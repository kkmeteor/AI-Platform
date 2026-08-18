# 执行计划：MCP Server 支持 Stdio 模式动态加载与工具发现

## 前置条件

- 本机 Python 3.11+，可启动后端（`_run_backend.bat` 或 uvicorn）
- 本机安装 uv（验证 stdio 真实场景）；如无 uv，用 `npx` 示例 server 或最小 python stdio server 验证
- git 分支：`pr/0814`（当前分支，base_branch 已在该分支）

## 实现步骤（有序执行）

### 1. 后端依赖
- [ ] `backend/requirements.txt` 增加 `mcp>=2.0.0`
- [ ] 安装依赖：`pip install -r backend/requirements.txt`
- [ ] 快速验证 v2 API 可用：`python -c "import mcp; from mcp import Client, StdioServerParameters; print('ok')"`
- [ ] 确认 `Tool` 类型支持 `model_dump()`（`python -c "from mcp.types import Tool; print(hasattr(Tool, 'model_dump'))"`，v2 中 types 可能在 mcp_types 包，以实际为准）

### 2. 数据模型与迁移
- [ ] `backend/app/models.py`：`McpServer` 增加 `command/args/env` 三列（见 design §4.1）
- [ ] `backend/app/database.py`：`migrate_db()` 增加 mcp_servers 表迁移（ADD COLUMN，幂等），并更新 `CREATE TABLE mcp_servers` 建表语句
- [ ] 启动后端验证迁移：`python -c "from app.database import migrate_db"`（或直接启动）后检查 `sqlite3 backend/skills.db "PRAGMA table_info(mcp_servers)"` 三列存在

### 3. Schema
- [ ] `backend/app/schemas.py`：`McpServerCreate.url` 默认 `""`；三处 schema 增加 `command/args/env`（见 design §4.3）

### 4. 探测逻辑
- [ ] `backend/app/routers/mcp.py`：
  - [ ] 顶部导入 `from mcp import Client, StdioServerParameters`
  - [ ] `_discover_tools` 增加 transport 分流（stdio → `_discover_stdio_tools`，30s）
  - [ ] 新增 `_discover_stdio_tools`（手动 `__aenter__/__aexit__` + 两段 `wait_for`，见 design §5.2-5.3）
  - [ ] `_server_to_response` 透传 command/args/env

### 5. Dockerfile
- [x] `backend/Dockerfile` 内置 uv：`RUN pip install uv`（ghcr.io 多阶段方案公司网络不可达，改 PyPI 安装）

### 6. 前端
- [ ] `frontend/src/services/api.ts`：类型扩展 + `fetchMcpServersStatus` timeout 30s → 60s
- [ ] `frontend/src/components/McpModal.tsx`：command/args/env 三个字段 + URL 必填规则随 transport 动态化（见 design §7.2）
- [ ] `frontend/src/pages/McpPage.tsx`：卡片 URL 兜底显示 command

## 验证（对照 PRD 验收标准）

- [ ] **AC1 创建 stdio server**：`POST /mcp` body `{name, transport:"stdio", command:"uvx", args:"[\"mcp-server-tapd\"]", env:"{...}"}` → 响应 `is_active=true` 且 `tools` 非空
- [ ] **AC2 混合探测**：`GET /mcp/status` 同时含 streamable_http 与 stdio 服务器时全部正常
- [ ] **AC3 失败场景**：command 填 `nonexistent-cmd-xyz` → `is_active=false`；其他服务器不受影响；后端日志含失败原因
- [ ] **AC4 前端**：创建/编辑 stdio 配置成功；URL 非必填逻辑生效；卡片显示 command
- [ ] **AC5 Docker**：`docker build -f backend/Dockerfile backend` 成功后 `docker run --rm <image> uvx --version` 输出版本
- [ ] **AC6 迁移**：旧 mcp_servers 数据保留，新列 NULL

## Review Gates

- 每步完成做一次增量检查（GetProblems + 手工验证）
- 全部完成后做一次全量检查：`python -m compileall backend`（或启动后端确认无导入错误）、`npm run build`（frontend 无 TS 错误）
- 验收标准逐条核对后报告完成

## 回滚点

- 代码回滚：还原各文件（git checkout 对应文件），无数据损失
- 数据库：新列可保留（无害）或手动 DROP；不影响回滚后运行
- 阶段一不做工具调用；若 stdio 探测不稳定，可临时将 transport 改回 streamable_http 配置，不影响现有 HTTP server
