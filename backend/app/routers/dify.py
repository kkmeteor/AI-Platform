import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dify", tags=["dify"])

# ---------------------------------------------------------------------------
# Dify session manager – lazy login, auto-retry on 401
# ---------------------------------------------------------------------------

class DifySession:
    """Manages an httpx.AsyncClient with cookie-based Dify console session."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._logged_in = False

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            cfg = get_settings()
            self._client = httpx.AsyncClient(
                base_url=cfg.dify_base_url,
                timeout=30.0,
                cookies=httpx.Cookies(),
            )
        return self._client

    async def login(self) -> None:
        """Perform login and store cookies in the client."""
        client = await self._ensure_client()
        cfg = get_settings()
        resp = await client.post(
            "/console/api/login",
            json={
                "email": cfg.dify_email,
                "password": cfg.dify_password,
                "language": "zh-Hans",
                "remember_me": True,
            },
        )
        if resp.status_code != 200:
            logger.error("Dify login failed: %s %s", resp.status_code, resp.text)
            raise HTTPException(status_code=502, detail=f"Dify login failed: {resp.status_code}")
        self._logged_in = True
        logger.info("Dify login succeeded")

    async def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Send a request, auto-login on first call, retry once on 401."""
        client = await self._ensure_client()
        if not self._logged_in:
            await self.login()

        # Inject x-csrf-token from cookies
        headers = kwargs.pop("headers", {}) or {}
        csrf = client.cookies.get("csrf_token")
        if csrf:
            headers.setdefault("x-csrf-token", csrf)

        resp = await client.request(method, path, headers=headers, **kwargs)

        # If session expired, re-login and retry once
        if resp.status_code == 401:
            logger.info("Got 401, re-logging in …")
            self._logged_in = False
            await self.login()
            csrf = client.cookies.get("csrf_token")
            if csrf:
                headers["x-csrf-token"] = csrf
            resp = await client.request(method, path, headers=headers, **kwargs)

        return resp


# Module-level singleton
_session = DifySession()

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/apps")
async def get_dify_apps():
    """Proxy: GET /console/api/apps – returns the Dify application list."""
    resp = await _session.request("GET", "/console/api/apps", params={"page": 1, "limit": 100})
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/chat-apps")
async def get_dify_chat_apps():
    """Return a curated list of online chat apps with site tokens.

    1. Fetches all apps from Dify (paginated).
    2. Filters to those tagged ``online`` (type=app).
    3. For each, fetches the app detail to obtain ``site.access_token``
       and ``site.icon``.
    4. Returns a flattened list suitable for frontend card rendering.
    """
    # Step 1: get app list
    list_resp = await _session.request("GET", "/console/api/apps", params={"page": 1, "limit": 100})
    if list_resp.status_code != 200:
        raise HTTPException(status_code=list_resp.status_code, detail=list_resp.text)

    apps: list[dict[str, Any]] = (list_resp.json().get("data") or [])

    # Step 2: filter online apps
    online_apps = [
        app for app in apps
        if any(
            t.get("name") == "online" and t.get("type") == "app"
            for t in (app.get("tags") or [])
        )
    ]

    # Step 3: fetch detail for each app to get site.access_token
    result: list[dict[str, Any]] = []
    for app in online_apps:
        app_id = app.get("id")
        if not app_id:
            continue
        detail_resp = await _session.request("GET", f"/console/api/apps/{app_id}")
        if detail_resp.status_code != 200:
            logger.warning("Failed to fetch detail for app %s: %s", app_id, detail_resp.status_code)
            continue
        detail = detail_resp.json()
        site_info = detail.get("site") or {}
        result.append({
            "id": app.get("id"),
            "name": app.get("name"),
            "description": app.get("description") or "",
            "icon": site_info.get("icon") or "🤖",
            "icon_background": site_info.get("icon_background") or "",
            "access_token": site_info.get("access_token") or "",
            "mode": app.get("mode") or "",
        })

    return result


@router.get("/apps/{app_id}")
async def get_dify_app_detail(app_id: str):
    """Proxy: GET /console/api/apps/{app_id} – returns Dify app detail.

    The response includes site info such as ``site.access_token``
    and ``site.icon`` needed for chat session configuration.
    """
    resp = await _session.request("GET", f"/console/api/apps/{app_id}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()
