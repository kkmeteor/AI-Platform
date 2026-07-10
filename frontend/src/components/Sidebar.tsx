import './Sidebar.css';

interface NavItem {
  key: string;
  icon: string;
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

const navGroups: NavGroup[] = [
  {
    title: 'Agent Studio',
    items: [
      { key: 'agent', icon: '🤖', label: 'Agents' },
      { key: 'skill', icon: '⚡', label: 'Skills' },
      { key: 'tool', icon: '🔧', label: 'Tools' },
      { key: 'mcp', icon: '🔗', label: 'MCPs' },
      { key: 'rag', icon: '📚', label: 'RAGs' },
      { key: 'stats', icon: '📊', label: '统计' },
    ],
  },
  {
    title: 'Agent Control',
    items: [
      { key: 'session', icon: '💬', label: '会话' },
      { key: 'channel', icon: '📡', label: '通道' },
      { key: 'memory', icon: '🧠', label: '记忆' },
    ],
  },
];

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
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
    </aside>
  );
}
