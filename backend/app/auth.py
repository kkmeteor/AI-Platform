"""
Authentication module: JWT utilities, LDAP authentication, and FastAPI dependencies.
"""

import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from ldap3 import Server, Connection, ALL, SUBTREE, SIMPLE
from ldap3.core.exceptions import LDAPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User, LoginLog

settings = get_settings()

security = HTTPBearer(auto_error=False)


# ── JWT Utilities ──

def create_access_token(user: User) -> str:
    """Generate a JWT access token for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── LDAP Authentication ──

def authenticate_ldap(username: str, password: str) -> tuple[bool, str, Optional[dict]]:
    """
    Authenticate user against LDAP/Active Directory.
    Returns (success, message, user_info_dict).
    user_info_dict contains display_name and email if available.
    """
    if not settings.ldap_server:
        return False, "LDAP server not configured", None

    try:
        server = Server(
            settings.ldap_server,
            port=settings.ldap_port,
            use_ssl=settings.ldap_use_ssl,
            get_info=ALL,
        )

        # Build username: use DOMAIN\username for AD simple bind
        if settings.ldap_domain:
            ldap_username = f"{settings.ldap_domain}\\{username}"
        elif settings.ldap_user_prefix:
            ldap_username = f"{settings.ldap_user_prefix}{username}"
        else:
            ldap_username = username

        # Use SIMPLE authentication (NTLM requires MD4 which is removed in OpenSSL 3.x)
        conn = Connection(server, user=ldap_username, password=password, authentication=SIMPLE)

        if not conn.bind():
            return False, f"LDAP authentication failed: {conn.result.get('message', 'Invalid credentials')}", None

        # Search for user details
        user_info = {"display_name": None, "email": None}
        if settings.ldap_base_dn:
            search_filter = f"(&(objectClass=person)(sAMAccountName={username}))"
            conn.search(
                settings.ldap_base_dn,
                search_filter,
                search_scope=SUBTREE,
                attributes=["displayName", "mail", "cn"],
            )
            if conn.entries:
                entry = conn.entries[0]
                user_info["display_name"] = str(entry.displayName) if hasattr(entry, "displayName") and entry.displayName else str(entry.cn) if hasattr(entry, "cn") and entry.cn else username
                user_info["email"] = str(entry.mail) if hasattr(entry, "mail") and entry.mail else None

        conn.unbind()
        return True, "Authentication successful", user_info

    except LDAPException as e:
        return False, f"LDAP error: {e}", None
    except Exception as e:
        return False, f"Authentication error: {e}", None


# ── FastAPI Dependencies ──

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate the current user from JWT token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled")

    return user


def require_probe_token(x_token: str = Header(default="", alias="X-Probe-Token")) -> bool:
    """Validate the shared agent probe token (X-Probe-Token header).

    Independent of the user JWT flow: agent services (is-busy.py probes,
    automated test reporters) run headless and cannot hold a user session.
    A missing configured token means the endpoint is intentionally disabled.
    """
    if not settings.probe_token:
        raise HTTPException(
            status_code=503,
            detail="Probe endpoint not configured (probe_token is empty)",
        )
    if not x_token or not hmac.compare_digest(x_token, settings.probe_token):
        raise HTTPException(status_code=401, detail="Invalid probe token")
    return True


def require_role(*roles: str):
    """Dependency factory: ensure the current user has one of the required roles."""
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not authorized. Required: {', '.join(roles)}",
            )
        return current_user
    return checker


def record_login_log(db: Session, user_id: Optional[int], username: str, ip_address: Optional[str], success: bool, message: Optional[str] = None):
    """Record a login attempt in the login_logs table."""
    log = LoginLog(
        user_id=user_id,
        username=username,
        ip_address=ip_address,
        success=success,
        message=message,
    )
    db.add(log)
    db.commit()
