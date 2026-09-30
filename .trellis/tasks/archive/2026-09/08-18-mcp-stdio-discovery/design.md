# 设计：MCP Server 支持 Stdio 模式动态加载与工具发现（阶段一）

## 1. 概述

平台后端当前仅支持 streamable_http 传输的 MCP server 工具发现（`_discover_tools` 通过 HTTP POST JSON-RPC 探测）。本设计为 `McpServer` 增加 Stdio 模式支持：配置 `command + args + env`，探测时通过官方 `mcp` Python SDK（v2）拉起子进程，完成协议握手与 `tools/list`，返回工具列表。

阶段一范围：**仅工具发现**（create/update/refresh/status 四类操作），不做工具调用。

## 2. 架构

现有 `_discover_tools(server, timeout_seconds)` 是唯一的探测入口，按其签名改造为按 `transport` 分流：

```
_discover_tools(server)
├── transport == "stdio"       → _discover_stdio_tools(server)   [30s 超时]
└── 其他（streamable_http/sse） → 现有 HTTP JSON-RPC 探测逻辑    [5s 超时]
```

- 调用方（create / update / refresh / status 探测）**零改动**，自动获得 stdio 支持
- 错误语义与现有行为一致：失败仅返回 `(False, [])` → `is_active=false`，详细原因记录 `logger.warning`
- stdio 探测超时 30s（uvx 首次运行需下载依赖包）；HTTP 保持 5s

## 3. SDK 选型：mcp v2（>=2.0.0）

`pip install mcp` 当前默认安装 2.0.0（2026-07-28 发布，stable，支持 2026-07-28 协议规范）。v2 相对 v1 的关键差异（直接影响本设计）：

| 差异点 | v2 行为 | 设计影响 |
|---|---|---|
| 客户端 API | `Client` 取代 `ClientSession`；`async with Client(params) as client:` 自动完成 initialize 握手 | 代码更短，无手动握手 |
| 子进程环境 | allow-list 机制：仅继承 HOME/LOGNAME/PATH/SHELL/TERM/USER，`env=` 合并其上 | **无需手动合并 os.environ**；配置 env 直接传参 |
| 进程清理 | 退出时 close stdin → wait → kill | 正常路径自动清理；超时取消路径需手动管理（见 §5.3） |
| 工具列表 | `client.list_tools()` 返回 `ListToolsResult`，`.tools` 为 `Tool` 列表 | `tool.model_dump()` 转 dict |

## 4. 数据模型与数据库迁移

### 4.1 models.py — `McpServer` 增加三列

```python
command = Column(String(500), nullable=True)   # stdio 可执行命令，如 uvx
args = Column(Text, nullable=True)             # JSON 数组字符串，如 ["mcp-server-tapd"]
env = Column(Text, nullable=True)              # JSON 对象字符串
```

`url` 保持 `nullable=False`（stdio 模式存空字符串 `""`，避免 SQLite 重建表）。

### 4.2 database.py — `migrate_db()` 增加 mcp_servers 迁移

沿用现有 skills 表迁移模式：

```python
# --- mcp_servers table migrations ---
# 表存在时 PRAGMA table_info 检查，缺失列执行 ALTER TABLE ADD COLUMN
# migrations: ("command", "VARCHAR(500)"), ("args", "TEXT"), ("env", "TEXT")
```

同时在建表语句（新库场景）的 `CREATE TABLE mcp_servers` 中补充三列定义。迁移幂等，旧数据保留。

### 4.3 schemas.py

- `McpServerCreate`：`url: str = ""`（stdio 可选）；新增 `command/args/env: Optional[str] = None`；`transport` 保留默认 `streamable_http`
- `McpServerUpdate`：新增 `command/args/env: Optional[str] = None`
- `McpServerResponse`：新增 `command/args/env: Optional[str] = None`
- 不新增服务端强校验（transport=stdio 必须有 command 等），由前端表单控制，后端宽容接收；探测失败自然体现为 is_active=false

## 5. 探测逻辑（mcp.py）

### 5.1 入口分流

```python
async def _discover_tools(server, timeout_seconds=5.0):
    if server.transport == "stdio":
        return await _discover_stdio_tools(server)  # 内部固定 30s
    # ... 现有 HTTP 逻辑不动
```

### 5.2 stdio 探测实现

```python
from mcp import Client, StdioServerParameters

async def _discover_stdio_tools(server: McpServer, timeout_seconds: float = 30.0):
    try:
        args = json.loads(server.args or "[]")
        env = json.loads(server.env or "{}")
        params = StdioServerParameters(
            command=server.command,
            args=args if isinstance(args, list) else [],
            env=env if isinstance(env, dict) else None,   # v2 allow-list 合并
        )
        client = Client(params)
        entered = False
        try:
            await asyncio.wait_for(client.__aenter__(), timeout=timeout_seconds)  # spawn + initialize
            entered = True
            result = await asyncio.wait_for(client.list_tools(), timeout=timeout_seconds)
            return True, [t.model_dump() for t in result.tools]
        finally:
            if entered:
                await client.__aexit__(None, None, None)   # 确保子进程清理
    except Exception as exc:
        logger.warning("Failed to discover stdio tools from %s: %s", server.name, exc)
        return False, []
```

### 5.3 生命周期与超时（重要）

- **不用 `asyncio.timeout` 包裹整个 `async with Client(...)` 块**：超时取消任务时，被取消任务内的 `__aexit__` 无法 await，子进程会残留
- 采用手动 `__aenter__/__aexit__` + 两段 `asyncio.wait_for`：超时抛异常后，`finally` 在主任务中执行 `__aexit__`，SDK 正常关闭 stdin、wait、必要时 kill，保证无僵尸进程
- `initialize` 阶段（`__aenter__`）与 `tools/list` 阶段分别限时 30s
- 导入：`from mcp import ...` 放模块顶部（启动时一次性导入，代价可接受）

## 6. Dockerfile 内置 uv

uv 发布在 PyPI（`pip install uv` 即得 uv/uvx 二进制），无需额外基础镜像，与现有 pip 构建流程一致：

```dockerfile
FROM python:3.11-slim
RUN pip install --no-cache-dir uv
# ... 其余不变
```

- 镜像增加约 30MB；容器内可直接执行 `uvx`
- 本地开发（Windows）无需 Docker 改动：已安装 uv 的机器直接用 `uvx`；未安装则探测失败（日志提示）
- ~~多阶段构建 `FROM ghcr.io/astral-sh/uv` 方案~~：ghcr.io 在公司网络不可达（registry-mirror 仅代理 Docker Hub），已废弃

## 7. 前端设计

### 7.1 api.ts

- `McpServer` 接口增加 `command/args/env: string | null`
- `McpServerCreate/Update` 增加 `command/args/env?: string`
- `fetchMcpServersStatus` 的 axios timeout 由 30s 放宽至 60s（stdio 冷启动）

### 7.2 McpModal.tsx（JSON 文本域平铺方案）

- 新增三个 Form.Item（平铺在 URL 之后）：
  - `command`：Input 单行，placeholder `e.g. uvx`
  - `args`：TextArea 3 行，JSON 数组格式校验（validator 与 headers 一致），placeholder `["mcp-server-tapd"]`
  - `env`：TextArea 3 行，JSON 对象格式校验，placeholder `{"TAPD_ACCESS_TOKEN": "..."}`
- URL 校验规则动态化：`transport === 'stdio'` 时非必填，否则必填（依赖字段监听）
- 创建模式默认值保持 `streamable_http`；编辑模式回填三个新字段

### 7.3 McpPage.tsx

- 卡片 URL 展示兜底：`{server.url || server.command || '—'}`

## 8. 错误处理与日志

- 与现有 HTTP 探测完全一致：API 不返回错误详情，仅 `is_active=false`；`logger.warning` 记录失败原因（含异常类型与消息）
- stdio 特有失败场景：command 不存在（FileNotFoundError）、initialize 超时（TimeoutError）、进程启动后异常退出（SDK 抛错）、JSON 配置非法（json.JSONDecodeError）

## 9. 兼容性与回滚

- **数据库**：仅 ADD COLUMN，旧代码/旧数据兼容；回滚删除列不影响旧数据
- **API**：新字段全部 Optional，旧前端不传字段行为不变；`url` 默认值放宽不影响现有客户端
- **探测行为**：HTTP 路径完全不动；stdio 仅在新 transport 值时启用
- **回滚**：还原各文件即可，无迁移数据损失；Dockerfile 回滚仅失去 uvx 能力

## 10. 测试策略

1. 后端启动：`migrate_db()` 自动执行，验证 skills.db 中 mcp_servers 新增列
2. 本地验证 stdio 发现：本机有 uv 时用 tapd-mcp 配置；无 uv 时用 `npx -y @modelcontextprotocol/server-everything` 或最小 python stdio server 验证
3. 失败场景：command 填不存在命令（如 `nonexistent-cmd`）→ is_active=false
4. 混合探测：同时存在 streamable_http 与 stdio 服务器时 `GET /mcp/status` 正常
5. 前端：创建/编辑 stdio 配置，卡片展示 command；URL 必填规则随 transport 切换
6. Docker：`docker build backend` 成功后 `docker run --rm <image> uvx --version` 验证
