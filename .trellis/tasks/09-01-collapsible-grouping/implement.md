# 执行计划：分组折叠组件与测试机页面改造

## 实施步骤

1. **创建 `CollapsibleGroup` 组件**
   - 新建 `frontend/src/components/CollapsibleGroup.tsx`：按 design.md 的 Props 契约实现非受控折叠组件（localStorage 持久化 + defaultCollapsed）。
   - 新建 `frontend/src/components/CollapsibleGroup.css`：`cg-` 前缀样式，标题区按钮化、箭头旋转动画、与现有分组视觉一致。
   - 更新 `frontend/src/components/` 目录（无 index 则不需要额外导出；TestMachinePage 直接 import）。

2. **改造 `TestMachinePage.tsx`**
   - 新增 `PRIORITY_TAGS = ['真机', 'Flight', 'FlightX', 'NOVA', 'SPECTCT', '6x0']`。
   - 重写 `allTags` 排序：优先组在前（按 PRIORITY_TAGS 顺序），其余按 `localeCompare(zh)`，`untagged` 最后。
   - 用 `<CollapsibleGroup>` 替换 `renderGroup`（删除该函数），每组合并到 `tm-groups` 容器；`storageKey` 按 `tm-group-collapsed-{tag}` / `tm-group-collapsed-__untagged__`，`defaultCollapsed`。
   - 保持 `renderCard` / `tm-grid` / 多 tag 归属 / 30s 轮询逻辑不变。

3. **清理 `TestMachinePage.css`**
   - 删除 `tm-group`、`tm-group-header`、`tm-group-title`、`tm-group-count` 样式（已迁移到组件），保留 `tm-groups`、`tm-grid` 及其他样式。

## 验证

- `cd frontend && npm run build`（或 `npx tsc --noEmit` + build）通过，无类型错误。
- 浏览器人工验证：
  - 分组顺序：真机 → Flight → FlightX → NOVA → SPECTCT → 6x0 → 其他 → 未分组。
  - 默认全部折叠；点击标题展开/收起，箭头动画正确。
  - 展开一组后刷新页面，状态保持；新 tag 分组首次出现时为折叠。
  - 多 tag 机器在多个组出现；未分组机器数量正确。
  - 30s 轮询刷新不重置折叠状态。

## 回滚点

- 单次提交（或暂存）内完成组件 + 页面 + CSS 改动；如异常，`git checkout` 还原 TestMachinePage.tsx / .css 并删除组件文件即可，无数据层变更。
