# 设计：远程桌面连接按钮

## 背景

用户点击"远程桌面连接"后，期望直接打开本机 mstsc.exe 且 IP 已填入远程地址框。但浏览器沙箱模型禁止网页直接启动本地可执行文件，必须寻找等效替代方案。

## 方案权衡

| 方案 | 说明 | 结论 |
|------|------|------|
| 浏览器直接启动 `mstsc.exe` | 浏览器沙箱禁止启动本地 exe | 不可行 |
| 自定义 URL 协议（如 `ms-rdp:`） | 需在每台用户机注册表注册协议处理器，非标准、部署成本高 | 不可行 |
| **下载 `.rdp` 文件** | Windows 系统默认将 `.rdp` 关联到 mstsc（远程桌面连接），双击即打开且 IP 自动填入远程地址框；浏览器下载文件是标准能力 | **采用（主方案）** |
| 复制 IP + 提示手动粘贴 | 用户明确接受的兜底方案，`copyToClipboard` 三层方案已具备 | **同时执行（兜底）** |

结论：主方案 + 兜底同时执行——点击按钮后既复制 IP 到剪贴板，又下载 `.rdp` 文件。用户双击文件即得到"mstsc 打开且 IP 已填入"的效果；即使双击不可用（非 Windows / 关联被改），剪贴板中已有 IP，提示文案引导直接粘贴。

## 数据流

```
点击"远程桌面连接"
  │
  ├─ 校验：occupyTarget 存在 且 occupyUnits != null（否则 return）
  │
  ├─ POST /api/test-machines/{id}/occupy
  │     body: { duration_minutes: occupyUnits * 15, auto_renew: occupyAutoRenew }
  │     （复用现有 occupyTestMachine API；后端自动将机器置 busy）
  │
  ├─ 成功：
  │     ├─ copyToClipboard(machine.ip_address)        // 兜底：粘贴即用
  │     ├─ 生成 .rdp 内容并触发下载（Blob + a[download]）
  │     ├─ message.success 提示（含粘贴 / 双击文件两种方式）
  │     ├─ 关闭弹窗、loadMachines() 刷新（机器显示 busy + 倒计时）
  │     └─ 复制失败（'unsupported'）时提示手动复制
  │
  └─ 失败：
        └─ message.error(接口 detail)，不下载、不复制、不关弹窗
```

## `.rdp` 文件内容

```
full address:s:<ip_address>
```

- 仅写入 IP 一项即可满足"IP 填入远程地址框"的核心需求，其余参数（分辨率、凭据等）使用 mstsc 默认值，保持最小侵入。
- 文件名：`<机器名>.rdp`，需剔除 Windows 非法文件名字符（`\/:*?"<>|`）。
- 编码：UTF-8 无 BOM（Windows mstsc 对 ASCII 内容完全兼容；IP 为纯 ASCII，无编码风险）。

## 前端改动点（`frontend/src/pages/TestMachinePage.tsx`）

1. `occupyUnits` 初始值由 `2` 改为 `null`，类型改为 `number | null`（弹窗打开时重置为 `null`，见 `handleCardClick`）。
2. 占用 Modal 自定义 `footer`（antd v6 支持 `footer` 渲染函数或 ReactNode）：
   - 取消 / **远程桌面连接** / **确认占用**
   - "远程桌面连接"与"确认占用"均 `disabled={occupyUnits == null}`
   - 两个主按钮均带 `confirmLoading={occupySubmitting}` 防重复提交
3. 新增 `handleRdpConnect`：
   - 前置校验 + 调 `occupyTestMachine`（提取公共占用逻辑，与 `handleOccupy` 共用）
   - 成功后复制 IP、生成并下载 `.rdp`、提示、关弹窗、刷新
4. `handleOccupy` 增加 `occupyUnits == null` 防御性校验（理论上 disabled 已拦截）。
5. 不涉及 CSS 新增（复用现有按钮样式或 Modal 默认按钮）。

## 兼容性与边界

- **非 Windows / 关联失效**：双击 `.rdp` 无效果，但剪贴板已复制 IP，提示文案覆盖此场景。
- **占用冲突**（409 非空闲 / 锁定）：后端返回 `detail`，直接展示错误，无副作用。
- **下载被浏览器拦截**：`a.click()` 在用户手势（按钮点击）的 async 链中执行，通常不被拦截；若被拦截用户仍可通过剪贴板 IP 完成连接。
- **机器名含非法字符**：下载文件名做 sanitize。
