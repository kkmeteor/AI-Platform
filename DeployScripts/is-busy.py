"""
Machine idle-status probe agent.

Detects whether the current Windows machine is busy (someone is operating it
via keyboard/mouse, or an active RDP session exists) and proactively reports
heartbeat + status to the SinoAI backend monitoring service.

Designed to run headless as a Windows service (NSSM wrapping pythonw.exe) on
every Jenkins agent / test machine. It is the single source of truth for the
"物理占用" state shown in the 测试机监控 page.

Usage:
    python is-busy.py                  # run as a foreground daemon
    python is-busy.py --once           # report once and exit (used by install script)
    python is-busy.py --status         # print local verdict and exit
    python is-busy.py --version

Configuration (environment variables; injected by the service wrapper):
    PROBE_SERVER_URL              probe endpoint, e.g.
                                  http://<backend-host>:8000/api/test-machines/probe
    PROBE_TOKEN                   shared token, must match backend probe_token
    PROBE_INTERVAL_SEC            heartbeat interval when nothing changed (default 30)
    PROBE_IDLE_THRESHOLD_SEC      idle threshold (default 300)
    PROBE_TICK_SEC                local sampling period (default 10)
    PROBE_MACHINE_NAME            optional hostname override
    PROBE_MACHINE_IP              optional ip override
    PROBE_LOG_FILE                optional log file path (default: stderr)

Dependencies: pywin32 (win32ts / win32api). HTTP uses only the standard library.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import socket
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

import ctypes
from ctypes import Structure, wintypes
import win32ts
import win32api

# ---------------------------------------------------------------------------
# Constants / defaults
# ---------------------------------------------------------------------------
VERSION = "1.0.0"
DEFAULT_INTERVAL_SEC = 30
DEFAULT_IDLE_THRESHOLD_SEC = 300
DEFAULT_TICK_SEC = 10
REPORT_TIMEOUT_SEC = 10
BACKOFF_INITIAL_SEC = 5
BACKOFF_MAX_SEC = 30

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("is-busy")


def _setup_logging() -> None:
    log_file = os.environ.get("PROBE_LOG_FILE", "").strip()
    handlers: list[logging.Handler] = []
    if log_file:
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    else:
        handlers.append(logging.StreamHandler(sys.stderr))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
        force=True,
    )


# ---------------------------------------------------------------------------
# Windows idle detection (unchanged core logic)
# ---------------------------------------------------------------------------

class LASTINPUTINFO(Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("dwTime", wintypes.DWORD),
    ]


def get_system_idle_seconds() -> float:
    """Seconds since the last keyboard/mouse input."""
    last_input = LASTINPUTINFO()
    last_input.cbSize = ctypes.sizeof(LASTINPUTINFO)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(last_input))
    tick = win32api.GetTickCount()
    idle_ms = tick - last_input.dwTime
    return idle_ms / 1000.0


def has_active_rdp_session() -> bool:
    """Whether an active RDP remote-desktop session exists."""
    sessions = win32ts.WTSEnumerateSessions(win32ts.WTS_CURRENT_SERVER_HANDLE)
    for session in sessions:
        if isinstance(session, dict):
            session_id = session["SessionId"]
            state = session["State"]
            session_name = session["WinStationName"]
        else:
            session_id, state, session_name = session
        # WTSActive = 0
        if state == win32ts.WTSActive:
            # Exclude the system session (0) and the local Console session.
            if session_id != 0 and str(session_name) != "Console":
                return True
    return False


def is_machine_busy(idle_threshold_sec: int = 300):
    """
    Judge whether the machine is busy.

    :param idle_threshold_sec: idle threshold in seconds
    :return: (is_busy: bool, idle_sec: float, rdp_active: bool)
    """
    idle_sec = get_system_idle_seconds()
    rdp_active = has_active_rdp_session()
    if rdp_active or idle_sec < idle_threshold_sec:
        return True, idle_sec, rdp_active
    return False, idle_sec, rdp_active


# ---------------------------------------------------------------------------
# Self identity
# ---------------------------------------------------------------------------

def _detect_local_ip(server_url: str) -> str:
    """The local IPv4 used to reach the probe server (no packets are sent)."""
    try:
        parsed = urlparse(server_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect((host, port))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return ""


def machine_identity(server_url: str) -> tuple[str, str]:
    """Return (hostname, ip_address). Env overrides win."""
    name = os.environ.get("PROBE_MACHINE_NAME", "").strip() or socket.gethostname()
    ip = os.environ.get("PROBE_MACHINE_IP", "").strip() or _detect_local_ip(server_url)
    return name, ip


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def _build_payload(status: str, idle_sec: float, rdp_active: bool, name: str, ip: str) -> dict:
    return {
        "hostname": name,
        "ip_address": ip,
        "status": status,
        "idle_seconds": round(idle_sec, 2),
        "rdp_active": bool(rdp_active),
        "client_time": time.time(),
        "version": VERSION,
    }


def report_once(server_url: str, token: str, status: str, idle_sec: float,
                rdp_active: bool, name: str, ip: str) -> dict:
    """POST one probe report; return the parsed JSON response."""
    payload = _build_payload(status, idle_sec, rdp_active, name, ip)
    req = urllib.request.Request(
        server_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Probe-Token": token,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=REPORT_TIMEOUT_SEC) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Daemon loop
# ---------------------------------------------------------------------------

def _install_signal_handlers(stop_event: list[bool]) -> None:
    def _handle(signum, frame):
        logger.info("Received signal %s, shutting down gracefully", signum)
        stop_event[0] = True

    try:
        signal.signal(signal.SIGTERM, _handle)
    except (ValueError, OSError):
        pass  # SIGTERM may be unsupported in some Windows pythonw contexts
    try:
        signal.signal(signal.SIGINT, _handle)
    except (ValueError, OSError):
        pass


def run_daemon(server_url: str, token: str, idle_threshold: int,
               interval_sec: int, tick_sec: int) -> None:
    name, ip = machine_identity(server_url)
    logger.info(
        "Probe agent %s v%s starting (hostname=%s, ip=%s, server=%s)",
        os.path.basename(sys.argv[0]), VERSION, name, ip, server_url,
    )
    if not token:
        logger.error("PROBE_TOKEN is not set; refusing to run")
        sys.exit(1)
    if not server_url:
        logger.error("PROBE_SERVER_URL is not set; refusing to run")
        sys.exit(1)

    stop_event: list[bool] = [False]
    _install_signal_handlers(stop_event)

    last_status: str | None = None
    last_report_time: float = 0.0
    backoff = BACKOFF_INITIAL_SEC

    while not stop_event[0]:
        try:
            busy, idle_sec, rdp = is_machine_busy(idle_threshold)
            status = "busy" if busy else "idle"
            now = time.time()
            changed = status != last_status
            due = now - last_report_time >= interval_sec
            if last_status is None or changed or due:
                resp = report_once(server_url, token, status, idle_sec, rdp, name, ip)
                if not resp.get("ok"):
                    logger.warning("Backend reported not-ok: %s", resp)
                else:
                    logger.info(
                        "Reported %s (idle=%.0fs, rdp=%s) -> backend status=%s (%s, id=%s)",
                        status, idle_sec, rdp, resp.get("status"),
                        resp.get("name"), resp.get("machine_id"),
                    )
                last_status = status
                last_report_time = time.time()
                backoff = BACKOFF_INITIAL_SEC
        except urllib.error.HTTPError as exc:
            logger.warning("Backend HTTP %s: %s", exc.code, exc.reason)
            _sleep_backoff(backoff, stop_event)
            backoff = min(backoff * 2, BACKOFF_MAX_SEC)
        except Exception as exc:  # noqa: BLE001 - keep the agent alive
            logger.warning("Report failed (%s); retrying in %ss", exc, backoff)
            _sleep_backoff(backoff, stop_event)
            backoff = min(backoff * 2, BACKOFF_MAX_SEC)
        else:
            _interruptible_sleep(tick_sec, stop_event)

    logger.info("Probe agent stopped")


def _sleep_backoff(seconds: float, stop_event: list[bool]) -> None:
    _interruptible_sleep(seconds, stop_event)


def _interruptible_sleep(seconds: float, stop_event: list[bool]) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline and not stop_event[0]:
        time.sleep(min(0.5, deadline - time.time()))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Machine idle probe agent")
    parser.add_argument("--once", action="store_true", help="report once and exit")
    parser.add_argument("--status", action="store_true", help="print local verdict and exit")
    parser.add_argument("--version", action="store_true", help="print version and exit")
    args = parser.parse_args()

    _setup_logging()

    server_url = os.environ.get("PROBE_SERVER_URL", "").strip()
    token = os.environ.get("PROBE_TOKEN", "").strip()
    idle_threshold = int(os.environ.get("PROBE_IDLE_THRESHOLD_SEC", DEFAULT_IDLE_THRESHOLD_SEC))
    interval_sec = int(os.environ.get("PROBE_INTERVAL_SEC", DEFAULT_INTERVAL_SEC))
    tick_sec = int(os.environ.get("PROBE_TICK_SEC", DEFAULT_TICK_SEC))

    if args.version:
        print(VERSION)
        return 0

    if args.status:
        busy, idle_sec, rdp = is_machine_busy(idle_threshold)
        name, ip = machine_identity(server_url)
        print(json.dumps({
            "busy": busy,
            "idle_seconds": round(idle_sec, 2),
            "rdp_active": rdp,
            "hostname": name,
            "ip_address": ip,
            "idle_threshold_sec": idle_threshold,
            "version": VERSION,
        }, ensure_ascii=False))
        return 0

    if args.once:
        busy, idle_sec, rdp = is_machine_busy(idle_threshold)
        name, ip = machine_identity(server_url)
        status = "busy" if busy else "idle"
        if not server_url or not token:
            logger.error("PROBE_SERVER_URL and PROBE_TOKEN are required for --once")
            return 1
        resp = report_once(server_url, token, status, idle_sec, rdp, name, ip)
        print(json.dumps(resp, ensure_ascii=False))
        return 0 if resp.get("ok") else 1

    # daemon mode
    run_daemon(server_url, token, idle_threshold, interval_sec, tick_sec)
    return 0


if __name__ == "__main__":
    sys.exit(main())
