import { useState, useEffect, useCallback } from 'react';
import { Spin, Empty, message } from 'antd';
import { fetchDifyDatasets } from '../services/api';
import type { DifyDataset } from '../services/api';
import './RagPage.css';

/** Dify server direct URL (CORS configured on Dify server side) */
const DIFY = 'http://10.10.9.65';

/** Format word count to readable string (e.g., 40029 -> "4.0万") */
function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}千`;
  }
  return String(count);
}

/** Format unix timestamp to date string */
function formatDate(timestamp: number): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function RagPage() {
  const [datasets, setDatasets] = useState<DifyDataset[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDifyDatasets();
      setDatasets(res.data || []);
    } catch {
      message.error('Failed to load knowledge bases');
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCardClick = (datasetId: string) => {
    window.open(`${DIFY}/datasets/${datasetId}/documents`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rag-page">
      {/* Header */}
      <div className="rag-header">
        <div>
          <h1 className="rag-title">RAG</h1>
          <p className="rag-subtitle">检索增强生成配置</p>
        </div>
      </div>

      {/* Content */}
      <Spin spinning={loading}>
        {datasets.length === 0 && !loading ? (
          <Empty description="No knowledge bases found" style={{ marginTop: 80 }} />
        ) : (
          <div className="rag-cards-grid">
            {datasets.map(dataset => (
              <div
                key={dataset.id}
                className="rag-card"
                onClick={() => handleCardClick(dataset.id)}
              >
                {/* Card header */}
                <div className="rag-card-header">
                  <div className="rag-card-icon">📚</div>
                  <div className="rag-card-header-text">
                    <div className="rag-card-name">{dataset.name}</div>
                    <div className="rag-card-desc">{dataset.description || 'No description'}</div>
                  </div>
                </div>

                {/* Status */}
                <div className="rag-card-status">
                  <span className="rag-status-dot rag-status-active" />
                  <span className="rag-status-text">已索引</span>
                  <span className="rag-card-tag">{dataset.indexing_technique}</span>
                </div>

                {/* Metadata */}
                <div className="rag-card-meta">
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">文档数</span>
                    <span className="rag-meta-value">{dataset.document_count}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">字数</span>
                    <span className="rag-meta-value">{formatWordCount(dataset.word_count)}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">关联应用</span>
                    <span className="rag-meta-value">{dataset.app_count}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">数据源</span>
                    <span className="rag-meta-value">{dataset.data_source_type}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">嵌入模型</span>
                    <span className="rag-meta-value">{dataset.embedding_model}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">模型提供商</span>
                    <span className="rag-meta-value">{dataset.embedding_model_provider}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">创建者</span>
                    <span className="rag-meta-value">{dataset.author_name}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">创建时间</span>
                    <span className="rag-meta-value">{formatDate(dataset.created_at)}</span>
                  </div>
                  <div className="rag-meta-row">
                    <span className="rag-meta-label">更新时间</span>
                    <span className="rag-meta-value">{formatDate(dataset.updated_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
}
