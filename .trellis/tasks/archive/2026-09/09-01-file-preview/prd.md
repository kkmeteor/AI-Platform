# 共享目录文档在线预览（Markdown/图片/PDF）

## Goal

在现有文件管理页面中，支持点击共享目录内的文档（Markdown/文本/图片/PDF）直接在网页上预览，无需先下载到本地。

## Background / Confirmed Facts

- 现有 File Manager 已上线（`GET /api/files/list`、`/download`、`/download-zip`），任务 `09-01-file-manager`。
- `backend/app/smb_client.py` 提供 `open_file(user, rel_path)`、`iter_file_chunks`、`SmbError`（业务凭据错误 403 约定），直接复用，无需新增 SMB 能力。
- 路径契约已统一为"相对 root"语义，预览接口沿用同一约定（`_validate_rel_path` + `_absolute_path` 复用）。
- 前端 FileManagerPage（antd Table）已有操作列可扩展；`package.json` 无 markdown 渲染库，需新增 `react-markdown` + `remark-gfm`。

## Requirements

**R1 后端**：新增 `GET /api/files/preview?path=<rel>`，JWT 认证 + SMB 凭据，按扩展名白名单处理：

| 类型 | 扩展名 | 返回 | 大小上限 |
|------|--------|------|----------|
| 文本 | `.md` `.markdown` `.txt` `.log` | `text/markdown` 或 `text/plain`（UTF-8 优先，失败回退 GBK） | 2 MB |
| 图片 | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | 字节流 `image/*` | 10 MB |
| PDF | `.pdf` | 字节流 `application/pdf` | 50 MB |
| 其他/超限 | — | `HTTPException`（中文 detail：不支持的类型 / 文件过大请下载查看） | — |

**R2 前端**：文件列表操作列按类型显示"预览"按钮（仅白名单类型）；点击后 antd Modal 展示：
- MD → `react-markdown` + `remark-gfm` 渲染（表格、任务列表、代码块）
- 纯文本 → `<pre>` 展示
- 图片 → `<img>` 展示
- PDF → `<iframe>`（浏览器内置查看器）

**R3 约束**：预览请求同样走 JWT + SMB 凭据，错误码沿用 401/403 约定（凭据失败 403，前端不被登出）；路径校验复用 `_validate_rel_path`。

## Acceptance Criteria

- AC1: MD 文件（含标题/列表/表格/代码块）预览正确渲染 GFM 语法，中文无乱码
- AC2: GBK 编码 txt 预览不乱码（UTF-8 解码失败自动回退 GBK）
- AC3: png/jpg 图片预览显示原图；PDF 预览可翻页
- AC4: 超限文件点预览 → 中文提示"文件过大，请下载查看"，无异常
- AC5: exe/zip 等不支持类型不显示"预览"按钮
- AC6: guest（无 SMB 凭据）点预览 → 403 气泡提示，页面保持登录态
- AC7: 路径穿越 `../` → 400；`npx tsc --noEmit` 通过

## Out of Scope

- 文档编辑/上传/重命名等写操作
- Office 文档（docx/xlsx/ppt）在线渲染（后续可接入 OnlyOffice / kkFileView 类服务）
- 超限文件的在线预览

## Key Decisions

- D1: 预览类型 = MD + 文本 + 图片 + PDF（用户确认）
- D2: 预览交互 = 列表内 Modal 弹窗，不新增路由（改动最小）
- D3: 大小限制 = 文本 2MB / 图片 10MB / PDF 50MB
- D4: markdown 渲染用 `react-markdown` + `remark-gfm`（社区标准，antd 生态无冲突）
