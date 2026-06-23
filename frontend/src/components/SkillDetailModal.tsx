import { Modal, Typography, Tag, Divider, Space, Button, message, Switch } from 'antd';
import {
  UserOutlined,
  CloudDownloadOutlined,
  AppstoreOutlined,
  CopyOutlined,
  PushpinOutlined,
  LockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Skill } from '../services/api';
import { getDownloadUrl, togglePinSkill, isAdmin } from '../services/api';

const { Text, Paragraph, Title } = Typography;

interface SkillDetailModalProps {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function SkillDetailModal({ open, skill, onClose, onRefresh }: SkillDetailModalProps) {
  if (!skill) return null;

  const admin = isAdmin();
  const downloadUrl = `${window.location.origin}${getDownloadUrl(skill.id)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      message.success('链接已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const handleTogglePin = async (checked: boolean) => {
    try {
      await togglePinSkill(skill.id, checked);
      message.success(checked ? '已置顶' : '已取消置顶');
      onRefresh?.();
    } catch {
      message.error('操作失败');
    }
  };

  return (
    <Modal
      title="Skill 详情"
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Title level={4} style={{ margin: 0 }}>
            {skill.name}
          </Title>
          {skill.is_readonly && (
            <Tag icon={<LockOutlined />} color="orange">只读</Tag>
          )}
          {skill.is_pinned && (
            <Tag icon={<PushpinOutlined />} color="blue">置顶</Tag>
          )}
        </div>

        <Space style={{ marginBottom: 16 }} wrap>
          <Tag color="green">v{skill.version}</Tag>
          {skill.tags && skill.tags.length > 0 && skill.tags.map((tag) => (
            <Tag key={tag} color="blue">{tag}</Tag>
          ))}
        </Space>

        {/* Pin toggle - admin only */}
        {admin && (
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong>置顶显示：</Text>
            <Switch
              checked={skill.is_pinned}
              onChange={handleTogglePin}
              checkedChildren="是"
              unCheckedChildren="否"
            />
          </div>
        )}

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>描述</Text>
          <Paragraph
            type="secondary"
            style={{
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {skill.description || '暂无描述'}
          </Paragraph>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>下载链接</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text
              copyable={false}
              style={{
                flex: 1,
                padding: '4px 8px',
                backgroundColor: '#f5f5f5',
                borderRadius: 4,
                fontSize: 12,
                wordBreak: 'break-all',
              }}
            >
              {downloadUrl}
            </Text>
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={handleCopyLink}
              title="复制链接"
            />
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">
            <AppstoreOutlined style={{ marginRight: 8 }} />
            作者：{skill.author || 'Unknown'}
          </Text>
          <Text type="secondary">
            <UserOutlined style={{ marginRight: 8 }} />
            上传时间：{dayjs(skill.created_at).format('YYYY-MM-DD HH:mm')}
          </Text>
          <Text type="secondary">
            <CloudDownloadOutlined style={{ marginRight: 8 }} />
            下载次数：{skill.download_count}
          </Text>
        </Space>
      </div>
    </Modal>
  );
}
