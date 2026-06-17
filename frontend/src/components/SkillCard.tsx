import { Card, Tag, Button, Popconfirm, message, Typography, Space } from 'antd';
import {
  DownloadOutlined,
  DeleteOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Skill } from '../services/api';
import { getDownloadUrl, deleteSkill } from '../services/api';

const { Text, Paragraph } = Typography;

interface SkillCardProps {
  skill: Skill;
  onRefresh: () => void;
  onClick: (skill: Skill) => void;
}

export default function SkillCard({ skill, onRefresh, onClick }: SkillCardProps) {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    message.info({
      content: '文件建议保存到 ~/.qoder/skills/ 目录',
      duration: 3,
    });
    window.open(getDownloadUrl(skill.id), '_blank');
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteSkill(skill.id);
      message.success('删除成功');
      onRefresh();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <Card
      hoverable
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
      onClick={() => onClick(skill)}
    >
      <div style={{ flex: 1 }}>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
          {skill.name}
        </Typography.Title>

        <Paragraph
          ellipsis={{ rows: 2, expandable: false }}
          type="secondary"
          style={{ marginBottom: 12, minHeight: 44 }}
        >
          {skill.description}
        </Paragraph>

        {skill.tags && skill.tags.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {skill.tags.map((tag) => (
              <Tag key={tag} color="blue">
                {tag}
              </Tag>
            ))}
          </div>
        )}

        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary">
            <UserOutlined /> {skill.author || 'Unknown'}
          </Text>
          <Text type="secondary">
            <ClockCircleOutlined /> {dayjs(skill.created_at).format('YYYY-MM-DD HH:mm')}
          </Text>
          <Text type="secondary">
            <CloudDownloadOutlined /> {skill.download_count} 次下载
          </Text>
        </Space>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tag color="green">v{skill.version}</Tag>
        <Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            size="small"
            onClick={handleDownload}
          >
            下载
          </Button>
          <Popconfirm
            title="确定删除此 Skill？"
            onConfirm={handleDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      </div>
    </Card>
  );
}
