# 技术设计：分组折叠组件与测试机页面改造

## 1. CollapsibleGroup 通用组件

路径：`frontend/src/components/CollapsibleGroup.tsx` + `CollapsibleGroup.css`

### Props 契约

```tsx
interface CollapsibleGroupProps {
  title: React.ReactNode;        // 分组标题（组名，如 "#真机" / "未分组"）
  count?: number;                // 组内数量，展示在标题旁
  storageKey?: string;           // 非空时折叠状态持久化到 localStorage（页面内需唯一）
  defaultCollapsed?: boolean;    // 无持久化时的初始状态，默认 false（展开）
  className?: string;            // 透传到外层容器
  children: React.ReactNode;     // 组内容（卡片网格等）
}
```

### 行为

- **非受控**：内部 `useState` 管理折叠状态；`storageKey` 存在时初始化读取 localStorage，切换时写回。
- 标题区整行可点击（`<button>` 语义，键盘可达），右侧箭头 SVG 随状态旋转 180°（CSS transition）。
- 折叠时内容区不渲染子节点（避免隐藏网格仍占 DOM）；用简单的条件渲染即可，无动画高度需求（antd Collapse 不引入，保持轻量）。
- 计数徽标：`count` 为 `undefined` 时不渲染。

### 样式

- 独立 CSS 类名前缀 `cg-`（collapsible group），继承项目 CSS 变量（`--text-primary`、`--border-default`、`--accent` 等），与 TestMachinePage 现有分组视觉（左侧竖线标题）保持一致。
- 不引用任何 TestMachinePage CSS 类。

## 2. TestMachinePage 分组逻辑改造

### 固定分组顺序

```ts
const PRIORITY_TAGS = ['真机', 'Flight', 'FlightX', 'NOVA', 'SPECTCT', '6x0'];
```

排序算法（替换现有 `allTags` 的 localeCompare 排序）：
1. 命中的优先组：按 `PRIORITY_TAGS` 出现顺序。
2. 未命中的其他 tag：按 `localeCompare(zh)` 排序，追加在优先组之后。
3. "未分组"（无 tag）始终最后。

### 渲染结构

```
<div class="tm-groups">
  {orderedGroups.map(({ tag, machines }) => (
    <CollapsibleGroup
      title={`#${tag}`}
      count={machines.length}
      storageKey={`tm-group-collapsed-${tag}`}
      defaultCollapsed
    >
      <div className="tm-grid">{machines.map(renderCard)}</div>
    </CollapsibleGroup>
  ))}
  {untagged.length > 0 && (
    <CollapsibleGroup title="未分组" count={untagged.length} storageKey="tm-group-collapsed-__untagged__" defaultCollapsed>
      <div className="tm-grid">{untagged.map(renderCard)}</div>
    </CollapsibleGroup>
  )}
</div>
```

- `storageKey` 中 tag 可能有特殊字符（localStorage key 允许任意字符串，无限制），直接拼接即可。
- 移除 TestMachinePage.tsx 内 `renderGroup` 及 `tm-group*` CSS（迁移到组件）；`tm-grid` 保留在页面 CSS。

## 3. 边界与兼容

- 多 tag 机器多组归属、无 tag 机器进"未分组"：保持现有逻辑不变。
- 折叠状态下 30s 轮询刷新仍正常（`loadMachines` 只更新数据，不重置折叠状态）。
- 其他页面零改动；组件未来复用时不带 `storageKey` 即为纯内存折叠。
