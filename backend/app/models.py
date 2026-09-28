from sqlalchemy import Column, Integer, String, Text, Boolean, Float, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    author = Column(String(50), nullable=True)
    version = Column(String(20), nullable=True)
    tags = Column(String(200), nullable=True)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)
    download_count = Column(Integer, default=0)
    is_readonly = Column(Boolean, default=False, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))


class PortalLink(Base):
    __tablename__ = "portal_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    icon = Column(String(50), default="🔗")
    description = Column(String(200), nullable=True)
    background_image = Column(String(500), nullable=True)
    category = Column(String(50), default="custom")
    sort_order = Column(Integer, default=0)
    is_builtin = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    transport = Column(String(50), default="streamable_http")
    headers = Column(Text, default="{}")
    command = Column(String(500), nullable=True)
    args = Column(Text, nullable=True)
    env = Column(Text, nullable=True)
    timeout = Column(Integer, default=60)
    sse_read_timeout = Column(Integer, default=50)
    is_active = Column(Boolean, default=True)
    # Cached tool list from the last probe; avoids re-spawning stdio processes
    # (e.g. uvx) just to display capabilities on the list page.
    tools_cache = Column(Text, nullable=True)
    tools_cached_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(200), nullable=True)  # base64 encoded cached password
    display_name = Column(String(100), nullable=True)
    email = Column(String(200), nullable=True)
    role = Column(String(20), default="viewer", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_login_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))


class LoginLog(Base):
    __tablename__ = "login_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(50), nullable=False)
    login_time = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    ip_address = Column(String(50), nullable=True)
    success = Column(Boolean, default=True, nullable=False)
    message = Column(String(200), nullable=True)


class TestMachine(Base):
    __tablename__ = "test_machines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    ip_address = Column(String(50), nullable=False)
    teamviewer_id = Column(String(50), nullable=True)
    # Remote desktop login username, pre-filled into generated .rdp files.
    rdp_username = Column(String(100), nullable=True)
    status = Column(String(20), default="unknown", nullable=False)
    # Comma-separated tags, e.g. "regression,smoke". Kept as a plain string
    # for SQLite simplicity; serialized as a list in the API layer.
    tags = Column(String(200), nullable=True)
    # True = admin manually locked the machine (busy and not occupiable).
    # A machine occupied by a user via the occupy flow is NOT locked.
    locked = Column(Boolean, default=False, nullable=False)
    # ── Agent probe metadata (reported by is-busy.py running on the machine) ──
    hostname = Column(String(100), nullable=True)
    last_seen_at = Column(TIMESTAMP, nullable=True)
    last_idle_seconds = Column(Float, nullable=True)
    last_rdp_active = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))


class TestMachineLog(Base):
    __tablename__ = "test_machine_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(Integer, nullable=False)
    machine_name = Column(String(100), nullable=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String(100), nullable=True)
    action = Column(String(50), nullable=False)  # occupy / release / auto_release / lock / unlock / create / update / delete
    detail = Column(String(500), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))


class TestResult(Base):
    """Test progress reported by automated test runs.

    One row per (build_number, test_type, test_machine) run; repeated reports
    for the same run update the row (upsert) instead of inserting history.
    """

    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Build number kept as a string to allow non-numeric build identifiers later.
    build_number = Column(String(50), nullable=False, index=True)
    hardware_version = Column(String(50), nullable=True)
    software_version = Column(String(50), nullable=True)
    test_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    target_amount = Column(Integer, nullable=True)
    current_done = Column(Integer, default=0, nullable=False)
    # Test machine name as a plain string (soft reference, no FK).
    test_machine = Column(String(100), nullable=False)
    # NOTE: SQLite "now" is already UTC; the "utc" modifier used by the other
    # models treats its input as localtime and shifts UPDATE timestamps by the
    # server's UTC offset. Dropped here so progress freshness stays accurate.
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now"))

    __table_args__ = (
        UniqueConstraint("build_number", "test_type", "test_machine", name="uq_test_results_run"),
    )
