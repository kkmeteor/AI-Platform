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
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from app.auth import get_current_user
from app.models import User
from app.smb_client import SmbError, iter_file_chunks, list_dir, open_file, zip_directory

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)


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
