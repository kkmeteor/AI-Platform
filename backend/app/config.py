"""
Application configuration centre.

Priority (highest → lowest):
  1. Environment variable (DIFY_BASE_URL, DIFY_EMAIL, …)
  2. config/config.json
  3. Hardcoded default

Usage:
    from app.config import get_settings
    settings = get_settings()
    settings.dify_base_url
"""

import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

# ---------------------------------------------------------------------------
# Project root — computed once at module load
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # backend/
_CONFIG_JSON = PROJECT_ROOT.parent / "config" / "config.json"


def _load_json() -> dict:
    if not _CONFIG_JSON.exists():
        return {}
    with open(_CONFIG_JSON, encoding="utf-8") as f:
        return json.load(f)


_json_defaults = _load_json()
_console = _json_defaults.get("difyConsole", {})


# ---------------------------------------------------------------------------
# Settings model — pydantic-settings auto-reads env vars for each field
# ---------------------------------------------------------------------------
class Settings(BaseSettings):
    """Application settings.

    Env var names are derived from field names by uppercasing, e.g.:
      - ``dify_base_url``  → ``DIFY_BASE_URL``
      - ``dify_email``     → ``DIFY_EMAIL``
      - ``dify_password``  → ``DIFY_PASSWORD``
      - ``database_url``   → ``DATABASE_URL``
      - ``upload_dir``     → ``UPLOAD_DIR``
      - ``data_dir``       → ``DATA_DIR``

    Values from ``config/config.json`` serve as defaults and are
    automatically overridden when the corresponding env var is set.
    """

    # ── Dify ──
    dify_base_url: str = _json_defaults.get("difyUrl", "").rstrip("/")
    dify_email: str = _console.get("email", "")
    dify_password: str = _console.get("password", "")
    dify_dataset_token: str = _json_defaults.get("difyDatasetToken", "")

    # ── Database ──
    database_url: str = _json_defaults.get(
        "databaseUrl", f"sqlite:///{PROJECT_ROOT}/skills.db"
    )

    # ── File paths ──
    upload_dir: Path = Path(
        _json_defaults.get("uploadDir", str(PROJECT_ROOT / "uploads"))
    )
    data_dir: Path = Path(
        _json_defaults.get("dataDir", str(PROJECT_ROOT / "data"))
    )

    # ── LDAP / Active Directory ──
    ldap_server: str = _json_defaults.get("ldap", {}).get("server", "")
    ldap_port: int = _json_defaults.get("ldap", {}).get("port", 389)
    ldap_use_ssl: bool = _json_defaults.get("ldap", {}).get("useSsl", False)
    ldap_domain: str = _json_defaults.get("ldap", {}).get("domain", "")
    ldap_base_dn: str = _json_defaults.get("ldap", {}).get("baseDn", "")
    ldap_user_prefix: str = _json_defaults.get("ldap", {}).get("userPrefix", "")

    # ── JWT ──
    jwt_secret_key: str = _json_defaults.get("jwtSecretKey", "change-me-in-production")
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = _json_defaults.get("jwtExpireHours", 8)

    model_config = {"extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached ``Settings`` singleton.

    ``pydantic-settings`` reads environment variables during
    initialisation; those values automatically override the defaults
    we set from ``config/config.json``.
    """
    return Settings()
