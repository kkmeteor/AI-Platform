# Agent 空闲探测与测试机监控

## Goal

将 `DebugTools/is-busy.py`（Windows 空闲检测脚本）改造成可配置的探测 agent，通过 Jenkins 批量下发到所有 agent 测试机，以 Windows 服务方式常驻运行；agent 主动向 SinoAI 平台后端上报心跳与空闲状态，后端接收上报并自动更新所有已注册测试机的实时状态（busy / idle / offline），供前端测试机页面展示。

## Requirements

- **探测脚本改造**：保留现有 `get_system_idle_seconds / has_active_rdp_session / is_machine_busy` 检测逻辑，重写运行主循环为常驻 agent：
  - 配置化：服务器地址、token、心跳间隔、空闲阈值等全部通过环境变量注入
  - 自识别：自动获取本机 hostname 与主网卡 IPv4（可达后端的那块网卡）
  - 主动上报：启动即上报（注册）；状态变化立即上报；无变化按固定心跳间隔周期性上报
  - 健壮性：后端不可达/异常时本地继续采样、指数退避重试、进程不崩溃；支持优雅退出
  - 运维 CLI：`--once`（单次上报自检）、`--status`、`--version`
  - 依赖最小化：HTTP 仅用标准库 urllib，外部依赖仍只有 pywin32
- **Windows 服务化**：agent 以服务方式常驻运行，具备开机自启、崩溃自动重启、日志轮转、可脚本化安装/更新/卸载（NSSM 方案）
- **Jenkins 批量下发**：新增 `Jenkinsfile.agent-probe` 流水线，支持对多台 agent node **并行**执行 install / update / uninstall / status / restart；token 等敏感参数走 Jenkins Credentials，不硬编码
- **后端接收端点**：新增 `POST /api/test-machines/probe`，接收 agent 上报并更新 `test_machines` 状态；复用现有 FastAPI:8000，**不新开端口**
- **后端鉴权**：probe 端点不依赖用户 JWT，改用共享 token（`X-Probe-Token` header + 配置项 `probe_token`）
- **状态语义**：
  - 上报 busy（RDP 活跃或空闲 < 阈值）→ `busy`；空闲 ≥ 阈值 → `idle`
  - 管理员锁定（locked）或存在占用（occupation_cache）的机器，不被物理空闲上报覆盖，保持 `busy`
  - 超过 `probe_offline_after_seconds` 未收到心跳且未锁定、无占用 → `offline`
  - 新机器首次上报可自动注册（`probe_auto_register`，默认开启）；未知机器在不开启时被忽略
- **数据持久化**：`TestMachine` 增加 `hostname / last_seen_at / last_idle_seconds / last_rdp_active` 列，数据库自动迁移、旧数据保留
- **前端（轻量）**：测试机卡片展示最后心跳时间与 hostname（可选，不阻塞核心链路）
- **配置**：`config/config.json`（+example）增加 `probeToken / probeOfflineAfterSeconds / probeAutoRegister`，env 可覆盖

## Acceptance Criteria

- [ ] `POST /api/test-machines/probe`：无 token / 错 token → 401；正确 token → 200 且状态正确更新
- [ ] 物理忙碌（RDP 活跃或空闲 < 阈值）→ 测试机状态 `busy`；空闲超阈值 → `idle`
- [ ] 被占用 / 被管理员锁定的机器，即使上报空闲也不会被覆盖为 `idle`
- [ ] 停止 agent 服务超过 `probe_offline_after_seconds` 后 → `offline`；agent 恢复后自动回到 busy/idle
- [ ] 新机器首次上报自动注册进测试机列表（auto_register 开启时）
- [ ] `is-busy.py --once` 单次上报返回后端回执且状态正确
- [ ] NSSM 服务：开机自启、崩溃自动重启、`install/update/uninstall` 幂等可重复执行
- [ ] `Jenkinsfile.agent-probe` 可对多台 agent 并行下发，每台服务 RUNNING 且 `--once` 回执 OK
- [ ] 数据库迁移后旧 test_machines 数据保留，新列默认值正确
- [ ] 前端卡片正确展示 busy/idle/offline 与最后心跳时间

## Notes

- 后端不新起端口：现有 FastAPI 已监听 8000，新增路由即可；前端 nginx 9090 已反代 `/api/` 到 `backend:8000`，probe 路径不会被 Dify 正则段拦截
- 认证采用共享静态 token（内网环境），后续可升级为每机独立 key / mTLS
- 上报频率与离线判定默认值：心跳 30s、离线判定 90s（3×心跳）、空闲阈值 5 分钟，均可配置
- 状态优先级：locked > occupied > 物理 busy > idle；占用/锁定不被物理空闲覆盖
- `DebugTools/is-busy.py` 是探测脚本的单一事实源，就地改造，不另复制新文件
- 服务化默认采用 NSSM（脚本化、自动重启、开机自启）；备选 pywin32 原生服务
