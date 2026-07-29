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
import './SkillCard.css';

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
      className={`skill-card ${skill.is_pinned ? 'skill-card-pinned' : ''}`}
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' } }}
      onClick={() => onClick(skill)}
    >
      {/* Pin icon - top right, admin only */}
      {admin && (
        <Tooltip title={skill.is_pinned ? '取消置顶' : '置顶'}>
          <Button
            type="text"
            size="small"
            icon={skill.is_pinned ? <PushpinFilled style={{ color: 'var(--accent)' }} /> : <PushpinOutlined />}
            onClick={handleTogglePin}
            className="skill-card-pin"
          />
        </Tooltip>
      )}

      <div className="skill-card-body">
        <Typography.Title level={5} className="skill-card-title">
          {skill.name}
        </Typography.Title>

        <Paragraph
          ellipsis={{ rows: 2, expandable: false }}
          type="secondary"
          className="skill-card-desc"
        >
          {skill.description}
        </Paragraph>

        {skill.tags && skill.tags.length > 0 && (
          <div className="skill-card-tags">
            {skill.tags.map((tag) => (
              <Tag key={tag} color="default" className="skill-tag">
                {tag}
              </Tag>
            ))}
          </div>
        )}

        <Space orientation="vertical" size={4} className="skill-card-meta">
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

      <div className="skill-card-footer">
        <Tag color="default" className="skill-version-tag">v{skill.version}</Tag>
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
