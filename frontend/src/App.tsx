import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import Sidebar from './components/Sidebar';
import PlaceholderPage from './components/PlaceholderPage';
import MarketPlace from './pages/MarketPlace';
import McpPage from './pages/McpPage';
import RagPage from './pages/RagPage';
import PortalPage from './pages/PortalPage';
import SessionPage from './pages/SessionPage';
import { fetchDifyApps, fetchDifyAppDetail, fetchDifyAppWorkflow, fetchAllDatasets } from './services/api';
import type { DifyApp, DifyAppTag } from './services/api';
import './App.css';

/** Dify server direct URL (CORS configured on Dify server side) */
const DIFY = 'http://10.10.9.65';

interface KnowledgeLink {
  label: string;
  url: string;
}

interface ToolInfo {
  name: string;
  description: string;
}

type CardColor = 'blue' | 'purple' | 'green' | 'orange';

interface CardData {
  icon: string;
  color: CardColor;
  title: string;
  desc: string;
  status: 'active' | 'inactive';
  statusText: string;
  meta: string;
  link?: string;
  externalLink?: string;
  knowledgeLinks?: KnowledgeLink[];
  models?: string[];
  tools?: ToolInfo[];
  config?: Record<string, any>;
}

interface SectionData {
  title: string;
  subtitle: string;
  cards: CardData[];
}

const sectionData: Record<string, SectionData> = {
  agent: {
    title: 'Agent',
    subtitle: '管理和配置您的智能代理',
    cards: [],
  },
  tool: {
    title: 'Tool',
    subtitle: '管理可用工具和集成',
    cards: [
      { icon: '🔧', color: 'blue', title: 'Web Search', desc: '网络搜索工具，获取实时信息', status: 'active', statusText: '已连接', meta: 'API v3' },
      { icon: '🔧', color: 'purple', title: 'Code Runner', desc: '代码执行环境，支持多种语言', status: 'active', statusText: '已连接', meta: 'Sandbox v2' },
      { icon: '🔧', color: 'green', title: 'File Manager', desc: '文件管理工具，读写和处理文件', status: 'active', statusText: '已连接', meta: 'Local FS' },
    ],
  },
  mcp: {
    title: 'MCP',
    subtitle: 'Model Context Protocol server configurations',
    cards: [],  // dynamically loaded via McpPage
  },
  rag: {
    title: 'RAG',
    subtitle: '检索增强生成配置',
    cards: [],  // dynamically loaded via RagPage
  },
  stats: {
    title: '统计',
    subtitle: '系统运行数据和指标',
    cards: [
      { icon: '📊', color: 'blue', title: 'API调用统计', desc: '本月API调用次数: 12,345', status: 'active', statusText: '正常', meta: '更新于 5分钟前' },
      { icon: '📊', color: 'purple', title: '响应时间', desc: '平均响应时间: 1.2秒', status: 'active', statusText: '正常', meta: '更新于 5分钟前' },
      { icon: '📊', color: 'green', title: '用户活跃度', desc: '日活跃用户: 892', status: 'active', statusText: '正常', meta: '更新于 1小时前' },
    ],
  },
  session: {
    title: '会话',
    subtitle: '管理和查看Agent会话记录',
    cards: [],  // dynamically loaded via useEffect
  },
  channel: {
    title: '通道',
    subtitle: '管理消息通道和连接',
    cards: [
      { icon: '📡', color: 'blue', title: 'WebSocket', desc: '实时消息通道', status: 'active', statusText: '已连接', meta: '128 连接' },
      { icon: '📡', color: 'purple', title: 'HTTP Stream', desc: 'HTTP流式传输', status: 'active', statusText: '已连接', meta: 'SSE模式' },
    ],
  },
  memory: {
    title: '记忆',
    subtitle: '管理对话记忆和上下文',
    cards: [
      { icon: '🧠', color: 'blue', title: '短期记忆', desc: '会话级上下文存储', status: 'active', statusText: '运行中', meta: 'Redis' },
      { icon: '🧠', color: 'purple', title: '长期记忆', desc: '持久化记忆存储', status: 'active', statusText: '运行中', meta: 'Vector DB' },
    ],
  },
};

function getInitialSection(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('section') || 'portal';
}

/** Parse workflow graph nodes to extract dataset IDs and model names */
function parseWorkflowNodes(graph: {
  nodes?: Array<{
    data?: {
      type?: string;
      dataset_ids?: string[];
      model?: { name?: string };
    };
  }>;
} | null) {
  const datasetIds: string[] = [];
  const models: string[] = [];
  for (const node of graph?.nodes || []) {
    const { type, dataset_ids, model } = node.data || {};
    if (type === 'knowledge-retrieval' && dataset_ids?.length) {
      datasetIds.push(...dataset_ids);
    } else if (type === 'llm' && model?.name) {
      models.push(model.name);
    }
  }
  return { datasetIds: [...new Set(datasetIds)], models };
}

function App() {
  const [activeSection, setActiveSection] = useState(getInitialSection());
  const [agentCards, setAgentCards] = useState<CardData[]>([]);
  const [agentLoading, setAgentLoading] = useState(true);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        // Fetch all datasets once for local matching
        let datasetMap = new Map<string, { id: string; name: string }>();
        try {
          const allDs = await fetchAllDatasets();
          for (const ds of allDs.data || []) {
            datasetMap.set(ds.id, { id: ds.id, name: ds.name });
          }
        } catch {
          // Ignore dataset list fetch failures
        }

        const res = await fetchDifyApps();
        const filtered = (res.data || []).filter((app: DifyApp) =>
          app.tags?.some((t: DifyAppTag) => t.name === 'online' && t.type === 'app')
        );
        const colors: CardColor[] = ['blue', 'purple', 'green', 'orange'];
        const cards: CardData[] = await Promise.all(
          filtered.map(async (app, idx) => {
            const card: CardData = {
              icon: '🤖',
              color: colors[idx % colors.length],
              title: app.name,
              desc: app.description || 'Dify AI Assistant',
              status: 'active' as const,
              statusText: '运行中',
              meta: 'Dify Chatbot',
              externalLink: `${DIFY}/app/${app.id}/workflow`,
            };
            // Dynamically load model & knowledge base info
            try {
              const appDetail = await fetchDifyAppDetail(app.id);
              const mode = appDetail?.mode || app.mode;

              if (mode === 'chat' || mode === 'agent-chat') {
                // Chat mode: get model from model_config.model.name
                const modelConfig = appDetail?.model_config;
                const modelName = modelConfig?.model?.name;
                if (modelName) {
                  card.models = [modelName];
                }
                // Get dataset IDs from model_config.dataset_configs.datasets.datasets
                const datasets = modelConfig?.dataset_configs?.datasets?.datasets || [];
                const datasetIds: string[] = datasets
                  .map((d: any) => d?.dataset?.id)
                  .filter(Boolean);
                if (datasetIds.length > 0) {
                  card.knowledgeLinks = datasetIds
                    .map((id: string) => {
                      const ds = datasetMap.get(id);
                      return ds
                        ? { label: ds.name, url: `${DIFY}/datasets/${ds.id}/documents` }
                        : null;
                    })
                    .filter((kl): kl is KnowledgeLink => kl !== null);
                }
              } else {
                // Non-chat mode: parse workflow graph nodes
                const workflow = await fetchDifyAppWorkflow(app.id);
                const { datasetIds, models } = parseWorkflowNodes(workflow?.graph);
                if (models.length > 0) {
                  card.models = models;
                }
                if (datasetIds.length > 0) {
                  card.knowledgeLinks = datasetIds
                    .map(id => {
                      const ds = datasetMap.get(id);
                      return ds
                        ? { label: ds.name, url: `${DIFY}/datasets/${ds.id}/documents` }
                        : null;
                    })
                    .filter((kl): kl is KnowledgeLink => kl !== null);
                }
              }
            } catch {
              // Ignore individual app fetch failures
            }
            return card;
          })
        );
        setAgentCards(cards);
      } catch {
        setAgentCards([]);
      } finally {
        setAgentLoading(false);
      }
    };
    loadAgents();
  }, []);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.replaceState({}, '', url.toString());
  };

  const renderContent = () => {
    if (activeSection === 'portal') {
      return <PortalPage />;
    }

    if (activeSection === 'skill') {
      return <MarketPlace />;
    }

    if (activeSection === 'agent') {
      const data = sectionData[activeSection];
      return (
        <Spin spinning={agentLoading}>
          <PlaceholderPage title={data.title} subtitle={data.subtitle} cards={agentCards} />
        </Spin>
      );
    }

    if (activeSection === 'session') {
      return <SessionPage />;
    }

    if (activeSection === 'mcp') {
      return <McpPage />;
    }

    if (activeSection === 'rag') {
      return <RagPage />;
    }

    const data = sectionData[activeSection];
    if (data) {
      const showNotImplemented = ['tool', 'stats', 'channel', 'memory'].includes(activeSection);
      return <PlaceholderPage title={data.title} subtitle={data.subtitle} cards={data.cards} showNotImplemented={showNotImplemented} />;
    }

    return <PlaceholderPage title="未知页签" subtitle="该页签暂未实现" cards={[]} />;
  };

  return (
    <div className="app-layout">
      <Sidebar activeSection={activeSection} onSectionChange={handleSectionChange} />
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
