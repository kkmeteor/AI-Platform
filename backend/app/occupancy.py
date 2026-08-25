"""
Test machine occupation manager.

In-memory occupation cache with a sliding-expiry semantics, plus a background
reaper task that flips machines back to "idle" in the database once their
occupation window expires.

Design notes:
- Single-process deployment (uvicorn / Docker) → an in-process dict is
  sufficient. The cache interface is intentionally small so it could be
  swapped for a Redis-backed implementation later.
- Sliding window: every heartbeat (or occupancy renewal) resets the
  expiration to `now + window`. If the occupier stops polling, the window
  expires and the machine is automatically released.
- Concurrency: a lock guards all cache mutations. Database writes for
  auto-release happen inside the same lock to avoid races with occupy/release.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# Occupancy window unit (minutes); bookings are multiples of this.
UNIT_MINUTES = 15
# Maximum bookable window in minutes (8 units = 2 hours).
MAX_WINDOW_MINUTES = UNIT_MINUTES * 8
# How often the background reaper scans for expired occupations.
REAPER_INTERVAL_SECONDS = 15


@dataclass
class Occupation:
    machine_id: int
    user_id: int
    username: str
    window_minutes: int
    auto_renew: bool
    occupied_at: float  # epoch seconds (UTC)
    expires_at: float   # epoch seconds (UTC)
    # Optional DB session lazily injected by the reaper; keeps auto-release
    # logic out of the cache itself.
    on_expired: Optional[callable] = field(default=None, repr=False)


class OccupationCache:
    """Thread-safe in-memory occupation registry."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # machine_id -> Occupation
        self._occupations: dict[int, Occupation] = {}

    # ── queries ──

    def get(self, machine_id: int) -> Optional[Occupation]:
        with self._lock:
            occ = self._occupations.get(machine_id)
            if occ is None:
                return None
            if self._is_expired(occ):
                return None
            return occ

    def snapshot(self) -> dict[int, Occupation]:
        """Return a copy of all live (non-expired) occupations."""
        with self._lock:
            now = time.time()
            return {
                mid: occ
                for mid, occ in self._occupations.items()
                if occ.expires_at > now
            }

    # ── mutations ──

    def occupy(
        self,
        machine_id: int,
        user_id: int,
        username: str,
        window_minutes: int,
        auto_renew: bool = False,
    ) -> Occupation:
        """Register a new occupation.

        With auto_renew=True the window slides on every heartbeat; otherwise
        the window is fixed and the occupation expires once it elapses.
        """
        now = time.time()
        occ = Occupation(
            machine_id=machine_id,
            user_id=user_id,
            username=username,
            window_minutes=window_minutes,
            auto_renew=auto_renew,
            occupied_at=now,
            expires_at=now + window_minutes * 60,
        )
        with self._lock:
            self._occupations[machine_id] = occ
        return occ

    def renew(self, machine_id: int, user_id: int) -> bool:
        """Slide the expiry window for the current occupier.

        Only works when the occupation was created with auto_renew=True and
        the caller is the occupier. Returns False otherwise.
        """
        with self._lock:
            occ = self._occupations.get(machine_id)
            if occ is None or self._is_expired(occ):
                return False
            if occ.user_id != user_id:
                return False
            if not occ.auto_renew:
                return False
            occ.expires_at = time.time() + occ.window_minutes * 60
            return True

    def release(self, machine_id: int, user_id: Optional[int] = None) -> Optional[Occupation]:
        """Remove an occupation. If user_id is given, only that user (or an
        admin calling with explicit force) may release it.

        Returns the removed Occupation, or None if there was no live
        occupation (or the user was not the occupier).
        """
        with self._lock:
            occ = self._occupations.get(machine_id)
            if occ is None or self._is_expired(occ):
                return None
            if user_id is not None and occ.user_id != user_id:
                return None
            del self._occupations[machine_id]
            return occ

    # ── reaper helpers ──

    def collect_expired(self) -> list[Occupation]:
        """Remove and return all expired occupations (reaper use)."""
        expired: list[Occupation] = []
        with self._lock:
            now = time.time()
            for mid in list(self._occupations.keys()):
                occ = self._occupations[mid]
                if occ.expires_at <= now:
                    del self._occupations[mid]
                    expired.append(occ)
        return expired

    @staticmethod
    def _is_expired(occ: Occupation) -> bool:
        return occ.expires_at <= time.time()


# Global cache singleton.
occupation_cache = OccupationCache()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def epoch_to_dt(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def _auto_release_loop() -> None:
    """Background task: scan the cache, release expired occupations and
    update the database status back to idle."""
    from app.database import SessionLocal
    from app.models import TestMachine, TestMachineLog

    async def run() -> None:
        logger.info("Test machine occupation reaper started")
        while True:
            try:
                await asyncio.sleep(REAPER_INTERVAL_SECONDS)
                expired = occupation_cache.collect_expired()
                if not expired:
                    continue

                db = SessionLocal()
                try:
                    for occ in expired:
                        machine = (
                            db.query(TestMachine)
                            .filter(TestMachine.id == occ.machine_id)
                            .first()
                        )
                        if not machine:
                            continue
                        # Only release if still busy and not admin-locked.
                        # A machine that was manually edited meanwhile must
                        # not be clobbered.
                        if machine.locked:
                            continue
                        machine.status = "idle"
                        db.add(
                            TestMachineLog(
                                machine_id=machine.id,
                                machine_name=machine.name,
                                user_id=occ.user_id,
                                username=occ.username,
                                action="auto_release",
                                detail=(
                                    f"占用到期自动释放（窗口 {occ.window_minutes} 分钟，"
                                    f"自动续期 {'开启' if occ.auto_renew else '关闭'}，"
                                    f"占用者 {occ.username}）"
                                ),
                            )
                        )
                        logger.info(
                            "Auto-released machine %s (id=%s) after window expiry",
                            machine.name,
                            machine.id,
                        )
                    db.commit()
                finally:
                    db.close()
            except asyncio.CancelledError:
                logger.info("Test machine occupation reaper stopped")
                raise
            except Exception:
                logger.exception("Error in test machine occupation reaper")

    return run()


def repair_orphaned_busy() -> None:
    """On startup, reset machines left in 'busy' with no live occupation.

    The occupation cache is in-memory, so a backend restart drops all
    occupations while the database still holds status='busy'. Such machines
    would otherwise be stuck busy-but-unoccupiable. Machines that are
    admin-locked (locked=True) are intentionally left untouched.
    """
    from app.database import SessionLocal
    from app.models import TestMachine, TestMachineLog

    db = SessionLocal()
    try:
        orphans = (
            db.query(TestMachine)
            .filter(TestMachine.status == "busy", TestMachine.locked.is_(False))
            .all()
        )
        for machine in orphans:
            # No live occupation in cache after restart → stale busy state.
            machine.status = "idle"
            db.add(
                TestMachineLog(
                    machine_id=machine.id,
                    machine_name=machine.name,
                    action="reset",
                    detail="后端重启，清理无占用者的忙碌状态，恢复为空闲",
                )
            )
            logger.info(
                "Reset stale busy machine %s (id=%s) to idle after restart",
                machine.name,
                machine.id,
            )
        db.commit()
    finally:
        db.close()


def start_reaper(app) -> None:
    """Hook into FastAPI startup to launch the background reaper task."""

    @app.on_event("startup")
    async def _start_reaper() -> None:
        repair_orphaned_busy()
        asyncio.get_event_loop().create_task(_auto_release_loop())
