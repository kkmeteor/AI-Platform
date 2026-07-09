# SinoAI Platform 项目分享

---

## 1. 这项目是干嘛的？

简单说：**赛诺联合内部的一个 AI 能力集成平台**。

我们内部有很多 AI 相关的东西散落在各处——Dify 上有聊天机器人、有知识库、Qoder开发工具有 MCP 工具、还有各种 Skill 插件。
这个项目就是把这些东西统一到一个界面里，让大家在一个地方就能管理和使用它们。

**一句话总结：AI 能力的"控制台 + 组件市场 + 全局监控/追溯"。**

---

## 2. 现在能干什么？—— 当前已实现的功能

目前系统初步搭建完成，通过侧边栏可以切换不同的功能页签：

### 左侧导航

```
Agent Studio 区：
  ─ Agents（🤖） → 显示 Dify 上发布的 AI 助手列表
  ─ Skills（⚡）  → Skill 插件市场，上传/下载/管理
  ─ Tools（🔧）  → 内置工具展示（Web Search、Code Runner 等（占位未实现））
  ─ MCPs（🔗）   → MCP 协议工具（tfs-tool、jenkins-tool）
  ─ RAGs（📚）   → 知识库列表（已对接 Dify 知识库）
  ─ 统计（📊）   → 统计AI token用量，agent调用记录，健康状态等（占位未实现）

Agent Control 区：
  ─ 会话（💬）   → Dify chatbot 聊天会话入口
  ─ 通道（📡）   → 消息通道展示（占位未实现）
  ─ 记忆（🧠）   → 记忆管理（占位未实现）
```

### 重点模块现状

| 模块 | 状态 | 说明 |
|------|------|------|
| **Skills 市场** | ✅ 已上线 | 支持上传 .zip 插件、搜索、下载、删除、置顶（admin 权限） |
| **Dify 集成** | ✅ 已上线 | 后端代理 Dify API、前端嵌入 Dify chatbot iframe |
| **MCP 展示** | ✅ 已上线 | 展示 tfs-tool、jenkins-tool 等 MCP 服务信息 |
| **RAG 知识库** | ✅ 已对接 | 展示 Dify 知识库链接，点击跳转 Dify 管理页 |
| **Agent 列表** | ✅ 已上线 | 从 Dify 拉取 app 列表，支持筛选 online 标签的 Agent |
| **会话入口** | ✅ 已上线 | 通过 iframe 嵌入 Dify chatbot |

---

## 3. 整体架构

```
┌────────────────────────────────────────────┐
│              用户浏览器 (React SPA)          │
│    localhost:5173（开发）/ 9090（生产）      │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│            Nginx 反向代理（生产环境）         │
│    /api/* → backend:8000                    │
│    /chatbot/* → Dify 服务器                  │
│    /_next/* /console/* → Dify 服务器         │
└──────────────────┬─────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐   ┌──────────────────┐
│  Backend       │   │  Dify 服务器      │
│  FastAPI       │   │  (10.10.9.65)    │
│  SQLite        │   │  聊天/知识库/Agent │
│  端口 8000     │   │  端口 80          │
└───────┬───────┘   └──────────────────┘
        │
        ▼
┌───────────────┐
│  skills.db     │
│  (SQLite 文件)  │
└───────────────┘
```

### 几个关键设计

**1. 前后端分离**
- 前端 React + Vite，后端 FastAPI（Python），各跑各的容器
- 开发时前端通过 Vite proxy 调后端；生产时 Nginx 统一反向代理

**2. Dify 打通**
- 为了快速上线原型，集成开源低代码AI agent编排平台Dify。
- 后端有一个 `DifySession` 类，负责自动登录 Dify 控制台、维护 cookie、遇到 401 自动重登
- 前端通过 iframe 嵌入 Dify chatbot，Vite dev 模式下有个透明代理插件绕开 `X-Frame-Options` 限制
- 生产环境 Nginx 配置了完整的 Dify 反向代理（`/chatbot/`、`/console/`、`/api/` 等路径）

**3. 配置驱动**
- Dify 地址、登录凭据写在 `config/config.json` 里，容器运行时挂载，改配置不用重编镜像
- 支持环境变量覆盖，优先级：环境变量 > config.json > 代码默认值

---

## 4. 项目代码结构

```
├── backend/                       # Python 后端
│   └── app/
│       ├── main.py                # FastAPI 入口，挂载路由
│       ├── config.py              # 配置中心（json + 环境变量）
│       ├── database.py            # SQLite + SQLAlchemy
│       ├── models.py              # 数据模型（Skill 表）
│       ├── schemas.py             # Pydantic 校验模型
│       └── routers/
│           ├── skills.py          # Skills CRUD 接口
│           └── dify.py            # Dify API 代理
│
├── frontend/                      # React 前端
│   ├── src/
│   │   ├── App.tsx                # 主应用，路由+布局
│   │   ├── components/
│   │   │   ├── Sidebar.tsx        # 左侧导航栏
│   │   │   ├── SkillCard.tsx      # Skill 卡片展示
│   │   │   ├── SkillDetailModal.tsx # Skill 详情弹窗
│   │   │   ├── UploadModal.tsx    # 上传弹窗
│   │   │   └── PlaceholderPage.tsx # 通用卡片页（Agent/Tools/MCP等）
│   │   ├── pages/
│   │   │   └── MarketPlace.tsx    # Skills 市场页
│   │   └── services/
│   │       └── api.ts             # 所有 API 调用封装
│   └── nginx.conf                 # 生产 Nginx 配置
│
├── config/
│   └── config.json                # 运行时配置（Dify 地址等）
│
├── MD/                            # 设计文档
│   ├── Agent/                     # Agent 功能设计文档
│   ├── RAG/                       # 知识库架构设计文档
│   └── FlowChart/                 # 架构流程图
│
├── docker-compose.yml             # 容器编排
├── _run_backend.bat               # 本地启动后端
├── _run_frontend.bat              # 本地启动前端
└── _start_all_local.bat           # 一键启动（前后端）
```

---

## 5. 技术栈一览

| 层 | 技术 | 说明 |
|----|------|------|
| 前端框架 | React 19 + TypeScript | Hooks 函数组件 |
| UI 组件库 | Ant Design 6 | 界面统一好看 |
| 构建工具 | Vite 8 | 开发热更新快 |
| 后端框架 | Python FastAPI | 异步高性能 |
| 数据库 | SQLite | 轻量，开发/小规模够用 |
| ORM | SQLAlchemy 2 | Python 最流行的 ORM |
| HTTP 客户端 | httpx | 异步，用于代理 Dify API |
| 部署 | Docker Compose | 容器化一键部署 |
| 外部依赖 | Dify | 底层 AI 引擎和知识库 |

---

## 6. 怎么跑起来？

### 开发模式（本地）

```bash
# 终端 1：启动后端
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 终端 2：启动前端
cd frontend
npm install
npm run dev
```

然后浏览器打开 `http://localhost:5173` 即可。

### 生产模式（Docker）

```bash
docker-compose up -d --build
```

然后访问 `http://localhost:9090`。

### 配置文件

编辑 `config/config.json` 修改 Dify 服务器地址和登录凭据：

```json
{
  "difyUrl": "http://你的Dify地址:80",
  "difyConsole": {
    "email": "你的账号",
    "password": "你的密码"
  }
}
```

---

## 7. 未来规划（设计文档里的内容）

**欢迎大家积极Contribute~**
代码路径： http://10.10.11.194:3000/sinounion/ai-studio 
创建分支，修改代码，提交PR。

## 开发

### 权限管理
- **权限管理集成** 目前未集成公司单点登陆系统，后期考虑集成域账户+OAuth2单点登陆。
- **权限粒度控制** dify权限控制比较粗放，需要精细化管理（部门、身份、个人权限等）
- **域账户绑定** 打通公司域账户和Dify账户绑定。

### Agent 功能模块
- **声明式 Agent 配置**：用 YAML/JSON 定义 Agent 的身份、模型、绑定的 Skills/MCPs/RAGs，并且权限映射到dify
- **运行时引擎**：ReAct / Function Calling 循环，LLM Planner + Tool Executor
- **会话管理**：和登陆身份绑定，多轮对话持久化、滑动窗口、上下文压缩
- **权限模型**：RBAC + 能力级权限 + tool_confirm 确认机制
- **审计日志**：全链路 trace_id，所有调用可追溯

## 测试/管理/产品

### RAG 知识库（"单一源、双消费"）
- **文档连接器**：自动从钉钉文档、Confluence、GitLab 等同步知识
- **智能分块**：按文档类型采用不同分块策略
- **混合检索**：向量检索 + 全文检索（ES）双索引
- **权限过滤**：AI 检索严格遵守文档权限，不可越权
- **溯源机制**：AI 回答可追溯到原始文档的具体段落
- **更多知识库系统集成** Obsidian自生长知识图谱等

### 分阶段路线
| 阶段 | 内容 |
|------|------|
| Phase 1 | Agent 核心 Runtime（配置 CRUD + 对话 + 内置工具） | 
| Phase 2 | 能力生态打通（Skills/MCPs/RAGs 鉴权 + 沙盒） | 
| Phase 3 | 多通道接入（钉钉/飞书） + 可观测性 |
| Phase 4 | 多 Agent 协作 + 长任务 + 画布编排 UI |

---

## 8. 关键设计/决策备忘

- **配置分离** — `config.json` 挂载到容器内，改配置不用重新构建镜像，运维友好
- **MCP 协议兼容** — 预留了 Anthropic MCP 协议支持，后续可对接更多 MCP 工具

---

## 9. 常见问题

**Q：Dify 页面打不开？**
A：检查 `config.json` 里的 `difyUrl` 是否正确，以及 Dify 服务是否可用。

**Q：上传 Skill 失败？**
A：只支持 .zip 文件，文件大小不超过 Nginx 限制（默认 100M）。

**Q：Dify iframe 白屏？**
A：通常是 Dify 响应头带 `X-Frame-Options: DENY`，开发环境用 Vite 透明代理解决，生产环境靠 Nginx `proxy_hide_header` 处理。

---
