# 测试结果上报与展示平台

## Goal

自动化测试主动向平台后端推送测试进度数据（BuildNumber / HardwareVersion / SoftwareVersion / TestType / Description / TargetAmount / CurrentDone / TestMachine），平台持久化存储并提供前端页面按 Build 分组展示测试结果与进度。同一测试运行（BuildNumber + TestType + TestMachine）重复上报时更新进度而非新增记录。

## Requirements

- **上报接口**：新增 `POST /api/test-results/report`，无用户会话的自动化测试进程可调用：
  - 认证复用现有共享探针令牌（`X-Probe-Token` header，与 is-busy.py 探针一致）
  - 必填字段：`BuildNumber`、`TestType`、`TestMachine`；可选字段：`HardwareVersion`、`SoftwareVersion`、`Description`、`TargetAmount`、`CurrentDone`
  - 字段名同时兼容 PascalCase（上报方示例格式）与 snake_case；未知字段忽略
- **存储**：SQLite 新增 `test_results` 表，唯一键 = BuildNumber + TestType + TestMachine；同键重复上报为 upsert（更新进度与 `updated_at`），不做历史流水
- **数据结构演进策略**：全固定字段建列（类型严格、可索引筛选）；未来新增 property 走既有 `migrate_db()` 自动迁移流程（加列），前端同步加列
- **查询接口**：新增 `GET /api/test-results/builds`（登录用户 JWT），按 BuildNumber 分组、构建号倒序返回；支持 build_number 模糊搜索、test_type / test_machine 精确筛选、分页
- **前端页面**：新增"测试结果"页（侧边栏 Online 组，测试机状态之后）：
  - 按 Build 分组折叠视图，组头展示构建号、版本信息与完成汇总
  - 组内展示每条测试运行：TestType、TestMachine、Description、进度条（CurrentDone/TargetAmount）、状态（进行中/已完成）、最后更新时间
  - 支持手动刷新 + 自动刷新（默认开启，30s 轮询）
  - 筛选：BuildNumber 模糊搜索 + TestType / TestMachine 下拉

## Acceptance Criteria

- [ ] 错误 / 缺失 `X-Probe-Token` 上报 → 401；未配置 probe_token → 503（与现有探针端点行为一致）
- [ ] 首次上报新联合键 → 返回 `created: true`；同键再次上报（改 CurrentDone）→ `created: false` 且记录 id 不变
- [ ] `BuildNumber` 传数字（13553）或字符串（"13553"）均正常入库；PascalCase 与 snake_case 键名均可解析
- [ ] 未来新增未知字段上报 → 接口不报错（字段忽略，走迁移流程后方可入库）
- [ ] 查询接口按 Build 分组：构建号倒序（纯数字按数值排序）、组内 runs 按 test_type + test_machine 排序
- [ ] 前端页面正确渲染分组、进度条百分比与状态标签；筛选与分页可用
- [ ] `cd frontend && npm run build` 通过（tsc 无类型错误）
- [ ] 现有测试机探针端点（`/api/test-machines/probe`）行为不受 auth.py 重构影响

## Notes

- 上报契约（提供给自动化测试侧）：
  ```
  POST http://<host>:8000/api/test-results/report
  Headers: X-Probe-Token: <probe_token> | Content-Type: application/json
  Body: { "BuildNumber": 13553, "HardwareVersion": "Flight", "SoftwareVersion": "2.5.0",
          "TestType": "Recon", "Description": "...", "TargetAmount": 2500,
          "CurrentDone": 1020, "TestMachine": "P52-BJ-S-1" }
  Response: { "ok": true, "id": 1, "created": true }
  ```
- TestMachine 以字符串存储，不强制外键关联 `test_machines` 表
- 仅保留每个联合键最新状态；历史趋势 / 图表不在本期范围
- 查询接口对所有登录角色（admin / editor / viewer）开放
