# 执行计划：Agent 空闲探测与测试机监控

> 顺序执行，每个 Stage 完成验证后才进入下一 Stage。复杂任务，先 prd/design 评审通过再 start。

## Stage 1 — 后端（probe 端点 + 离线判定）

- [ ] 1.1 `config.py` 增加 `probe_token / probe_offline_after_seconds / probe_auto_register`；`config/config.json` 与 `config.json.example` 同步补 `probeToken / probeOfflineAfterSeconds / probeAutoRegister`
- [ ] 1.2 `models.py` TestMachine 增加 `hostname / last_seen_at / last_idle_seconds / last_rdp_active`
- [ ] 1.3 `database.py` migrate_db() 补 test_machines 4 列迁移（含建表语句同步）
- [ ] 1.4 `schemas.py` 新增 `ProbeReport`；`TestMachineResponse` 补 4 字段
- [ ] 1.5 `routers/test_machines.py`：`require_probe_token` + `POST /test-machines/probe` + `_apply_probe_report`（匹配/自动注册/元数据更新/状态优先级/跳变日志）
- [ ] 1.6 `occupancy.py` 新增离线 reaper；`main.py` startup 并列启动

**验证**：
```powershell
# 本地起后端
cd backend; pip install -r requirements.txt; uvicorn app.main:app --port 8000
# 无/错 token → 401
curl.exe -s -X POST http://localhost:8000/api/test-machines/probe -H "Content-Type: application/json" -d '{"hostname":"t1","ip_address":"127.0.0.1","status":"idle"}'
# 带 token → 200（先预置 test_machines 记录 ip=127.0.0.1 或开 auto_register）
curl.exe -s -X POST http://localhost:8000/api/test-machines/probe -H "X-Probe-Token: <token>" -H "Content-Type: application/json" -d '{"hostname":"t1","ip_address":"127.0.0.1","status":"idle","idle_seconds":600}'
# 验证：busy/idle 切换、locked/occupied 优先级、90s 后 offline、auto-register 新建
```

## Stage 2 — 探测脚本改造

- [ ] 2.1 `DebugTools/is-busy.py`：保留检测函数；新增 env 配置读取、自识别（hostname/主 IP）、urllib 上报、心跳节奏（启动/变化/周期）、指数退避、信号处理
- [ ] 2.2 新增 CLI：`--once / --status / --version`
- [ ] 2.3 语法/行为自测：`python DebugTools/is-busy.py --status` 本机判定正确；`--once` 打后端回执正确

## Stage 3 — 服务化脚本

- [x] 3.1 新增 `DeployScripts/install_probe_service.ps1`（install/update/uninstall/restart/status + 参数 + NSSM 全套配置 + `--once` 验证闭环）
- [~] 3.2 本机（或 pilot 机）验证：install → `sc query AgentProbe` RUNNING → 崩溃自愈 → update 幂等 → uninstall 无残留
      （本机无 NSSM：已验证 status/uninstall 幂等、install 至 NSSM 解析前的全部路径、参数校验；NSSM 完整生命周期待 pilot 机验证）

## Stage 4 — Jenkins 流水线

- [x] 4.1 新增 `Jenkinsfile.agent-probe`（参数 + parallel 下发 + 汇总回执 + Credentials 引 token）
- [~] 4.2 建 job 指向该 pipeline；pilot 1 台 `ACTION=install` 端到端
      （配置指引已就绪：[jenkins-job-guide.md](./jenkins-job-guide.md)；建 job / pilot 需 Jenkins 环境操作）
- [ ] 4.3 确认后端已部署新代码（Stage 1 产物走 `Jenkinsfile.backend` 部署；部署前需在 config.json 设置 probeToken）

## Stage 5 — 全量下发与验收

- [ ] 5.1 `AGENTS=全部` `ACTION=install`，各台服务 RUNNING + `--once` 回执 OK（需真实 agent 环境）
- [~] 5.2 按 prd.md Acceptance Criteria 逐条验收：后端全部 + 探测脚本 + 迁移已实测通过；NSSM/Jenkins 项待 pilot
- [x] 5.3 （可选）前端补 `last_seen_at / hostname` 展示（tsc 通过），需重新构建前端

## Stage 6 — 收尾

- [ ] 6.1 更新 `.trellis/spec/`（如新发现的可复用模式）
- [ ] 6.2 按 Trellis 3.4 批量提交（work commits → archive → journal）

## 回滚点

- **Stage 1 后**：后端还原（仅 ADD COLUMN，无数据损失）；config 回退
- **Stage 3 后**：agent 端 `install_probe_service.ps1 -Action uninstall`
- **Stage 4 后**：删除 Jenkins job + 各 agent uninstall
- 每个 Stage 完成即自查（后端 curl、脚本 --once、服务 sc query、流水线回执），不通过不进入下一 Stage
