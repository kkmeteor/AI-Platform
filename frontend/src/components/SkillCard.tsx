import { Card, Tag, Button, Popconfirm, message, Typography, Space, Tooltip } from 'antd';
import {
  DownloadOutlined,
  DeleteOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CloudDownloadOutlined,
  PushpinOutlined,
  PushpinFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Skill } from '../services/api';
import { getDownloadUrl, deleteSkill, togglePinSkill, isAdmin } from '../services/api';

const { Text, Paragraph } = Typography;

interface SkillCardProps {
  skill: Skill;
  onRefresh: () => void;
  onClick: (skill: Skill) => void;
}

export default function SkillCard({ skill, onRefresh, onClick }: SkillCardProps) {
  const admin = isAdmin();

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

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await togglePinSkill(skill.id, !skill.is_pinned);
      message.success(skill.is_pinned ? '已取消置顶' : '已置顶');
      onRefresh();
    } catch {
      message.error('操作失败');
    }
  };

  return (
    <Card
      hoverable
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        border: skill.is_pinned ? '1px solid #1677ff' : undefined,
      }}
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
      onClick={() => onClick(skill)}
    >
      {/* Pin icon - top right, admin only */}
      {admin && (
        <Tooltip title={skill.is_pinned ? '取消置顶' : '置顶'}>
          <Button
            type="text"
            size="small"
            icon={skill.is_pinned ? <PushpinFilled style={{ color: '#1677ff' }} /> : <PushpinOutlined />}
            onClick={handleTogglePin}
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
          />
        </Tooltip>
      )}

      <div style={{ flex: 1 }}>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8, paddingRight: admin ? 32 : 0 }}>
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
          {/* Delete button: admin only, and not readonly */}
          {admin && !skill.is_readonly && (
            <Popconfirm
              title="确定删除此 Skill？"
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          )}
        </Space>
      </div>
    </Card>
  );
}
