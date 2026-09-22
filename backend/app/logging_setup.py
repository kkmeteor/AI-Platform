"""Logging bootstrap for the backend process.

Uvicorn installs its own logging configuration for the ``uvicorn``,
``uvicorn.error`` and ``uvicorn.access`` loggers before the app module is
imported, so ``logging.basicConfig`` alone cannot add timestamps to request
lines. This module re-configures every logger (it runs after uvicorn's setup,
so this config wins) and keeps high-frequency heartbeat requests out of the
Docker log stream.
"""

import logging
from logging.config import dictConfig

from app.config import get_settings


class AccessPathFilter(logging.Filter):
    """Drop successful access-log lines for the configured path prefixes.

    Uvicorn emits one ``uvicorn.access`` line per request; agent probe
    heartbeats hit the same endpoint every few seconds and drown out real
    traffic in Docker logs. Records whose path matches an excluded prefix are
    dropped while the status code is below 400, so failures (401/403/5xx) stay
    visible for troubleshooting.

    Uvicorn populates ``record.args`` as
    ``(client_addr, method, full_path, http_version, status_code)``.
    """

    def __init__(self, exclude_paths: tuple[str, ...] = ()) -> None:
        super().__init__()
        self._exclude_paths = exclude_paths

    def filter(self, record: logging.LogRecord) -> bool:
        if not self._exclude_paths:
            return True
        args = record.args
        if not (isinstance(args, tuple) and len(args) >= 5):
            return True
        path, status = args[2], args[4]
        if not isinstance(path, str) or not isinstance(status, int) or status >= 400:
            return True
        return not any(path.startswith(prefix) for prefix in self._exclude_paths)


def configure_logging() -> None:
    """Apply timestamped formats to all loggers and silence noisy requests.

    Called once from ``app.main`` at import time. Excluded path prefixes come
    from ``access_log_exclude_paths`` (config.json ``accessLogExcludePaths`` or
    env ``ACCESS_LOG_EXCLUDE_PATHS``); an empty value disables filtering.
    """
    exclude_paths = tuple(
        prefix.strip()
        for prefix in get_settings().access_log_exclude_paths.split(",")
        if prefix.strip()
    )
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "plain": {
                    "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
                "uvicorn_default": {
                    "()": "uvicorn.logging.DefaultFormatter",
                    "fmt": "%(asctime)s | %(levelprefix)s %(name)s: %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                    "use_colors": None,
                },
                "uvicorn_access": {
                    "()": "uvicorn.logging.AccessFormatter",
                    "fmt": (
                        "%(asctime)s | %(levelprefix)s %(client_addr)s -"
                        ' "%(request_line)s" %(status_code)s'
                    ),
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                    "use_colors": None,
                },
            },
            "filters": {
                "access_path_filter": {
                    "()": "app.logging_setup.AccessPathFilter",
                    "exclude_paths": exclude_paths,
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "plain",
                    "stream": "ext://sys.stderr",
                },
                "uvicorn_default": {
                    "class": "logging.StreamHandler",
                    "formatter": "uvicorn_default",
                    "stream": "ext://sys.stderr",
                },
                "uvicorn_access": {
                    "class": "logging.StreamHandler",
                    "formatter": "uvicorn_access",
                    "filters": ["access_path_filter"],
                    "stream": "ext://sys.stdout",
                },
            },
            "loggers": {
                "uvicorn": {
                    "handlers": ["uvicorn_default"],
                    "level": "INFO",
                    "propagate": False,
                },
                "uvicorn.error": {
                    "handlers": ["uvicorn_default"],
                    "level": "INFO",
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": ["uvicorn_access"],
                    "level": "INFO",
                    "propagate": False,
                },
            },
            "root": {"handlers": ["console"], "level": "INFO"},
        }
    )
