---
name: tfs-changeset-query
version: 1.0.0
description: Query TFS changeset history and compare changes between projects using the tfs-tool MCP service.
description_zh: 使用 tfs-tool MCP 服务查询 TFS 变更集历史记录并比较项目间的变更。
user-invocable: true
argument-hint: "Query TFS changesets, e.g.: '查询 nova 项目最近一周的变更集' or '比较 nova 和 flight 之间的待合并变更'"
---

# TFS Changeset Query

Query and analyze TFS (Team Foundation Server) changeset history using the `tfs-tool` MCP service.

## Capabilities

This skill provides three main workflows:

1. **Health Check** — Verify TFS service availability
2. **Changeset History Query** — Search changesets by date range, submitter, and source path
3. **Cross-Project Changeset Comparison** — Compare changesets between source and target projects, highlighting pending merges

## Prerequisites

The `tfs-tool` MCP server must be configured and accessible. See `CONNECTORS.md` for setup instructions.

## Workflow

### 1. TFS Health Check

Before running queries, optionally verify the TFS service is healthy:

```
MCP tool: check_tfs_health
Parameters: (none)
```

Use this when the user reports connection issues or as a first-step sanity check.

### 2. Query Changeset History

Query changesets with flexible filters:

```
MCP tool: query_changeset_history
Required parameters:
  - startDate: "YYYY-MM-DD" (e.g., "2026-01-01")
  - endDate: "YYYY-MM-DD" (e.g., "2026-07-24")

Optional parameters:
  - sourcePath: Project name, branch, or version (default: "nova")
    Examples: "flight", "flight plus", "nova", "2.0", "v2.0", "main", "master", "develop"
  - submitter: Filter by committer name
  - tfsUrl: Custom TFS server URL (default: http://10.10.10.63:8080/tfs/DefaultCollection)
```

**Usage patterns:**

- "查询 nova 项目本月的提交记录"
  → `startDate: "2026-07-01"`, `endDate: "2026-07-24"`, `sourcePath: "nova"`

- "查看张三在 flight 分支最近两周的变更"
  → `startDate: "2026-07-10"`, `endDate: "2026-07-24"`, `sourcePath: "flight"`, `submitter: "张三"`

- "查一下 develop 分支上个月的提交"
  → `startDate: "2026-06-01"`, `endDate: "2026-06-30"`, `sourcePath: "develop"`

### 3. Cross-Project Changeset Comparison

Compare changesets between two projects and identify pending merges:

```
MCP tool: compare_with_status
Required parameters:
  - sourceProjectPath: e.g., "$/PET-CT Software Project/S2 main"
  - sourceProjectName: e.g., "nova"
  - targetProjectPath: e.g., "$/PET-CT Software Project/PET-CT flight"
  - targetProjectName: e.g., "flight"
  - startDate: "YYYY-MM-DD"
  - endDate: "YYYY-MM-DD"

Optional parameters:
  - tfsUrl: Custom TFS server URL
```

**Important notes:**

- This operation is long-running (typically 2–5 minutes). Always warn the user before invoking.
- Always specify a date range to speed up the query.
- Results are automatically filtered to show only **Pending** and **NeedMerge** changesets.

**Usage patterns:**

- "比较 nova 和 flight 之间有哪些待合并的变更"
  → Prompt user for date range if not specified, then call with appropriate paths.

- "检查 S2 main 到 PET-CT flight 的合并状态"
  → Map to correct `sourceProjectPath` and `targetProjectPath` values.

## Response Guidelines

- Present changeset results in a clear table format showing: changeset ID, author, date, comment, and status.
- For comparison results, highlight **NeedMerge** items prominently.
- If the query returns a large number of results, summarize and offer to filter further.
- Always confirm the date range with the user before running cross-project comparisons.

## Error Handling

- If `check_tfs_health` fails, inform the user that the TFS service may be unreachable and suggest checking network connectivity or VPN status.
- If a query times out, suggest narrowing the date range or verifying the source path.
- If the MCP tool is unavailable, guide the user to configure the `tfs-tool` MCP server per `CONNECTORS.md`.
