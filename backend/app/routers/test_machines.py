import hmac
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session

from app.auth import require_role
from app.config import get_settings
from app.database import get_db
from app.models import TestMachine, TestMachineLog, User
from app.occupancy import (
    MAX_WINDOW_MINUTES,
    UNIT_MINUTES,
    occupation_cache,
    epoch_to_dt,
)
from app.schemas import (
    TestMachineCreate,
    TestMachineUpdate,
    TestMachineResponse,
    TestMachineOccupyRequest,
    TestMachineLogListResponse,
    ProbeReport,
    ProbeReportResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

VALID_STATUSES = {"busy", "idle", "unknown", "offline"}


def _utc_now() -> datetime:
    """Naive-UTC datetime (matches how SQLite stores UTC timestamps)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def require_probe_token(x_token: str = Header(default="", alias="X-Probe-Token")) -> bool:
    """Validate the shared agent probe token (X-Probe-Token header).

    Independent of the user JWT flow: agent services run headless and cannot
    hold a user session. A missing configured token means the endpoint is
    intentionally disabled.
    """
    if not settings.probe_token:
        raise HTTPException(
            status_code=503,
            detail="Probe endpoint not configured (probe_token is empty)",
        )
    if not x_token or not hmac.compare_digest(x_token, settings.probe_token):
        raise HTTPException(status_code=401, detail="Invalid probe token")
    return True


# ── helpers ──

def _tags_to_str(tags) -> str | None:
    """Normalize a list of tags into a comma-separated DB string."""
    if tags is None:
        return None
    cleaned = [t.strip() for t in tags if t and t.strip()]
    return ",".join(cleaned) if cleaned else None


def _to_response(machine: TestMachine, occ=None) -> dict:
    """Serialize a TestMachine plus live occupation info."""
    data = {
        "id": machine.id,
        "name": machine.name,
        "ip_address": machine.ip_address,
        "teamviewer_id": machine.teamviewer_id,
        "rdp_username": machine.rdp_username,
        "status": machine.status,
        "locked": machine.locked,
        "tags": [t for t in (machine.tags or "").split(",") if t.strip()],
        "occupier_user_id": None,
        "occupier_username": None,
        "occupied_at": None,
        "expires_at": None,
        "remaining_seconds": None,
        "auto_renew": None,
        # Agent probe metadata
        "hostname": machine.hostname,
        "last_seen_at": machine.last_seen_at,
        "last_idle_seconds": machine.last_idle_seconds,
        "last_rdp_active": machine.last_rdp_active,
        "created_at": machine.created_at,
        "updated_at": machine.updated_at,
    }
    if occ is not None:
        now = time.time()
        data.update(
            occupier_user_id=occ.user_id,
            occupier_username=occ.username,
            occupied_at=epoch_to_dt(occ.occupied_at),
            expires_at=epoch_to_dt(occ.expires_at),
            remaining_seconds=max(0, int(occ.expires_at - now)),
            auto_renew=occ.auto_renew,
        )
    return data


def _add_log(
    db: Session,
    machine: TestMachine,
    user: User | None,
    action: str,
    detail: str | None = None,
) -> None:
    db.add(
        TestMachineLog(
            machine_id=machine.id,
            machine_name=machine.name,
            user_id=user.id if user else None,
            username=user.username if user else None,
            action=action,
            detail=detail,
        )
    )


def _validate_window(duration_minutes: int) -> int:
    if (
        duration_minutes <= 0
        or duration_minutes % UNIT_MINUTES != 0
        or duration_minutes > MAX_WINDOW_MINUTES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"占用时长必须为 {UNIT_MINUTES} 分钟的整数倍，"
                f"且不超过 {MAX_WINDOW_MINUTES} 分钟"
            ),
        )
    return duration_minutes


# ── list & CRUD ──

@router.get("/test-machines", response_model=list[TestMachineResponse])
def list_test_machines(db: Session = Depends(get_db)):
    """Get all test machines, with live occupation info attached."""
    machines = db.query(TestMachine).order_by(TestMachine.created_at.asc()).all()
    occs = occupation_cache.snapshot()
    return [_to_response(m, occs.get(m.id)) for m in machines]


@router.post("/test-machines", response_model=TestMachineResponse)
def create_test_machine(
    payload: TestMachineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Add a new test machine. Admin only."""
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")

    machine = TestMachine(
        name=payload.name,
        ip_address=payload.ip_address,
        teamviewer_id=payload.teamviewer_id,
        rdp_username=payload.rdp_username,
        status=payload.status,
        locked=payload.locked,
        tags=_tags_to_str(payload.tags),
    )
    db.add(machine)
    db.commit()
    db.refresh(machine)
    _add_log(db, machine, current_user, "create", f"创建测试机（IP: {machine.ip_address}）")
    db.commit()
    return _to_response(machine)


@router.put("/test-machines/{machine_id}", response_model=TestMachineResponse)
def update_test_machine(
    machine_id: int,
    payload: TestMachineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """Update a test machine. Admin and editor.

    Setting status="busy" + locked=True marks the machine as admin-locked
    (busy and not occupiable); status="idle" + locked=False unlocks it.
    """
    machine = db.query(TestMachine).filter(TestMachine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Test machine not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    # Tags arrive as a list; persist as a comma-separated string.
    if "tags" in update_data:
        update_data["tags"] = _tags_to_str(update_data["tags"])

    changed: list[str] = []
    for key, value in update_data.items():
        if getattr(machine, key) != value:
            changed.append(key)
        setattr(machine, key, value)

    # Admin lock: force status to busy and free any live occupation.
    if machine.locked:
        occupation_cache.release(machine.id)
        if machine.status != "busy":
            machine.status = "busy"
            if "status" not in changed:
                changed.append("status")

    # Admin unlock: if busy without a live occupation, drop back to idle.
    if "locked" in changed and not machine.locked:
        if machine.status == "busy" and occupation_cache.get(machine.id) is None:
            machine.status = "idle"

    db.commit()
    db.refresh(machine)

    if changed:
        if machine.locked:
            detail = "管理员锁定（忙碌，不可申请占用）"
            action = "lock"
        elif "locked" in changed:
            detail = "管理员解锁"
            action = "unlock"
        else:
            detail = "更新字段: " + ", ".join(changed)
            action = "update"
        _add_log(db, machine, current_user, action, detail)
        db.commit()

    return _to_response(machine, occupation_cache.get(machine.id))


@router.delete("/test-machines/{machine_id}")
def delete_test_machine(
    machine_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Delete a test machine. Admin only."""
    machine = db.query(TestMachine).filter(TestMachine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Test machine not found")

    occupation_cache.release(machine_id)
    machine_name = machine.name
    _add_log(db, machine, current_user, "delete", f"删除测试机 {machine_name}")
    db.delete(machine)
    db.commit()
    return {"detail": "Test machine deleted successfully"}


# ── agent probe flow (is-busy.py heartbeat) ──

def _apply_probe_report(db: Session, machine: TestMachine, report: ProbeReport) -> str:
    """Apply a probe report to a machine; returns the effective display status.

    Status priority (higher wins):
      1. Admin lock (locked=True)         -> busy
      2. Live occupation (occupation_cache) -> busy
      3. Physical busy reported by probe   -> busy
      4. otherwise                         -> idle

    Occupation/lock states are deliberate and must never be clobbered by a
    physical-idle report. Only the status field is touched by the probe;
    occupancy/lock state is managed by the existing JWT flows.
    """
    machine.hostname = report.hostname
    machine.last_seen_at = _utc_now()
    machine.last_idle_seconds = report.idle_seconds
    machine.last_rdp_active = report.rdp_active

    if machine.locked:
        effective = "busy"
    elif occupation_cache.get(machine.id) is not None:
        effective = "busy"
    elif report.status == "busy":
        effective = "busy"
    else:
        effective = "idle"

    if machine.status != effective:
        old = machine.status
        machine.status = effective
        _add_log(
            db,
            machine,
            None,
            "probe",
            (
                f"探针上报 {report.status}（空闲 {report.idle_seconds:.0f}s，"
                f"RDP {'活跃' if report.rdp_active else '无'}）→ {effective}（原 {old}）"
            ),
        )
        logger.info(
            "Probe %s (id=%s) status %s -> %s",
            machine.name,
            machine.id,
            old,
            effective,
        )
    return effective


@router.post("/test-machines/probe", response_model=ProbeReportResponse)
def report_probe(
    payload: ProbeReport,
    db: Session = Depends(get_db),
    _: bool = Depends(require_probe_token),
):
    """Receive a heartbeat/status report from the is-busy.py agent service.

    The agent self-identifies via ip_address (primary matching key) and
    hostname. Unknown machines are auto-registered when probe_auto_register is
    enabled; otherwise the report is acknowledged but ignored.
    """
    machine = (
        db.query(TestMachine)
        .filter(TestMachine.ip_address == payload.ip_address)
        .first()
    )
    if machine is None and payload.hostname:
        machine = (
            db.query(TestMachine)
            .filter(TestMachine.hostname == payload.hostname)
            .first()
        )
    if machine is None:
        if not settings.probe_auto_register:
            return ProbeReportResponse(ok=False, reason="unknown_machine")
        machine = TestMachine(
            name=payload.hostname or payload.ip_address,
            ip_address=payload.ip_address,
            hostname=payload.hostname or None,
            status="unknown",
        )
        db.add(machine)
        db.commit()
        db.refresh(machine)
        logger.info(
            "Probe auto-registered machine %s (ip=%s)", machine.name, machine.ip_address
        )

    effective = _apply_probe_report(db, machine, payload)
    db.commit()
    db.refresh(machine)
    return ProbeReportResponse(
        ok=True, machine_id=machine.id, name=machine.name, status=effective
    )


# ── occupation flow ──

@router.post("/test-machines/{machine_id}/occupy", response_model=TestMachineResponse)
def occupy_test_machine(
    machine_id: int,
    payload: TestMachineOccupyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor", "viewer")),
):
    """Occupy an idle test machine for a sliding window.

    Any authenticated user may occupy a machine that is idle and not locked.
    The window is a multiple of 15 minutes; it slides on every heartbeat and
    expires automatically, flipping the machine back to idle.
    """
    window = _validate_window(payload.duration_minutes)
    machine = db.query(TestMachine).filter(TestMachine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Test machine not found")
    if machine.locked:
        raise HTTPException(status_code=409, detail="该测试机已被管理员锁定，不可申请占用")
    if machine.status != "idle":
        raise HTTPException(status_code=409, detail="该测试机当前不可占用（非空闲状态）")

    occ = occupation_cache.occupy(
        machine_id=machine.id,
        user_id=current_user.id,
        username=current_user.username,
        window_minutes=window,
        auto_renew=payload.auto_renew,
    )
    machine.status = "busy"
    machine.locked = False
    _add_log(
        db,
        machine,
        current_user,
        "occupy",
        (
            f"申请占用 {window} 分钟（{window // UNIT_MINUTES} 个单位），"
            f"自动续期{'开启' if payload.auto_renew else '关闭'}"
        ),
    )
    db.commit()
    db.refresh(machine)
    return _to_response(machine, occ)


@router.post("/test-machines/{machine_id}/release", response_model=TestMachineResponse)
def release_test_machine(
    machine_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor", "viewer")),
):
    """Release a machine occupation.

    The occupier may release their own occupation; admins and editors may
    force-release any occupation.
    """
    machine = db.query(TestMachine).filter(TestMachine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Test machine not found")

    occ = occupation_cache.release(
        machine.id,
        user_id=None if current_user.role in ("admin", "editor") else current_user.id,
    )
    if occ is None:
        raise HTTPException(status_code=409, detail="没有可释放的占用（或您不是占用者）")

    forced = current_user.role in ("admin", "editor") and occ.user_id != current_user.id
    machine.status = "idle"
    _add_log(
        db,
        machine,
        current_user,
        "release",
        f"释放占用（占用者 {occ.username}）" + ("，强制释放" if forced else ""),
    )
    db.commit()
    db.refresh(machine)
    return _to_response(machine)


@router.post("/test-machines/{machine_id}/heartbeat", response_model=TestMachineResponse)
def heartbeat_test_machine(
    machine_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor", "viewer")),
):
    """Slide the occupancy window for the current occupier.

    Renewal only takes effect when the occupation was created with
    auto_renew=True; otherwise the window is fixed and the request is a no-op.
    The frontend polls this while the user keeps the page open.
    """
    machine = db.query(TestMachine).filter(TestMachine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Test machine not found")

    occupation_cache.renew(machine.id, current_user.id)
    return _to_response(machine, occupation_cache.get(machine.id))


# ── logs ──

@router.get("/test-machines/logs", response_model=TestMachineLogListResponse)
def list_test_machine_logs(
    machine_id: int | None = Query(default=None, description="Filter by machine id"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """List test machine occupation logs (admin and editor)."""
    query = db.query(TestMachineLog)
    if machine_id is not None:
        query = query.filter(TestMachineLog.machine_id == machine_id)
    total = query.count()
    items = (
        query.order_by(TestMachineLog.created_at.desc(), TestMachineLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return TestMachineLogListResponse(items=items, total=total)
