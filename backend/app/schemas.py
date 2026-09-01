from datetime import datetime, timezone
from typing import Annotated, Optional, List, Literal
from pydantic import BaseModel, BeforeValidator, field_validator


def _ensure_utc(v):
    """Normalize a datetime value to UTC with explicit tzinfo.

    SQLite stores timestamps as naive UTC strings (see models.py), which
    would be serialized without a timezone marker and misread as local
    time by timezone-naive clients. Attaching UTC makes the JSON output
    carry a "Z" suffix so frontends can convert to local time correctly.
    """
    if v is None:
        return None
    if isinstance(v, str):
        v = datetime.fromisoformat(v.replace("Z", "+00:00"))
    if v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc)


# Datetime fields stored as naive UTC get an explicit UTC tzinfo.
UtcDatetime = Annotated[datetime, BeforeValidator(_ensure_utc)]


class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = None
    author: Optional[str] = None
    version: Optional[str] = None
    tags: Optional[str] = None
    file_base64: str
    file_name: str


class SkillResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    author: Optional[str] = None
    version: Optional[str] = None
    tags: List[str] = []
    file_path: str
    file_size: Optional[int] = None
    download_count: int = 0
    is_readonly: bool = False
    is_pinned: bool = False
    created_at: Optional[UtcDatetime] = None
    updated_at: Optional[UtcDatetime] = None

    class Config:
        from_attributes = True

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            return [tag.strip() for tag in v.split(",") if tag.strip()]
        return []


# ---- Portal Link Schemas ----

class PortalLinkCreate(BaseModel):
    name: str
    url: str
    icon: Optional[str] = "🔗"
    description: Optional[str] = None
    background_image: Optional[str] = None


class PortalLinkUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    background_image: Optional[str] = None


class PortalLinkResponse(BaseModel):
    id: int
    name: str
    url: str
    icon: Optional[str] = "🔗"
    description: Optional[str] = None
    background_image: Optional[str] = None
    category: Optional[str] = "custom"
    sort_order: int = 0
    is_builtin: bool = False
    created_at: Optional[UtcDatetime] = None
    updated_at: Optional[UtcDatetime] = None

    class Config:
        from_attributes = True


class SkillUpdate(BaseModel):
    is_pinned: Optional[bool] = None


class SkillListResponse(BaseModel):
    items: List[SkillResponse]
    total: int


# ---- MCP Server Schemas ----

class McpServerCreate(BaseModel):
    name: str
    url: str = ""
    transport: str = "streamable_http"
    headers: Optional[str] = "{}"
    command: Optional[str] = None
    args: Optional[str] = None
    env: Optional[str] = None
    timeout: int = 60
    sse_read_timeout: int = 50


class McpServerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    transport: Optional[str] = None
    headers: Optional[str] = None
    command: Optional[str] = None
    args: Optional[str] = None
    env: Optional[str] = None
    timeout: Optional[int] = None
    sse_read_timeout: Optional[int] = None


class McpServerResponse(BaseModel):
    id: int
    name: str
    url: str
    transport: str
    headers: str
    command: Optional[str] = None
    args: Optional[str] = None
    env: Optional[str] = None
    timeout: int
    sse_read_timeout: int
    is_active: bool
    tools: List[dict] = []
    tools_cached_at: Optional[UtcDatetime] = None
    created_at: Optional[UtcDatetime] = None
    updated_at: Optional[UtcDatetime] = None

    class Config:
        from_attributes = True


# ---- User Schemas ----

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    role: str = "viewer"
    is_active: bool = True
    last_login_at: Optional[UtcDatetime] = None
    created_at: Optional[UtcDatetime] = None
    updated_at: Optional[UtcDatetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int


class UserRoleUpdate(BaseModel):
    role: str


class UserStatusUpdate(BaseModel):
    is_active: bool


# ---- Login Log Schemas ----

class LoginLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: str
    login_time: Optional[UtcDatetime] = None
    ip_address: Optional[str] = None
    success: bool = True
    message: Optional[str] = None

    class Config:
        from_attributes = True


class LoginLogListResponse(BaseModel):
    items: List[LoginLogResponse]
    total: int


# ---- Auth Schemas ----

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ---- Test Machine Schemas ----

class TestMachineCreate(BaseModel):
    name: str
    ip_address: str
    teamviewer_id: Optional[str] = None
    rdp_username: Optional[str] = None
    status: str = "unknown"
    locked: bool = False
    tags: Optional[List[str]] = None


class TestMachineUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    teamviewer_id: Optional[str] = None
    rdp_username: Optional[str] = None
    status: Optional[str] = None
    locked: Optional[bool] = None
    tags: Optional[List[str]] = None


class TestMachineResponse(BaseModel):
    id: int
    name: str
    ip_address: str
    teamviewer_id: Optional[str] = None
    rdp_username: Optional[str] = None
    status: str = "unknown"
    locked: bool = False
    tags: List[str] = []
    # Live occupancy info (populated from the in-memory occupation cache)
    occupier_user_id: Optional[int] = None
    occupier_username: Optional[str] = None
    occupied_at: Optional[UtcDatetime] = None
    expires_at: Optional[UtcDatetime] = None
    remaining_seconds: Optional[int] = None
    auto_renew: Optional[bool] = None
    # Agent probe metadata (reported by is-busy.py)
    hostname: Optional[str] = None
    last_seen_at: Optional[UtcDatetime] = None
    last_idle_seconds: Optional[float] = None
    last_rdp_active: Optional[bool] = None
    created_at: Optional[UtcDatetime] = None
    updated_at: Optional[UtcDatetime] = None

    class Config:
        from_attributes = True

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return [str(t).strip() for t in v if str(t).strip()]
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return []


class TestMachineOccupyRequest(BaseModel):
    duration_minutes: int
    auto_renew: bool = False


# ---- Agent Probe Schemas ----

class ProbeReport(BaseModel):
    """Payload sent by the is-busy.py agent service running on each machine."""

    hostname: str
    ip_address: str
    status: Literal["busy", "idle"]
    idle_seconds: float = 0.0
    rdp_active: bool = False
    client_time: Optional[float] = None  # epoch seconds (UTC)
    version: str = "1.0.0"


class ProbeReportResponse(BaseModel):
    """Response echoed back to the agent so it can self-verify the round trip."""

    ok: bool
    machine_id: Optional[int] = None
    name: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None


class TestMachineLogResponse(BaseModel):
    id: int
    machine_id: int
    machine_name: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    detail: Optional[str] = None
    created_at: Optional[UtcDatetime] = None

    class Config:
        from_attributes = True


class TestMachineLogListResponse(BaseModel):
    items: List[TestMachineLogResponse]
    total: int
