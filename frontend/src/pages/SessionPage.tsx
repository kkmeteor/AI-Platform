import { useState, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { fetchDifyChatApps } from '../services/api';
import type { DifyChatApp } from '../services/api';
import './SessionPage.css';

/** Get Dify user ID bound to logged-in user identity */
function getDifyUserId(): string {
  // Prefer logged-in username for cross-device conversation history
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user?.username) {
        return user.username;
      }
    } catch {
      // Fallback to random ID below
    }
  }
  // Fallback: persistent random ID for unauthenticated sessions
  let uid = localStorage.getItem('dify_user_id');
  if (!uid) {
    uid = crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    localStorage.setItem('dify_user_id', uid);
  }
  return uid;
}

/** Determine the Dify proxy base URL based on current environment */
function getDifyProxyUrl(): string {
  const port = window.location.port;
  if (port === '5173' || port === '5174') {
    return `http://${window.location.hostname}:5174`;
  }
  return '';
}

/** Build the full iframe URL for a given chatbot */
function buildChatbotUrl(botId: string): string {
  const proxyUrl = getDifyProxyUrl();
  const userId = getDifyUserId();
  const baseUrl = proxyUrl ? `${proxyUrl}/chat/${botId}` : `/chat/${botId}`;
  return `${baseUrl}?user=${encodeURIComponent(userId)}`;
}

export default function SessionPage() {
  const [apps, setApps] = useState<DifyChatApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBotId, setActiveBotId] = useState('');
  const [activeBotName, setActiveBotName] = useState('AI 助手');
  const [iframeUrl, setIframeUrl] = useState('');

  useEffect(() => {
    const loadApps = async () => {
      try {
        const data = await fetchDifyChatApps();
        setApps(data);
        // Auto-select first bot if none specified
        if (!activeBotId && data.length > 0) {
          setActiveBotId(data[0].access_token);
          setActiveBotName(data[0].name);
        }
      } catch {
        setApps([]);
      } finally {
        setLoading(false);
      }
    };
    loadApps();
  }, []);

  useEffect(() => {
    if (activeBotId) {
      setIframeUrl(buildChatbotUrl(activeBotId));
    }
  }, [activeBotId]);

  const handleSwitchBot = useCallback((botId: string, name: string) => {
    setActiveBotId(botId);
    setActiveBotName(name);
  }, []);

  const activeApp = apps.find((a) => a.access_token === activeBotId);

  return (
    <div className="session-page">
      {/* Chat area */}
      <div className="session-chat">
        <div className="session-chat-header">
          <div className="session-agent-info">
            <div className="session-agent-avatar">
              {activeApp?.icon || '🤖'}
            </div>
            <div>
              <div className="session-agent-name">{activeBotName}</div>
              <div className="session-agent-status">Dify Chatbot · 运行中</div>
            </div>
          </div>
        </div>

        <div className="session-chat-body">
          {iframeUrl ? (
            <iframe
              src={iframeUrl}
              className="session-chat-iframe"
              title="Dify Chatbot"
              frameBorder="0"
              allow="microphone"
            />
          ) : (
            <div className="session-chat-empty">
              <div className="session-chat-empty-icon">💬</div>
              <p className="session-chat-empty-text">选择一个会话开始对话</p>
            </div>
          )}
        </div>
      </div>

      {/* Session list panel */}
      <div className="session-list-panel">
        <div className="session-list-header">
          <h3 className="session-list-title">会话列表</h3>
        </div>

        <div className="session-list-body">
          <Spin spinning={loading}>
            {apps.length === 0 && !loading ? (
              <div className="session-list-empty">
                <p>暂无可用会话</p>
              </div>
            ) : (
              apps.map((app) => (
                <div
                  key={app.id}
                  className={`session-list-item ${app.access_token === activeBotId ? 'active' : ''}`}
                  onClick={() => handleSwitchBot(app.access_token, app.name)}
                >
                  <div className="session-list-item-header">
                    <span className="session-list-item-icon">{app.icon || '💬'}</span>
                    <span className="session-list-item-name">{app.name}</span>
                  </div>
                  <div className="session-list-item-preview">
                    {app.description || app.name}
                  </div>
                  <div className="session-list-item-meta">
                    <span className="session-tag online">线上</span>
                  </div>
                </div>
              ))
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
}
