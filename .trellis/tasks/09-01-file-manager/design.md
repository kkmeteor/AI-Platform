# File Manager 技术设计

## 1. 架构与边界

```
浏览器 (React FileManagerPage)
   │  JWT (axios / 浏览器直链)
   ▼
FastAPI /api/files/* (app/routers/files.py)
   │  smbprotocol (NTLM, 用户名=当前登录用户)
   ▼
SMB 共享 \\10.10.11.31\SoftwareDev\tengfei\
```

- 纯后端代理模式：浏览器不直连 SMB，所有读写经 FastAPI，凭据不出后端。
- 复用现有 JWT 认证：所有接口 `Depends(get_current_user)`（`app/auth.py`）。
- 只读功能，无任何写操作。

## 2. 关键决策与权衡

| 决策 | 选择 | 理由 / 权衡 |
|------|------|-------------|
| SMB 客户端库 | `smbprotocol`（纯 Python，SMB 2/3） | pysmb 仅支持 SMB1（现代 Windows 默认禁用）；smbprotocol 支持 NTLM 认证与流式文件读取 |
| 认证方式 | NTLM（username/password/domain） | 服务器是 IP 地址 `10.10.11.31`，无 SPN，Kerberos 不可用；smbprotocol 对 IP 自动走 NTLM |
| 凭据来源 | 解密 `users.password`（base64 缓存密码） | 与登录认证同一套 AD 凭据；密码为空时返回 401 语义错误"请重新登录" |
| 域名 | 复用 `ldap_domain` 配置；允许 `smbDomain` 独立覆盖 | 同一 AD 环境域名一致；独立配置项保留灵活性 |
| 连接管理 | 每次请求新建 SMBConnection（context manager） | 无连接池复杂度；局域网认证开销 ~100-300ms 可接受；避免密码变更后的陈旧连接 |
| zip 打包 | 临时文件 + FileResponse + BackgroundTask 删除 | zipfile 需要可 seek 写器；临时文件方式简单可靠，避免流式 zip 的边界问题 |
| 路径安全 | 仅接受相对路径（禁绝对路径 / `..` / 前缀分隔符） | 防路径穿越逃出根目录；根目录固定为配置的 smbRoot |

## 3. 配置（config/config.json + 环境变量覆盖，不入库）

```jsonc
{
  "smb": {
    "host": "10.10.11.31",        // 或 env SMB_HOST
    "share": "SoftwareDev",       // SMB_SHARE
    "root": "tengfei",            // 根目录相对共享的路径，空串=共享根 SMB_ROOT
    "domain": ""                  // 可选，覆盖 ldap.domain，SMB_DOMAIN
  }
}
```

- `config.json.example` 同步补充示例（无敏感信息）。
- 未配置 `smb.host` 时接口返回 503 配置缺失。

## 4. API 契约（prefix `/api/files`）

### GET /api/files/list?path=<相对路径>
- `path` 缺省或空 = 根目录；必须以 `/` 分隔、无首尾分隔符问题；校验通过 `_validate_rel_path`。
- 响应：
```jsonc
{
  "path": "sub/dir",            // 当前目录（相对根）
  "parent": "sub",              // 上级目录；根目录为 null
  "items": [
    { "name": "report.docx", "is_dir": false, "size": 204800, "modified_at": "2026-08-30T10:00:00Z" },
    { "name": "docs", "is_dir": true, "size": null, "modified_at": "2026-08-01T08:00:00Z" }
  ]
}
```
- 目录优先排序，其余按名称排序。
- 错误：共享不可达 → 502 + 中文提示；凭据失败 → 401（detail 提示重新登录）；路径不存在/无权限 → 404。

### GET /api/files/download?path=<相对路径>
- 仅允许指向文件；`StreamingResponse` 按块读取 SMB 文件（1MB 块），`Content-Disposition: attachment; filename*=UTF-8''<urlencoded>`。

### GET /api/files/download-zip?path=<相对路径>
- 仅允许指向目录；递归遍历（深度不限，循环/重复条目按 SMB 目录语义天然无环），流式写入临时 zip，完成后 `FileResponse` + `BackgroundTask` 删除临时文件。
- zip 内保留相对目录结构（根 = 所下载目录名）。

## 5. 数据流

1. 请求携带 JWT → `get_current_user` 校验 → 拿到 `User`。
2. `smb_client.py` 构造连接：`SMBConnection(uuid.uuid4(), username, password, domain, host, port=445)` + `connect()` + `TreeConnect(share)`。
3. 列表：`query_directory` 过滤 `.`/`..`，取 file attributes → is_dir；`get_file_info` 取 size / last_write_time（转 UTC ISO）。
4. 下载：`open_file` + `read` 循环，yield 给 StreamingResponse。
5. zip：`os.walk` 等价递归（smbprotocol 无 walk，自实现 DFS），`zipfile.ZipFile(tmp, "w", ZIP_DEFLATED)` 逐文件写入。

## 6. 前端设计

- `FileManagerPage.tsx` + `FileManagerPage.css`：面包屑导航（根/…/当前）、antd Table（名称 / 大小 / 修改时间）、文件夹行双击/点击进入、文件行"下载"、文件夹行"下载 zip"按钮、空目录与加载态、错误 message 提示。
- `api.ts` 新增：`fetchFileList(path)`、`getFileDownloadUrl(path)`（返回 `/api/files/download?path=…`，浏览器直链下载不走 axios，避免 30s 超时）、`getZipDownloadUrl(path)`。
- `Sidebar.tsx` Online 组新增 `file-manager` 导航项（文件夹图标，1.5px stroke 风格与现有图标一致）。
- `App.tsx` `renderContent()` 注册 `file-manager` → `<FileManagerPage />`。

## 7. 兼容性与运维

- 后端新增依赖 `smbprotocol>=1.12.0`（纯 Python，无需编译，Docker 构建无额外系统依赖）。
- 容器需能出网访问 10.10.11.31:445（默认 bridge 网络即可；若部署机有防火墙需放行）。
- 回滚：删除 router 注册与前端导航项即可整体下线，不动数据库 schema。
- 密码缓存已有机制（login 时 base64 写入 `users.password`）；若某用户密码缓存为空（理论上登录即写入），接口返回 401 提示重新登录。
- 日志禁止输出密码或 SMB 凭据。

## 8. 风险

- 大目录 zip 耗时/体积：MVP 不设硬限制，前端展示"打包中"状态；后续可加大小上限。
- NTLM 被服务器策略禁用（罕见）：需改 Kerberos（要求域名而非 IP 访问共享），作为已知边界。
- SMB 服务器与部署机时钟偏差大时 NTLM 可能失败：属环境问题，报错即可。
