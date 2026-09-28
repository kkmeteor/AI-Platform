# 设计：测试结果上报与展示

## 背景

自动化测试需要将测试进度推送到平台并可视化。字段当前固定（Build/HardwareVersion/SoftwareVersion/TestType/Description/TargetAmount/CurrentDone/TestMachine），未来可能新增 property。需要决策：动态 JSON 文档数据库 vs 固定字段 + migration。

## 存储方案权衡

| 方案 | 说明 | 结论 |
|------|------|------|
| 引入 MongoDB / 文档数据库 | 动态 schema、任意字段 | 否决：引入新存储组件，与现有 SQLite 栈不匹配，运维成本高，当前数据量小 |
| 纯 JSON 列（整条记录存 JSON） | 零迁移、最灵活 | 否决：查询筛选/约束弱、类型无保障，进度字段无法高效索引排序 |
| **全固定字段 + 迁移** | 每个 property 建真实列；新增字段走 `migrate_db()` 自动 ALTER TABLE | **采用** |

采用的依据：项目已有成熟的自动迁移机制（`backend/app/database.py` 的 `migrate_db()`，含 `test_machines` 等表的增量加列模式），新增字段成本低（models.py 加列 + migrate_db 列表加条目 + schemas 加字段 + 前端加列）；固定列获得类型约束、索引与 SQL 级筛选排序。字段数量预计有限且稳定，可维护性优于文档库。

## 数据模型

`test_results` 表（SQLite）：

| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增主键 |
| build_number | VARCHAR(50) NOT NULL, INDEX | 构建号，字符串存储（兼容非纯数字） |
| hardware_version | VARCHAR(50) | 硬件版本，如 Flight |
| software_version | VARCHAR(50) | 软件版本，如 2.5.0 |
| test_type | VARCHAR(100) NOT NULL | 测试类型，如 Recon |
| description | TEXT | 测试描述 |
| target_amount | INTEGER | 目标总量，如 2500 |
| current_done | INTEGER DEFAULT 0 | 当前完成量，如 1020 |
| test_machine | VARCHAR(100) NOT NULL | 测试机名称（字符串，不建外键） |
| created_at / updated_at | TIMESTAMP | 首次入库 / 最后上报时间 |
| UNIQUE(build_number, test_type, test_machine) | | 联合唯一键，upsert 依据 |

## 接口设计

### 上报 `POST /api/test-results/report`

- 认证：`Depends(require_probe_token)`（`X-Probe-Token`）。该依赖从 `routers/test_machines.py` 迁至 `app/auth.py` 供两个路由复用。
- Payload `TestResultReport`（schemas.py）：
  - Pydantic `model_config = ConfigDict(populate_by_name=True)`
  - 每个字段 `validation_alias=AliasChoices("snake_case", "PascalCase")`，兼容两种键名
  - `build_number: str` + before validator 转字符串（兼容 13553 数字输入）
  - `current_done: int = 0`；其余可选字段默认 None
  - 未知字段：Pydantic v2 默认忽略（extra="ignore"）
- upsert：按 (build_number, test_type, test_machine) 查询 → 存在则更新 hardware_version / software_version / description / target_amount / current_done 与 updated_at；不存在则插入。捕获 `IntegrityError` 兜底（并发下唯一约束冲突时回滚重查更新）。
- 响应 `TestResultReportResponse`：`{ok: true, id, created}`

### 查询 `GET /api/test-results/builds`

- 认证：`Depends(require_role("admin", "editor", "viewer"))`
- 参数：`build_number`（LIKE 模糊）、`test_type`（精确）、`test_machine`（精确）、`page`、`page_size`（默认 20，≤100）
- 分组逻辑（Python 内存完成，数据量小）：
  1. 按筛选条件查询全部匹配行
  2. 按 build_number 分组；组排序键为"纯数字按数值、非数字按字符串"，倒序
  3. 组内 runs 按 (test_type, test_machine) 升序
  4. 对组列表分页切片
- 响应 `TestResultBuildListResponse`：`{items: [{build_number, hardware_version, software_version, runs: [...]}], total}`（total = 分组总数）
  - 组头版本取组内首条 run 的值

## 前端设计

### 页面 `TestResultsPage.tsx`（新）

- 数据源：`fetchTestResultBuilds({build_number, test_type, test_machine, page, page_size})`
- 布局（仿 TestMachinePage 风格，独立 `tr-` 前缀 CSS）：
  - 头部：标题 + 副标题 + 手动刷新按钮 + 自动刷新开关（默认开，30s `setInterval` 轮询）
  - 筛选栏：BuildNumber 搜索 input（防抖/回车触发）+ TestType / TestMachine Select（选项从已加载数据 distinct 提取，可清除）+ 分页控件
  - 分组列表：`CollapsibleGroup` 复用（标题 = `Build #13553`，`storageKey` 持久化；第一组默认展开、其余默认折叠）
    - 组头副信息：`Flight / 2.5.0` + `x/y 完成`（completed / total runs）
    - 组内容表格：TestType、TestMachine、Description、进度（antd Progress，percent = done/target 截断 100，文本 `1020 / 2500`）、状态 Tag（已完成：done ≥ target 且 target > 0；否则 进行中）、更新时间（本地时区）
- 空态 / 加载态仿 `tm-empty` / `tm-skeleton` 风格

### 导航接入

- `Sidebar.tsx`：新增图标（进度/图表风格 SVG），Online 组"测试机状态"之后新增 `{ key: 'test-results', label: '测试结果' }`
- `App.tsx`：import + `activeSection === 'test-results'` 分支

## 兼容性与边界

- auth.py 重构：`require_probe_token` 迁移后 `test_machines.py` 改 import，接口行为与错误码（401/503）保持不变
- `config.py` 的 `access_log_exclude_paths` 默认值追加 `/api/test-results/report`，避免高频上报刷访问日志（旧部署 config.json 未覆盖该项时生效；已覆盖的部署可手动追加）
- 上报并发：同一联合键极端并发下依赖唯一约束 + IntegrityError 兜底，SQLite 单写者模型下风险极低
- 未来新增字段：models.py 加列 → migrate_db() else 分支 `test_result_migrations` 追加条目 → schemas 加字段 → 前端加列
