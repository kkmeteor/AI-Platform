# 测试机页面分组折叠与通用分组组件

## Goal

TestMachinePage 显示页面在现有"按 tag 分组"基础上增加**分组折叠**功能，并支持**固定分组顺序**（真机，Flight，FlightX，NOVA，SPECTCT，6x0 → 其他分组放最后）。同时抽取通用分组折叠组件，供未来其他 card list 页面复用。

## Requirements

1. TestMachinePage 按 tag 分组展示保持不变（多 tag 机器出现在多个组、无 tag 机器进入"未分组"）。
2. 分组顺序固定：`真机`、`Flight`、`FlightX`、`NOVA`、`SPECTCT`、`6x0`（按用户给定拼写精确匹配 tag），其余 tag 分组按原有 localeCompare 排序放到最后，"未分组"最后。
3. 每个分组可折叠/展开：分组标题区可点击切换，带箭头指示（展开/收起动画），标题旁展示组内机器数量。
4. **默认全部折叠**，折叠状态持久化到 localStorage（按页面区分 key，刷新后保留用户操作）。
5. 抽取通用 `CollapsibleGroup` 组件到 `frontend/src/components/`（含独立 CSS，跟随项目组件样式习惯），TestMachinePage 使用；其他页面（MarketPlace / McpPage / RagPage / PortalPage）本次不改，未来出现分组需求时复用该组件。
6. 分组逻辑（key 提取、固定顺序、多归属）保留在 TestMachinePage 内，组件只负责"标题 + 数量 + 折叠容器"的 UI 职责。

## Acceptance Criteria

- [ ] TestMachinePage 分组顺序为：真机 → Flight → FlightX → NOVA → SPECTCT → 6x0 → 其他 tag（localeCompare 排序）→ 未分组。
- [ ] 每个分组头部显示组名与机器数量，点击可折叠/展开，箭头方向随状态变化。
- [ ] 页面首次加载时全部分组默认折叠。
- [ ] 折叠/展开状态刷新页面后保持（localStorage 持久化）。
- [ ] 多 tag 机器仍出现在其所属的每个分组中；无 tag 机器只在"未分组"出现。
- [ ] `CollapsibleGroup` 组件位于 components/ 目录，样式独立，不依赖 TestMachinePage 的 CSS 类。
- [ ] `npm run build` 通过，无 TypeScript 类型错误。
- [ ] 其他页面无行为变化。

## Notes

- SPECTCT 按用户给定拼写精确匹配，不做拼写修正。
- 折叠状态持久化 key 需带上页面标识（如 `tm-group-collapsed`），避免未来多页面复用时冲突。
