import { useState } from 'react';
import Sidebar from './components/Sidebar';
import PlaceholderPage from './components/PlaceholderPage';
import MarketPlace from './pages/MarketPlace';
import './App.css';

interface KnowledgeLink {
  label: string;
  url: string;
}

interface SectionData {
  title: string;
  subtitle: string;
  cards: {
    icon: string;
    color: 'blue' | 'purple' | 'green' | 'orange';
    title: string;
    desc: string;
    status: 'active' | 'inactive';
    statusText: string;
    meta: string;
    link?: string;
    externalLink?: string;
    knowledgeLinks?: KnowledgeLink[];
  }[];
}

const sectionData: Record<string, SectionData> = {
  agent: {
    title: 'Agent',
    subtitle: '管理和配置您的智能代理',
    cards: [
      { icon: '🤖', color: 'blue', title: '赛诺联合通用小助理', desc: '赛诺联合通用AI助手，提供综合智能问答服务', status: 'active', statusText: '运行中', meta: 'Dify Chatbot' },
      { icon: '🤖', color: 'purple', title: 'TFS代码同步小助理', desc: 'TFS代码同步助手，协助代码同步与版本管理', status: 'active', statusText: '运行中', meta: 'Dify Chatbot', knowledgeLinks: [{ label: 'TFS产品文档知识库', url: 'http://localhost:8080/datasets/718c4af9-8947-458d-b3d8-0dd926cbc8ed/documents' }] },
      { icon: '🤖', color: 'green', title: '知识库问答小助理', desc: '知识库查询助手，提供快速问题解答', status: 'active', statusText: '运行中', meta: 'Dify Chatbot', knowledgeLinks: [{ label: '会议纪要知识库', url: 'http://localhost:8080/datasets/798fee81-3456-4d1a-be62-00cd1511d8cc/documents' }] },
      { icon: '🤖', color: 'orange', title: 'TFS迁移GIT小助手', desc: 'TFS迁移GIT助手，协助代码从TFS迁移到GIT', status: 'active', statusText: '运行中', meta: 'Dify Chatbot' },
    ],
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
    subtitle: '模型上下文协议配置',
    cards: [
      { icon: '🔗', color: 'blue', title: 'MCP Server 1', desc: '数据库连接服务', status: 'active', statusText: '在线', meta: 'PostgreSQL' },
      { icon: '🔗', color: 'purple', title: 'MCP Server 2', desc: 'API网关服务', status: 'active', statusText: '在线', meta: 'REST API' },
    ],
  },
  rag: {
    title: 'RAG',
    subtitle: '检索增强生成配置',
    cards: [
      { icon: '📚', color: 'blue', title: 'TFS产品文档', desc: 'TFS产品文档', status: 'active', statusText: '已索引', meta: 'Dify Knowledge', externalLink: 'http://localhost:8080/datasets/718c4af9-8947-458d-b3d8-0dd926cbc8ed/documents' },
      { icon: '📚', color: 'purple', title: '会议纪要知识库', desc: '会议纪要知识库', status: 'active', statusText: '已索引', meta: 'Dify Knowledge', externalLink: 'http://localhost:8080/datasets/798fee81-3456-4d1a-be62-00cd1511d8cc/documents' },
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
    cards: [
      { icon: '💬', color: 'blue', title: '会话 1', desc: '与赛诺联合通用小助理对话', status: 'active', statusText: '进行中', meta: 'Dify Chatbot', link: '/session.html?bot=af3iXcoKxjqyA41D&name=赛诺联合通用小助理' },
      { icon: '💬', color: 'purple', title: '会话 2', desc: '与TFS代码同步小助理会话', status: 'active', statusText: '进行中', meta: 'Dify Chatbot', link: '/session.html?bot=G81boXDVlGHcIn2G&name=TFS代码同步小助理' },
      { icon: '💬', color: 'orange', title: '会话 3', desc: '与知识库问答小助理会话', status: 'active', statusText: '进行中', meta: 'Dify Chatbot', link: '/session.html?bot=tGnNbmEg0ou9ANn0&name=知识库问答小助理' },
      { icon: '💬', color: 'green', title: '会话 4', desc: '与TFS迁移GIT小助手会话', status: 'active', statusText: '进行中', meta: 'Dify Chatbot', link: '/session.html?bot=nmZEDqKpr2HHPMdJ&name=TFS迁移GIT小助手' },
    ],
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

function App() {
  const [activeSection, setActiveSection] = useState('skill');

  const renderContent = () => {
    if (activeSection === 'skill') {
      return <MarketPlace />;
    }

    const data = sectionData[activeSection];
    if (data) {
      return <PlaceholderPage title={data.title} subtitle={data.subtitle} cards={data.cards} />;
    }

    return <PlaceholderPage title="未知页签" subtitle="该页签暂未实现" cards={[]} />;
  };

  return (
    <div className="app-layout">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
