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
