# 动态会话卡片实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将硬编码的4个会话卡片替换为从 Dify API 动态加载，支持通过 Dify 管理后台添加/删除 bot 后前端自动更新。

**架构:** 后端通过 DifySession 已有的登录凭证，新增一个批量接口 `GET /dify/chat-apps`，先获取 app list，再对每个 online 的 app 获取详情（含 `site.access_token`、`site.icon` 等），返回前端。前端在 `session` 页签和 `session.html` 右侧面板中动态渲染数据。

**Tech Stack:** FastAPI (Python), React/TypeScript, Ant Design, Dify Console API

## Global Constraints

- 遵循已有的 DifySession 模式（自动登录、401 重试、csrf_token 注入）
- 前端 `PlaceholderPage` 组件的数据格式 (`CardData` 接口) 保持不变
- `session.html` 保持纯 HTML/JS，不引入 React
- API 路径已有 Nginx/Docker 代理支持

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/app/routers/dify.py` | 修改 | 新增 `GET /dify/apps/{appId}` 和 `GET /dify/chat-apps` 端点 |
| `frontend/src/services/api.ts` | 修改 | 新增 `fetchDifyChatApps()` 函数和 `DifyChatApp` 类型 |
| `frontend/src/App.tsx` | 修改 | 用动态 API 替换硬编码的 `session` 卡片 |
| `frontend/public/session.html` | 修改 | 用 API fetch 替换硬编码的 `sessions` 数组 |

---

### Task 1: 后端 — 新增 `/dify/apps/{appId}` 应用详情代理端点

**Files:**
- Modify: `backend/app/routers/dify.py` (在现有文件末尾新增端点)

**Interfaces:**
- Consumes: `DifySession.request()` (已有)
- Produces: `GET /dify/apps/{appId}` → 代理 Dify `GET /console/api/apps/{appId}` 返回原始 JSON

- [ ] **Step 1: 在 `dify.py` 末尾新增应用详情端点**

在 `get_dify_apps` 函数之后添加：

```python
@router.get("/apps/{app_id}")
async def get_dify_app_detail(app_id: str):
    """Proxy: GET /console/api/apps/{app_id} – returns Dify app detail.

    The response includes site info such as ``site.access_token``
    and ``site.icon`` needed for chat session configuration.
    """
    resp = await _session.request("GET", f"/console/api/apps/{app_id}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()
```

- [ ] **Step 2: 验证编译**

```bash
cd c:\Code\SkillMarket\backend
python -c "from app.routers.dify import router; print('OK')"
```

Expected: `OK`

---

### Task 2: 后端 — 新增 `/dify/chat-apps` 批量聊天应用端点

**Files:**
- Modify: `backend/app/routers/dify.py`

**Interfaces:**
- Consumes: `get_dify_apps` 逻辑（获取 app list）、`get_dify_app_detail` 逻辑（逐个获取详情）
- Produces: `GET /dify/chat-apps` → `DifyChatApp[]` 数组

```typescript
// 前端类型定义
interface DifyChatApp {
  id: string;        // Dify app id
  name: string;      // app name
  description: string;
  icon: string;      // emoji icon from site.icon
  icon_background?: string;
  access_token: string;  // site.access_token — 用于 session.html 的 bot 参数
  mode: string;
}
```

- [ ] **Step 1: 在 `dify.py` 末尾新增批量接口**

```python
from typing import Any


@router.get("/chat-apps")
async def get_dify_chat_apps():
    """Return a curated list of online chat apps with site tokens.

    1. Fetches all apps from Dify (paginated).
    2. Filters to those tagged ``online`` (type=app).
    3. For each, fetches the app detail to obtain ``site.access_token``
       and ``site.icon``.
    4. Returns a flattened list suitable for frontend card rendering.
    """
    # Step 1: get app list
    list_resp = await _session.request("GET", "/console/api/apps", params={"page": 1, "limit": 100})
    if list_resp.status_code != 200:
        raise HTTPException(status_code=list_resp.status_code, detail=list_resp.text)

    apps: list[dict[str, Any]] = (list_resp.json().get("data") or [])

    # Step 2: filter online apps
    online_apps = [
        app for app in apps
        if any(
            t.get("name") == "online" and t.get("type") == "app"
            for t in (app.get("tags") or [])
        )
    ]

    # Step 3: fetch detail for each app to get site.access_token
    result: list[dict[str, Any]] = []
    for app in online_apps:
        app_id = app.get("id")
        if not app_id:
            continue
        detail_resp = await _session.request("GET", f"/console/api/apps/{app_id}")
        if detail_resp.status_code != 200:
            logger.warning("Failed to fetch detail for app %s: %s", app_id, detail_resp.status_code)
            continue
        detail = detail_resp.json()
        site_info = detail.get("site") or {}
        result.append({
            "id": app.get("id"),
            "name": app.get("name"),
            "description": app.get("description") or "",
            "icon": site_info.get("icon") or "🤖",
            "icon_background": site_info.get("icon_background") or "",
            "access_token": site_info.get("access_token") or "",
            "mode": app.get("mode") or "",
        })

    return result
```

- [ ] **Step 2: 验证编译**

```bash
cd c:\Code\SkillMarket\backend
python -c "from app.routers.dify import router; print('OK')"
```

Expected: `OK`

---

### Task 3: 前端 api.ts — 新增 DifyChatApp 类型和 API 函数

**Files:**
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Consumes: 后端 `GET /api/dify/chat-apps` 端点
- Produces: `fetchDifyChatApps()` 函数和 `DifyChatApp` 接口

- [ ] **Step 1: 添加类型和 API 函数**

在文件末尾，`isAdmin` 函数之前添加：

```typescript
// ── Dify Chat Apps (for dynamic session cards) ──

export interface DifyChatApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_background: string;
  access_token: string;
  mode: string;
}

export async function fetchDifyChatApps(): Promise<DifyChatApp[]> {
  const res = await api.get<DifyChatApp[]>('/dify/chat-apps');
  return res.data;
}
```

---

### Task 4: 前端 App.tsx — 动态加载会话卡片

**Files:**
- Modify: `frontend/src/App.tsx` (第120-129行 session 硬编码区域)

- [ ] **Step 1: 修改 imports 和状态**

在文件顶部添加 import：

```typescript
import { fetchDifyChatApps } from './services/api';
import type { DifyChatApp } from './services/api';
```

在 `App` 组件内添加状态：

```typescript
const [sessionCards, setSessionCards] = useState<CardData[]>([]);
const [sessionLoading, setSessionLoading] = useState(true);
```

- [ ] **Step 2: 在已有 useEffect 中增加 session 数据加载**

在 `loadAgents` 之后（或并行的新的 useEffect），添加 session 数据加载：

```typescript
useEffect(() => {
  const loadSessionCards = async () => {
    try {
      const apps = await fetchDifyChatApps();
      const colors: CardColor[] = ['blue', 'purple', 'green', 'orange'];
      const cards: CardData[] = apps.map((app, idx) => ({
        icon: app.icon || '💬',
        color: colors[idx % colors.length],
        title: app.name,
        desc: app.description || 'Dify Chatbot',
        status: 'active' as const,
        statusText: '运行中',
        meta: 'Dify Chatbot',
        link: `/session.html?bot=${app.access_token}&name=${encodeURIComponent(app.name)}`,
      }));
      setSessionCards(cards);
    } catch {
      setSessionCards([]);
    } finally {
      setSessionLoading(false);
    }
  };
  loadSessionCards();
}, []);
```

- [ ] **Step 3: 修改 session section 配置**

将 `sectionData` 中 `session` 的 `cards` 改为空数组（由状态动态填充）：

```typescript
session: {
  title: '会话',
  subtitle: '管理和查看Agent会话记录',
  cards: [],  // 将在 useEffect 中动态设置
},
```

- [ ] **Step 4: 修改 renderContent 以处理 session 动态加载**

在 `renderContent` 函数中，对 `session` 添加类似 `agent` 的处理：

```typescript
if (activeSection === 'session') {
  const data = sectionData[activeSection];
  return (
    <Spin spinning={sessionLoading}>
      <PlaceholderPage title={data.title} subtitle={data.subtitle} cards={sessionCards} />
    </Spin>
  );
}
```

- [ ] **Step 5: 清理不再需要的数据**

可以删除或注释掉原来的 `memory` 和 `channel` 区域的硬编码卡片（如果不再需要），但建议保留，因为其不影响功能。（可选）

---

### Task 5: 前端 session.html — 动态加载右侧会话列表

**Files:**
- Modify: `frontend/public/session.html` (第529-535行硬编码 `sessions` 数组)

- [ ] **Step 1: 替换硬编码 sessions 数组为 API 异步加载**

将第529-535行的硬编码数组替换为异步加载逻辑：

```javascript
// ── 动态加载会话列表 ──
let sessions = [];

async function loadSessions() {
    try {
        const resp = await fetch('/api/dify/chat-apps');
        if (!resp.ok) throw new Error('Failed to load sessions');
        const apps = await resp.json();
        sessions = apps.map((app, idx) => ({
            id: idx + 1,
            agent: app.name,
            botId: app.access_token,
            preview: app.description || app.name,
            tag: 'online',
        }));
    } catch (err) {
        console.error('Failed to load session list:', err);
        sessions = [];
    }
    renderSessionList();
}
```

- [ ] **Step 2: 修改 `initPage` 中的调用**

将 `initPage` 中的 `renderSessionList()` 改为 `loadSessions()`：

```javascript
async function initPage() {
    const proxyUrl = getDifyProxyUrl();
    const userId = getDifyUserId();
    const baseUrl = proxyUrl ? `${proxyUrl}/chat/${botId}` : `/chat/${botId}`;
    const chatbotUrl = `${baseUrl}?user=${encodeURIComponent(userId)}`;
    document.getElementById('chatbotFrame').src = chatbotUrl;
    document.getElementById('currentAgent').textContent = botName;
    console.log('Loading chatbot from:', chatbotUrl);
    await loadSessions();  // 原来为 renderSessionList();

    // ... rest unchanged
}
```

- [ ] **Step 3: 修改 `switchBot` 函数 — 从 sessions 数据源查找名称**

`switchBot` 函数保持不变（它已经使用 `sessions` 数组）：

```javascript
function switchBot(id, name) {
    window.location.href = '/session.html?bot=' + id + '&name=' + encodeURIComponent(name);
}
```

---

## 自检

### Spec 覆盖检查
- **Task 1** = 后端 app detail 代理端点 ✓
- **Task 2** = 后端 chat-apps 批量端点 ✓
- **Task 3** = 前端 API 类型和函数 ✓
- **Task 4** = 前端 App.tsx 动态 session 卡片 ✓
- **Task 5** = 前端 session.html 动态右侧面板 ✓

### 占位符检查
- 所有步骤包含完整代码，没有 TBD/TODO
- 所有文件路径准确
- 所有接口签名一致
