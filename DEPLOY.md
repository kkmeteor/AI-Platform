# DCloud Market Docker 部署说明

本文档介绍如何使用 Docker 将 DCloud Market 部署到测试机。

---

## 一、环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10/11 或 Linux |
| Docker | Docker Desktop（已安装并运行） |
| Docker Compose | v2.0+（Docker Desktop 自带） |
| 磁盘空间 | 至少 2 GB 可用空间 |
| 端口 | 9090（前端）、8000（后端）未被占用 |
| 数据目录 | `C:\Data`（部署脚本会自动创建） |

---

## 二、文件结构说明

部署前请确认以下文件已就绪：

```
dcloud-market/
├── backend/
│   ├── Dockerfile          ← 后端镜像构建文件
│   ├── .dockerignore
│   └── ...（后端源码）
├── frontend/
│   ├── Dockerfile          ← 前端镜像构建文件
│   ├── nginx.conf          ← Nginx 反向代理配置
│   ├── .dockerignore
│   └── ...（前端源码）
├── docker-compose.yml      ← 开发环境编排配置
├── docker-compose.prod.yml ← 测试机编排配置（离线部署用）
├── build.bat               ← 一键打包脚本（构建镜像）
├── export.bat              ← 镜像导出脚本（生成离线部署包）
├── deploy.bat              ← 开发机一键部署脚本
├── deploy-prod.bat         ← 测试机部署脚本（加载镜像+启动）
├── stop.bat                ← 停止服务脚本
└── DEPLOY.md               ← 本文件
```

---

## 三、部署步骤

### 步骤 1：安装 Docker Desktop

1. 前往 [Docker 官网](https://www.docker.com/products/docker-desktop/) 下载 Docker Desktop
2. 安装完成后启动 Docker Desktop
3. 等待右下角鲸鱼图标变为稳定状态（绿色），表示 Docker Engine 已就绪
4. 确认使用 **Linux 容器模式**（右下角托盘图标右键 → Switch to Linux containers）

### 步骤 2：验证 Docker 环境

打开命令提示符（CMD）或 PowerShell，运行：

```bash
docker --version
docker-compose --version
```

两条命令均应正常输出版本号。

### 步骤 3：检查端口占用

确保以下端口未被占用：

```bash
netstat -ano | findstr :9090
netstat -ano | findstr :8000
```

如有占用，请先停止占用程序，或修改 `docker-compose.yml` 中的端口映射。

### 步骤 4：一键打包（构建镜像）

在项目根目录 `dcloud-market/` 下，双击运行：

```
build.bat
```

或手动执行：

```bash
cd dcloud-market
docker build -t dcloud-market-backend:latest ./backend
docker build -t dcloud-market-frontend:latest ./frontend
```

构建完成后，确认镜像已生成：

```bash
docker images dcloud-market-*
```

应看到 `dcloud-market-backend` 和 `dcloud-market-frontend` 两个镜像。

### 步骤 5：一键部署（启动服务）

双击运行：

```
deploy.bat
```

或手动执行：

```bash
docker-compose up -d --build
```

等待服务启动完成后，查看状态：

```bash
docker-compose ps
```

两个服务状态均应显示 `Up` 或 `running`。

### 步骤 6：验证服务

在浏览器中访问：

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:9090 |
| 后端 API | http://localhost:8000 |
| API 文档（Swagger） | http://localhost:8000/docs |

---

## 四、代码更新后发布到测试环境

当你修改了前端或后端代码后，按以下流程将更新发布到测试机：

### 完整发版流程

```
开发机                              测试机
──────                              ──────
1. 修改代码
2. 本地验证（start_all.bat）
3. 运行 build.bat    ──构建镜像
4. 运行 export.bat   ──导出镜像包
5. 复制 dcloud-market-deploy/  ──→
                                    6. 运行 deploy.bat ──自动部署
                                    7. 访问验证
```

### 详细步骤

**① 本地开发 & 验证**

修改代码后，先在本地验证功能正常：
```
start_all.bat        ← 启动后端 + 前端开发服务器
```

**② 构建 Docker 镜像**

确认无误后，构建最新镜像：
```
build.bat            ← 构建 backend + frontend 两个镜像
```

**③ 导出离线部署包**

将镜像导出为 tar 文件，并打包所有部署配置：
```
export.bat           ← 生成 dcloud-market-deploy/ 文件夹
```

**④ 复制到测试机**

将 `dcloud-market-deploy/` 整个文件夹复制到测试机（U盘 / 网络共享 / 远程桌面拖拽）。

**⑤ 在测试机部署**

在测试机上进入 `dcloud-market-deploy/` 文件夹，运行：
```
deploy.bat           ← 自动停止旧容器、加载新镜像、启动服务
```

**⑥ 验证**

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:9090 |
| 后端 API | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |

> 注意：数据存储在 `C:\Data` 中，更新镜像不会丢失数据。

---

## 五、离线部署（测试机部署）

当测试机无法访问外网或没有源码时，可使用离线部署方式：在开发机构建镜像并导出为 tar 文件，复制到测试机后加载运行。

### 步骤 1：在开发机上导出镜像

在开发机项目根目录下，双击运行：

```
export.bat
```

该脚本会自动：
1. 检查并构建最新镜像（如未构建）
2. 将镜像导出为 tar 文件
3. 复制部署所需的全部配置文件

导出完成后，在项目根目录生成 `dcloud-market-deploy` 文件夹：

```
dcloud-market-deploy/
├── dcloud-market-backend.tar    ← 后端镜像
├── dcloud-market-frontend.tar   ← 前端镜像
├── docker-compose.prod.yml      ← 生产环境编排配置
├── deploy.bat                   ← 测试机部署脚本
├── stop.bat                     ← 测试机停止脚本
└── DEPLOY.md                    ← 本部署文档
```

### 步骤 2：复制到测试机

将整个 `dcloud-market-deploy` 文件夹复制到测试机任意位置，例如 `C:\dcloud-market-deploy`。

可通过以下方式复制：
- U 盘 / 移动硬盘
- 网络共享文件夹
- 远程桌面拖拽

### 步骤 3：在测试机上部署

1. 确保测试机已安装 Docker Desktop 并处于运行状态
2. 进入 `dcloud-market-deploy` 文件夹
3. 双击运行 `deploy.bat`

脚本会自动：
1. 初始化 `C:\Data` 数据目录
2. 加载后端和前端镜像
3. 启动所有服务

### 步骤 4：验证服务

在测试机浏览器中访问：

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:9090 |
| 后端 API | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |

### 测试机常用命令

```bash
# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f

# 停止服务
docker-compose -f docker-compose.prod.yml down
# 或直接双击 stop.bat

# 重启服务
docker-compose -f docker-compose.prod.yml restart
```

### 测试机更新版本

当开发机发布新版本时，重复上述流程即可：

1. 在开发机运行 `export.bat` 导出新镜像
2. 将 `dcloud-market-deploy` 复制到测试机（覆盖旧文件）
3. 在测试机运行 `deploy.bat`（会自动停止旧容器、加载新镜像、启动）

> 注意：数据存储在 `C:\Data` 中，更新镜像不会丢失数据。

---

## 六、常用运维命令

### 查看实时日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 只看后端日志
docker-compose logs -f backend

# 只看前端日志
docker-compose logs -f frontend
```

### 停止服务

```bash
docker-compose down
```

### 重启服务

```bash
docker-compose restart
```

### 重新构建并启动（代码更新后）

```bash
docker-compose up -d --build
```

### 清除容器和网络（不影响数据）

```bash
docker-compose down
```

> 注意：数据存储在 `C:\Data` 目录中，`docker-compose down` 不会删除数据。如需彻底清除数据，请手动删除 `C:\Data` 目录。

---

## 七、数据持久化说明

所有业务数据直接存储在宿主机 `C:\Data` 目录中，与 Docker 容器完全解耦，重新部署不会丢失数据。

### 目录结构

```
C:\Data\
├── skills.db          ← SQLite 数据库文件
└── uploads\           ← 用户上传的技能包文件
    ├── xxx.zip
    └── yyy.zip
```

### 对应关系

| 宿主机路径 | 容器内路径 | 用途 |
|-----------|-----------|------|
| `C:\Data\skills.db` | `/app/data/skills.db` | SQLite 数据库 |
| `C:\Data\uploads` | `/app/uploads` | 上传文件存储 |

### 首次部署自动迁移

`deploy.bat` 在首次运行时会自动：
1. 创建 `C:\Data` 和 `C:\Data\uploads` 目录
2. 初始化空的 `skills.db` 文件
3. 将项目 `backend\uploads` 中已有的 `.zip` 文件复制到 `C:\Data\uploads`

### 备份

直接复制 `C:\Data` 整个文件夹即可完成备份，无需操作 Docker 容器。

```bash
# 示例：复制到其他位置备份
xcopy C:\Data D:\Backup\dcloud-data /E /I /Y
```

---

## 八、常见问题

### Q1：`build.bat` 提示 Docker 未运行

请确认 Docker Desktop 已启动且鲸鱼图标稳定。刚启动时可能需要等待 30 秒左右。

### Q2：前端页面打开后显示空白或 502

后端服务可能尚未完全就绪，等待 10 秒后刷新页面。

### Q3：端口 9090 被占用

修改 `docker-compose.yml` 中 frontend 的端口映射，例如改为 9100：

```yaml
ports:
  - "9100:80"
```

然后访问 http://localhost:9100

### Q4：构建前端镜像时报 npm 错误

可能是网络问题，可尝试在 `frontend/Dockerfile` 的 `npm ci` 前添加镜像源：

```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

### Q5：如何查看容器内部文件

```bash
docker exec -it dcloud-market-backend /bin/bash
docker exec -it dcloud-market-frontend /bin/sh
```

### Q6：启动失败，提示挂载权限错误

Docker Desktop 需要开启 C 盘的文件共享权限：

1. 打开 Docker Desktop → Settings → Resources → File sharing
2. 确认 `C:\` 盘已添加并启用
3. 如未添加，点击 `+` 号添加 `C:\` 盘，然后 Apply & Restart

---

## 九、架构说明

```
用户浏览器
    │
    ▼
┌─────────────────┐
│  Nginx (80端口)  │  ← frontend 容器
│  静态文件 + 反代  │
└────────┬────────┘
         │ /api/* 请求
         ▼
┌─────────────────┐
│ FastAPI (8000)   │  ← backend 容器
└────────┬────────┘
         │ 读写
         ▼
┌─────────────────┐
│  C:\Data\        │  ← 宿主机存储
│  ├─ skills.db   │
│  └─ uploads\    │
└─────────────────┘
```

- 前端 React 应用由 Nginx 托管，所有 `/api/*` 请求通过 Nginx 反向代理转发到后端
- 后端 FastAPI 服务监听 8000 端口，数据持久化存储在宿主机 `C:\Data` 目录中
