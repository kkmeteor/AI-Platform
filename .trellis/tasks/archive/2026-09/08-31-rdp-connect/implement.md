# 实施计划：远程桌面连接按钮

## 前置确认（已完成）

- [x] antd v6.4.3：Modal `footer` 支持自定义 ReactNode / 渲染函数
- [x] `copyToClipboard` 三层方案已存在于 `frontend/src/utils/clipboard.ts`
- [x] `occupyTestMachine(id, durationMinutes, autoRenew)` API 已存在
- [x] 后端 `occupy_test_machine` 占用成功后自动置 `busy`（无需后端变更）

## 实施步骤（仅 `frontend/src/pages/TestMachinePage.tsx`）

1. **时长必选化**
   - `occupyUnits` 类型改为 `number | null`，初始 `null`
   - `handleCardClick` 中 `setOccupyUnits(2)` → `setOccupyUnits(null)`

2. **公共占用逻辑提取**
   - 提取 `performOccupy(target, units, autoRenew)` 返回占用结果，供"确认占用"与"远程桌面连接"共用（保持现有提示文案不变）

3. **新增 `handleRdpConnect`**
   - `occupyUnits == null` 防御校验
   - 调 `performOccupy`；失败 → `message.error` 并 return（不下载、不复制、不关弹窗）
   - 成功 → `copyToClipboard(ip)`、生成 `.rdp` Blob 下载（文件名 sanitize 机器名）、`message.success`（文案：已占用 X 分钟 + IP 已复制 + 已下载 .rdp 文件，双击打开自动填入 IP 或直接粘贴）、关弹窗、`loadMachines()`

4. **Modal footer 自定义**
   - `footer` 改为：取消（`onCancel`）/ 远程桌面连接（`handleRdpConnect`）/ 确认占用（`handleOccupy`）
   - 后两者 `disabled={occupyUnits == null}`、`loading={occupySubmitting}`
   - 移除 Modal 默认 `okText="确认占用"` / `onOk` 属性（改由 footer 按钮承载）

5. **`handleOccupy` 增加 `occupyUnits == null` 防御校验**

## 验证清单

- [x] `cd frontend && npm run build` 通过（TypeScript 无类型错误）
- [x] `GetProblems` 无编译/类型错误
- [x] `python ./.trellis/scripts/task.py validate` 通过（任务上下文文件合法）
- [ ] 前端 dev 服务（`npm run dev`）手动验证（已启动 http://localhost:5173）：
  - 打开占用弹窗：无默认时长，两主按钮置灰
  - 选时长后两按钮可用
  - 点"远程桌面连接"：机器变 busy（占用者=自己）、IP 在剪贴板、下载 `<机器名>.rdp` 且内容含 `full address:s:<ip>`
  - 双击 `.rdp` 打开 mstsc 且 IP 已填入
  - 对已占用机器操作：仅错误提示，无下载
  - "确认占用"原流程回归正常

## 回滚点

- 单文件改动（`TestMachinePage.tsx`），git 可单文件还原；不涉及后端 / 数据迁移
