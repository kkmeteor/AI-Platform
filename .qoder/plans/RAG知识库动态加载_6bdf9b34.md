# RAG 知识库动态加载

## 1. 后端：新增 Dify 知识库代理接口

**文件**: `backend/app/routers/dify.py`

新增 `GET /dify/datasets` 端点，通过已有的 `DifySession` 代理 Dify 的 `/console/api/datasets` 接口：

```python
@router.get("/datasets")
async def get_dify_datasets():
    resp = await _session.request(
        "GET", "/console/api/datasets",
        params={"limit": 30, "include_all": "false", "keyword": "", "page": 1},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()
```

## 2. 前端：新增 API 函数和类型

**文件**: `frontend/src/services/api.ts`

新增类型和函数：

```typescript
export interface DifyDataset {
  id: string;
  name: string;
  description: string;
  permission: string;           // 权限类型，如 partial_members
  data_source_type: string;     // 数据源类型，如 upload_file
  indexing_technique: string;   // 索引技术，如 high_quality
  app_count: number;            // 关联应用数
  document_count: number;       // 文档数
  word_count: number;           // 字数
  created_by: string;
  author_name: string;          // 创建者名称
  created_at: number;           // 创建时间 (unix timestamp)
  updated_by: string;
  updated_at: number;           // 更新时间 (unix timestamp)
  embedding_model: string;      // 嵌入模型名称
  embedding_model_provider: string; // 嵌入模型提供商
}

export interface DifyDatasetsResponse {
  data: DifyDataset[];
  has_more: boolean;
  limit: number;
  page: number;
  total: number;
}

export async function fetchDifyDatasets(): Promise<DifyDatasetsResponse> {
  const res = await api.get<DifyDatasetsResponse>('/dify/datasets');
  return res.data;
}
```

## 3. 前端：创建 RagPage 组件

**新文件**: `frontend/src/pages/RagPage.tsx` + `frontend/src/pages/RagPage.css`

参考 `McpPage.tsx` 的模式，创建只读的知识库卡片列表页：
- 调用 `fetchDifyDatasets()` 加载数据
- 每个 dataset 渲染为一张卡片，展示以下信息：
  - **标题**: name
  - **描述**: description
  - **状态标签**: indexing_technique (如 high_quality)
  - **元数据信息**:
    - 文档数 (document_count)
    - 字数 (word_count，格式化为千/万)
    - 关联应用数 (app_count)
    - 数据源类型 (data_source_type)
    - 嵌入模型 (embedding_model)
    - 模型提供商 (embedding_model_provider)
    - 创建者 (author_name)
    - 创建/更新时间 (created_at/updated_at，格式化为日期)
- 卡片可点击跳转到 Dify 知识库文档页 (`${DIFY}/datasets/{id}/documents`)
- 包含 loading 状态和空数据提示
- 样式复用 McpPage 的卡片网格风格

## 4. 前端：更新 App.tsx 路由

**文件**: `frontend/src/App.tsx`

- 导入 `RagPage` 组件
- 在 `renderContent()` 中增加 `activeSection === 'rag'` 分支，渲染 `<RagPage />`
- 删除 `sectionData.rag` 中的硬编码卡片数据（改为空数组，与 agent/mcp 保持一致）
