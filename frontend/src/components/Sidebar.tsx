import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

/* Minimal stroke icons — 1.5px weight, 20×20 viewport */
const icons = {
  portal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  agent: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>,
  skill: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  tool: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  mcp: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  rag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  stats: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
  session: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  channel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>,
  memory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const navGroups: NavGroup[] = [
  {
    title: 'Online',
    items: [
      { key: 'portal', icon: icons.portal, label: '门户' },
      { key: 'session', icon: icons.session, label: 'Agent 会话' },
      { key: 'agent', icon: icons.agent, label: 'Agent 编排' },
      { key: 'skill', icon: icons.skill, label: 'Skills' },
      { key: 'mcp', icon: icons.mcp, label: 'MCPs' },
      { key: 'rag', icon: icons.rag, label: 'RAGs' },
    ],
  },
  {
    title: 'Offline',
    items: [
      { key: 'tool', icon: icons.tool, label: 'Tools' },
      { key: 'stats', icon: icons.stats, label: '统计' },
      { key: 'channel', icon: icons.channel, label: '通道' },
      { key: 'memory', icon: icons.memory, label: '记忆' },
    ],
  },
];

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { user, logout, isAdmin } = useAuth();

  const handleLogout = async () => {
    await logout();
    onSectionChange('portal');
  };

  return (
    <aside className="sidebar">
      <div className="system-name">SinoAI Platform</div>

      {navGroups.map((group) => (
        <div key={group.title} className="nav-group">
          <div className="group-title">{group.title}</div>
          {group.items.map((item) => (
            <div
              key={item.key}
              className={`nav-item ${activeSection === item.key ? 'active' : ''}`}
              onClick={() => onSectionChange(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-text">{item.label}</span>
            </div>
          ))}
        </div>
      ))}

      {isAdmin && (
        <div className="nav-group">
          <div className="group-title">管理</div>
          <div
            className={`nav-item ${activeSection === 'users' ? 'active' : ''}`}
            onClick={() => onSectionChange('users')}
          >
            <span className="nav-icon">{icons.users}</span>
            <span className="nav-text">用户管理</span>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-name">{user?.display_name || user?.username || 'Unknown'}</div>
          <div className="user-role">{user?.role || 'viewer'}</div>
        </div>
        <div className="logout-btn" onClick={handleLogout} title="退出登录">
          {icons.logout}
        </div>
      </div>
    </aside>
  );
}
