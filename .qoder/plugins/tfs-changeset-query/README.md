# TFS Changeset Query Plugin

Query and analyze TFS (Team Foundation Server) changeset history using the `tfs-tool` MCP service.

## What This Plugin Does

- **Health Check**: Verify TFS service availability before running queries.
- **Changeset History Query**: Search changesets by date range, submitter, project/branch, and source path.
- **Cross-Project Comparison**: Compare changesets between source and target projects, automatically highlighting **Pending** and **NeedMerge** items.

## Skills Included

| Skill | Description |
|---|---|
| `tfs-changeset-query` | Main skill for querying TFS changesets and comparing cross-project changes |

## MCP Tools Used

This skill depends on the `tfs-tool` MCP server which provides three tools:

| Tool | Purpose |
|---|---|
| `check_tfs_health` | Check TFS service health |
| `query_changeset_history` | Query changesets by date, submitter, and path |
| `compare_with_status` | Compare changesets between projects with merge status |

## Setup

### 1. Configure the tfs-tool MCP Server

The `tfs-tool` MCP server must be registered in your Qoder MCP settings. See [CONNECTORS.md](./CONNECTORS.md) for detailed instructions.

### 2. Network Access

Ensure you have network access (or VPN connected) to the TFS server at the configured URL.

## Usage Examples

```
/tfs-changeset-query 查询 nova 项目本月的提交记录
/tfs-changeset-query 查看张三在 flight 分支最近两周的变更
/tfs-changeset-query 比较 nova 和 flight 之间有哪些待合并的变更
```

## Source

This plugin was created from the `tfs-tool` MCP server integration in the SinoAI Platform project. The MCP server exposes TFS operations via HTTP SSE at the configured endpoint.

## Omitted Files

No support files were omitted. The skill is self-contained and relies entirely on the `tfs-tool` MCP tools at runtime.
