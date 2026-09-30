# 实施计划：测试结果上报与展示

## 前置确认（已完成）

- [x] `migrate_db()` 自动迁移机制已在 `backend/app/database.py`（if not exists 建表 + ALTER TABLE 加列模式）
- [x] `require_probe_token` 已在 `routers/test_machines.py`，可直接迁至 `auth.py` 复用
- [x] 前端 `CollapsibleGroup`（storageKey 持久化）、antd v6 `Progress` / `Tag` 可用
- [x] 用户决策：联合键唯一（不做历史流水）、复用探针令牌、按 Build 分组视图、全固定字段 + 迁移

## 实施步骤

### 1. 后端 — auth.py 重构

- `app/auth.py` 新增 `require_probe_token`（从 `routers/test_machines.py` 原样迁入：503 未配置 / 401 无效 token 语义不变）
- `routers/test_machines.py`：删除本地函数，改为 `from app.auth import require_probe_token`

### 2. 后端 — models.py 新增模型

- `TestResult`：字段见 design.md；`UniqueConstraint("build_number", "test_type", "test_machine", name="uq_test_results_run")`；`build_number` 建索引

### 3. 后端 — database.py 迁移

- `migrate_db()` 新增 `test_results` 建表段（含 UNIQUE 约束 + build_number 索引）
- else 分支：读取既有列，`test_result_migrations = []` 空列表 + 注释（未来加列在此追加 `(col, type)`）

### 4. 后端 — schemas.py

- `TestResultReport`：AliasChoices 兼容两种键名；build_number before validator 转 str；current_done 默认 0
- `TestResultReportResponse`：`{ok, id, created}`
- `TestResultResponse`：全字段 + UtcDatetime 时间戳
- `TestResultBuildGroup` / `TestResultBuildListResponse`

### 5. 后端 — 新建 routers/test_results.py

- `POST /test-results/report`：require_probe_token；upsert（查→更/插，IntegrityError 兜底）
- `GET /test-results/builds`：require_role(admin/editor/viewer)；筛选 → 分组 → 排序（数字构建号数值倒序）→ 分页
- 注意路由声明顺序：`/builds` 等静态路径不受 `{id}` 冲突影响（本路由无动态段）

### 6. 后端 — 接线

- `main.py`：import test_results 并 `app.include_router(test_results.router, prefix="/api")`
- `config.py`：`access_log_exclude_paths` 默认值 → `"/api/test-machines/probe,/api/test-results/report"`

### 7. 前端 — api.ts

- 类型：`TestResultRun`、`TestResultBuildGroup`、`TestResultBuildListResponse`
- `fetchTestResultBuilds(params)`：GET `/test-results/builds`

### 8. 前端 — TestResultsPage.tsx + .css

- 头部（标题/说明/刷新按钮/自动刷新开关）+ 筛选栏 + 分页
- CollapsibleGroup 按 build 分组（首组展开，其余折叠）+ 组内表格（Progress / Tag / 更新时间）
- 空态/加载态；`tr-` 前缀样式

### 9. 前端 — 导航

- `Sidebar.tsx`：新增 testResult 图标 + Online 组导航项
- `App.tsx`：import + `activeSection === 'test-results'` 分支

## 验证清单

- [ ] 后端启动：`cd backend && python -m uvicorn app.main:app --port 8000`
- [ ] curl 上报新键 → `created: true`；同键改 CurrentDone 再报 → `created: false` + id 不变
- [ ] 错 / 缺 token → 401；数字 BuildNumber 与 PascalCase 键名 → 正常入库
- [ ] 查询接口分组、排序、筛选、分页正确（JWT 获取参考 DebugTools/login.ps1）
- [ ] 探针端点回归：test_machines.py import 变更后行为不变
- [ ] `cd frontend && npm run build` 通过；`GetProblems` 无错误
- [ ] 前端 dev 手测：分组渲染、进度条、筛选、自动刷新、折叠持久化

## 回滚点

- 后端：auth.py 重构、models/database/schemas/新 router、main/config 接线均为增量改动，可按文件还原
- 前端：api.ts 增量、新页面文件、Sidebar/App 两处小改，可单文件还原
- 数据库：test_results 为新增表，回滚代码后表残留不影响现有功能
