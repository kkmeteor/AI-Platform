# Agent 知识库动态加载

## 现状分析

- `App.tsx` 第 136-142 行：知识库链接是**硬编码**的，按 Agent 名称匹配
- 后端 `dify.py` 已有 `GET /dify/datasets` 代理接口，但不支持按 app_id 过滤
- Dify API `GET /console/api/datasets?page=1&ids={app_id}` 可根据 app_id 获取绑定的知识库

## 后端改动

### 1. 新增后端接口 `GET /dify/apps/{app_id}/datasets`

文件：`backend/app/routers/dify.py`

新增一个代理接口，将前端的请求透传到 Dify：
```python
@router.get("/apps/{app_id}/datasets")
async def get_dify_app_datasets(app_id: str):
    """Proxy: GET /console/api/datasets?page=1&ids={app_id}"""
    resp = await _session.request(
        "GET",
        "/console/api/datasets",
        params={"page": 1, "ids": app_id},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()
```

## 前端改动

### 2. 新增前端 API 调用函数

文件：`frontend/src/services/api.ts`

新增类型和函数：
```typescript
export interface DifyAppDataset {
  id: string;
  name: string;
}

export async function fetchDifyAppDatasets(appId: string): Promise<{ data: DifyAppDataset[] }> {
  const res = await api.get(`/dify/apps/${appId}/datasets`);
  return res.data;
}
```

### 3. 修改 Agent 卡片加载逻辑，动态获取知识库

文件：`frontend/src/App.tsx`

在 `loadAgents` 函数中：
- 获取到 filtered apps 列表后，对每个 app 并发调用 `fetchDifyAppDatasets(app.id)`
- 将返回的 dataset name 映射为 `knowledgeLinks`（url 指向 `${DIFY}/datasets/{dataset_id}/documents`）
- 移除第 136-142 行的硬编码逻辑

核心改动：
```typescript
// 替换硬编码，改为动态加载
const cardsWithDatasets = await Promise.all(
  filtered.map(async (app, idx) => {
    const baseCard = { /* 原有卡片逻辑 */ };
    try {
      const datasetsRes = await fetchDifyAppDatasets(app.id);
      const datasets = datasetsRes.data || [];
      if (datasets.length > 0) {
        baseCard.knowledgeLinks = datasets.map(ds => ({
          label: ds.name,
          url: `${DIFY}/datasets/${ds.id}/documents`,
        }));
      }
    } catch { /* 忽略单个失败 */ }
    return baseCard;
  })
);
```

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `backend/app/routers/dify.py` | 新增 `GET /dify/apps/{app_id}/datasets` 接口 |
| `frontend/src/services/api.ts` | 新增 `fetchDifyAppDatasets` 函数和类型 |
| `frontend/src/App.tsx` | 修改 `loadAgents`，动态加载知识库，删除硬编码 |
