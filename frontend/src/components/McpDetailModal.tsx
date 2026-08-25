import { Modal, Typography, Tag, Divider, Space } from 'antd';
import { ApiOutlined, ToolOutlined } from '@ant-design/icons';
import type { McpServer } from '../services/api';

const { Text, Paragraph } = Typography;

interface McpDetailModalProps {
  open: boolean;
  server: McpServer | null;
  onClose: () => void;
}

// Pretty-print a JSON string field (headers/args/env); fall back to raw text
function formatJsonField(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

// Single config field: label + monospace value box
function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Text strong style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </Text>
      <pre
        style={{
          margin: 0,
          padding: '6px 10px',
          backgroundColor: 'var(--bg-muted)',
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.6,
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }}
      >
        {value || '—'}
      </pre>
    </div>
  );
}

export default function McpDetailModal({ open, server, onClose }: McpDetailModalProps) {
  if (!server) return null;

  // HTTP-like transports (streamable_http / sse) use URL + headers;
  // stdio (e.g. uvx) uses command + args + env instead.
  const isHttpLike = server.transport === 'streamable_http' || server.transport === 'sse';

  return (
    <Modal
      title="MCP Server 详情"
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <div style={{ marginTop: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Text strong style={{ fontSize: 16 }}>
            {server.name}
          </Text>
          <Tag color={server.is_active ? 'green' : 'red'}>
            {server.is_active ? 'Online' : 'Offline'}
          </Tag>
          <Tag color="blue">{server.transport}</Tag>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Configuration */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            <ApiOutlined style={{ marginRight: 8 }} />
            配置详情
          </Text>
          {isHttpLike ? (
            <>
              <ConfigField label="URL" value={server.url} />
              <ConfigField label="Headers" value={formatJsonField(server.headers)} />
            </>
          ) : (
            <>
              <ConfigField label="Command" value={server.command || '—'} />
              <ConfigField label="Args" value={formatJsonField(server.args)} />
              <ConfigField label="Env" value={formatJsonField(server.env)} />
            </>
          )}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <ConfigField label="Timeout (s)" value={String(server.timeout)} />
            </div>
            <div style={{ flex: 1 }}>
              <ConfigField label="SSE Read Timeout (s)" value={String(server.sse_read_timeout)} />
            </div>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Tools */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            <ToolOutlined style={{ marginRight: 8 }} />
            Tools ({server.tools ? server.tools.length : 0})
          </Text>
          {server.tools && server.tools.length > 0 ? (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {server.tools.map((tool, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-muted)',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <Text strong style={{ fontSize: 13 }}>
                    {tool.name}
                  </Text>
                  {tool.description && (
                    <Paragraph
                      type="secondary"
                      style={{
                        margin: '6px 0 0',
                        fontSize: 12,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {tool.description}
                    </Paragraph>
                  )}
                  {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                    <pre
                      style={{
                        margin: '8px 0 0',
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 4,
                        fontSize: 11,
                        lineHeight: 1.5,
                        wordBreak: 'break-all',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-tertiary)',
                        maxHeight: 180,
                        overflowY: 'auto',
                      }}
                    >
                      {JSON.stringify(tool.inputSchema, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </Space>
          ) : (
            <Text type="secondary">暂无工具</Text>
          )}
        </div>
      </div>
    </Modal>
  );
}
