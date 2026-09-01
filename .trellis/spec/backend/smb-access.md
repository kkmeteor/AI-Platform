# SMB Share Access Layer

> Contracts and pitfalls for the SMB file manager module (`backend/app/smb_client.py`, `backend/app/routers/files.py`).

---

## 1. Scope / Trigger

- Added a new module that browses / downloads from a LAN SMB share using cached AD credentials.
- Trigger for this spec: new integration module + cross-layer error contract that collides with the frontend 401 interceptor.

## 2. Signatures

Backend API (all require `Depends(get_current_user)`, JWT bearer):

```
GET /api/files/list?path=<rel>          -> 200 {path, parent, items: [{name, is_dir, size, modified_at}]}
GET /api/files/download?path=<rel>      -> 200 streaming attachment (filename* UTF-8)
GET /api/files/download-zip?path=<rel>  -> 200 zip (empty path = share root; arc root = dir name / "share")
```

SMB layer (`smb_client.py`):

```
list_dir(path) -> list[dict]                      # name / is_dir / size / modified_at(UTC iso)
open_file(path) -> (Open handle, size)
iter_file_chunks(handle, size) -> Iterator[bytes] # read(offset, length), EOF via STATUS_END_OF_FILE
zip_directory(path, out_fd)                       # single connection, DFS zipfile stream
```

Config keys (`config.json` -> `config.smb`): `host`, `share`, `root`, `domain` (empty = reuse `ldap_domain`).

## 3. Contracts

- Paths are **relative to the share root** (not UNC). `root` config scopes all access.
- Path validation rejects `..`, leading `/`, `:`, NUL; `GET /files/list` returns `400` for traversal attempts.
- Credentials come from the logged-in user's cached base64 password (`users.password`), authenticated via NTLM (`DOMAIN\username`).
- Error responses: FastAPI `HTTPException(detail=<Chinese message>)`; frontend shows `detail` via antd message.

## 4. Validation & Error Matrix

| Condition | HTTP | detail (中文) |
|-----------|------|---------------|
| JWT invalid / expired | 401 | (auth layer, session expiry) |
| No cached password / corrupted | 403 | 本地没有可用的共享目录凭据… |
| SMB logon failure / password expired | 403 | 共享目录凭据无效，请退出后重新登录 |
| SMB access denied (ACL) | 403 | 没有访问该目录的权限 |
| Path not found | 404 | 路径不存在 |
| Path traversal | 400 | 非法的路径 |
| Bad network name / other | 502 | 共享目录暂时不可用… |

**CRITICAL**: SMB credential failures must be `403`, never `401`. The frontend axios interceptor treats ANY 401 as session expiry → clears token → redirects to login. A business-level 401 (share credentials bad) would log the user out of the whole site.

## 5. Good / Base / Bad Cases

- Good: valid AD user cached credentials → list / download / zip all work.
- Base: guest or unknown user → 403 message shown in page, user stays logged in.
- Bad: return 401 for SMB logon failure → user gets kicked to the login page on every click.

## 6. Tests Required

- `GET /files/list` with real user → 200 with real share entries (assert file names/sizes).
- `GET /files/list?path=..` → 400; nonexistent path → 404; no token → 401.
- `GET /files/download` → byte-identical stream; `download-zip` → openable zip with expected members.
- SMB logon failure user → 403 (NOT 401), then frontend stays on page.

## 7. Wrong vs Correct

```python
# Wrong: business auth failure reported as 401 (frontend treats it as session expiry → logout)
raise SmbError(401, "共享目录凭据无效，请退出后重新登录")

# Correct: 403 for business-level credential problems; 401 reserved for JWT/session expiry
raise SmbError(403, "共享目录凭据无效，请退出后重新登录")
```

---

## smbprotocol 1.17 Gotchas (verified against installed version)

- `Connection(uuid4(), host, port=445)` has **no timeout kwarg**; set `conn.transport._sock.settimeout(30)` after connect.
- `Session(conn, f"{domain}\\{username}", password)` — no `domain` kwarg, embed domain in username. Authenticate failures raise `SMBAuthenticationError`.
- `Open(tree, rel_path)` paths are **relative to the share**, not UNC.
- `Open.create()` requires `ImpersonationLevel.Impersonation`, `FilePipePrinterAccessMask.GENERIC_READ`, `FileAttributes.X`, `ShareAccess.FILE_SHARE_READ|WRITE|DELETE`, `CreateDisposition.FILE_OPEN`, `CreateOptions.X`.
- `query_directory("*", FileInformationClass.FILE_DIRECTORY_INFORMATION)`; fields accessed via `entry["file_name"].get_value()`; file names are **UTF-16LE** bytes.
- `Open` has no `.file` attr; read via `open.read(offset, length)`, EOF detected by `NtStatus.STATUS_END_OF_FILE` exception (from `smbprotocol.exceptions`).
- Error codes live in `smbprotocol.exceptions.NtStatus` (e.g. `STATUS_LOGON_FAILURE`, `STATUS_ACCESS_DENIED`, `STATUS_OBJECT_NAME_NOT_FOUND`), not `smbprotocol.ntstatus`.
