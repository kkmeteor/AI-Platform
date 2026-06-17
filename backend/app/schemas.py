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


class SkillListResponse(BaseModel):
    items: List[SkillResponse]
    total: int
