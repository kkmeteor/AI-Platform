import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import Sidebar from './components/Sidebar';
import PlaceholderPage from './components/PlaceholderPage';
import MarketPlace from './pages/MarketPlace';
import McpPage from './pages/McpPage';
import { fetchDifyApps, fetchDifyChatApps } from './services/api';
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
    cards: [
      { icon: '📚', color: 'blue', title: 'GBSimulator知识库', desc: 'GBSimulator知识库', status: 'active', statusText: '已索引', meta: 'Dify Knowledge', externalLink: `${DIFY}/datasets/75538eb8-f35b-49a7-ba4a-c4c099c5776d/documents` },
      { icon: '📚', color: 'purple', title: 'AI-STUDIO知识库', desc: 'AI-STUDIO知识库', status: 'active', statusText: '已索引', meta: 'Dify Knowledge', externalLink: `${DIFY}/datasets/e7ff5fc1-2d0d-4fdd-8826-a852e8f1e7ad/documents` },
    ],
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
  return params.get('section') || 'skill';
}

function App() {
  const [activeSection, setActiveSection] = useState(getInitialSection());
  const [agentCards, setAgentCards] = useState<CardData[]>([]);
  const [agentLoading, setAgentLoading] = useState(true);
  const [sessionCards, setSessionCards] = useState<CardData[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const res = await fetchDifyApps();
        const filtered = (res.data || []).filter((app: DifyApp) =>
          app.tags?.some((t: DifyAppTag) => t.name === 'online' && t.type === 'app')
        );
        const colors: CardColor[] = ['blue', 'purple', 'green', 'orange'];
        const cards: CardData[] = filtered.map((app, idx) => ({
          icon: '🤖',
          color: colors[idx % colors.length],
          title: app.name,
          desc: app.description || 'Dify AI Assistant',
          status: 'active' as const,
          statusText: '运行中',
          meta: 'Dify Chatbot',
          externalLink: `${DIFY}/app/${app.id}/workflow`,
        }));
        // Merge knowledge links for specific apps
        cards.forEach(card => {
          if (card.title === 'GBSimulator小助手') {
            card.knowledgeLinks = [{ label: 'TFS产品文档知识库', url: `${DIFY}/datasets/718c4af9-8947-458d-b3d8-0dd926cbc8ed/documents` }];
          } else if (card.title === 'AI-STUDIO智能体') {
            card.knowledgeLinks = [{ label: '会议纪要知识库', url: `${DIFY}/datasets/798fee81-3456-4d1a-be62-00cd1511d8cc/documents` }];
          }
        });
        setAgentCards(cards);
      } catch {
        setAgentCards([]);
      } finally {
        setAgentLoading(false);
      }
    };
    loadAgents();
  }, []);

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

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.replaceState({}, '', url.toString());
  };

  const renderContent = () => {
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
      const data = sectionData[activeSection];
      return (
        <Spin spinning={sessionLoading}>
          <PlaceholderPage title={data.title} subtitle={data.subtitle} cards={sessionCards} />
        </Spin>
      );
    }

    if (activeSection === 'mcp') {
      return <McpPage />;
    }

    const data = sectionData[activeSection];
    if (data) {
      return <PlaceholderPage title={data.title} subtitle={data.subtitle} cards={data.cards} />;
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
