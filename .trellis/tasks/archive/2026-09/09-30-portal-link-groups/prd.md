# 门户Portal链接个人/公共分组

## Goal

门户 Portal 页面的网站链接（PortalLink）引入"分组"能力：链接分为"个人分组"（归属单个用户）与"公共分组"（全员可见）。每个用户默认只能看到自己的个人链接与公共链接；admin 可以查看所有人的链接。为每个人提供个性化链接空间，同时保持公共资源的集中管理。

## Background / Confirmed Facts

代码现状（已核实的证据）：

- `PortalLink` 模型（backend/app/models.py:25-38）字段：name/url/icon/description/background_image/category/sort_order/is_builtin；**无归属人、无可见范围（分组）字段**。
- `GET /api/portal/links`（backend/app/routers/portal.py:21-29）无认证、无过滤，返回全部链接，builtin 优先排序。
- 创建/编辑/删除/背景图上传（portal.py:32-159）均要求 `admin`/`editor`（`require_role`，backend/app/auth.py:154-163）；builtin 链接不可编辑/删除。
- 角色集合：admin / editor / viewer（frontend/src/pages/UserManagePage.tsx:15）；前端已有 `isAdmin`/`canEdit`（frontend/src/contexts/AuthContext.tsx:76-77）。
- 用户管理仅支持改角色/禁用，**无删除用户功能**（backend/app/routers/users.py），owner 引用不会悬空。
- 数据库迁移采用 `migrate_db()` 轻量 ALTER TABLE 方案（backend/app/database.py:25-236）；portal_links 表由启动时 `Base.metadata.create_all` 创建（backend/app/main.py:53）。
- 前端 `PortalPage.tsx` 平铺展示全部链接卡片；编辑/背景/删除按钮对所有登录者显示（后端会拒绝非 admin/editor）。
- 已有通用折叠分组组件 `CollapsibleGroup`（frontend/src/components/CollapsibleGroup.tsx），项目规范"卡片列表页面分组折叠设计规范"要求分组折叠复用该组件。
- `fetchPortalLinks` 仅在 PortalPage 使用（frontend/src/services/api.ts:407），改动认证要求不会影响其他页面。

已确认的需求决策（用户答复）：

1. 添加权限保持不变：仅 admin/editor 可以新增链接。
2. 仅 admin 可以创建"公共分组"链接；editor（及 viewer）新增的链接只能是个人分组。
3. 管理者范围仅为 admin：只有 admin 可以查看所有人的链接；editor 和 viewer 一样，只能看到公共分组 + 自己的个人分组。
4. 分组展示形式：折叠分组分区（复用 `CollapsibleGroup` 组件）——"公共分组"与"我的分组"分区；admin 额外看到每个用户的个人分组。

## Requirements

- **R1 数据模型**：`PortalLink` 增加 `scope`（personal/public，新链接默认 personal）与 `owner_id`（创建者）字段；历史存量链接迁移为 public（保持当前全员可见行为不回退）；builtin 链接视为 public。
- **R2 可见性过滤**：admin 可见所有链接（所有人的个人链接 + 全部公共链接）；editor/viewer/guest 仅可见 public 链接 + 自己的 personal 链接。
- **R3 创建**：admin/editor 可创建；新链接默认 personal、归属创建者；仅 admin 可将 scope 设为 public，editor 请求 public 时接口拒绝（403）；viewer/guest 创建被拒（403）。
- **R4 管理权限**：
  - admin：可编辑/删除任意非 builtin 链接（含他人 personal 链接、切换 scope、设置/删除背景图）。
  - editor：仅可编辑/删除自己的 personal 链接；不能编辑/删除公共链接及他人链接（403）。
  - builtin 链接维持不可编辑/删除。
- **R5 前端 UI**：
  - Portal 页以折叠分组分区展示链接（复用 `CollapsibleGroup`）："公共分组"始终显示；"我的分组"仅 admin/editor 显示（无链接时显示添加提示）；admin 额外显示每个有个人链接的用户的专属分组（标题为用户名/显示名）。
  - "Add site" 按钮仅 admin/editor 可见；新建 Modal 中 scope 选择器仅 admin 可见（默认 personal，可切换 public）；editor 创建固定 personal。
  - 卡片操作按钮（编辑/背景图/删除）仅在当前用户有权限操作该链接时显示。
  - admin 视图中他人 personal 链接可识别归属人。
- **R6 接口**：`GET /api/portal/links` 要求认证，按 R2 过滤返回；响应增加 scope、owner_id、owner 显示名；未认证返回 401。

## Acceptance Criteria

- [ ] admin 创建链接时可选 personal/public，默认 personal；editor 创建链接固定 personal（UI 无 public 选项，直接调接口传 public 返回 403）。
- [ ] viewer/guest 登录 Portal 页只能看到公共链接（无他人 personal 链接）；editor 只能看到公共链接和自己的个人链接。
- [ ] admin 能看到所有人的链接（含每个用户的个人链接）并能识别归属人。
- [ ] editor 在公共链接及他人链接上无编辑/删除入口；直接调用接口返回 403。editor 可编辑/删除自己的 personal 链接。
- [ ] admin 可编辑/删除任意非 builtin 链接（含他人 personal 链接与公共链接）；builtin 链接无操作入口且接口拒绝。
- [ ] viewer/guest 看不到 "Add site" 按钮；editor 可见但无法创建 public 链接。
- [ ] 升级存量数据：原有链接全部归入公共分组，所有用户升级后仍全部可见，行为不回退。
- [ ] 未认证请求 `GET /api/portal/links` 返回 401。

## Out of Scope

- 自定义任意分组名/多级分类（分组仅"个人/公共"两种）。
- 链接排序拖拽、分组排序调整、分组成员管理。
- 放开 viewer 创建链接。
- 个人链接"转让"给其他用户。

## Technical Notes

- 迁移：在 `migrate_db()`（backend/app/database.py）为 portal_links 增加 scope/owner_id 列迁移，存量行 scope 置为 public。
- 权限与可见性判定必须落在后端接口层；前端隐藏按钮仅为体验优化。
- 分组展示优先复用 `CollapsibleGroup` 组件（符合项目"卡片列表页面分组折叠设计规范"）。
