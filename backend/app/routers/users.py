"""
User management router: list users, update role/status, view login logs.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models import LoginLog, User
from app.schemas import (
    LoginLogListResponse,
    LoginLogResponse,
    UserListResponse,
    UserResponse,
    UserRoleUpdate,
    UserStatusUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


VALID_ROLES = {"admin", "editor", "viewer"}


@router.get("", response_model=UserListResponse)
def list_users(
    search: Optional[str] = Query(None, description="Search by username or display name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all users with optional search (admin only)."""
    query = db.query(User)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.username.ilike(search_term)) | (User.display_name.ilike(search_term))
        )

    total = query.count()
    items = query.order_by(User.last_login_at.desc().nullslast()).offset((page - 1) * page_size).limit(page_size).all()

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in items],
        total=total,
    )


@router.put("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Update user role (admin only)."""
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")

    user.role = body.role
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.put("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    body: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Enable or disable a user account (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot disable your own account")

    user.is_active = body.is_active
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.get("/login-logs", response_model=LoginLogListResponse)
def get_login_logs(
    username: Optional[str] = Query(None, description="Filter by username"),
    success: Optional[bool] = Query(None, description="Filter by success status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Get login logs with optional filters (admin only)."""
    query = db.query(LoginLog)

    if username:
        query = query.filter(LoginLog.username.ilike(f"%{username}%"))
    if success is not None:
        query = query.filter(LoginLog.success == success)

    total = query.count()
    items = query.order_by(LoginLog.login_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return LoginLogListResponse(
        items=[LoginLogResponse.model_validate(log) for log in items],
        total=total,
    )
