# 登录与用户管理功能 - 需求文档

## 背景
SinoAI Platform 当前无任何认证机制，所有功能完全开放。需要增加基于域账号（Active Directory/LDAP）的登录认证和用户管理功能。

## 核心需求

### 1. LDAP/AD 域账号登录
- 用户输入域账号用户名和密码进行登录
- 后端通过 LDAP 协议连接公司 AD 域控制器验证凭据
- 登录成功后颁发 JWT Token，前端存储并后续请求携带
- 首次登录的域账号自动创建本地用户记录

### 2. 多角色 RBAC 权限控制
三种角色：
- **admin（管理员）**：可管理用户、角色分配、查看所有功能
- **editor（编辑者）**：可创建/编辑技能、MCP 服务器、门户链接等
- **viewer（查看者）**：仅可浏览查看，不可进行任何写操作

### 3. 用户管理（仅管理员可访问）
- 用户列表查看：展示所有已登录过的用户，支持搜索
- 启用/禁用用户：管理员可禁用指定用户，被禁用用户无法登录
- 角色分配：管理员可修改用户角色
- 登录日志：记录每次登录的时间、IP、成功/失败状态

### 4. 前端登录体验
- 未登录时展示登录页面
- 登录后根据角色显示/隐藏管理功能
- 侧边栏显示当前用户信息和退出登录按钮
- 会话过期自动跳转登录页

## 验收标准
1. 域账号用户可以成功登录系统
2. 不同角色用户看到不同的功能按钮和操作权限
3. 管理员可以查看用户列表、修改角色、禁用用户
4. 登录日志可查询
5. 未登录用户无法访问系统功能
6. 退出登录后 Token 失效

## 技术约束
- 后端：FastAPI + SQLAlchemy + SQLite（现有栈）
- 前端：React 19 + TypeScript + Ant Design 6（现有栈）
- LDAP 连接配置通过环境变量或 config.json 配置
- JWT Token 有效期可配置（默认 8 小时）
# 登录与用户管理功能 - 域账号认证

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
