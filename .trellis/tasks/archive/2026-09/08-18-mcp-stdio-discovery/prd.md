# MCP Server 支持 Stdio 模式动态加载与工具发现

## Goal

让 SinoAI 平台后端支持配置本地 Stdio 模式（command + args + env）的 MCP server，动态拉起子进程完成工具发现（阶段一：仅发现，不调用），与现有 streamable_http 探测能力并存。

## Requirements

- 数据模型扩展：`McpServer` 增加 `command` / `args`(JSON 数组字符串) / `env`(JSON 对象字符串) 字段；stdio 模式无 URL（url 可存空字符串）
- 后端探测：`transport == "stdio"` 时通过官方 `mcp` Python SDK 拉起子进程，完成 initialize → tools/list，返回工具列表；失败仅标记 `is_active=false`（与 HTTP 模式行为一致），详细原因记录后端日志
- Dockerfile 内置 uv，使后端容器内可直接执行 `uvx`
- 前端表单：支持配置 command/args/env（JSON 文本域，平铺布局）；transport=stdio 时 URL 非必填
- 数据库自动迁移：通过现有 `migrate_db()` 机制为 `mcp_servers` 表增加新列，已有数据保留

## Acceptance Criteria

- [ ] 创建 `transport=stdio` 的 MCP server（如 command=uvx, args=["mcp-server-tapd"], env=含 TAPD token）后，`POST /mcp` 响应 `is_active=true` 且 `tools` 非空
- [ ] `GET /mcp/status` 并发探测时，stdio 与 streamable_http 混合服务器均正常工作
- [ ] stdio 探测失败（command 不存在、initialize 超时、进程异常退出）时 `is_active=false`，不影响其他服务器探测
- [ ] 前端 McpModal 可创建/编辑 stdio 配置；卡片在无 URL 时展示 command 信息
- [ ] 后端 Dockerfile 构建后，容器内可执行 `uvx` 命令
- [ ] `migrate_db()` 迁移后旧 mcp_servers 数据保留，新列默认值正确

## Notes

- 后端容器（python:3.11-slim）当前无 uv/uvx，需在 Dockerfile 中内置：`RUN pip install uv`（uv 发布在 PyPI，pip 安装即得 uv/uvx 二进制，无需额外镜像）
- stdio 冷启动较慢（uvx 首次运行需下载依赖），stdio 探测超时放宽至 30s；前端 `/mcp/status` 请求 axios timeout 同步放宽
- env 与后端进程环境合并：`{**os.environ, **configured_env}`，保证 uvx 等依赖 PATH
- 每次探测结束必须终止子进程，避免残留（SDK context manager 负责）
- 阶段一仅做工具发现，不做工具调用（YAGNI）；`transport` 取值设计保持可扩展
- 错误详情不在 API 响应中透出（与现有 HTTP 探测一致），由后端日志记录原因
- env 中敏感 token（如 TAPD_ACCESS_TOKEN）明文存库与返回，与现有 headers 字段处理方式一致，不额外加密（后续可单独立项）
