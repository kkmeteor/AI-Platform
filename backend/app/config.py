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
      - ``dify_base_url`` → ``DIFY_BASE_URL``
      - ``dify_email``   → ``DIFY_EMAIL``
      - ``dify_password`` → ``DIFY_PASSWORD``
      - ``database_url``  → ``DATABASE_URL``

    Values from ``config/config.json`` serve as defaults and are
    automatically overridden when the corresponding env var is set.
    """

    # ── Dify ──
    dify_base_url: str = _json_defaults.get("difyUrl", "").rstrip("/")
    dify_email: str = _console.get("email", "")
    dify_password: str = _console.get("password", "")
    dify_dataset_token: str = _json_defaults.get("difyDatasetToken", "")

    # ── Database ──
    database_url: str = f"sqlite:///{PROJECT_ROOT}/skills.db"

    # ── File paths ──
    upload_dir: Path = PROJECT_ROOT / "uploads"
    data_dir: Path = PROJECT_ROOT / "data"

    model_config = {"extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached ``Settings`` singleton.

    ``pydantic-settings`` reads environment variables during
    initialisation; those values automatically override the defaults
    we set from ``config/config.json``.
    """
    return Settings()
