import { Modal, Typography, Tag, Divider, Space } from 'antd';
import {
  UserOutlined,
  CloudDownloadOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Skill } from '../services/api';

const { Text, Paragraph, Title } = Typography;

interface SkillDetailModalProps {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
}

export default function SkillDetailModal({ open, skill, onClose }: SkillDetailModalProps) {
  if (!skill) return null;

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
        <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
          {skill.name}
        </Title>

        <Space style={{ marginBottom: 16 }} wrap>
          <Tag color="green">v{skill.version}</Tag>
          {skill.tags && skill.tags.length > 0 && skill.tags.map((tag) => (
            <Tag key={tag} color="blue">{tag}</Tag>
          ))}
        </Space>

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
