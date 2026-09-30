# 执行计划 — 门户Portal链接个人/公共分组

> 依赖顺序：后端（1→5）先行，前端（6→9）依赖后端契约；10 为端到端验证。每步完成后跑对应验证，再进入下一步。

## 实施清单（按顺序）

### 后端

- [ ] 1. `backend/app/models.py`：PortalLink 增加 `scope`、`owner_id` 列，`owner` relationship（`lazy="joined"`）与 `owner_name` property；注释风格与现有字段一致（说明 personal/public 语义与归属）。
- [ ] 2. `backend/app/database.py`：`migrate_db()` 增加 portal_links 迁移块（表存在性守护；scope 加列后存量全表置 public；owner_id 加列 `INTEGER REFERENCES users(id)`）。
- [ ] 3. `backend/app/schemas.py`：PortalLinkCreate/Update/Response 增加 scope / owner_id / owner_name 字段（`Literal` 校验）。
- [ ] 4. `backend/app/routers/portal.py`：
  - GET 增加 `get_current_user` 依赖 + 非 admin 可见性过滤（`or_`）；
  - 新增 `_assert_can_manage(link, user, for_background=False)`；
  - POST 写入 scope/owner_id，public 仅 admin；PUT 管理检查 + scope 变更规则；background 两个接口管理检查；DELETE 管理检查；
  - 需要 import：`or_`（sqlalchemy）、`get_current_user`。
- [ ] 5. 后端验证：
  - 解释器选择：优先 `backend/.venv/Scripts/python.exe`，`pip show fastapi` 不可用则用系统 Python（cwd=backend，先 `pip show fastapi` 确认依赖可用）。
  - 冒烟：`python -c "from app.main import app"`（确认迁移无报错、应用可导入）。
  - 验证前先备份 `backend/skills.db`（迁移逻辑风险兜底）。
  - 临时端到端脚本（置于 `backend/data/_test_portal_groups_e2e.py`，模式参考 `backend/data/_test_results_e2e.py`；设 `DATABASE_URL` 指向临时 sqlite 文件，创建 admin/editor/viewer 三个用户并用 `create_access_token` 生成 token，fastapi TestClient 驱动）：
    - 匿名 GET `/api/portal/links` → 401；
    - admin 建 public + personal 链接；editor 建默认链接（owner=editor、scope=personal）；viewer 建链接 → 403；
    - editor 创建 public → 403；
    - 可见性：admin 看到全部；editor 看到 public + 自己；viewer 仅 public；
    - editor 编辑/删除公共或他人链接 → 403；编辑/删除自己 → 200；
    - admin 编辑他人链接 → 200；编辑/删除 builtin → 403；
    - editor 编辑自己链接时传 scope=public → 403；
    - 迁移断言：先手工建旧表（无 scope/owner_id）插入存量行，再调 `migrate_db()`，断言列存在且存量行 scope='public'；
    - 创建响应包含正确 `owner_name`（验证 property 序列化路径）。
  - 全部通过后删除临时脚本。

### 前端

- [ ] 6. `frontend/src/services/api.ts`：`PortalLinkScope` 类型；PortalLink/PortalLinkCreate/PortalLinkUpdate 增加 scope、owner_id、owner_name。
- [ ] 7. `frontend/src/pages/PortalPage.tsx`：
  - `useAuth()` 取 user/isAdmin/canEdit；
  - useMemo 分组（publicLinks / myLinks / othersGroups）；
  - 用 `CollapsibleGroup` 渲染分区（含 storageKey、count、空提示）；
  - 卡片渲染抽为局部函数避免三处重复；操作按钮按 `canManageLink` 显示；
  - Add site 按钮按 canEdit 显示；Modal 增加 Group 字段（仅 admin）；空态文案按 canEdit 区分。
- [ ] 8. `frontend/src/pages/PortalPage.css`：`.portal-groups`、`.portal-group-empty-hint`、select 样式（对齐 input/focus 态）。
- [ ] 9. 前端验证：`cd frontend && npm run build`（tsc + vite 构建通过）。

### 验证与收尾

- [ ] 10. 本地联调冒烟（如环境允许）：起后端（`scripts/dev/run-backend.bat`）与前端（`scripts/dev/run-frontend.bat`），三角色人工检查 Portal 页分组与按钮可见性。
- [ ] 11. Phase 3：按 `trellis-check`/spec 更新（如产生新约定）、确认 git 状态、向用户确认后提交。

## 验证命令汇总

```bash
# 后端冒烟（cwd=backend）
python -c "from app.main import app"

# 临时 e2e（文件创建后执行；用后删除）
python data/_test_portal_groups_e2e.py

# 前端类型检查与构建
cd frontend && npm run build
```

## 风险文件 / 回滚点

- `backend/app/database.py`：迁移逻辑错误会写脏开发库 —— 验证前备份 `backend/skills.db`；回滚 = git 还原代码 + 还原 db 备份（或忽略新增列）。
- `backend/app/routers/portal.py`：GET 认证变更是最大行为变化（消费方仅 PortalPage，已核实）。
- `frontend/src/pages/PortalPage.tsx`：渲染结构整体重排，单文件集中改动，回滚容易。

## 启动前检查

- [ ] 复杂任务三件套齐备（prd.md / design.md / implement.md）
- [ ] implement.jsonl / check.jsonl 已含真实条目
- [ ] 用户明确批准本计划后，才执行 `task.py start` 进入实现
