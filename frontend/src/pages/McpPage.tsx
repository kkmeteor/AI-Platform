import { useState, useEffect, useCallback } from 'react';
import { Button, Spin, Empty, Popconfirm, message, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { fetchMcpServers, fetchMcpServersStatus, deleteMcpServer, refreshMcpServer, isAdmin } from '../services/api';
import type { McpServer } from '../services/api';
import McpModal from '../components/McpModal';
import './McpPage.css';

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());

  const [probing, setProbing] = useState(false);

  // Step 1: Load server configs from DB (fast, no probing)
  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMcpServers();
      setServers(data);
    } catch {
      message.error('Failed to load MCP servers');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Step 2: Probe all servers concurrently for live status (delayed)
  const probeStatus = useCallback(async () => {
    setProbing(true);
    try {
      const data = await fetchMcpServersStatus();
      setServers(data);
    } catch {
      // Silently fail — keep cached status shown on cards
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    loadServers().then(() => {
      // Delay status probe so cards render first
      setTimeout(() => probeStatus(), 300);
    });
  }, [loadServers, probeStatus]);

  const handleAdd = () => {
    setEditingServer(null);
    setModalOpen(true);
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMcpServer(id);
      message.success('MCP Server deleted');
      loadServers();
    } catch {
      message.error('Delete failed');
    }
  };

  const handleRefresh = async (id: number) => {
    setRefreshingIds(prev => new Set(prev).add(id));
    try {
      await refreshMcpServer(id);
      message.success('Refreshed');
      probeStatus();
    } catch {
      message.error('Refresh failed');
    } finally {
      setRefreshingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const admin = isAdmin();

  return (
    <div className="mcp-page">
      {/* Header */}
      <div className="mcp-header">
        <div>
          <h1 className="mcp-title">MCP</h1>
          <p className="mcp-subtitle">Model Context Protocol server configurations</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleAdd}>
          Add
        </Button>
      </div>

      {/* Probing indicator */}
      {probing && (
        <div className="mcp-probing-bar">
          <Spin size="small" />
          <span>Detecting server status...</span>
        </div>
      )}

      {/* Content */}
      <Spin spinning={loading}>
        {servers.length === 0 && !loading ? (
          <Empty description="No MCP Servers configured" style={{ marginTop: 80 }} />
        ) : (
          <div className="mcp-cards-grid">
            {servers.map(server => (
              <div
                key={server.id}
                className={`mcp-card ${!server.is_active ? 'inactive' : ''}`}
              >
                {/* Card header */}
                <div className="mcp-card-header">
                  <div className={`mcp-card-icon ${server.is_active ? 'mcp-icon-active' : 'mcp-icon-inactive'}`}>
                    🔗
                  </div>
                  <div className="mcp-card-header-text">
                    <div className="mcp-card-name">{server.name}</div>
                    <div className="mcp-card-url">{server.url || server.command || '—'}</div>
                  </div>
                  <div className="mcp-card-actions">
                    <Tooltip title="Refresh tools">
                      <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined spin={refreshingIds.has(server.id)} />}
                        onClick={() => handleRefresh(server.id)}
                      />
                    </Tooltip>
                    <Tooltip title="Edit">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(server)}
                      />
                    </Tooltip>
                    {admin && (
                      <Popconfirm
                        title="Delete this MCP Server?"
                        onConfirm={() => handleDelete(server.id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                      >
                        <Tooltip title="Delete">
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                      </Popconfirm>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="mcp-card-status">
                  <span className={`mcp-status-dot ${server.is_active ? 'mcp-status-active' : 'mcp-status-inactive'}`} />
                  <span className="mcp-status-text">
                    {server.is_active ? 'Online' : 'Offline'}
                  </span>
                  <span className="mcp-card-transport">{server.transport}</span>
                </div>

                {/* Tools list */}
                {server.tools && server.tools.length > 0 && (
                  <div className="mcp-tools-section">
                    <h4>Tools ({server.tools.length})</h4>
                    <ul>
                      {server.tools.map((tool, i) => (
                        <li key={i}>
                          <strong>{tool.name}</strong>
                          {tool.description && <p>{tool.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* No tools message */}
                {server.is_active && (!server.tools || server.tools.length === 0) && (
                  <div className="mcp-no-tools">No tools discovered</div>
                )}

                {!server.is_active && (
                  <div className="mcp-offline-msg">Server unreachable — tools unavailable</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Spin>

      {/* Modal */}
      <McpModal
        open={modalOpen}
        server={editingServer}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { loadServers(); probeStatus(); }}
      />
    </div>
  );
}
