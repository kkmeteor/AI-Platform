from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP
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


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    transport = Column(String(50), default="streamable_http")
    headers = Column(Text, default="{}")
    timeout = Column(Integer, default=60)
    sse_read_timeout = Column(Integer, default=50)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
    updated_at = Column(TIMESTAMP, server_default=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"), onupdate=func.strftime("%Y-%m-%d %H:%M:%S", "now", "utc"))
