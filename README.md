# SinoAI Platform

企业级 AI 技能市场与智能体管理平台，提供技能发布、AI 应用集成、MCP 工具接入等一站式能力。

---

## 功能特性

- **技能市场** — 上传、浏览、管理 AI 技能包（ZIP），支持分类与搜索
- **AI 对话集成** — 内嵌 Dify 聊天窗口，支持多会话、多 Bot 切换
- **MCP 工具接入** — 集成 12306 查询、Jenkins CI、TFS 变更集等 MCP 服务
- **动态配置** — 运行时通过 `config.json` 热更新，无需重建镜像
- **权限控制** — 基于角色的技能管理与操作权限体系
- **容器化部署** — Docker Compose 一键编排，支持生产环境与内网 Registry

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Ant Design 6 |
| 后端 | Python + FastAPI + SQLAlchemy + SQLite |
| 部署 | Docker + Nginx 反向代理 + Docker Compose |
| AI 集成 | Dify API 代理、MCP 协议 |

---

## 项目结构

```
SkillMarket/
├── backend/          # FastAPI 后端服务
│   ├── app/
│   │   ├── routers/  # API 路由（skills、dify）
│   │   ├── main.py   # 应用入口
│   │   ├── models.py # 数据模型
│   │   └── config.py # 配置管理
│   └── requirements.txt
├── frontend/         # React 前端应用
│   ├── src/
│   │   ├── components/  # UI 组件
│   │   ├── pages/       # 页面
│   │   └── services/    # API 服务层
│   └── package.json
├── config/           # 运行时配置文件
│   └── config.json
└── docker-compose.yml
```

---

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- Docker & Docker Compose（容器化部署时）

### 本地开发

**启动后端：**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端 API 文档访问：[http://localhost:8000/docs](http://localhost:8000/docs)

**启动前端：**

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器默认运行在：[http://localhost:5173](http://localhost:5173)

---

### Docker 部署

```bash
# 构建并启动所有服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

| 服务 | 端口 |
|------|------|
| 前端（Nginx） | `9090` |
| 后端（FastAPI） | `8000` |

---

## 配置说明

运行时配置通过 `config/config.json` 注入，前后端容器均挂载此文件，修改后无需重建镜像：

```json
{
  "backendUrl": "http://your-server:8000",
  "difyUrl": "http://your-dify-server:80"
}
```

---

## MCP 服务集成

项目支持通过 MCP 协议接入外部工具，已集成：

- **12306** — 火车票查询、票价查询、中转推荐
- **Jenkins** — CI/CD 任务触发与状态查询
- **TFS** — 变更集历史查询与合并状态对比
- **Browser Use** — 浏览器自动化操作

---

## 许可证

本项目仅供内部使用。
