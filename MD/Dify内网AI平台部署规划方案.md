## Dify 内网 AI 平台部署规划方案

> 基于 gstack 框架（Office Hours + CEO Review + Engineering Review）生成

---

## 一、需求验证（Office Hours）

### 核心问题

公司员工需要使用 AI 能力来提升工作效率，但直接使用外部 SaaS（ChatGPT、Claude 等）存在数据安全风险和合规隐患。公司需要一个**数据不出内网、可统一管控、又能灵活对接多种模型**的 AI 平台。

### 为什么选 Dify

Dify 是当前最成熟的开源 LLM 应用开发平台之一，具备以下关键能力：对话式 AI 界面（类 ChatGPT）、可视化工作流编排、RAG 知识库（对接内部文档）、API 网关（统一对外接口）、多模型支持（本地 + 外部混合）。它的开源协议允许企业免费商用，且社区活跃度极高（GitHub 90k+ stars）。

### 需求验证六问

**1. 问题是否真实？** 50 人以下的团队，员工日常涉及文档撰写、信息检索、数据处理等重复性工作。即使只有 10-20 人高频使用，每人每天节省 30 分钟，全年就是约 1000 小时的生产力释放。这个问题是真实的。

**2. 解决方案是否匹配？** Dify 的对话界面满足"智能问答"需求，工作流编排满足"自动化"需求，API 网关满足"服务中台"需求，多模型管理满足"统一底座"需求。功能覆盖度很高。

**3. 区分优势在哪？** 相比自建 AI 服务，Dify 提供了开箱即用的 UI 和应用编排能力，开发量极小。相比直接用外部 SaaS，数据完全可控。相比其他开源方案（如 FastGPT、MaxKB），Dify 的工作流能力和插件生态更完善。

**4. 用户从哪来？** 内部推广，从技术团队开始试用，再扩展到业务部门。建议先找 3-5 个"种子用户"验证核心场景。

**5. 成本模型？** Dify 本身免费。主要成本是服务器硬件（一次性 1-3 万）和 GPU 资源（如果部署本地模型）。外部 API 调用按用量付费，月均几百到几千元。总体年成本可控在 3-8 万以内。

**6. 增长路径？** 第一阶段上线对话 AI → 第二阶段建知识库 → 第三阶段开工作流 → 第四阶段开放 API 给内部系统。渐进式扩展，每阶段都有独立价值。

---

## 二、战略评审（CEO Review）

### 定位思考：不只是"部署一个工具"，而是"建设公司 AI 基础设施"

从 CEO 视角看，这个项目的正确定位不是"装一个 Dify"，而是**为公司构建 AI 能力底座**。这意味着架构设计要预留扩展空间，即使当前只有 50 人，也要考虑未来 200 人甚至更多场景接入的可能性。

### 贝佐斯式长期思考

Day 1 就要想清楚的事：数据治理（谁能看什么）、模型策略（哪些场景用什么模型）、权限体系（部门隔离）。这些如果后期补，成本是前期的 10 倍。

### 芒格式反向思维

反过来想——什么情况下这个项目会失败？

- **失败场景 1**：部署完没人用。缓解：先验证 1-2 个高频场景，带着"成果"推广，而不是空喊"大家来用"。
- **失败场景 2**：本地模型效果太差，用户失望。缓解：混合模式兜底——核心场景用开源模型，复杂场景走外部 API（如 DeepSeek、OpenAI），确保体验。
- **失败场景 3**：运维跟不上，系统挂了没人修。缓解：Docker Compose 部署极简，加上基础监控告警即可。

### 三阶段战略

**第一阶段（1-2 周）：MVP 上线。** 部署 Dify + 对接 1-2 个模型，开放对话 AI 功能。让团队先用起来。

**第二阶段（3-4 周）：知识库 + 工作流。** 导入公司核心文档（产品手册、FAQ、流程规范），构建 RAG 知识库。搭建 2-3 个自动化工作流。

**第三阶段（5-8 周）：API 中台 + 深度集成。** 开放 API 接口，对接内部系统（OA、CRM 等）。建立使用监控和效果评估体系。

---

## 三、技术架构（Engineering Review）

### 整体架构图

```
                        ┌──────────────────────────────────────────┐
                        │            公司内网                       │
                        │                                          │
  ┌──────────┐          │   ┌─────────┐     ┌──────────────────┐  │
  │ 员工浏览器 │────────────►  │  Nginx   │────►│   Dify Web (前端) │  │
  └──────────┘          │   │ :80/443 │     └──────────────────┘  │
                        │   └────┬────┘                            │
  ┌──────────┐          │        │        ┌──────────────────┐     │
  │ 内部系统   │────────────►        ├───────►│   Dify API (后端)  │     │
  │ (OA/CRM) │  API     │        │        └───────┬──────────┘     │
  └──────────┘          │        │                │                │
                        │        │    ┌───────────┼───────────┐    │
                        │        │    │           │           │    │
                        │        │    ▼           ▼           ▼    │
                        │        │ ┌──────┐  ┌────────┐  ┌──────┐ │
                        │        │ │ PG    │  │ Redis  │  │Weaviate│
                        │        │ │数据库  │  │ 缓存   │  │向量库  │
                        │        │ └──────┘  └────────┘  └──────┘ │
                        │        │                                 │
                        │        │    ┌───────────────────────┐    │
                        │        └───►│     模型路由层          │    │
                        │             │                       │    │
                        │             │  ┌─────────┐ ┌──────┐│    │
                        │             │  │ Ollama   │ │外部API││    │
                        │             │  │(本地模型) │ │网关   ││    │
                        │             │  │Qwen/GLM  │ │DeepSeek│   │
                        │             │  └─────────┘ │OpenAI ││    │
                        │             │              └──────┘│    │
                        │             └───────────────────────┘    │
                        └──────────────────────────────────────────┘
```

### 硬件建议（50人以下，混合模型模式）

**Dify 应用服务器：** 4 核 CPU / 16GB 内存 / 500GB SSD。运行 Dify 全套组件（API、Web、Worker、PostgreSQL、Redis、Weaviate、Nginx）。

**模型推理服务器（可选但推荐）：** 如果有 GPU 资源，建议配一张 NVIDIA GPU（RTX 4090 24GB 或 A10/A30），专门跑 Ollama 本地模型。如果没有 GPU，可以只用 CPU 跑小模型（如 Qwen2.5-7B 的 Q4 量化版），或者完全依赖外部 API。

**经济方案（无 GPU）：** 只用一台 4 核 16GB 的服务器，Dify + 外部 API（DeepSeek/OpenAI）。初期投入约 5000-8000 元/年（服务器）+ API 费用。

**推荐方案（有 GPU）：** 两台服务器，一台跑 Dify，一台跑 Ollama（GPU 推理）。初期投入约 2-3 万（含 GPU 显卡）+ 外部 API 费用。

### 软件栈清单

| 组件 | 版本 | 用途 |
|------|------|------|
| Docker Engine | 24.0+ | 容器运行时 |
| Docker Compose | 2.24+ | 服务编排 |
| Dify | v1.15.0 | AI 应用平台核心 |
| PostgreSQL | 15 (内置) | 关系型数据库 |
| Redis | 6 (内置) | 缓存与消息队列 |
| Weaviate | 最新 (内置) | 向量数据库（RAG） |
| Ollama | 最新 | 本地模型推理引擎 |
| Nginx | 内置 | 反向代理 |

---

## 四、分步实施指南

### 第一步：环境准备（Day 1）

**1.1 安装 Docker（在目标服务器上）**

```bash
# CentOS/Ubuntu 通用
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker && sudo systemctl start docker

# 验证安装
docker --version
docker compose version
```

**1.2 安装 Ollama（本地模型推理，可选）**

```bash
curl -fsSL https://ollama.com/install.sh | sh

# 拉取推荐模型
ollama pull qwen2.5:7b          # 通义千问 7B（中文能力强，推荐）
ollama pull nomic-embed-text     # Embedding 模型（RAG 必需）

# 验证
ollama run qwen2.5:7b "你好，介绍一下自己"
```

**1.3 配置 Ollama 允许远程访问（如果 Dify 和 Ollama 不在同一台机器）**

```bash
# 编辑 Ollama 服务配置
sudo systemctl edit ollama

# 添加以下内容：
[Service]
Environment="OLLAMA_HOST=0.0.0.0"

# 重启
sudo systemctl restart ollama
```

### 第二步：部署 Dify（Day 1-2）

**2.1 克隆并配置**

```bash
git clone https://github.com/langgenius/dify.git --depth=1
cd dify/docker
cp .env.example .env
```

**2.2 修改关键配置（编辑 .env 文件）**

```bash
# 安全密钥（必须修改！）
SECRET_KEY=你的随机密钥_建议32位以上
INIT_PASSWORD=管理员初始密码

# 数据库密码（建议修改）
DB_PASSWORD=数据库密码
REDIS_PASSWORD=Redis密码

# 端口（如有冲突可修改）
NGINX_PORT=80

# 如果 Ollama 在其他机器上，记住 Dify 中配置模型时需要填写那台机器的 IP
```

**2.3 启动服务**

```bash
docker compose up -d

# 查看启动状态
docker compose ps

# 查看日志（确认无报错）
docker compose logs -f --tail=50
```

**2.4 初始化**

浏览器访问 `http://服务器IP`，进入 Dify 初始化页面，设置管理员账号。

### 第三步：配置模型（Day 2）

**3.1 接入本地 Ollama 模型**

进入 Dify 后台 → 设置 → 模型供应商 → 找到 Ollama：

- 模型名称：`qwen2.5:7b`
- Base URL：`http://host.docker.internal:11434`（Docker Desktop）或 `http://172.17.0.1:11434`（Linux Docker）
- 模型类型：对话模型

同时添加 Embedding 模型：

- 模型名称：`nomic-embed-text`
- Base URL：同上
- 模型类型：Text Embedding

**3.2 接入外部 API（混合模式）**

在模型供应商中添加 OpenAI 兼容接口：

- 供应商：OpenAI
- API Key：你的 API Key
- Base URL：`https://api.deepseek.com`（如果用 DeepSeek）或 `https://api.openai.com/v1`
- 添加模型：`deepseek-chat`、`deepseek-reasoner` 等

**3.3 模型使用策略建议**

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 日常对话、简单问答 | Qwen2.5-7B（本地） | 速度快、无成本、数据不出网 |
| 文档撰写、复杂推理 | DeepSeek（外部 API） | 效果更好，适合非敏感内容 |
| 涉及公司机密的任务 | Qwen2.5-7B（本地） | 数据完全离线 |
| 知识库 Embedding | nomic-embed-text（本地） | 本地处理，文档内容不外泄 |

### 第四步：构建知识库（Week 2-3）

**4.1 创建第一个知识库**

Dify 界面 → 知识库 → 创建知识库：

- 名称：如"公司产品文档"
- Embedding 模型：选择 nomic-embed-text（本地）
- 索引方式：高质量

**4.2 导入文档**

支持的格式：PDF、Word、TXT、Markdown、Excel 等。建议按部门或主题分库：

- 产品知识库（产品手册、FAQ、操作指南）
- 制度知识库（公司制度、流程规范）
- 技术知识库（技术文档、开发规范）

**4.3 创建 RAG 应用**

Dify 界面 → 工作室 → 创建应用 → 聊天助手：

- 选择模型：Qwen2.5-7B（默认）
- 上下文：关联对应知识库
- 提示词模板：根据公司场景定制（如"你是 XX 公司的内部 AI 助手，请基于知识库内容回答问题"）

### 第五步：开放使用与推广（Week 3-4）

**5.1 创建不同角色的应用**

为不同部门创建专属应用：

- 通用问答助手（关联综合知识库）
- HR 助手（关联人事制度知识库）
- 技术助手（关联技术文档知识库）
- 写作助手（不关联知识库，直接用大模型）

**5.2 分享方式**

每个应用可以生成 Web 访问链接，员工直接通过浏览器使用，无需安装任何客户端。也可以通过 API 嵌入到现有内部系统中。

### 第六步：进阶能力（Week 4-8）

**6.1 工作流自动化**

使用 Dify 的工作流编排功能，可以构建：

- 周报自动生成（从项目系统拉数据 → AI 总结 → 格式化输出）
- 会议纪要整理（输入会议录音文本 → 提取要点 → 生成纪要）
- 合同审查（输入合同文本 → 比对模板 → 标记风险条款）

**6.2 API 对接内部系统**

Dify 提供标准 REST API，可以：

- 在 OA 系统中嵌入 AI 问答功能
- 让 CRM 系统调用 AI 分析客户数据
- 为内部 ChatBot 提供后端能力

API 文档：`http://服务器IP/v1/docs`

**6.3 插件扩展**

Dify v1.15 支持插件市场，可以安装社区插件扩展能力（如联网搜索、图片生成等）。如果内网无法访问外网插件市场，也可以离线安装插件。

---

## 五、运维与监控

### 日常运维命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f api        # 后端日志
docker compose logs -f web        # 前端日志
docker compose logs -f worker     # 后台任务日志

# 重启服务
docker compose restart

# 更新 Dify（建议先在测试环境验证）
cd dify/docker
git pull origin main
docker compose down
docker compose pull
docker compose up -d
```

### 基础监控（建议配置）

```bash
# 简单的健康检查脚本（可加入 crontab 定时执行）
#!/bin/bash
if ! docker compose -f /path/to/dify/docker/docker-compose.yaml ps | grep -q "Up"; then
    echo "Dify 服务异常！" | mail -s "Dify 告警" admin@company.com
    docker compose -f /path/to/dify/docker/docker-compose.yaml restart
fi
```

### 备份策略

```bash
# PostgreSQL 数据库备份（建议每天自动执行）
docker exec db_postgres pg_dump -U postgres dify > backup_$(date +%Y%m%d).sql

# 恢复
cat backup_20260710.sql | docker exec -i db_postgres psql -U postgres dify
```

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 本地模型效果不如外部 API | 用户体验差，弃用 | 混合模式兜底，非敏感场景走外部 API |
| 服务器宕机 | 全员不可用 | 配置基础监控 + 自动重启；重要数据定期备份 |
| 员工不愿使用 | 投资浪费 | 先找种子用户验证场景，用实际效果带动推广 |
| 外部 API 数据泄露 | 合规风险 | 敏感场景强制使用本地模型；API 调用前做数据脱敏 |
| Dify 版本升级导致兼容问题 | 服务中断 | 升级前备份，在测试环境验证后再生产升级 |

---

## 七、预算估算

| 项目 | 经济方案 | 推荐方案 |
|------|---------|---------|
| 服务器 | 5000-8000 元/年（云主机） | 1-2 万（一次性，自有服务器） |
| GPU 显卡 | 无 | 5000-15000（RTX 4090 或二手 A10） |
| 外部 API | 200-500 元/月 | 200-500 元/月 |
| 运维人力 | 约 0.5 人（兼职） | 约 0.5 人（兼职） |
| **首年总计** | **约 3-7 万** | **约 4-8 万** |

---

## 八、下一步行动

1. **确定服务器资源**：申请一台 4 核 16GB 的服务器（物理机或云主机均可）
2. **确定模型策略**：是否采购 GPU？还是先用纯 API 模式？
3. **指定项目负责人**：需要有基础 Linux 和 Docker 操作能力的人
4. **收集种子场景**：找 3-5 个同事，了解他们最想用 AI 解决什么问题
5. **启动部署**：按照本方案的"分步实施指南"操作，预计 1-2 天可完成基础部署

---

*文档生成时间：2026-07-10 | 基于 gstack 框架（Office Hours + CEO Review + Engineering Review）*
