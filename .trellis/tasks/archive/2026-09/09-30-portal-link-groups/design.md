# 技术设计 — 门户Portal链接个人/公共分组

## 1. 目标与边界

- 范围：backend（`models.py` / `schemas.py` / `database.py` 迁移 / `routers/portal.py`）+ frontend（`services/api.ts`、`pages/PortalPage.tsx`、`PortalPage.css`）。
- 不引入新依赖；不改动认证模块（复用 `get_current_user` / `require_role`）。
- 分组语义：`scope ∈ {personal, public}`；personal 链接归属 `owner_id` 用户；public 链接全员可见。

## 2. 权限矩阵（后端强制，前端仅隐藏入口）

| 操作 | admin | editor | viewer/guest |
|---|---|---|---|
| GET 可见链接 | 全部（含所有人 personal） | public + 自己 personal | public + 自己 personal |
| POST 创建 | 可选 scope（默认 personal） | 只能 personal（传 public → 403） | 403（require_role 拦截） |
| PUT 编辑 | 任意非 builtin（可改 scope） | 仅自己 personal（目标为 public → 403） | 403 |
| DELETE 删除 | 任意非 builtin | 仅自己 personal | 403 |
| 背景图上传/删除 | 任意（含 builtin，维持现状行为） | 仅自己 personal | 403 |

## 3. 数据模型与迁移

### 3.1 models.py — PortalLink

- 新增列：
  - `scope = Column(String(20), default="personal", nullable=False)` — 取值 `personal` / `public`。
  - `owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)` — 创建者；builtin 与存量行为 NULL。
- 新增供响应序列化使用的关系与属性：
  - `owner = relationship("User", lazy="joined")` — 列表查询 LEFT JOIN 一次取出，避免 N+1。
  - `@property owner_name` — 返回 `owner.display_name or owner.username`；owner 为空返回 None。
  - 注：models.py 目前无 relationship 使用，这是标准 SQLAlchemy 用法；如 Pydantic `from_attributes` 读取 property 验证不通过（预期可以），回退方案为路由层用一个批量 owner 查询手动组装 `owner_name`。
- 不复用既有 `category` 字段（语义是自定义分类且当前未被 API/UI 使用，复用会混淆）。

### 3.2 database.py — migrate_db()

新增 portal_links 迁移块（用表存在性检查守护，风格与现有各表迁移一致）：

- `scope` 列缺失时：`ALTER TABLE portal_links ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'personal'`，随后 `UPDATE portal_links SET scope='public'`（存量链接保持全员可见，全部归入公共分组；该 UPDATE 位于"列刚被创建"分支内，仅执行一次）。
- `owner_id` 列缺失时：`ALTER TABLE portal_links ADD COLUMN owner_id INTEGER REFERENCES users(id)`。
- 全新库：`migrate_db()` 在 import 时执行、先于启动时 `create_all`，表不存在则跳过；`create_all` 直接按新模型建表，无需迁移。

## 4. 后端接口契约

### 4.1 schemas.py

- `PortalLinkCreate`：新增 `scope: Optional[Literal["personal", "public"]] = "personal"`。
- `PortalLinkUpdate`：新增 `scope: Optional[Literal["personal", "public"]] = None`。
- `PortalLinkResponse`：新增 `scope: str = "personal"`、`owner_id: Optional[int] = None`、`owner_name: Optional[str] = None`。
- `Literal` 已在 schemas.py 引入（第 2 行）；非法取值自动 422。

### 4.2 routers/portal.py 关键逻辑

```python
def _assert_can_manage(link: PortalLink, user: User, for_background: bool = False) -> None:
    if user.role == "admin":
        if link.is_builtin and not for_background:
            raise HTTPException(status_code=403, detail="Cannot edit a builtin link")
        return
    # editor（viewer 已在 require_role 层被拦截）
    if link.is_builtin or link.scope != "personal" or link.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You can only manage your own personal links")
```

- `GET /portal/links`：依赖改为 `Depends(get_current_user)`；非 admin 增加过滤 `or_(PortalLink.scope == "public", PortalLink.owner_id == current_user.id)`；排序不变（builtin 优先 → sort_order → created_at）。
- `POST /portal/links`（`require_role("admin", "editor")`）：scope 默认 personal；若 `scope == "public"` 且角色非 admin → 403 "Only admin can create public links"；写入 `owner_id=current_user.id`。
- `PUT /portal/links/{id}`（`require_role("admin", "editor")`）：404 检查 → `_assert_can_manage` → 若 payload 显式包含 scope="public" 且角色非 admin → 403 → 现有 setattr 更新逻辑。
- `POST /portal/links/{id}/background`、`DELETE /portal/links/{id}/background`（`require_role("admin", "editor")`）：404 → `_assert_can_manage(..., for_background=True)`（admin 对 builtin 的背景操作维持现状；editor 不再能操作 builtin/公共/他人链接）。
- `DELETE /portal/links/{id}`（`require_role("admin", "editor")`）：404 → existing is_builtin 403 → `_assert_can_manage`。

### 4.3 行为边界（已确认接受）

- admin 可将他人 personal 链接改为 public（`owner_id` 不变，响应仍带 owner_name）；也可将他人 public 链接改回 personal（归入原 owner 的个人分组）。admin 超级权限，接受。
- editor 更新自己的链接若不传 scope，不触发 scope 校验；传同值 `personal` 为无害 no-op。
- 被禁用用户（is_active=false）的 personal 链接仅 admin 可见（登录层已拦截其本人）。

## 5. 前端设计

### 5.1 api.ts 类型

```ts
export type PortalLinkScope = 'personal' | 'public';
// PortalLink 增加：scope: PortalLinkScope; owner_id: number | null; owner_name: string | null;
// PortalLinkCreate / PortalLinkUpdate 增加：scope?: PortalLinkScope;
```

### 5.2 PortalPage.tsx

- `const { user, isAdmin, canEdit } = useAuth();`
- 客户端分组（useMemo，links 变化时计算）：
  - `publicLinks`：`l.is_builtin || l.scope === 'public'`（defensive，builtin 恒为 public）。
  - `myLinks`：`!l.is_builtin && l.scope === 'personal' && l.owner_id === user.id`。
  - `othersGroups`（仅 admin 计算）：过滤他人 personal 链接，按 `owner_id` 分组，按 owner_name 排序；组标题 `owner_name || 'Unknown user'`。
- 渲染（复用 `CollapsibleGroup`，props：`title` / `count` / `storageKey`，与 TestMachinePage 用法一致）：
  - "Public" 分组：始终渲染，`storageKey="portal-group-collapsed-public"`。
  - "My links" 分组：`canEdit` 时渲染，`storageKey="portal-group-collapsed-mine"`；无链接时显示空提示 "No personal links yet, click \"Add site\" to add"；viewer/guest 不渲染该组。
  - admin：每个他人分组，`storageKey={"portal-group-collapsed-user-" + ownerId}`，组内卡片网格沿用 `.portal-grid`。
- 整页空态：可见链接总数为 0 时保持现有空态布局；提示文案按 `canEdit` 区分（可添加 vs 联系管理员）。
- Add site 按钮：仅 `canEdit` 渲染。
- 卡片操作按钮：仅 `canManageLink(link)` 时渲染（builtin 徽章逻辑不变）：
  - admin：`!link.is_builtin`
  - editor：`!link.is_builtin && link.scope === 'personal' && link.owner_id === user.id`
- Modal：
  - 新增 "Group" 字段（原生 select，选项 Personal / Public），仅 `isAdmin` 显示；新建默认 Personal，编辑时取 `link.scope`。
  - 提交：仅 admin 在 payload 中携带 scope；editor 不携带（后端默认 personal / 拒绝 public）。
- 文案语言：与页面现有英文文案保持一致（Public / My links / Group）。

### 5.3 PortalPage.css

- `.portal-groups`：分组纵向容器（间距参考 `.tm-groups`）。
- `.portal-group-empty-hint`：组内空提示（仿 `.portal-empty-hint`）。
- `.portal-form-field select`：与现有 input 样式对齐（含 focus 态）。

## 6. 兼容性与迁移

- 存量链接 → public：升级后可见性与当前完全一致（全员可见）；builtin 一并落入 public。
- `GET /portal/links` 增加认证要求：已核实消费方仅 PortalPage（frontend/src/services/api.ts:407），同版本发布，无外部兼容问题。
- 回滚：新增列对旧代码无影响（旧代码忽略新列），回滚代码无需回滚数据。
- 无用户删除功能（仅禁用，backend/app/routers/users.py 已核实），`owner_id` 不会悬空。

## 7. 风险与权衡

- 迁移 UPDATE 全表置 public 依赖"列刚创建仅一次"特性；若未来需要再调整存量 scope，需另写迁移。可接受。
- `lazy="joined"` 使所有 PortalLink 查询多一个 LEFT JOIN（含 max_order 等内部查询）——数据量小，可接受；换取 owner_name 全接口自动序列化。
- `db.refresh()` 后访问 `owner` 可能触发一次懒加载 SELECT 以生成 owner_name——正确性优先，可接受。
- 扁平响应 + 前端客户端分组：符合项目"页面保留分组逻辑"的组件规范，admin 跨用户分组逻辑简单可控。

## 8. 测试要点

详见 implement.md 验证清单：迁移正确性、三角色可见性矩阵、editor/admin 权限矩阵、未认证 401、前端构建通过。
