# TFS Changeset Query Skill

## 概述

这是一个用于查询TFS变更集历史的Skill，可以直接通过自然语言对话调用MCP Server的查询能力。

## 安装位置

```
.qoder/skills/tfs-changeset-query/
├── SKILL.md        # 主要指令文件
└── examples.md     # 使用示例
```

## 快速开始

### 基本用法

直接询问：
```
"我要查询今年1月1号到5月26号，所有peng yang的提交结果"
```

Agent会：
1. 自动识别需要使用 `tfs-changeset-query` Skill
2. 解析日期和提交人信息
3. 调用MCP Server的 `query_changeset_history` 工具
4. 返回格式化的查询结果

### 不需要做的

❌ 不再需要手动创建JS脚本
❌ 不再需要运行 `node xxx.js`
❌ 不再需要编写调用代码

✅ 只需要用自然语言提问即可！

## 功能特性

- ✅ 按日期范围查询
- ✅ 按提交人筛选
- ✅ 自然语言日期解析
- ✅ 不区分大小写的姓名匹配
- ✅ 结构化的结果展示
- ✅ 完整的错误处理

## 使用示例

更多示例请查看 [examples.md](examples.md)

### 常见查询

1. **查询特定人员的提交**
   ```
   "查询peng yang从1月1日到5月26日的所有提交"
   ```

2. **查询所有提交**
   ```
   "查看2026年3月到5月的所有变更集"
   ```

3. **查询近期提交**
   ```
   "查看shuo li最近一周的提交记录"
   ```

## 依赖

- MCP Server: `mcp-server/tfs_health_mcp.js` 必须已配置并运行
- 工具: `query_changeset_history`

## 配置

确保MCP Server已正确配置在 `mcp.json` 中：

```json
{
  "mcpServers": {
    "tfs-tool": {
      "command": "node",
      "args": ["C:\\Users\\tengfei.ma\\Documents\\MD\\mcp-server\\tfs_health_mcp.js"],
      "disabled": false
    }
  }
}
```

**注意：** MCP服务文件位于 `mcp-server/` 目录下。

## 技术细节

### MCP工具调用

```
工具名称: query_changeset_history
参数:
  - startDate: string (必需) - 开始日期 YYYY-MM-DD
  - endDate: string (必需) - 结束日期 YYYY-MM-DD
  - submitter: string (可选) - 提交人姓名
  - tfsUrl: string (可选) - TFS服务器URL
  - sourcePath: string (可选) - 源码路径
```

### API端点

```
POST http://localhost:9000/api/changesethistory/query
Content-Type: application/json

{
    "TfsUrl": "http://10.10.10.63:8080/tfs/DefaultCollection",
    "SourcePath": "$/PET-CT Software Project/PET-CT flight",
    "StartDate": "2026-01-01",
    "EndDate": "2026-05-26"
}
```

## 更新日志

- 2026-05-26: 初始版本创建
