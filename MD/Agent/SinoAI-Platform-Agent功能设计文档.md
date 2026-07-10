# SinoAI Platform - Agent 功能模块设计文档

**文档版本**：V1.0
**编制日期**：2026-06-23
**适用系统**：SinoAI Platform
**关联文档**：《企业RAG知识库架构设计文档》

---

## 1. 背景与目标

### 1.1 背景

SinoAI Platform 平台已经规划了 RAG 知识库模块作为 AI 知识底座，以及 Skills / MCPs / Tools 作为原子能力集合。但这些能力本身是"散装的"——用户无法快速把一组能力组合成解决某个具体业务场景的"数字员工"。

Agent（智能体）正是承载"能力组合 + 场景化封装"的产品形态。它把 LLM 推理引擎、Skills（流程型能力）、MCPs（工具型能力）、RAG 知识库（知识增强）通过一套声明式配置串起来，向用户提供"开箱即用、可对话、可审计"的 AI 协作者。

### 1.2 目标

业务目标：让业务人员能在 5 分钟内配置出一个解决特定场景（如数据分析、客服问答、运维巡检）的 Agent；让管理员能统一纳管 Agent 的能力边界与合规风险。

技术目标：实现 Agent 的声明式配置、运行时可组合、会话状态可持久化、调用行为可审计，并与现有 RAG 模块无缝打通。

### 1.3 设计原则

声明式优先：Agent = 一份 YAML/JSON 配置 + 运行时实例。能力通过引用方式绑定，不重复实现。

最小权限：Agent 仅能调用显式授权的能力，不存在"默认全开"。

可观测性：每一轮推理、每一次工具调用、每一次 RAG 检索都带 trace_id 落日志，支持回放和审计。

渐进演进：核心 Agent Runtime 先跑通单轮推理 + 工具调用，再逐步加入多 Agent 协作、长任务、流式响应等高级特性。

---

## 2. 与主流方案的对照与选型

### 2.1 主流 Agent 框架对比

LangGraph（LangChain 系）：以图状态机为核心，强在复杂多步工作流编排，适合研究型和高度定制化场景；但配置重、学习曲线陡。

CrewAI / AutoGen：多 Agent 协作框架，强调"角色分工 + 对话"，适合研究类、长任务类场景；对单 Agent + 工具调用的轻量场景偏重。

OpenAI Assistants API：配置式 Agent（Instructions + Tools + Files），托管在 OpenAI 云端，调用简单但无法私有化。

Dify / FastGPT / Coze：低代码 Agent 平台，提供"画布式编排"，UI 友好，但多为 SaaS 形态，私有化部署受限或能力受限。

### 2.2 本方案定位

结合 SinoUnion 企业内网、私有化部署、已有 RAG 模块的事实，我们采取"配置驱动 + 轻量运行时"的方案：

不引入重量级图引擎，而是用"Agent 配置 → Planner → Tool Executor"这一经典 ReAct / Function Calling 范式作为核心循环。

能力编排以声明式清单（skills/mcps/rag 列表）为主、复杂流程（多分支、循环、并行）作为 v2 的可选扩展。

兼容主流协议：工具调用采用 OpenAI Function Calling 兼容格式，MCP 遵循 Anthropic MCP 协议，方便后续接入第三方 Agent 生态。

---

## 3. 总体架构

Agent 模块整体分为 4 层：定义层、能力层、运行时层、接入层。

```
┌──────────────────────────────────────────────────────────────────────┐
│                          接入层 (Gateway)                            │
│   Web Chat │ REST API │ 钉钉/飞书机器人 │ IM通道 │ 定时任务          │
└──────────────────────────────┬───────────────────────────────────────┘
┌──────────────────────────────▼───────────────────────────────────────┐
│                       运行时层 (Runtime)                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ 会话管理器  │  │ 推理编排器   │  │ 工具执行器    │  │ 上下文   │  │
│  │ Session Svc │  │ Planner      │  │ Tool Executor │  │ Context  │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  └──────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
┌──────────────────────────────▼───────────────────────────────────────┐
│                        能力层 (Capabilities)                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────┐  │
│  │  Skills  │   │   MCPs   │   │   RAGs   │   │  Built-in Tools  │  │
│  │ 流程能力  │   │ 工具协议  │   │ 知识检索  │   │  HTTP/SQL/Code   │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
┌──────────────────────────────▼───────────────────────────────────────┐
│                        定义层 (Definition)                           │
│  Agent Config (YAML/JSON) ─ identity / instructions / model / caps   │
│  + 权限策略 (RBAC)  + 版本 (Versioned)  + 审计元数据                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 定义层

承载 Agent 的"是什么"——身份、指令、绑定的能力、使用的模型、权限策略。Agent 配置是版本化的、可回滚的。

### 3.2 能力层

Skills、MCPs、RAGs、Built-in Tools 四类能力以统一接口对外暴露。Agent 仅通过能力标识（capability_id）引用，运行时按需加载。

### 3.3 运行时层

核心执行引擎：管理会话状态、驱动 LLM 推理、编排工具调用、维护上下文窗口。详见第 6 节。

### 3.4 接入层

支持 Web 会话（参考截图）、REST API、钉钉/飞书机器人、IM 通道、定时触发等多种触发方式，统一接入同一个 Runtime。

---

## 4. Agent 配置模型

### 4.1 配置 Schema（YAML 示例）

```yaml
apiVersion: agentstudio/v1
kind: Agent
metadata:
  id: agent-sales-analyst
  name: 销售数据分析助手
  version: 1.2.0
  owner: team-data
  labels:
    domain: sales
    scope: internal

spec:
  identity:
    display_name: 销售分析 Agent
    avatar: /assets/avatars/sales.png
    description: 帮助业务人员分析销售数据、生成可视化报告

  instructions: |
    你是一名资深销售数据分析师。在回答前，请先确认数据源；
    回答中要包含数据来源和口径说明；图表优先使用 ECharts。

  model:
    provider: openai-compatible     # 兼容 OpenAI 协议，可切换本地/云端模型
    name: qwen-max
    parameters:
      temperature: 0.3
      max_tokens: 4096
    fallback: qwen-plus             # 主模型不可用时降级

  capabilities:
    skills:
      - id: skill-xlsx-analysis
        version: ">=1.0"
      - id: skill-chart-echarts
    mcps:
      - id: mcp-mysql-salesdb
        permissions: [read]
      - id: mcp-oss-report
        permissions: [read, write]
    rags:
      - id: kb-product-docs          # 引用 RAG 模块的知识库
        top_k: 5
        score_threshold: 0.7
        permission_mode: user       # 按调用用户权限过滤
    builtins:
      - python_sandbox
      - http_client

  conversation:
    welcome_message: "你好，我是销售分析助手。请告诉我你想分析的数据范围和指标。"
    max_history_turns: 20
    context_window_tokens: 8000
    streaming: true

  policy:
    allowed_users: [group: sales-team, user:alice, user:bob]
    rate_limit:
      per_user_per_minute: 20
      per_user_per_day: 500
    tool_confirm:
      - mcp-mysql-salesdb.write      # 写操作需用户确认
    data_classification: internal    # 数据分类标签
```

### 4.2 实体关系模型

```
┌──────────┐  N:N  ┌──────────┐
│  Agent   │──────▶│  Skill   │
└──────────┘       └──────────┘
      │ N:N              ▲
      ▼                  │
┌──────────┐       ┌──────────┐
│   MCP    │       │   RAG    │
└──────────┘       └──────────┘
      │                  │
      ▼                  ▼
┌──────────┐       ┌──────────────────┐
│ MCP Server│       │ Knowledge Base   │
└──────────┘       └──────────────────┘
```

关联表设计（PostgreSQL）：

```sql
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(64) UNIQUE NOT NULL,   -- agent-sales-analyst
    name            VARCHAR(128) NOT NULL,
    version         VARCHAR(32) NOT NULL,
    owner           VARCHAR(64),
    instructions    TEXT,
    model_config    JSONB NOT NULL,
    conv_config     JSONB,
    policy          JSONB,
    status          VARCHAR(16) DEFAULT 'draft',   -- draft / published / archived
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_capabilities (
    agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,
    cap_type        VARCHAR(16),                   -- skill / mcp / rag / builtin
    cap_id          VARCHAR(64),
    cap_version     VARCHAR(32),
    config          JSONB,                         -- top_k、permissions 等
    PRIMARY KEY (agent_id, cap_type, cap_id)
);

CREATE TABLE agent_versions (
    agent_id        UUID REFERENCES agents(id),
    version         VARCHAR(32),
    snapshot        JSONB NOT NULL,                -- 完整配置快照
    published_at    TIMESTAMPTZ DEFAULT now(),
    published_by    VARCHAR(64),
    PRIMARY KEY (agent_id, version)
);
```

### 4.3 与 RAG 模块的衔接

Agent 配置中的 `rags` 段直接引用 RAG 模块的知识库 ID。Agent Runtime 通过 RAG 模块暴露的 Agent API（语义检索接口）获取上下文，并继承 RAG 的权限过滤（permission_mode=user 时按当前对话用户过滤）。详见《企业RAG知识库架构设计文档》服务层章节。

---

## 5. 能力层详解

### 5.1 Skills（流程型能力）

Skill 是一段封装好的"流程脚本"，通常由一系列步骤组成（如"读取 Excel → 计算指标 → 生成图表 → 写入报告"）。Skill 内部可以使用 MCP 工具，也可以调用 RAG。

Skill 对外暴露 Function Calling 描述（name/description/parameters_schema），Agent 把它当作可调用函数。

### 5.2 MCPs（工具协议）

遵循 Anthropic MCP 协议：每个 MCP Server 独立进程/容器，通过 JSON-RPC 暴露 tools/resources/prompts。Agent Runtime 作为 MCP Client 按需建连，调用 tool 时带上 agent 的身份凭证。

MCP 的优势：能力可跨 Agent 复用、独立升级、故障隔离。典型 MCP：MySQL MCP、OSS MCP、钉钉 MCP、TFS MCP、Git MCP。

### 5.3 RAGs（知识检索）

Agent 通过统一的 RAG Gateway 调用知识库检索。Gateway 负责：

接收查询 + 当前用户身份 → 权限过滤 → 向量检索 + 全文检索混合召回 → 重排 → 返回 top_k 段落 + 溯源信息。

Agent 在每轮推理中可通过内置的 `rag_query` 工具主动发起检索，而不是每次对话都默认注入（节省 token、减少干扰）。

### 5.4 Built-in Tools（内置工具）

平台自带、所有 Agent 可按策略启用的通用工具：

python_sandbox：受限沙箱执行 Python 代码（用于数据分析、图表生成）。

http_client：可限制白名单的 HTTP 请求工具。

datetime / calculator：无副作用的轻量工具。

rag_query：调用 RAG 检索的内置工具（详见 5.3）。

---

## 6. 会话运行时（Runtime）

### 6.1 核心循环（ReAct / Function Calling）

```
用户消息 ─▶ Session Svc ─▶ Context Builder ─▶ LLM Planner
                                     ▲              │
                                     │              ▼
                               [tool_results] ◀── Tool Executor
                                     │              │
                                     └── LLM ◀──────┘  (final answer)
                                             │
                                             ▼
                                        用户响应
```

核心循环步骤：

Context Builder 把 system prompt（来自 Agent instructions）+ 历史消息（受 max_history_turns 和 context_window_tokens 限制）+ 可用能力清单（函数定义）+ 当前用户信息组装成 LLM 请求。

LLM Planner 决定是直接回答还是调用工具。若调用工具，返回结构化的 tool_calls。

Tool Executor 校验 tool_call 是否在 Agent 的 capability 白名单内、权限是否足够、是否需要用户确认，然后路由到对应的 Skill / MCP / Built-in。

执行结果（tool_results）回流到 LLM，进入下一轮推理，直到 LLM 给出 final answer。

整个循环受 max_turns（默认 10）保护，防止死循环。

### 6.2 上下文管理

滑动窗口：保留最近 N 轮对话，超出后做摘要压缩（由小模型生成 summary 替代早期消息）。

Tool Call 压缩：历史工具调用仅保留结果摘要，原始输入/输出在审计日志中保留。

RAG 上下文注入：仅当 LLM 显式调用 rag_query 时注入，避免每轮都塞入大段检索结果。

### 6.3 流式响应

采用 SSE（Server-Sent Events）向前端推送：

事件类型：token_delta（文本增量）、tool_call_start / tool_call_end（工具调用状态）、rag_citation（知识溯源）、error。

前端（参考截图中的会话页签）逐 token 渲染，工具调用阶段显示"正在查询 MySQL…""正在生成图表…"等状态卡片。

### 6.4 多轮状态持久化

会话（Session）数据结构：

```json
{
  "session_id": "sess_xxx",
  "agent_id": "agent-sales-analyst",
  "agent_version": "1.2.0",
  "user_id": "alice",
  "channel": "web",
  "created_at": "2026-06-23T10:30:00+08:00",
  "messages": [
    { "role": "user",      "content": "帮我分析上个月销售数据" },
    { "role": "assistant", "content": "...", "tool_calls": [...] },
    { "role": "tool",      "tool_call_id": "...", "content": "..." }
  ],
  "state": {
    "total_tokens_used": 12345,
    "tool_calls_count": 3,
    "rag_citations": [{ "kb": "kb-product-docs", "doc_id": "...", "chunk_id": "..." }]
  }
}
```

存储：热会话（近 7 天）存 PostgreSQL + Redis 缓存；冷会话归档到对象存储（MinIO），保留索引以便查询回放。

---

## 7. Agent 管理功能（左侧 Agents 页签）

### 7.1 Agent 列表与状态

展示所有 Agent，按状态分类：draft（草稿）、published（已发布）、archived（归档）。支持按 owner / label / 能力类型筛选。

### 7.2 Agent 编辑器

基础信息页签：名称、头像、描述、指令（instructions，支持 Markdown）。

模型页签：选择 provider / model name / 参数（温度、max_tokens、fallback）。

能力页签：三个子列表 Skills / MCPs / RAGs，从全局能力目录中搜索并勾选绑定，可针对每个能力设置局部参数（如 RAG 的 top_k）。

策略页签：访问用户/用户组、速率限制、敏感工具确认策略、数据分类。

版本页签：查看历史版本、回滚、对比差异（diff）。

### 7.3 调试沙盒

编辑器内置"测试"面板（对应截图中的"线上/测试/全部"Tab 中的"测试"Tab），可模拟对话、查看每一轮工具调用详情、token 消耗、RAG 引用段落，方便上线前调优。

---

## 8. 会话管理功能（左侧 会话 页签）

### 8.1 会话列表与历史

右侧"会话历史"面板展示当前 Agent 的所有会话，区分"线上"（真实用户）和"测试"（沙盒调试）。支持按用户、时间、摘要关键词检索。

### 8.2 会话详情与审计

管理员可打开任意会话查看：完整消息流、每次工具调用的输入/输出、RAG 引用原文及得分、总 token 消耗、用户反馈（赞/踩）。

提供"导出记录"功能（对应截图右上角按钮），支持 JSON / Markdown / CSV 三种格式。

### 8.3 干预与反馈

管理员可对某条 AI 回答打标（正确/错误/需修正），标注结果进入评估数据集，用于后续的模型微调或指令优化。

---

## 9. 权限、隔离与审计

### 9.1 权限模型（RBAC + ABAC 混合）

Agent 级：谁能"使用"某个 Agent（policy.allowed_users，支持用户/用户组/角色）。

能力级：Agent 能"调用"哪些 Skills/MCPs/RAGs，调用时带什么权限（read/write）。

数据级：Agent 调用 RAG 时按当前用户做权限过滤（permission_mode=user）；调用 MCP 时由 MCP Server 端再做一次权限校验。

### 9.2 运行时隔离

每个 Agent 的会话独立，不共享上下文。

MCP Server 以独立进程/容器运行，Agent 之间不能互相访问对方的 MCP 连接凭证。

Skill 中的代码执行走 python_sandbox（cgroups + seccomp 限制）。

### 9.3 审计日志

所有 Agent 行为写入审计表（audit_logs），字段：trace_id、agent_id、session_id、user_id、event_type（llm_call / tool_call / rag_query / user_feedback）、payload、latency_ms、status。

审计日志保留 180 天，按月归档；敏感事件（如写操作失败、越权尝试）实时告警到运维通道。

### 9.4 数据安全

Agent 输出经过敏感内容检测器（复用 RAG 模块的脱敏组件），对个人隐私、密钥、商业敏感词做兜底过滤。

高风险 Agent（如涉及财务、人事数据）强制开启 tool_confirm + 二次审批。

---

## 10. 关键技术选型

推理引擎：基于 OpenAI 兼容协议封装统一网关，后端可挂载本地部署的 vLLM / Ollama 或云端 Qwen / DeepSeek / GLM。

运行时服务：Python（FastAPI + asyncio）或 Go（Gin），承担会话管理、Planner 编排、Tool Executor。

MCP 客户端/服务端：采用官方 MCP SDK（TypeScript / Python），保证与第三方 MCP Server 互通。

状态存储：PostgreSQL（配置 + 会话元数据）+ Redis（热会话缓存 + 速率限制）+ MinIO（冷会话归档、导出文件）。

向量检索：复用 RAG 模块已建设的 Milvus / Qdrant，不重复建设。

可观测性：OpenTelemetry 收集 trace → 接入内部 Prometheus + Grafana。

---

## 11. 与现有平台的集成点

| 集成对象            | 集成方式                                                       |
|---------------------|----------------------------------------------------------------|
| RAG 模块            | 通过 Agent API（语义检索）对接，复用权限过滤与溯源能力         |
| Skills 模块         | Agent 引用 skill_id，Runtime 加载并执行                        |
| MCPs 模块           | Agent 作为 MCP Client 连接 MCP Server                          |
| 钉钉/飞书通道       | 接入层提供 Channel Adapter，把 IM 消息转成统一会话请求         |
| 用户中心（LDAP/SSO）| RBAC 基于已有用户/组，Agent 的 allowed_users 引用用户组        |
| 审计中心            | 审计日志通过 Kafka 推送至企业统一审计平台                      |

---

## 12. 分阶段实施路线

### Phase 1（4 周）：核心 Agent Runtime

交付：Agent 配置 CRUD、单 Agent + 单轮/多轮对话、内置工具（http / python_sandbox / rag_query）、会话持久化、基础审计日志。

验收：能够跑通一个"销售数据分析"Agent（参考截图场景），调用 MySQL MCP 查询并生成图表。

### Phase 2（4 周）：能力生态与权限

交付：Skills / MCPs / RAGs 绑定与鉴权完整打通、RBAC 上线、会话导出、测试沙盒。

验收：至少 5 个 Agent 投入业务试用，敏感操作 tool_confirm 100% 触发。

### Phase 3（4 周）：多通道与可观测

交付：钉钉/飞书机器人接入、OpenTelemetry trace 接入、冷会话归档、会话回放。

验收：Agent 可在 IM 中被 @ 唤起；单次会话 trace 可在 Grafana 全链路查看。

### Phase 4（4 周）：高级能力

交付：多 Agent 协作（handoff / 路由）、长任务（后台异步执行 + 回调通知）、画布式编排 UI。

验收：至少一个跨 Agent 协作场景（如"客服 Agent 调用知识 Agent + 工单 Agent"）稳定运行。

---

## 13. 风险与对策

模型幻觉风险：强制要求 RAG 引用带溯源链接、关键数据输出附"口径说明"，并通过 guardrail 兜底过滤。

能力越权风险：最小权限原则 + 运行时二次校验 + 敏感操作 tool_confirm。

会话状态膨胀：滑动窗口 + 摘要压缩 + 冷归档，单会话热数据不超过 32K token。

供应商锁定：推理引擎、MCP、RAG 全部走开放协议（OpenAI 兼容、MCP、S3 兼容存储），可无感切换底层实现。

---

## 14. 总结

Agent 功能模块是 SinoAI Platform 的"能力整合层"。它通过声明式配置把 Skills / MCPs / RAGs 组合成场景化的数字员工，通过统一 Runtime 保证执行的一致性和可观测性，通过 RBAC + 审计保证合规。配合已规划的 RAG 模块，平台将具备"知识 + 行动"双重能力，真正落地企业内部的 AI 协作场景。
