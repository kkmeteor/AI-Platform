"""
Authentication router: login, logout, and current user info.
"""

import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import authenticate_ldap, create_access_token, get_current_user, record_login_log
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, LoginResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate user via cached credentials, falling back to LDAP/AD on mismatch, then return JWT token."""
    username = req.username.strip()
    ip_address = _get_client_ip(request)

    if not username or not req.password:
        record_login_log(db, None, username or "unknown", ip_address, False, "Empty username or password")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and password are required")

    # Look up cached credentials in database first
    user = db.query(User).filter(User.username == username).first()

    encoded_password = base64.b64encode(req.password.encode("utf-8")).decode("utf-8")

    if user and user.password == encoded_password:
        # Cached credential hit: skip LDAP authentication
        success, message, user_info = True, "Cached credential login", {
            "display_name": user.display_name,
            "email": user.email,
        }
    else:
        # Cache miss or password mismatch: fall back to guest / LDAP authentication
        if username == "guest" and req.password == "guest":
            success, message, user_info = True, "Guest login", {"display_name": "Guest"}
        else:
            # Authenticate against LDAP
            success, message, user_info = authenticate_ldap(username, req.password)

        if not success:
            record_login_log(db, user.id if user else None, username, ip_address, False, message)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)

        # Refresh cached password after successful re-authentication
        if user:
            user.password = encoded_password

    # Find or create local user record
    if user:
        if not user.is_active:
            record_login_log(db, user.id, username, ip_address, False, "Account disabled")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account has been disabled. Please contact administrator.")
        # Cache password on first successful LDAP login
        if not user.password:
            user.password = base64.b64encode(req.password.encode("utf-8")).decode("utf-8")
        # Update user info from AD
        if user_info:
            if user_info.get("display_name"):
                user.display_name = user_info["display_name"]
            if user_info.get("email"):
                user.email = user_info["email"]
    else:
        # Create new user (first login) and cache credentials
        user = User(
            username=username,
            password=base64.b64encode(req.password.encode("utf-8")).decode("utf-8"),
            display_name=user_info.get("display_name") if user_info else username,
            email=user_info.get("email") if user_info else None,
            role="viewer",
            is_active=True,
        )
        db.add(user)

    # Update last login time
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    # Record successful login
    record_login_log(db, user.id, username, ip_address, True)

    # Generate JWT token
    access_token = create_access_token(user)

    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    """Logout (client should discard token)."""
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info."""
    return UserResponse.model_validate(current_user)
