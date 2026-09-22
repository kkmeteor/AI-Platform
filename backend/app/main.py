from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base, get_db
from app.logging_setup import configure_logging
from app.occupancy import start_reaper, start_offline_reaper
from app.routers import skills, dify, mcp, portal, auth, users, test_machines, files

settings = get_settings()

# ---------------------------------------------------------------------------
# Logging — timestamps for every line (app + uvicorn); high-frequency probe
# heartbeat access lines are silenced. See app/logging_setup.py.
# ---------------------------------------------------------------------------
configure_logging()

app = FastAPI(title="DCloud Market API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(skills.router, prefix="/api")
app.include_router(dify.router, prefix="/api")
app.include_router(mcp.router, prefix="/api")
app.include_router(portal.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(test_machines.router, prefix="/api")
app.include_router(files.router, prefix="/api")

# Background task: auto-release expired test machine occupations.
start_reaper(app)
# Background task: mark machines offline when their probe heartbeat lapses.
start_offline_reaper(app)


@app.on_event("startup")
def on_startup():
    from app.models import PortalLink

    # 创建数据库目录（Docker 卷挂载时需要）
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    # 创建数据库表
    Base.metadata.create_all(bind=engine)
    # 创建 uploads 目录
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
