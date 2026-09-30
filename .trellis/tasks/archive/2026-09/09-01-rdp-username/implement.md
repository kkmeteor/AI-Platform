# 实施计划：测试机远程用户名自动填入

## 改动清单（完全复刻 `teamviewer_id` 既有模式）

### 后端

1. `backend/app/models.py`：`TestMachine` 增加 `rdp_username = Column(String(100), nullable=True)`（放在 `teamviewer_id` 之后）
2. `backend/app/database.py`：
   - `CREATE TABLE test_machines` 语句增加 `rdp_username VARCHAR(100),`（新建库场景）
   - `test_machine_migrations` 列表增加 `("rdp_username", "VARCHAR(100)")`（存量库自动补列）
3. `backend/app/schemas.py`：`TestMachineCreate` / `TestMachineUpdate` / `TestMachineResponse` 各增加 `rdp_username: Optional[str] = None`
4. `backend/app/routers/test_machines.py`：
   - `create_test_machine` 显式构造处增加 `rdp_username=payload.rdp_username`
   - `_to_response` 序列化增加 `"rdp_username": machine.rdp_username`
   - `update_test_machine` 走 `model_dump(exclude_unset=True)`，无需改动

### 前端

5. `frontend/src/services/api.ts`：`TestMachine` / `TestMachineCreate` / `TestMachineUpdate` 类型各增加 `rdp_username?: string | null`
6. `frontend/src/pages/TestMachinePage.tsx`：
   - 添加/编辑表单 `formData` 增加 `rdp_username: ''`；`openAddModal` / `openEditModal` 初始化/回显；`handleSave` 提交 `rdp_username`（trim 后空串转 undefined）
   - 添加/编辑 Modal 增加"远程用户名（可选）"输入框（IP 输入框之后）
   - 卡片展示：IP 地址 field 之后增加"远程用户名" field（有值才渲染）
   - `downloadRdpFile(machineName, ipAddress, username?)`：有用户名时追加 `username:s:<user>\n` 行

## 验证清单

- [x] 重启后端（`migrate_db` 自动补列），`C:/Data/skills.db` 的 `test_machines` 已含 `rdp_username` 列
- [x] 后端启动日志无报错
- [x] `cd frontend && npm run build` 通过（tsc + vite，TS 无类型错误）
- [x] API 验证（登录 + PUT 更新 + GET 列表，测试值已恢复原样）：`rdp_username` 可写可读
- [ ] dev 环境手动验证（已启动 http://localhost:5173）：
  - 添加测试机填远程用户名 → 卡片展示
  - 编辑修改用户名 → 生效
  - 点"远程桌面连接" → 下载的 `.rdp` 含 `full address:s:<ip>` + `username:s:<user>`（无用户名机器仅 IP 行）
  - 双击 `.rdp` → mstsc 用户名已填入
- [x] `python ./.trellis/scripts/task.py validate .trellis/tasks/09-01-rdp-username` 通过

## 回滚点

- 后端 4 文件 + 前端 2 文件，均可 git 单文件还原；`rdp_username` 为可空列，无数据迁移风险
