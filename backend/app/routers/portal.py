import os
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.config import get_settings
from app.database import get_db
from app.models import PortalLink, User
from app.schemas import PortalLinkCreate, PortalLinkUpdate, PortalLinkResponse

router = APIRouter()
settings = get_settings()

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _assert_can_manage(link: PortalLink, user: User, for_background: bool = False) -> None:
    """Raise 403 unless the user is allowed to modify the given link.

    admin: any non-builtin link. Editing a builtin link's background image
    remains allowed (for_background=True keeps the previous behavior).
    editor: only their own personal links.
    """
    if user.role == "admin":
        if link.is_builtin and not for_background:
            raise HTTPException(status_code=403, detail="Cannot edit a builtin link")
        return
    # editor (viewer/guest is already rejected by require_role)
    if link.is_builtin or link.scope != "personal" or link.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You can only manage your own personal links")


@router.get("/portal/links", response_model=list[PortalLinkResponse])
def list_portal_links(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the portal links visible to the current user, builtin first, then by sort_order.

    admin sees every link; other roles see public links plus their own
    personal links.
    """
    query = db.query(PortalLink)
    if current_user.role != "admin":
        query = query.filter(
            or_(PortalLink.scope == "public", PortalLink.owner_id == current_user.id)
        )
    links = (
        query
        .order_by(PortalLink.is_builtin.desc(), PortalLink.sort_order.asc(), PortalLink.created_at.asc())
        .all()
    )
    return links


@router.post("/portal/links", response_model=PortalLinkResponse)
def create_portal_link(
    payload: PortalLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """Add a custom portal link owned by the current user."""
    if payload.scope == "public" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create public links")

    max_order = db.query(PortalLink).order_by(PortalLink.sort_order.desc()).first()
    next_order = (max_order.sort_order + 1) if max_order else 0

    link = PortalLink(
        name=payload.name,
        url=payload.url,
        icon=payload.icon or "🔗",
        description=payload.description,
        sort_order=next_order,
        scope=payload.scope or "personal",
        owner_id=current_user.id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.put("/portal/links/{link_id}", response_model=PortalLinkResponse)
def update_portal_link(
    link_id: int,
    payload: PortalLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """Update a custom portal link."""
    link = db.query(PortalLink).filter(PortalLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Portal link not found")
    _assert_can_manage(link, current_user)

    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("scope") == "public" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create public links")

    for key, value in update_data.items():
        setattr(link, key, value)
    db.commit()
    db.refresh(link)
    return link


@router.post("/portal/links/{link_id}/background", response_model=PortalLinkResponse)
async def upload_background(
    link_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """Upload a background image for a portal link."""
    link = db.query(PortalLink).filter(PortalLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Portal link not found")
    _assert_can_manage(link, current_user, for_background=True)

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only image files (png, jpeg, webp, gif) are allowed")

    # 生成唯一文件名并保存
    ext = os.path.splitext(file.filename or "")[1] or ".png"
    unique_name = f"bg_{uuid.uuid4().hex}{ext}"
    bg_dir = settings.upload_dir / "portal_bg"
    bg_dir.mkdir(parents=True, exist_ok=True)
    file_path = bg_dir / unique_name

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 存储相对URL
    link.background_image = f"/api/portal/backgrounds/{unique_name}"
    db.commit()
    db.refresh(link)
    return link


@router.get("/portal/backgrounds/{filename}")
def get_background(filename: str):
    """Serve a portal background image file."""
    bg_dir = settings.upload_dir / "portal_bg"
    file_path = bg_dir / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Background image not found")
    return FileResponse(file_path)


@router.delete("/portal/links/{link_id}/background", response_model=PortalLinkResponse)
def delete_background(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """Remove the background image from a portal link."""
    link = db.query(PortalLink).filter(PortalLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Portal link not found")
    _assert_can_manage(link, current_user, for_background=True)

    # 删除旧文件
    if link.background_image:
        old_filename = link.background_image.rsplit("/", 1)[-1]
        old_path = settings.upload_dir / "portal_bg" / old_filename
        if old_path.exists():
            os.remove(old_path)

    link.background_image = None
    db.commit()
    db.refresh(link)
    return link


@router.delete("/portal/links/{link_id}")
def delete_portal_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor")),
):
    """Delete a custom portal link. Builtin links cannot be deleted."""
    link = db.query(PortalLink).filter(PortalLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Portal link not found")
    if link.is_builtin:
        raise HTTPException(status_code=403, detail="Cannot delete a builtin link")
    _assert_can_manage(link, current_user)

    db.delete(link)
    db.commit()
    return {"detail": "Portal link deleted successfully"}
