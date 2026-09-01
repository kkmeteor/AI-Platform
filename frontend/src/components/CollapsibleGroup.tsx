import { useState } from 'react';
import './CollapsibleGroup.css';

interface CollapsibleGroupProps {
  /** 分组标题（组名，如 "#真机" / "未分组"） */
  title: React.ReactNode;
  /** 组内数量，展示在标题旁；不传则不渲染 */
  count?: number;
  /** 数量单位后缀（如 "台"），仅 count 存在时生效 */
  countSuffix?: string;
  /** 非空时折叠状态持久化到 localStorage（页面内需唯一，如 "tm-group-collapsed-xxx"） */
  storageKey?: string;
  /** 无持久化记录时的初始状态，默认展开 */
  defaultCollapsed?: boolean;
  /** 透传到外层容器 */
  className?: string;
  children: React.ReactNode;
}

function readStoredState(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey) return fallback;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === '1';
  } catch {
    // localStorage 不可用（隐私模式等）时回退到默认状态
  }
  return fallback;
}

/**
 * 通用分组折叠容器：标题区可点击展开/收起，箭头随状态旋转。
 * 非受控组件，storageKey 存在时折叠状态跨会话保持。
 */
export default function CollapsibleGroup({
  title,
  count,
  countSuffix,
  storageKey,
  defaultCollapsed = false,
  className,
  children,
}: CollapsibleGroupProps) {
  const [collapsed, setCollapsed] = useState(() => readStoredState(storageKey, defaultCollapsed));

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? '1' : '0');
        } catch {
          // 存储失败不影响本次会话内的折叠切换
        }
      }
      return next;
    });
  };

  return (
    <section className={`cg-group${collapsed ? ' cg-collapsed' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="cg-header" onClick={handleToggle} aria-expanded={!collapsed}>
        <svg
          className="cg-arrow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="cg-title">{title}</span>
        {count !== undefined && (
          <span className="cg-count">
            {count}
            {countSuffix ? ` ${countSuffix}` : ''}
          </span>
        )}
      </button>
      {!collapsed && <div className="cg-content">{children}</div>}
    </section>
  );
}
