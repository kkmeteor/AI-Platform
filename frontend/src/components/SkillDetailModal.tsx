import { useState, useRef } from 'react';
import { Modal, Typography, Tag, Divider, Space, Button, message, Switch, Input } from 'antd';
import type { InputRef } from 'antd';
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
import { copyToClipboard } from '../utils/clipboard';

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

  const [manualCopyOpen, setManualCopyOpen] = useState(false);
  const manualCopyInputRef = useRef<InputRef>(null);

  const handleCopyLink = async () => {
    const result = await copyToClipboard(downloadUrl);
    if (result === 'success') {
      message.success('链接已复制到剪贴板');
    } else {
      // 浏览器禁止自动复制（HTTP / iframe 权限受限等），提供手动复制兜底
      setManualCopyOpen(true);
    }
  };

  const handleManualCopyOpen = () => {
    // 弹窗打开后自动选中链接，用户直接 Ctrl+C 即可
    requestAnimationFrame(() => manualCopyInputRef.current?.select());
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

      {/* 自动复制被浏览器禁止时的手动复制兜底 */}
      <Modal
        title="手动复制链接"
        open={manualCopyOpen}
        onCancel={() => setManualCopyOpen(false)}
        afterOpenChange={(open) => open && handleManualCopyOpen()}
        footer={
          <Button type="primary" onClick={() => setManualCopyOpen(false)}>
            完成
          </Button>
        }
        width={480}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          当前浏览器禁止自动复制，链接已自动选中，请按 Ctrl+C（Mac: Cmd+C）复制：
        </Text>
        <Input ref={manualCopyInputRef} value={downloadUrl} readOnly />
      </Modal>
    </Modal>
  );
}
