---
name: tfs-changeset-query
description: Query TFS changeset history by date range and submitter, or compare changeset merge status between projects. Use when the user asks to query TFS commit history, changeset history, submission records, wants to find commits by a specific person within a date range, or wants to check pending/need-merge changesets between source and target projects. Supports filtering by submitter name.
---

# TFS Changeset Query Skill

## 功能说明

此Skill用于查询TFS变更集历史记录和比较变更集合并状态，支持：
- 按日期范围查询变更集历史（必需）
- 按提交人筛选（可选）
- 比较源项目和目标项目之间的变更集，筛选待处理/需要合并项
- 返回结构化的提交记录信息

## 使用场景

当用户提出以下需求时自动使用：
- "查询某个时间段的TFS提交记录"
- "查看某人的提交历史"
- "我要查询X月X号到X月X号，某某某的提交结果"
- "查看nova和flight之间有哪些待处理/需要合并的变更集"
- "比较源项目和目标项目的变更集状态"
- "TFS changeset history"、"commit history"、"submission records"
- "pending changesets"、"need merge changesets"

## 查询流程

### 1. 解析用户输入

从用户问题中提取：
- **startDate**: 开始日期（格式：YYYY-MM-DD）
- **endDate**: 结束日期（格式：YYYY-MM-DD）
- **submitter**: 提交人姓名（可选）

**示例解析：**
- 用户输入："我要查询今年1月1号到5月26号，所有peng yang的提交结果"
  - startDate: "2026-01-01"
  - endDate: "2026-05-26"
  - submitter: "peng yang"

- 用户输入："查询2026年3月到5月的所有变更集"
  - startDate: "2026-03-01"
  - endDate: "2026-05-31"
  - submitter: 不指定

### 2. 执行查询

通过MCP工具 `query_changeset_history` 执行查询：

```
工具名称: query_changeset_history
参数:
  - startDate: "2026-01-01"
  - endDate: "2026-05-26"
  - submitter: "peng yang" (可选)
  - sourcePath: 项目代号/分支/版本名称或完整路径 (可选，默认nova)
    - 项目代号: nova/nova产品 → $/PET-CT Software Project/S2 main (默认)
    - 项目代号: flight/flight产品 → $/PET-CT Software Project/PET-CT flight
    - 项目代号: flight plus/flight plus产品 → $/PET-CT Software Project/PET-CT flight plus
    - 版本/分支: 2.0, v2.0, main, master, develop, dev → flight项目
    - 版本/分支: flight plus 2.0, flight plus main → flight plus项目
    - 版本/分支: nova main, s2, s2 main → nova项目
    - 支持后缀: 自动移除"产品"、"project"、"版本"、"version"等后缀后匹配
  - tfsUrl: "http://10.10.10.63:8080/tfs/DefaultCollection" (使用默认值)
```

### 3. 处理和展示结果

MCP Server返回JSON格式结果后，进行格式化输出：

```markdown
## 查询结果

**查询条件：**
- 时间范围：2026-01-01 到 2026-05-26
- 提交人：peng yang

**统计：** 共找到 2 条提交记录

1. **变更集 #24249**（2026-05-25 14:47）
   - 描述：...
   - 审核人：yangpeng | Story/Bug：...

2. **变更集 #24238**（2026-05-25 10:25）
   - 描述：...
   - 审核人：Guanwei.li | Story/Bug：...
```

## 日期解析规则

- "今年X月X号" → 2026-X-X
- "X月X号"（当年）→ 2026-X-X
- "X年X月X号" → 按指定年份
- "X月到X月" → X月1号到X月最后一天
- "最近一周" → 今天往前推7天
- "最近一个月" → 今天往前推30天

## 提交人匹配

- 不区分大小写：`peng yang` = `Peng Yang` = `PENG YANG`
- 支持中英文姓名：`peng yang`、`guanwei li`、`shuo li`
- 精确匹配：只返回完全匹配提交人名称的记录

## 注意事项

1. **日期格式必须正确**：YYYY-MM-DD（如：2026-01-01）
2. **提交人姓名为可选**：不指定则返回该时间段所有提交
3. **结果按时间倒序**：最新的提交排在前面
4. **空结果处理**：如果未找到记录，明确告知用户
5. **依赖TFS后台代理服务**：MCP工具依赖 `localhost:9000` 的TFS代理服务。
   如果查询返回 "fetch failed" 错误，说明后台服务未运行，需要执行启动脚本：
   ```powershell
   powershell -ExecutionPolicy Bypass -File "D:\CODE\Tools\TfsTool.BlazorServer\start-api-only.ps1"
   ```
   等待服务就绪后重新查询。

## 常见查询示例

### 示例1：指定提交人
```
用户：我要查询今年1月1号到5月26号，所有guanwei li的提交结果
```
→ startDate: "2026-01-01", endDate: "2026-05-26", submitter: "guanwei li"

### 示例2：不指定提交人（查所有）
```
用户：查询2026年3月到5月的所有变更集
```
→ startDate: "2026-03-01", endDate: "2026-05-31"

### 示例3：指定项目和提交人
```
用户：查看flight plus项目shuo li本月的提交
```
→ startDate: "2026-05-01", endDate: "2026-05-31", submitter: "shuo li", sourcePath: "flight plus"

**注意：** 如果用户没有指定项目，默认使用nova项目。
支持代号映射：`nova` → `$/PET-CT Software Project/S2 main`、`flight` → `$/PET-CT Software Project/PET-CT flight`、`flight plus` → `$/PET-CT Software Project/PET-CT flight plus`

### 示例4：使用自然语言后缀
```
用户：查询peng yang在4月份对nova产品的提交记录
```
→ startDate: "2026-04-01", endDate: "2026-04-30", submitter: "peng yang", sourcePath: "nova产品"

系统会自动移除"产品"后缀后匹配，"nova产品" → "$/PET-CT Software Project/S2 main"

同理支持：`flight版本`、`nova project`等格式

---

## 二、比较变更集状态（compare_with_status）

### 使用场景

当用户需要比较源项目和目标项目之间的变更集，查看哪些变更集待处理或需要合并时使用。

### 调用流程

#### 1. 解析用户输入

从用户问题中提取：
- **sourceProjectPath**: 源项目路径（必需）
- **sourceProjectName**: 源项目名称（必需）
- **targetProjectPath**: 目标项目路径（必需）
- **targetProjectName**: 目标项目名称（必需）
- **startDate**: 开始日期（可选，默认最近1个月）
- **endDate**: 结束日期（可选，默认今天）

**常见项目组合：**
| 源项目 | 目标项目 | 说明 |
|---------|---------|------|
| nova (S2 main) | flight | nova → flight 合并检查 |
| nova (S2 main) | flight plus | nova → flight plus 合并检查 |
| flight | flight plus | flight → flight plus 合并检查 |

#### 2. 执行查询

通过MCP工具 `compare_with_status` 执行查询：

```
工具名称: compare_with_status
参数:
  - sourceProjectPath: "$/PET-CT Software Project/S2 main"
  - sourceProjectName: "nova"
  - targetProjectPath: "$/PET-CT Software Project/PET-CT flight"
  - targetProjectName: "flight"
  - startDate: "2026-05-01" (可选，默认最近1个月)
  - endDate: "2026-06-09" (可选，默认今天)
  - tfsUrl: "http://10.10.10.63:8080/tfs/DefaultCollection" (使用默认值)
```

#### 3. 结果说明

API返回结构为 `{ Merged: [...], Unmerged: [...] }`。

MCP Server **只取 Unmerged 分组的数据**（未合并的变更集），并从中筛选出：
- **Pending (0)** - 待处理
- **NeedMerge (1)** - 需要合并

Merged 分组的数据会被忽略，仅统计数量。

### 注意事项

1. **此接口耗时较长**：涉及3次TFS QueryHistory查询，通常2-5分钟
2. **默认日期范围**：如果未指定日期，默认查询最近1个月的数据
3. **超时设置**：10分钟超时，如果仍然超时请缩小日期范围
4. **依赖TFS后台代理服务**：需要 `localhost:9000` 服务运行中

### 示例

```
用户：查看nova到flight之间有哪些需要合并的变更集
```
→ sourceProjectPath: "$/PET-CT Software Project/S2 main"
→ sourceProjectName: "nova"
→ targetProjectPath: "$/PET-CT Software Project/PET-CT flight"
→ targetProjectName: "flight"
→ startDate/endDate: 使用默认（最近1个月）

```
用户：比较nova和flight在2026年5月的变更集状态
```
→ sourceProjectPath: "$/PET-CT Software Project/S2 main"
→ sourceProjectName: "nova"
→ targetProjectPath: "$/PET-CT Software Project/PET-CT flight"
→ targetProjectName: "flight"
→ startDate: "2026-05-01", endDate: "2026-05-31"
