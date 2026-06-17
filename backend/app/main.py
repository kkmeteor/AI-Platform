import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import skills

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

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


@app.on_event("startup")
def on_startup():
    # 创建数据库目录（Docker 卷挂载时需要）
    db_dir = os.path.join(BASE_DIR, "data")
    os.makedirs(db_dir, exist_ok=True)
    # 创建数据库表
    Base.metadata.create_all(bind=engine)
    # 创建 uploads 目录
    os.makedirs(UPLOAD_DIR, exist_ok=True)
