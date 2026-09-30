# 设计：Agent 空闲探测与测试机监控

## 1. 概述

现有 `DebugTools/is-busy.py` 仅在本机循环打印 busy/idle。本设计将其改造为常驻探测 agent，通过 NSSM 服务部署到每台 Jenkins agent（即测试机），主动向平台后端上报心跳与空闲状态；后端新增 probe 端点接收上报并更新 `test_machines` 状态，补一个离线判定 reaper。后端复用现有 FastAPI:8000，不新开端口。

```
[Jenkins: agent-probe 流水线] --并行 node(agentName)--> [Agent A..N]
                                                             │ NSSM 服务(开机自启/崩溃重启)
                                                             ▼
                                                    pythonw is-busy.py
                                                             │ 启动即上报 / 变化即上报 / 30s 心跳
                                                             ▼
                                          POST /api/test-machines/probe  (X-Probe-Token)
                                                             ▼
                                                  [后端 FastAPI:8000]
                                                     │ 匹配/自动注册 → 更新 last_seen+状态
                                                     │ 离线 reaper: 缺心跳 90s → offline
                                                     ▼
                                                  [前端 9090] 卡片展示 + 最后心跳
```

## 2. 后端设计

### 2.1 配置（config.py + config/config.json + example）

```python
probe_token: str = _json_defaults.get("probeToken", "")          # env: PROBE_TOKEN
probe_offline_after_seconds: int = _json_defaults.get("probeOfflineAfterSeconds", 90)
probe_auto_register: bool = _json_defaults.get("probeAutoRegister", True)  # env: PROBE_AUTO_REGISTER
```

### 2.2 数据模型与迁移（models.py + database.py）

`TestMachine` 增加 4 列（沿用 `migrate_db()` 的 PRAGMA 检查 + ALTER TABLE 模式，幂等、旧数据保留）：

| 列 | 类型 | 说明 |
|---|---|---|
| `hostname` | VARCHAR(100) nullable | 上报的主机名 |
| `last_seen_at` | TIMESTAMP nullable | 最后心跳时间（UTC 字符串，与现有列一致） |
| `last_idle_seconds` | REAL nullable | 最近一次上报的空闲秒数 |
| `last_rdp_active` | BOOLEAN default 0 | 最近一次上报的 RDP 活跃标记 |

同时 `CREATE TABLE test_machines`（新库）与迁移分支（旧库）同步补充。

### 2.3 Schemas（schemas.py）

```python
class ProbeReport(BaseModel):
    hostname: str
    ip_address: str
    status: Literal["busy", "idle"]
    idle_seconds: float = 0.0
    rdp_active: bool = False
    client_time: float | None = None   # epoch seconds
    version: str = "1.0.0"
```

`TestMachineResponse` 增加 `hostname / last_seen_at / last_idle_seconds / last_rdp_active`（last_seen_at 走现有 `UtcDatetime` 归一化）。

### 2.4 鉴权依赖（auth.py 或 test_machines.py 内）

```python
def require_probe_token(x_token: str = Header(default="", alias="X-Probe-Token")):
    if not settings.probe_token or not hmac.compare_digest(x_token, settings.probe_token):
        raise HTTPException(401, "Invalid probe token")
    return True
```

- 与用户 JWT 体系完全隔离；`probe_token` 为空时端点返回 503/401（防误配开放）
- 用 `hmac.compare_digest` 防时序攻击

### 2.5 新端点 `POST /api/test-machines/probe`

路由挂在现有 `test_machines.router` 下（prefix `/api`），不依赖 `get_current_user`：

1. **鉴权**：`Depends(require_probe_token)`
2. **机器匹配**：
   - `ip_address` 精确匹配 `TestMachine`
   - 未命中 → 按 `hostname` 匹配
   - 仍未命中 → `probe_auto_register=true` 时自动创建（name=hostname，ip 取上报值，status=unknown）；否则返回 `{"ok": False, "reason": "unknown_machine"}`（200，不报错刷日志）
3. **更新元数据**：`hostname / last_seen_at(now) / last_idle_seconds / last_rdp_active`
4. **有效状态计算（优先级）**：
   ```
   machine.locked                           → busy   （管理员锁定优先）
   occupation_cache.get(machine.id) 非空      → busy   （逻辑占用优先）
   probe.status == "busy"                   → busy   （物理忙碌）
   否则                                     → idle
   ```
5. **日志**：仅当有效状态与 `machine.status` 不一致时写入 `TestMachineLog(action="probe", detail=...)` 并更新 `status`；否则只更新元数据。减少日志刷屏。
6. 返回 `{"ok": True, "machine_id", "name", "status"}`，供 agent `--once` 自检回显。

辅助函数 `_apply_probe_report(db, machine, report) -> effective_status` 抽取为独立方法，便于单测。

### 2.6 离线 reaper（occupancy.py + main.py）

```python
OFFLINE_REAPER_INTERVAL = 15  # s
def _offline_check_loop(): ...   # 与 _auto_release_loop 同构
def start_offline_reaper(app): ...
```

- 每 15s 扫描：`last_seen_at` 非空 且 `now - last_seen_at > probe_offline_after_seconds` 且 `locked=False` 且 `occupation_cache.get(id) is None` → `status="offline"` + 跳变写日志
- locked / occupied 的机器永不因缺心跳被置 offline（锁定是管理员状态；占用由占用 reaper 负责到期释放）
- 在 `main.py` 的 `startup` 中与 `start_reaper` 并列启动

### 2.7 前端（轻量，可选）

- `api.ts`：`TestMachine` 接口补 `hostname / last_seen_at / last_idle_seconds / last_rdp_active`
- `TestMachinePage.tsx`：卡片 IP 下方展示 `hostname`，状态徽标旁展示“最后心跳 HH:MM:SS”（`last_seen_at` 本地化）
- 不改变占用/锁定交互逻辑

## 3. 探测脚本设计（DebugTools/is-busy.py，就地改造）

保留检测函数，重写 `__main__` 为配置化 agent：

### 3.1 配置（环境变量，由 NSSM AppEnvironmentExtra 注入）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PROBE_SERVER_URL` | 必填 | 完整端点 URL，如 `http://<master>:8000/api/test-machines/probe` |
| `PROBE_TOKEN` | 必填 | 与后端 `probe_token` 一致 |
| `PROBE_INTERVAL_SEC` | 30 | 心跳间隔（无状态变化时） |
| `PROBE_IDLE_THRESHOLD_SEC` | 300 | 空闲判定阈值 |
| `PROBE_TICK_SEC` | 10 | 本地采样周期 |
| `PROBE_MACHINE_NAME` / `PROBE_MACHINE_IP` | 空 | 手动覆盖自识别结果 |
| `PROBE_LOG_FILE` | 空 | 日志文件（空则写 stderr，由 NSSM 重定向） |

### 3.2 自识别

- hostname：`socket.gethostname()`
- 主 IP：`udp = socket.socket(AF_INET, SOCK_DGRAM); udp.connect((server_host, server_port)); local_ip = udp.getsockname()[0]` —— 拿到“可达后端的那块网卡”的 IP，与后端按 ip 匹配最稳；失败则 `getaddrinfo` 兜底，再失败用 `PROBE_MACHINE_IP`

### 3.3 上报

- 仅用标准库 `urllib.request`，`POST` JSON，header `X-Probe-Token`，timeout 10s
- 启动立即上报一次；每 tick（10s）采样，状态变化立即上报；无变化满 `PROBE_INTERVAL_SEC` 上报
- 响应 200 且 `ok=true` 才算成功；否则按异常处理

### 3.4 健壮性

- 所有异常捕获 → 写日志 → 连续失败指数退避（5s→10s→…→30s 封顶）→ 恢复后立即补报
- 后端不可达期间本地继续采样，不阻塞、不崩溃
- 捕获 `SIGTERM` / `SIGINT` 优雅退出（NSSM 停止依赖）

### 3.5 CLI

```
python is-busy.py                  # 常驻（服务模式）
python is-busy.py --once           # 单次上报后退出（install 脚本验证闭环）
python is-busy.py --status         # 打印本机判定结果后退出
python is-busy.py --version
```

## 4. Windows 服务化（NSSM）

新增 `DeployScripts/install_probe_service.ps1`：

- 参数：`-Action install|update|uninstall|restart|status`、`-ServerUrl`、`-Token`、`-AgentName`（默认本机 hostname）、`-IntervalSec`、`-IdleThresholdSec`、`-PythonPath`、`-ServiceName`（默认 `AgentProbe`）、`-InstallDir`（默认 `C:\SinoAI\AgentProbe`）
- **install**：
  1. 建 `InstallDir`，拷贝 `DebugTools/is-busy.py` → `InstallDir/is-busy.py`
  2. Python：优先 `-PythonPath`，否则 `py -3` / `python`；检测 `import win32ts`，失败则 `pip install pywin32`
  3. NSSM：PATH 或 `InstallDir\nssm.exe` 缺失 → 从内网镜像下载（可配置 `-NssmUrl`，或仓库内置）
  4. `nssm install AgentProbe <pythonw.exe> "<InstallDir>\is-busy.py"`
  5. `nssm set AgentProbe AppEnvironmentExtra` 注入全部 `PROBE_*` 变量
  6. `nssm set AgentProbe AppStdout / AppStderr` → `InstallDir\logs\`，`AppRotateFiles 1`
  7. `nssm set AgentProbe AppExit Default Restart` + `AppRestartDelay 5000`（崩溃自动拉起）
  8. `nssm start AgentProbe`；`sc query AgentProbe` 确认 RUNNING
  9. 执行 `is-busy.py --once`，打印后端回执验证全链路
- **update**：覆盖脚本 + 更新 env + `restart`（幂等，不重复注册）
- **uninstall**：`nssm stop` + `nssm remove`（confirm）
- 全程 `$ErrorActionPreference="Stop"`，失败非零退出（Jenkins 可判定）

## 5. Jenkins 批量下发（Jenkinsfile.agent-probe）

- **参数**：
  - `AGENTS`（string，逗号分隔 node 名；空则报错提示）
  - `ACTION`（choice: install/update/uninstall/status/restart）
  - `SERVER_URL`（默认 `http://<master-ip>:8000`）
  - `PROBE_TOKEN`（`credentials('probe-token')` secret text 引用）
  - `IDLE_THRESHOLD_SEC`（默认 300）、`INTERVAL_SEC`（默认 30）、`PYTHON_PATH`（可选）
- **下发**：`stage('Dispatch')` 内 `parallel` 遍历 `AGENTS.split(',')`，每台 `node(agentName){ checkout scm; powershell -File DeployScripts/install_probe_service.ps1 ... }` —— Jenkins 默认单次只挑一台 node，必须显式并行列表才能“下发到所有 agent”
- **汇总**：每台打印 `sc query` 状态 + `--once` 回执；任一失败标记该台 FAILED 并汇总
- **安全**：`PROBE_TOKEN` 只用 Credentials 绑定；不打印明文
- 节点清单从 Jenkins `Manage Jenkins → Nodes` 获取；`AGENTS` 默认值填已知列表，增删机器改参数

## 6. 安全

- probe 端点与用户 JWT 完全隔离，仅共享 token 鉴权；`hmac.compare_digest` 比对
- token 不进 git（config.json 已 gitignore；Jenkins 存 Credentials）
- 内网静态 token 为阶段一方案，后续可升级每机独立 key / mTLS / IP 白名单
- 上报日志只记状态变化，不记录 token、不记录敏感负载

## 7. 兼容性与回滚

- **数据库**：仅 ADD COLUMN，旧代码/旧数据兼容；回滚删除列不影响旧数据
- **API**：新增端点与新增字段全 Optional；旧前端不传新字段行为不变；probe 端点不影响既有 JWT 路由
- **状态语义**：现有占用/锁定优先级不被破坏（probe 更新受 locked/occupied 保护）
- **探测脚本**：检测函数签名不变，纯新增运行层；回滚仅还原 `__main__`
- **服务**：`ACTION=uninstall` 一键摘除，无残留（NSSM remove）
- **回滚顺序**：后端还原 → agent 端 uninstall → Jenkins job 删除

## 8. 测试策略

1. **后端单测/手动**：curl probe（无/错/对 token）；上报 busy/idle；locked/occupied 优先级；停报后 offline；auto-register 新建
2. **脚本**：`--status` 本机判定；`--once` 单次上报回执
3. **服务**：install → `sc query` → stop/start/restart → 崩溃自愈（kill 进程观察拉起）→ uninstall
4. **Jenkins**：先 pilot 1 台 install 端到端，再 `AGENTS=全部` 全量；各台汇总回执
5. **前端**：卡片状态 + 最后心跳展示
6. **Docker**：`docker build backend` 后 `docker-compose up` 验证新列迁移与 probe 端点
