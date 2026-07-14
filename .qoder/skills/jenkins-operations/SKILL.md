---
name: jenkins-operations
description: Operate Jenkins CI/CD server via MCP tools. Query jobs, nodes, job details, and trigger builds. Use when the user asks about Jenkins jobs, nodes, builds, or wants to trigger a build.
---

# Jenkins Operations

Use the `jenkins` MCP server tools (via `CallMcpTool`) to interact with Jenkins.

## Available Tools

### 1. List All Jobs (Items)

Tool: `get_all_items`
- **Parameters**: None
- **Description**: Get all Jenkins items (jobs, folders, views).
- **Output**: Array of items, each with `_class`, `fullname`, `name`, `url`, `color` (for jobs) etc.
- **Typical usage**: Start here to discover what jobs exist in Jenkins.

**Call format:**
```
fullname: Not needed (no parameters)
```

**Example output fields:**
- `_class`: e.g. `"hudson.model.FreeStyleProject"`, `"com.cloudbees.hudson.plugins.folder.Folder"`
- `fullname`: e.g. `"my-folder/job-name"`
- `name`: Display name of the item
- `url`: Direct URL to the item
- `color`: e.g. `"blue"` (success), `"red"` (failed), `"notbuilt"`, `"aborted"`, `"disabled"`, `"blue_anime"` (running)

---

### 2. List All Nodes (Agents)

Tool: `get_all_nodes`
- **Parameters**: None
- **Description**: Get all Jenkins nodes (including the built-in controller and any agents).
- **Output**: Array of nodes with metadata.

**Call format:**
```
fullname: Not needed (no parameters)
```

**Example output fields:**
- `_class`: Node type
- `displayName`: Node display name
- `numExecutors`: Number of executors
- `offline`: Whether the node is offline
- `idle`: Whether the node is idle

---

### 3. Get Specific Job/Item Details

Tool: `get_item`
- **Parameters**: `fullname` (string, required) — the full path of the item
- **Description**: Get detailed information about a specific Jenkins item.
- **Output**: Detailed JSON object of the item.

**Call format:**
```
fullname: "my-folder/job-name"
```

**Notes:**
- Use the `fullname` from `get_all_items` output.
- Nested items in folders use slash-separated paths, e.g. `"folder/subfolder/job-name"`.

---

### 4. Get Job Build Parameters

Tool: `get_item_parameters`
- **Parameters**: `fullname` (string, required)
- **Description**: Get the parameter definitions of a parameterized Jenkins job. Use this **before** triggering a parameterized build to know what parameters are required.
- **Output**: Array of parameter definitions.

**Call format:**
```
fullname: "my-folder/job-name"
```

**Example output:**
Each parameter object typically contains `_class`, `name`, `description`, `type`, `defaultParameterValue` (with `value`), etc.

---

### 5. Trigger a Build

Tool: `build_item`
- **Parameters**:
  - `fullname` (string, required) — the full path of the job
  - `build_type` (string, required) — either `"build"` (no params) or `"buildWithParameters"` (with params)
  - `data` (object, optional) — build parameters, required if `build_type` is `"buildWithParameters"`
- **Description**: Trigger a build for a Jenkins job.
- **Output**: Integer (queue item ID).

**Call formats:**

**Without parameters:**
```
fullname: "my-folder/job-name"
build_type: "build"
data: null
```

**With parameters** (first use `get_item_parameters` to discover required params):
```
fullname: "my-folder/job-name"
build_type: "buildWithParameters"
data: {
  "BRANCH": "main",
  "ENV": "production",
  "PARAM_NAME": "param_value"
}
```

**Workflow for parameterized builds:**
1. Use `get_item_parameters` to discover the parameter definitions
2. Extract parameter names and default values
3. Ask the user which parameters to override (or use defaults)
4. Call `build_item` with `build_type: "buildWithParameters"` and `data` object

---

### 6. Check Build Status

Tool: `get_build`
- **Parameters**:
  - `fullname` (string, required) — job fullname
  - `number` (integer, optional) — build number; if omitted, returns the last build
- **Description**: Get build details including result, timestamp, duration, etc.

**Call format:**
```
fullname: "my-folder/job-name"
number: 42
```

---

### 7. Get Build Console Output

Tool: `get_build_console_output`
- **Parameters**:
  - `fullname` (string, required) — job fullname
  - `number` (integer, optional) — build number; if omitted, gets last build output
  - `limit` (integer, optional) — max lines to return
  - `offset` (integer, optional, default 0) — lines to skip from start
  - `pattern` (string, optional) — regex to filter matching lines only
- **Description**: Get the console log output of a build. Use after triggering a build or when troubleshooting build failures.

**Call format:**
```
fullname: "my-folder/job-name"
number: 42
limit: 100
offset: 0
pattern: "ERROR|FAILURE"
```

---

## Typical Workflows

### Workflow A: Discover and Inspect Jobs
1. Call `get_all_items` to list all Jenkins items
2. Pick a job of interest, note its `fullname` and `color` (build status)
3. Call `get_item` with that `fullname` to get detailed info
4. Optionally call `get_item_config` to inspect XML config

### Workflow B: Trigger a Build
1. Call `get_all_items` to find the target job
2. Call `get_item_parameters` to check if the job has parameters
3. If parameters exist, determine the values to pass
4. Call `build_item` with appropriate `build_type` and `data`
5. Optionally check build status via `get_build` or view logs via `get_build_console_output`

### Workflow C: Check Jenkins Agents
1. Call `get_all_nodes` to see all nodes
2. Check `offline` and `idle` fields to assess node health

## Important Notes

- The `fullname` parameter for nested items uses `/` as separator (e.g. `"folder/job-name"`).
- Job `color` ending with `_anime` means the job is currently running.
- After triggering a build, the return value is a queue item ID. The build may not start immediately if no executor is available.
