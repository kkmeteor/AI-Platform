import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Select, Switch, Tabs, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  fetchUsers,
  fetchLoginLogs,
  updateUserRole,
  updateUserStatus,
  type UserInfo,
  type LoginLog,
} from '../services/api';
import './UserManagePage.css';

const ROLE_OPTIONS = ['admin', 'editor', 'viewer'];

/** Format an ISO timestamp (UTC) as Shanghai local time, independent of browser timezone. */
function formatShanghaiTime(text?: string | null): string {
  if (!text) return '-';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function UserManagePage() {
  return (
    <div className="user-manage-page">
      <div className="page-header">
        <h1 className="page-title">用户管理</h1>
        <p className="page-subtitle">管理系统用户、角色和登录日志</p>
      </div>
      <Tabs
        defaultActiveKey="users"
        items={[
          { key: 'users', label: '用户列表', children: <UserList /> },
          { key: 'logs', label: '登录日志', children: <LoginLogs /> },
        ]}
      />
    </div>
  );
}

function UserList() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchUsers({ search, page, page_size: 20 });
      setUsers(res.items);
      setTotal(res.total);
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await updateUserRole(userId, role);
      message.success('角色已更新');
      loadUsers();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '更新角色失败');
    }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    try {
      await updateUserStatus(userId, isActive);
      message.success(isActive ? '用户已启用' : '用户已禁用');
      loadUsers();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '更新状态失败');
    }
  };

  const columns: ColumnsType<UserInfo> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: '显示名称',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 180,
      render: (text) => text || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (text) => text || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role, record) => (
        <Select
          value={role}
          onChange={(val) => handleRoleChange(record.id, val)}
          style={{ width: 110 }}
          options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive, record) => (
        <Switch
          checked={isActive}
          onChange={(checked) => handleStatusChange(record.id, checked)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 180,
      render: (text) => formatShanghaiTime(text),
    },
  ];

  return (
    <div className="user-list">
      <div className="list-toolbar">
        <Input
          placeholder="搜索用户名或显示名称"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 280 }}
          allowClear
        />
      </div>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
        size="middle"
      />
    </div>
  );
}

function LoginLogs() {
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [page, setPage] = useState(1);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLoginLogs({ username, page, page_size: 50 });
      setLogs(res.items);
      setTotal(res.total);
    } catch {
      message.error('加载登录日志失败');
    } finally {
      setLoading(false);
    }
  }, [username, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const columns: ColumnsType<LoginLog> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '登录时间',
      dataIndex: 'login_time',
      key: 'login_time',
      width: 180,
      render: (text) => formatShanghaiTime(text),
    },
    {
      title: 'IP 地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
      render: (text) => text || '-',
    },
    {
      title: '结果',
      dataIndex: 'success',
      key: 'success',
      width: 100,
      render: (success) => (
        <Tag color={success ? 'success' : 'error'}>
          {success ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '信息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (text) => text || '-',
    },
  ];

  return (
    <div className="login-logs">
      <div className="list-toolbar">
        <Input
          placeholder="搜索用户名"
          prefix={<SearchOutlined />}
          value={username}
          onChange={(e) => { setUsername(e.target.value); setPage(1); }}
          style={{ width: 280 }}
          allowClear
        />
      </div>
      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
        size="middle"
      />
    </div>
  );
}
