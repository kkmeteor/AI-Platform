# Jenkins Job 配置指引：Agent Probe 批量下发

> 对应 implement.md Stage 4.2。目标：在 Jenkins 上创建一个 Pipeline Job，把
> `DeployScripts/install_probe_service.ps1` 批量下发到所有 agent 测试机（Jenkins 节点），
> 以 NSSM Windows 服务方式安装/更新/卸载探测 agent（is-busy.py）。

---

## 0. 前置条件

| 项目 | 要求 |
|------|------|
| 仓库分支 | `Jenkinsfile.agent-probe` 所在分支（如 `pr/0825_增加测试机管理`）已推送 |
| Jenkins 节点 | 目标机器必须是已注册的 **Windows 节点**，且装有 PowerShell |
| 节点权限 | Jenkins agent 服务/进程必须以 **管理员** 运行（NSSM 注册服务需要） |
| 后端 | 已部署且 `config.json` 中 `probeToken` 已设置（与下方凭据值一致） |
| 凭据 | 需先创建 Secret text 凭据 `probe-token`（见第 1 节） |

---

## 1. 创建凭据 probe-token（一次性）

Pipeline 通过 `credentials('probe-token')` 读取 token，凭据 ID 必须精确为 `probe-token`，否则构建直接失败。

1. Jenkins 主页 → **Manage Jenkins** → **Credentials** → **System** → **Global credentials (unrestricted)** → **Add Credentials**
2. 填写：
   - **Kind**: Secret text
   - **ID**: `probe-token`
   - **Secret**: 与后端 `config/config.json` 中 `probeToken` **完全相同的值**
   - Description: `Agent probe shared token (must match backend config probeToken)`
3. 保存。

> ⚠️ 更换 token 时，必须同时修改后端 `config.json` 的 `probeToken` 并重启后端，
> 再更新此凭据，否则所有 agent 心跳会收到 401。

---

## 2. 创建 Pipeline Job

1. Jenkins 主页 → **New Item**
2. 名称：`agent-probe-deploy`（示例），类型选 **Pipeline**
3. 配置：
   - **General**：可选，填描述（如 "Batch deploy is-busy.py probe agent to test machines"）
   - **Pipeline** 区域：
     - **Definition**: `Pipeline script from SCM`（推荐，跟随代码更新）
     - **SCM**: `Git`
       - **Repository URL**: 仓库地址（与现有 Jenkinsfile.backend/frontend 的 job 一致）
       - **Branches to build**: `*/pr/0825_增加测试机管理`（或目标分支）
       - **Script Path**: `Jenkinsfile.agent-probe`
4. 保存。

> 若 Jenkins 无法访问 SCM，可临时用 **Definition: Pipeline script** 粘贴
> `Jenkinsfile.agent-probe` 内容，但每次代码变更需手动同步。

---

## 3. 构建参数说明

Job 的 6 个参数（由 Jenkinsfile 定义，构建时 "Build with Parameters" 填写）：

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `AGENTS` | ✅ | 空 | 逗号分隔的 **Jenkins 节点名**，如 `tengfei-test,win-agent-01`。流水线按节点名调度（`node(agent)`），拼写必须与节点管理页完全一致 |
| `ACTION` | ✅ | install | `install` / `update` / `uninstall` / `status` / `restart`，对全部选中机器执行 |
| `SERVER_URL` | ✅ | `http://10.10.9.65:8000` | 后端 **base URL**，流水线自动追加 `/api/test-machines/probe`。不要填完整 endpoint |
| `IDLE_THRESHOLD_SEC` | 否 | `300` | 空闲判定阈值（秒），is-busy.py 据此上报 busy/idle |
| `INTERVAL_SEC` | 否 | `30` | 无变化时的心跳间隔（秒） |
| `PYTHON_PATH` | 否 | 空 | agent 上 python.exe 完整路径；留空自动探测（`py -3` → `python`） |

> **agent 身份说明**：Jenkinsfile 未传 `-AgentName`，ps1 默认取 `$env:COMPUTERNAME`
> 作为上报 hostname。后端匹配顺序：**先 IP、后 hostname**；未知机器在
> `probe_auto_register=true`（默认）时自动注册。因此 Jenkins 节点名与 Windows
> 计算机名不需要一致，上报入库的是计算机名。

---

## 4. 运行流程（pilot 优先）

### 4.1 单台 pilot 验证

首次务必先对 **一台** 机器验证全链路：

1. Build with Parameters：
   - `AGENTS` = pilot 机节点名（如 `tengfei-test`）
   - `ACTION` = `status`（先确认当前未安装 → 输出 `SERVICE_STATE: NOT_FOUND`，exit 0）
2. 再跑一次：
   - `AGENTS` = 同一台机器
   - `ACTION` = `install`
3. 确认输出包含：`INSTALL_OK: AgentProbe`；控制台有 `[AGENT-PROBE] tengfei-test: RESULT=PASS`
4. 到后端测试机管理页面确认该机器状态变为 busy/idle 且显示心跳时间；或 curl 探活。

### 4.2 全量下发

pilot 通过后：

- `AGENTS` = 所有目标节点名（逗号分隔），`ACTION` = `install`，其余参数保持默认。
- 流水线对每台机器并行执行（parallel 分支），某台失败**不影响其他机器**，失败机器控制台有 `RESULT=FAIL` 标记。

### 4.3 日常运维

| 场景 | ACTION | 说明 |
|------|--------|------|
| 调整心跳/阈值参数后生效 | `update` | 重新注入环境变量并重启服务 |
| 检查各机器服务状态 | `status` | 输出 `SERVICE_STATE: RUNNING/STOPPED/NOT_FOUND` |
| 重启探测服务 | `restart` | 服务异常恢复用 |
| 下线机器 | `uninstall` | 删除服务 + 安装目录；后端机器会在离线阈值后自动置 offline |

---

## 5. 结果解读与排查

### 5.1 结果标记

控制台日志中每台机器一行：

```
[AGENT-PROBE] win-agent-01: RESULT=PASS
[AGENT-PROBE] win-agent-02: RESULT=FAIL - <异常信息>
```

任一分支失败会导致整体构建失败（`failure` 分支提示重新运行），但 PASS 的机器不受影响。

### 5.2 常见问题

| 现象 | 原因与处理 |
|------|-----------|
| `No such DSL method 'node'` / 构建找不到节点 | `AGENTS` 节点名拼写错误或节点未注册/离线；到 Manage Jenkins → Nodes 核对名称 |
| `checkout scm` 失败 | Job 未配置 SCM 或分支不存在；检查第 2 节 SCM 配置 |
| 服务注册失败 / 无权限 | Jenkins agent 不是管理员身份运行；将 agent 服务/进程提权后重试 |
| agent 心跳 401 | `probe-token` 凭据值 ≠ 后端 `probeToken`（见第 1 节警告） |
| 心跳 503 | 后端 `probeToken` 未配置（为空），先去 config.json 设置 |
| 后端返回 `unknown_machine` | `probe_auto_register=false`：需先在测试机管理页登记机器（hostname 或 IP 匹配） |
| 页面状态不更新 | 确认机器未被 locked/occupied（优先级高于物理 busy/idle）；检查 `C:\SinoAI\AgentProbe\logs\probe.log` |
| `RESULT=FAIL` 但无具体错误 | 在失败机器上手动执行 ps1 复现，或查看该机器 `%InstallDir%\logs\probe.log` |

### 5.3 每台机器的观测点

- 服务：`services.msc` 中 `AgentProbe`（或 `-ServiceName` 指定名）
- 日志：`C:\SinoAI\AgentProbe\logs\probe.log`（NSSM 轮转，1 MB 上限）
- 脚本：`C:\SinoAI\AgentProbe\is-busy.py`

---

## 6. 上线检查清单

- [ ] 凭据 `probe-token` 已创建且与后端 `probeToken` 一致
- [ ] 后端已重启使新 `probeToken` 生效
- [ ] Job 已创建，Script Path 指向 `Jenkinsfile.agent-probe`
- [ ] 全部目标节点为管理员权限的 Windows 节点
- [ ] pilot 单台 install 成功，页面出现心跳
- [ ] 全量下发完成，所有机器 `RESULT=PASS`
- [ ] 测试机管理页面所有机器状态正确（busy/idle/offline 流转正常）
