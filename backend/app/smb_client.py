"""
SMB client helpers for the web File Manager.

Connects to a LAN share (e.g. ``\\\\10.10.11.31\\SoftwareDev\\tengfei``) using the
current user's cached AD credentials — the base64 password stored in
``users.password`` by the login flow — and exposes read-only primitives
(directory listing, streaming file reads, zip packaging) consumed by
``routers/files.py``.

Every request opens a fresh connection: LAN auth overhead is small
(~100-300ms) and it avoids serving stale sessions after a password change.
No credentials are ever logged.
"""

import base64
import logging
import uuid
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator, Optional

from smbprotocol.connection import Connection
from smbprotocol.exceptions import NtStatus, SMBAuthenticationError, SMBException
from smbprotocol.open import (
    CreateDisposition,
    CreateOptions,
    FileAttributes,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
    Open,
    ShareAccess,
)
from smbprotocol.query_info import FileInformationClass
from smbprotocol.session import Session
from smbprotocol.tree import TreeConnect

from app.config import get_settings
from app.models import User

logger = logging.getLogger(__name__)

# Streamed read chunk size: 1 MiB keeps memory bounded for very large files
# while remaining fast enough for LAN throughput.
CHUNK_SIZE = 1024 * 1024
CONNECT_TIMEOUT_SECONDS = 30


class SmbError(Exception):
    """SMB operation failure carrying an HTTP status code and user-facing message."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass
class SmbEntry:
    """One directory entry (file or folder) as exposed by the list API."""

    name: str
    is_dir: bool
    size: Optional[int]
    modified_at: Optional[str]  # ISO 8601 UTC, None when unknown


def _user_smb_password(user: User) -> str:
    """Decode the cached base64 password used to authenticate to the share."""
    if not user.password:
        # 403 (not 401): 401 is reserved for JWT/session expiry so the frontend
        # auth interceptor must not treat this as a logged-out session.
        raise SmbError(
            403,
            "本地没有可用的共享目录凭据，请退出后重新登录以刷新凭据",
        )
    try:
        return base64.b64decode(user.password).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        logger.error("user %s has an invalid cached password entry", user.username)
        raise SmbError(403, "共享目录凭据已损坏，请退出后重新登录")


def _smb_config() -> tuple[str, str, str, str]:
    """Return (host, share, root, domain) from settings, raising 503 when unconfigured."""
    settings = get_settings()
    host = settings.smb_host.strip()
    share = settings.smb_share.strip()
    if not host or not share:
        raise SmbError(503, "共享目录服务未配置（smb.host / smb.share）")
    root = settings.smb_root.strip("/").strip("\\")
    domain = settings.smb_domain.strip() or settings.ldap_domain.strip()
    return host, share, root, domain


def _validate_rel_path(path: Optional[str]) -> str:
    """Normalize and validate a client-supplied relative path.

    Only plain relative paths are allowed: no absolute prefixes, no ``..``
    parent traversal, no drive letters or embedded separators that could
    escape the configured share root.
    """
    if not path:
        return ""
    normalized = path.strip().replace("\\", "/").strip("/")
    if not normalized:
        return ""
    for part in normalized.split("/"):
        if part in ("", ".", ".."):
            raise SmbError(400, "非法的路径格式")
        if ":" in part or "\\" in part or "\x00" in part:
            raise SmbError(400, "非法的路径格式")
    return normalized


def _absolute_path(rel_path: str) -> tuple[str, str]:
    """Join the configured root onto a relative path.

    Returns (smb_rel, rel): smb_rel is the path relative to the share (as
    consumed by Open), rel is the API-facing path for the client.
    """
    host, share, root, _domain = _smb_config()
    combined = f"{root}/{rel_path}" if root else rel_path
    combined = "/".join(p for p in combined.split("/") if p)
    return combined.replace("/", "\\"), combined


def _classify_error(exc: Exception, operation: str) -> SmbError:
    """Map raw SMB / socket exceptions to user-facing HTTP errors.

    Authentication failures are mapped to 403 (not 401): 401 is reserved for
    JWT/session expiry, which the frontend treats as a logged-out session and
    redirects to the login page.
    """
    status = getattr(exc, "status", None)
    if isinstance(exc, SMBAuthenticationError) or status in (
        NtStatus.STATUS_LOGON_FAILURE,
        NtStatus.STATUS_PASSWORD_EXPIRED,
    ):
        return SmbError(403, "共享目录凭据无效，请退出后重新登录")
    if status == NtStatus.STATUS_ACCESS_DENIED:
        return SmbError(403, "没有访问该目录的权限")
    if status in (
        NtStatus.STATUS_OBJECT_NAME_NOT_FOUND,
        NtStatus.STATUS_OBJECT_PATH_NOT_FOUND,
        NtStatus.STATUS_NO_SUCH_FILE,
    ):
        return SmbError(404, "路径不存在或已被删除")
    if status == NtStatus.STATUS_BAD_NETWORK_NAME:
        return SmbError(502, "共享不存在或无法访问")
    if isinstance(exc, SmbError):
        return exc
    if isinstance(exc, (OSError, SMBException)):
        logger.warning("SMB %s failed: %s", operation, exc)
        return SmbError(502, "共享服务器连接失败，请稍后重试")
    logger.exception("Unexpected error during SMB %s", operation)
    return SmbError(502, "共享访问出现未知错误")


@contextmanager
def _smb_tree(user: User):
    """Open an authenticated SMB connection to the configured share.

    Yields the connected TreeConnect; always tears the connection down.
    """
    host, share, _root, domain = _smb_config()
    # NTLM carries the domain inside the username (DOMAIN\user); pass it
    # separately from the website login name.
    username = f"{domain}\\{user.username}" if domain else user.username
    password = _user_smb_password(user)

    connection = Connection(uuid.uuid4(), host, port=445)
    try:
        connection.connect()
        # Timeouts are applied per socket read; a hung LAN share would
        # otherwise block the request thread indefinitely.
        connection.transport._sock.settimeout(CONNECT_TIMEOUT_SECONDS)
        session = Session(connection, username, password)
        session.connect()
        tree = TreeConnect(session, f"\\\\{host}\\{share}")
        tree.connect()
        yield tree
    except SmbError:
        raise
    except Exception as exc:  # noqa: BLE001 - classified by _classify_error
        raise _classify_error(exc, "connect") from exc
    finally:
        try:
            connection.disconnect()
        except Exception:  # noqa: BLE001 - teardown must not mask the original error
            pass


def _entry_name(raw: bytes) -> str:
    # SMB2 directory entries carry file names as UTF-16LE bytes
    return raw.decode("utf-16-le")


def _entry_modified_at(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    # smbprotocol returns timezone-aware UTC datetimes for directory entries
    return dt.astimezone(timezone.utc).isoformat()


def _list_entries(tree, abs_path: str) -> list[SmbEntry]:
    """List a directory on an already-connected tree (no connection management)."""
    open_dir = Open(tree, abs_path)
    open_dir.create(
        ImpersonationLevel.Impersonation,
        FilePipePrinterAccessMask.GENERIC_READ,
        FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
        ShareAccess.FILE_SHARE_READ | ShareAccess.FILE_SHARE_WRITE | ShareAccess.FILE_SHARE_DELETE,
        CreateDisposition.FILE_OPEN,
        CreateOptions.FILE_DIRECTORY_FILE,
    )
    entries = open_dir.query_directory("*", FileInformationClass.FILE_DIRECTORY_INFORMATION)
    open_dir.close()

    items: list[SmbEntry] = []
    for entry in entries:
        name = _entry_name(entry["file_name"].get_value())
        if name in (".", ".."):
            continue
        attributes = entry["file_attributes"].get_value()
        is_dir = bool(attributes & FileAttributes.FILE_ATTRIBUTE_DIRECTORY)
        items.append(
            SmbEntry(
                name=name,
                is_dir=is_dir,
                size=None if is_dir else int(entry["end_of_file"].get_value()),
                modified_at=_entry_modified_at(entry["last_write_time"].get_value()),
            )
        )
    items.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return items


@contextmanager
def _open_handle(tree, abs_path: str):
    """Open a file for streaming reads on an already-connected tree."""
    handle = Open(tree, abs_path)
    handle.create(
        ImpersonationLevel.Impersonation,
        FilePipePrinterAccessMask.GENERIC_READ,
        FileAttributes.FILE_ATTRIBUTE_NORMAL,
        ShareAccess.FILE_SHARE_READ | ShareAccess.FILE_SHARE_WRITE | ShareAccess.FILE_SHARE_DELETE,
        CreateDisposition.FILE_OPEN,
        CreateOptions.FILE_NON_DIRECTORY_FILE,
    )
    yield handle
    handle.close()


def _read_chunks(handle: Open) -> Iterator[bytes]:
    """Read a whole file in bounded chunks, advancing the SMB read offset."""
    offset = 0
    while True:
        try:
            chunk = handle.read(offset, CHUNK_SIZE)
        except SMBException as exc:
            # EOF is signalled as a status in this smbprotocol version
            if getattr(exc, "status", None) == NtStatus.STATUS_END_OF_FILE:
                break
            raise
        if not chunk:
            break
        offset += len(chunk)
        yield chunk


def list_dir(user: User, rel_path: str) -> tuple[str, Optional[str], list[SmbEntry]]:
    """List a directory; returns (path, parent, entries) sorted dirs-first."""
    rel_path = _validate_rel_path(rel_path)
    _abs_path, _combined = _absolute_path(rel_path)
    with _smb_tree(user) as tree:
        try:
            items = _list_entries(tree, _abs_path)
        except SmbError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise _classify_error(exc, "list") from exc

    parent = None
    if rel_path:
        parent = "/".join(rel_path.split("/")[:-1]) or None
    # Return the normalized rel path (not the root-joined absolute one): the
    # API-facing path must stay relative to the configured root so the client
    # can round-trip it back as a query parameter without duplicating root.
    return rel_path, parent, items


@contextmanager
def open_file(user: User, rel_path: str):
    """Open a file for streaming reads; yields a file-like object.

    Caller must consume the file inside the ``with`` block: the SMB
    connection is closed when the block exits.
    """
    rel_path = _validate_rel_path(rel_path)
    abs_path, _combined = _absolute_path(rel_path)
    with _smb_tree(user) as tree:
        try:
            with _open_handle(tree, abs_path) as fh:
                yield fh
        except SmbError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise _classify_error(exc, "open file") from exc


def iter_file_chunks(user: User, rel_path: str) -> Iterator[bytes]:
    """Yield the file content in bounded chunks (used by the download API)."""
    with open_file(user, rel_path) as handle:
        yield from _read_chunks(handle)


def read_file_bytes(user: User, rel_path: str, max_bytes: int) -> bytes:
    """Read a file fully but bounded; raises 413 when it exceeds max_bytes.

    Used by the preview API so oversized files are rejected as soon as the
    limit is crossed instead of being buffered into memory.
    """
    rel_path = _validate_rel_path(rel_path)
    abs_path, _combined = _absolute_path(rel_path)
    with _smb_tree(user) as tree:
        try:
            with _open_handle(tree, abs_path) as handle:
                chunks: list[bytes] = []
                total = 0
                for chunk in _read_chunks(handle):
                    total += len(chunk)
                    if total > max_bytes:
                        raise SmbError(413, "文件过大，请下载查看")
                    chunks.append(chunk)
                return b"".join(chunks)
        except SmbError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise _classify_error(exc, "open file") from exc


def _zip_add(tree, abs_path: str, rel_dir: str, arc_root: str, zf: zipfile.ZipFile) -> None:
    """Depth-first copy of a directory subtree into the zip archive."""
    for entry in _list_entries(tree, abs_path):
        rel = f"{rel_dir}/{entry.name}" if rel_dir else entry.name
        arc = f"{arc_root}/{rel}"
        entry_abs = f"{abs_path}\\{entry.name}"
        if entry.is_dir:
            zf.writestr(zipfile.ZipInfo(f"{arc}/"), b"")
            _zip_add(tree, entry_abs, rel, arc_root, zf)
        else:
            with _open_handle(tree, entry_abs) as handle:
                with zf.open(arc, "w") as dest:
                    for chunk in _read_chunks(handle):
                        dest.write(chunk)


def zip_directory(user: User, rel_path: str, zip_path: str) -> None:
    """Package a directory subtree into ``zip_path`` on a single SMB connection.

    The zip keeps the folder's own name as its root entry (e.g. downloading
    ``docs`` yields ``docs/...`` inside the archive).
    """
    rel_path = _validate_rel_path(rel_path)
    abs_path, _combined = _absolute_path(rel_path)
    arc_root = rel_path.split("/")[-1] or "share"
    with _smb_tree(user) as tree:
        try:
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                _zip_add(tree, abs_path, "", arc_root, zf)
        except SmbError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise _classify_error(exc, "zip") from exc
