# Connectors Setup

This plugin requires the `tfs-tool` MCP server to be configured and accessible.

## tfs-tool MCP Server

### Server Details

- **Name**: `tfs-tool`
- **Type**: HTTP SSE (Server-Sent Events)
- **Default URL**: `http://<YOUR_TFS_MCP_HOST>:<PORT>/mcp`

### Configuration Steps

1. Open your Qoder MCP settings (Settings → MCP Servers).
2. Add a new MCP server with the following configuration:

   ```json
   {
     "name": "tfs-tool",
     "type": "sse",
     "url": "http://<YOUR_TFS_MCP_HOST>:<PORT>/mcp"
   }
   ```

3. Replace `<YOUR_TFS_MCP_HOST>` and `<PORT>` with your actual TFS MCP server address.
4. Save and verify the connection by using the health check tool.

### TFS Server

The `tfs-tool` MCP server connects to a TFS server. The default TFS URL used by the tools is:

```
http://<YOUR_TFS_HOST>:8080/tfs/DefaultCollection
```

You can override this per-query by passing the `tfsUrl` parameter.

### Network Requirements

- Ensure network access to both the MCP server and the TFS server.
- VPN may be required if accessing from outside the corporate network.

### Tools Provided

| Tool | Description |
|---|---|
| `check_tfs_health` | Check TFS service health (no parameters) |
| `query_changeset_history` | Query changesets by date range, submitter, path |
| `compare_with_status` | Compare changesets between projects with merge status |
