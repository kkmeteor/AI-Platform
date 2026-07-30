# 登录与用户管理 - 实施计划

## 执行顺序

### Step 1: 后端 - 新增依赖和配置
- 更新 `requirements.txt` 添加 `ldap3` 和 `python-jose[cryptography]`
- 在 `config.py` Settings 中添加 LDAP 和 JWT 相关配置字段
- 在 `config/config.json.example` 中添加示例配置

### Step 2: 后端 - 数据模型
- 在 `models.py` 中添加 `User` 和 `LoginLog` 模型
- 在 `database.py` 的 `migrate_db()` 中添加新表的迁移逻辑
- 在 `schemas.py` 中添加相关 DTO

### Step 3: 后端 - 认证模块
- 创建 `app/auth.py`：JWT 工具函数（生成/验证 Token）
- 实现 `get_current_user` 和 `require_role` 依赖
- 创建 `app/routers/auth.py`：登录/登出/me 接口
- 在 `main.py` 中注册 auth 路由

### Step 4: 后端 - 用户管理模块
- 创建 `app/routers/users.py`：用户列表/角色/状态/日志接口
- 在 `main.py` 中注册 users 路由
- 为现有写操作接口添加角色检查（skills/mcp/portal）

### Step 5: 后端 - 现有接口权限改造
- `routers/skills.py`：创建/删除/修改需要 editor+ 权限
- `routers/mcp.py`：创建/删除/修改需要 editor+ 权限
- `routers/portal.py`：创建/删除/修改需要 editor+ 权限

### Step 6: 前端 - API 层和认证上下文
- `api.ts`：添加 auth 和 users 相关 API 函数
- 修改请求拦截器：自动附加 JWT Token
- 添加 401 响应拦截器：自动跳转登录
- 创建 `AuthContext.tsx`：全局认证状态管理

### Step 7: 前端 - 登录页面
- 创建 `LoginPage.tsx` 和对应样式
- 居中卡片布局，用户名/密码表单
- 集成到 `App.tsx`：未登录时显示登录页

### Step 8: 前端 - 用户管理页面
- 创建 `UserManagePage.tsx` 和对应样式
- 用户列表（Ant Design Table）+ 搜索
- 角色修改（下拉选择）
- 启用/禁用开关
- 登录日志查看

### Step 9: 前端 - 集成权限控制
- 修改 `Sidebar.tsx`：显示用户信息、退出按钮、用户管理菜单
- 根据角色控制各页面操作按钮的显示/隐藏
- 所有写操作按钮添加角色检查

### Step 10: 验证和测试
- 编译检查：TypeScript 无错误
- 启动后端验证数据库迁移
- 启动前端验证页面渲染
- 验证登录流程（需要可用 LDAP 服务器）

## 回滚方案
- 所有改动通过 git 管理，可直接回退
- 新增表不影响现有功能数据
- 认证功能可通过配置开关（后续可选）
