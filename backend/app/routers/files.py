"""
File manager router: browse and download files from a LAN SMB share.

All endpoints require JWT auth; the SMB connection uses the current user's
cached AD credentials (see ``app.smb_client``). Only read operations exist:
listing, single-file download, and directory zip packaging.
"""

import logging
import tempfile
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

from app.auth import get_current_user
from app.models import User
from app.smb_client import SmbError, iter_file_chunks, list_dir, open_file, read_file_bytes, zip_directory

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

# extension -> (kind, media type); only these kinds can be previewed inline
_PREVIEW_KINDS: dict[str, tuple[str, str]] = {
    ".md": ("text", "text/markdown"),
    ".markdown": ("text", "text/markdown"),
    ".txt": ("text", "text/plain"),
    ".log": ("text", "text/plain"),
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".gif": ("image", "image/gif"),
    ".webp": ("image", "image/webp"),
    ".svg": ("image", "image/svg+xml"),
    ".pdf": ("pdf", "application/pdf"),
}

_PREVIEW_LIMITS: dict[str, int] = {
    "text": 2 * 1024 * 1024,
    "image": 10 * 1024 * 1024,
    "pdf": 50 * 1024 * 1024,
}


def _decode_text(raw: bytes) -> str:
    """Decode as UTF-8 first (handles BOM), falling back to GBK for legacy files."""
    for encoding in ("utf-8-sig", "gbk"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _raise_smb(e: SmbError) -> None:
    """Convert an SMB layer error into an HTTP response."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/list")
def file_list(
    path: str = Query("", description="相对路径，空字符串表示根目录"),
    current_user: User = Depends(get_current_user),
):
    """List a directory on the shared drive."""
    try:
        current_path, parent, items = list_dir(current_user, path)
    except SmbError as e:
        _raise_smb(e)
    return {
        "path": current_path,
        "parent": parent,
        "items": [item.__dict__ for item in items],
    }


@router.get("/download")
def file_download(
    path: str = Query(..., description="要下载的文件的相对路径"),
    current_user: User = Depends(get_current_user),
):
    """Stream a single file to the browser."""
    if not path:
        raise HTTPException(status_code=400, detail="缺少文件路径")
    # Validate the file is openable before the response starts: once
    # StreamingResponse begins, errors can no longer change the status code.
    try:
        with open_file(current_user, path):
            pass
    except SmbError as e:
        _raise_smb(e)

    filename = path.split("/")[-1]
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    return StreamingResponse(
        iter_file_chunks(current_user, path),
        media_type="application/octet-stream",
        headers=headers,
    )


@router.get("/download-zip")
def file_download_zip(
    path: str = Query("", description="要打包下载的目录的相对路径，空字符串表示整个根目录"),
    current_user: User = Depends(get_current_user),
):
    """Package a directory subtree into a zip and download it."""
    filename = path.split("/")[-1] or "share"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_path = tmp.name
    tmp.close()
    try:
        zip_directory(current_user, path, tmp_path)
    except SmbError as e:
        Path(tmp_path).unlink(missing_ok=True)
        _raise_smb(e)

    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename + '.zip')}"}
    return FileResponse(
        tmp_path,
        media_type="application/zip",
        headers=headers,
        background=BackgroundTask(Path(tmp_path).unlink, missing_ok=True),
    )


@router.get("/preview")
def file_preview(
    path: str = Query(..., description="要预览的文件的相对路径"),
    current_user: User = Depends(get_current_user),
):
    """Serve a file for in-browser preview (text / image / PDF only).

    Text files are decoded (UTF-8 first, GBK fallback); images and PDFs are
    streamed as-is. Oversized files are rejected with 413 by the SMB layer.
    """
    if not path:
        raise HTTPException(status_code=400, detail="缺少文件路径")
    kind = _PREVIEW_KINDS.get(Path(path).suffix.lower())
    if kind is None:
        raise HTTPException(status_code=415, detail="该文件类型不支持在线预览，请下载查看")
    kind_name, media_type = kind
    try:
        raw = read_file_bytes(current_user, path, _PREVIEW_LIMITS[kind_name])
    except SmbError as e:
        _raise_smb(e)
    if kind_name == "text":
        return Response(content=_decode_text(raw), media_type=f"{media_type}; charset=utf-8")
    return Response(content=raw, media_type=media_type)
