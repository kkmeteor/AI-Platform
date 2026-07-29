from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, field_validator


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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
    url: str
    transport: str = "streamable_http"
    headers: Optional[str] = "{}"
    timeout: int = 60
    sse_read_timeout: int = 50


class McpServerUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    transport: Optional[str] = None
    headers: Optional[str] = None
    timeout: Optional[int] = None
    sse_read_timeout: Optional[int] = None


class McpServerResponse(BaseModel):
    id: int
    name: str
    url: str
    transport: str
    headers: str
    timeout: int
    sse_read_timeout: int
    is_active: bool
    tools: List[dict] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
