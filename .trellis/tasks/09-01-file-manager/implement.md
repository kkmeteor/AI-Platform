# File Manager 实施计划

## 顺序清单

### 后端（Phase 1：SMB 访问层 + API）
1. [ ] `backend/requirements.txt` 添加 `smbprotocol>=1.12.0`；本地 venv 安装 `pip install smbprotocol`
2. [ ] `backend/app/config.py`：Settings 增加 `smb_host` / `smb_share` / `smb_root` / `smb_domain`（读取 `config.json` 的 `smb` 段，环境变量 `SMB_HOST` 等覆盖）
3. [ ] 新建 `backend/app/smb_client.py`：
   - `get_user_smb_password(user)`：base64 解密 `users.password`，为空抛"请重新登录"错误
   - `SMBContext`（contextmanager）：建连 + TreeConnect + 关闭（超时控制）
   - `list_dir(conn, rel_path)` → items（name/is_dir/size/modified_at，目录优先排序）
   - `iter_file_chunks(conn, rel_path, chunk_size=1MB)`：下载流式读取
   - `_validate_rel_path(path)`：禁绝对路径、`..`、前缀 `/` 或 `\`；统一 `/` 分隔
4. [ ] 新建 `backend/app/routers/files.py`：
   - `GET /files/list?path=`（响应含 path/parent/items）
   - `GET /files/download?path=`（StreamingResponse，`Content-Disposition` 含 RFC 5987 文件名）
   - `GET /files/download-zip?path=`（递归 DFS → 临时 zip → FileResponse + BackgroundTask 删除）
   - 错误映射：SMBException → 502/401/404 + 中文 detail
5. [ ] `backend/app/main.py` 注册 `files.router`
6. [ ] `config/config.json.example` 补充 `smb` 段示例；本地 `config/config.json` 填入真实 host/share/root
7. [ ] 后端验证（见验证命令）

### 前端（Phase 2：页面与入口）
8. [ ] `frontend/src/services/api.ts`：新增 `FileEntry` 接口、`fetchFileList(path)`、`getFileDownloadUrl(path)`、`getZipDownloadUrl(path)`
9. [ ] 新建 `frontend/src/pages/FileManagerPage.tsx` + `FileManagerPage.css`：
   - 面包屑导航（根/…/当前，可点击返回）
   - 文件列表 Table（名称/大小/修改时间），文件夹行进入、文件行下载、文件夹"下载 zip"
   - 加载态、空目录态、错误 message
10. [ ] `frontend/src/components/Sidebar.tsx`：Online 组新增 `file-manager` 项 + 文件夹图标（1.5px stroke）
11. [ ] `frontend/src/App.tsx`：`renderContent()` 注册 `file-manager` → `<FileManagerPage />`

### 联调与收尾（Phase 3）
12. [ ] 前端本地联调：登录 → 文件管理 → 逐级浏览 → 单文件下载 → 目录 zip 下载 → 错误路径（不存在目录、未登录 401）
13. [ ] 检查代码规范（命名/注释/错误处理）、无密码进日志
14. [ ] `.trellis/spec/` 更新（如适用）；`task.py start` 后按 check 流程收尾

## 验证命令

```bash
# 后端（backend/.venv）
.venv\Scripts\python -m pip install smbprotocol
.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload

# 冒烟（需先登录拿 token）
curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"username":"...","password":"..."}'
curl "http://localhost:8000/api/files/list" -H "Authorization: Bearer <token>"
curl "http://localhost:8000/api/files/list?path=sub" -H "Authorization: Bearer <token>"
curl -o out.bin "http://localhost:8000/api/files/download?path=sub/file.txt" -H "Authorization: Bearer <token>"
curl -o out.zip "http://localhost:8000/api/files/download-zip?path=sub" -H "Authorization: Bearer <token>"
# 校验：文件内容一致（fc / 哈希）、zip 可正常解压且目录结构正确、路径穿越被拒（path=..%2F..）
```

```bash
# 前端
cd frontend && npm run dev
# 浏览器验证清单：
# ① 侧边栏"文件管理"入口可见 ② 根目录列表正确（文件夹/文件/大小/时间）
# ③ 进入/返回子目录 ④ 文件下载成功且内容一致 ⑤ 文件夹 zip 下载可解压
# ⑥ 无权限目录报错友好 ⑦ 退出登录后访问重定向登录页
```

## 风险文件 / 回滚点

- `backend/app/smb_client.py`、`backend/app/routers/files.py`：新文件，删除即可整体下线
- `main.py` 的 router 注册行、`Sidebar.tsx`/`App.tsx` 的入口：可单独回滚
- 无数据库 schema 变更，无迁移
- 注意：`config/config.json` 本地改真实 SMB 配置时不要提交（已 gitignore）；`config.json.example` 只放示例

## 依赖 / 前置

- 后端运行环境（本机或容器）需可访问 `10.10.11.31:445`
- 验证需一个真实 AD 账号（与共享 ACL 匹配）登录网站后测试
