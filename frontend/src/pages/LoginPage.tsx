import { useState, type KeyboardEvent } from 'react';
import { Button, Input, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      message.warning('请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      await login({ username: username.trim(), password });
      message.success('登录成功');
      window.location.href = '/?section=portal';
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '登录失败，请检查用户名和密码';
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">SinoAI Platform</h1>
          <p className="login-subtitle">使用域账号登录</p>
          <p className="login-hint">请输入域账号和密码，无需加 @ 后缀</p>
        </div>

        <div className="login-form">
          <Input
            size="large"
            placeholder="域账号用户名"
            prefix={<UserOutlined />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="username"
          />
          <Input.Password
            size="large"
            placeholder="密码"
            prefix={<LockOutlined />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="current-password"
          />
          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={handleLogin}
          >
            登录
          </Button>
        </div>
      </div>
    </div>
  );
}
