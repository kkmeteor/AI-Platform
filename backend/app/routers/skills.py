import os
import uuid
import base64
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Skill
from app.schemas import SkillCreate, SkillResponse, SkillListResponse, SkillUpdate

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")


def require_admin(request: Request):
    """Check X-User-Role header, raise 403 if not admin."""
    role = request.headers.get("X-User-Role", "").strip().lower()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")


@router.get("/skills", response_model=SkillListResponse)
def list_skills(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Skill)

    if search:
        query = query.filter(
            or_(
                Skill.name.contains(search),
                Skill.tags.contains(search),
            )
        )

    total = query.count()
    items = (
        query.order_by(Skill.is_pinned.desc(), Skill.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return SkillListResponse(items=items, total=total)


@router.get("/skills/{skill_id}", response_model=SkillResponse)
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.post("/skills", response_model=SkillResponse)
async def create_skill(
    request: Request,
    payload: SkillCreate,
    db: Session = Depends(get_db),
):
    # 调试日志：打印请求头和请求体
    logging.error(f"=== Request Content-Type: {request.headers.get('content-type')} ===")
    body = await request.body()
    logging.error(f"=== Request body ({len(body)} bytes): {body[:500]} ===")
    # 验证文件为 .zip
    if not payload.file_name or not payload.file_name.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")

    # 解码 base64 文件
    try:
        file_content = base64.b64decode(payload.file_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 file data")

    file_size = len(file_content)

    # 生成唯一文件名
    file_ext = os.path.splitext(payload.file_name)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # 保存文件
    with open(file_path, "wb") as f:
        f.write(file_content)

    # 创建数据库记录
    skill = Skill(
        name=payload.name,
        description=payload.description,
        author=payload.author,
        version=payload.version,
        tags=payload.tags,
        file_path=unique_filename,
        file_size=file_size,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)

    return skill


@router.get("/skills/{skill_id}/download")
def download_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    file_path = os.path.join(UPLOAD_DIR, skill.file_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # 增加下载计数
    skill.download_count += 1
    db.commit()

    download_name = f"{skill.name}.zip"
    return FileResponse(
        path=file_path,
        filename=download_name,
        media_type="application/zip",
    )


@router.patch("/skills/{skill_id}/pin", response_model=SkillResponse)
def toggle_pin_skill(
    skill_id: int,
    request: Request,
    payload: SkillUpdate,
    db: Session = Depends(get_db),
):
    require_admin(request)
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if payload.is_pinned is not None:
        skill.is_pinned = payload.is_pinned
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/skills/{skill_id}")
def delete_skill(
    skill_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    require_admin(request)
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if skill.is_readonly:
        raise HTTPException(status_code=403, detail="Cannot delete a readonly skill")

    # 删除文件
    file_path = os.path.join(UPLOAD_DIR, skill.file_path)
    if os.path.exists(file_path):
        os.remove(file_path)

    # 删除数据库记录
    db.delete(skill)
    db.commit()

    return {"detail": "Skill deleted successfully"}
