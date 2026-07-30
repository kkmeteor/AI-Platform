# 登录与用户管理 - 技术设计

## 整体架构

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React 前端  │────▶│  FastAPI 后端     │────▶│  SQLite DB   │
│  (JWT存储)   │     │  (JWT验证+RBAC)  │     │  (用户/日志)  │
└─────────────┘     └────────┬─────────┘     └──────────────┘
                             │ LDAP
                             ▼
                    ┌──────────────────┐
                    │  Active Directory │
                    │  域控制器          │
                    └──────────────────┘
```

## 后端设计

### 新增依赖
- `ldap3`：LDAP/AD 连接和认证
- `python-jose[cryptography]`：JWT Token 生成和验证

### 数据模型

#### User 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| username | String(50) UNIQUE | 域账号用户名 |
| display_name | String(100) | 显示名称（从 AD 获取） |
| email | String(200) | 邮箱（从 AD 获取） |
| role | String(20) | 角色：admin/editor/viewer |
| is_active | Boolean | 是否启用 |
| last_login_at | TIMESTAMP | 最后登录时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### LoginLog 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 自增主键 |
| user_id | Integer FK | 关联用户 |
| username | String(50) | 用户名（冗余存储） |
| login_time | TIMESTAMP | 登录时间 |
| ip_address | String(50) | 登录 IP |
| success | Boolean | 是否成功 |
| message | String(200) | 失败原因 |

### API 设计

#### 认证接口
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/auth/login | 登录（LDAP验证） | 公开 |
| POST | /api/auth/logout | 登出 | 已登录 |
| GET | /api/auth/me | 获取当前用户信息 | 已登录 |

#### 用户管理接口
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/users | 用户列表（分页+搜索） | admin |
| PUT | /api/users/{id}/role | 修改用户角色 | admin |
| PUT | /api/users/{id}/status | 启用/禁用用户 | admin |
| GET | /api/users/login-logs | 登录日志（分页） | admin |

### 认证流程
1. 前端发送 `{username, password}` 到 `/api/auth/login`
2. 后端使用 `ldap3` 连接 AD，尝试 bind 验证凭据
3. 验证成功：从 AD 获取用户信息（display_name, email）
4. 本地查找/创建 User 记录，首次登录默认角色为 viewer
5. 生成 JWT Token（包含 user_id, username, role）
6. 记录登录日志
7. 返回 Token 和用户信息

### JWT 认证中间件
- 新增 `app/auth.py` 实现 JWT 工具函数
- `get_current_user` 依赖：从 Authorization header 解析并验证 JWT
- `require_role(*roles)` 依赖工厂：检查当前用户角色
- 写操作接口统一添加角色检查

### LDAP 配置
在 `config.py` Settings 中新增：
```python
ldap_server: str = ""          # LDAP 服务器地址
ldap_port: int = 389           # LDAP 端口
ldap_use_ssl: bool = False     # 是否使用 SSL
ldap_domain: str = ""          # AD 域名
ldap_base_dn: str = ""         # 搜索基础 DN
ldap_user_prefix: str = ""     # 用户名前缀（如 DOMAIN\\）
```

## 前端设计

### 新增文件
- `src/pages/LoginPage.tsx`：登录页面组件
- `src/pages/UserManagePage.tsx`：用户管理页面
- `src/contexts/AuthContext.tsx`：认证上下文（Provider + Hook）

### 修改文件
- `App.tsx`：集成 AuthProvider，未登录时渲染 LoginPage
- `Sidebar.tsx`：底部显示用户信息和退出按钮，根据角色显示菜单项
- `api.ts`：添加 auth 和 users 相关 API，请求拦截器自动带 JWT

### 认证状态管理
- 使用 React Context 管理全局认证状态
- Token 存储在 localStorage
- 启动时检查 Token 有效性（调用 /api/auth/me）
- 401 响应自动清除 Token 并跳转登录页

### 登录页面设计
- 居中卡片式布局，包含用户名/密码输入框
- 支持回车键提交
- 登录失败显示错误提示
- 简洁风格，与现有系统 UI 一致

### 权限控制
- 前端根据角色控制操作按钮的显示/隐藏
- admin 角色：显示用户管理菜单、所有操作按钮
- editor 角色：显示创建/编辑按钮
- viewer 角色：隐藏所有写操作按钮
- 侧边栏新增"用户管理"菜单项（仅 admin 可见）
