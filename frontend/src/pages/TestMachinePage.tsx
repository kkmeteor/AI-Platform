import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, message, Table, Switch, Select } from 'antd';
import {
  fetchTestMachines,
  createTestMachine,
  updateTestMachine,
  deleteTestMachine,
  occupyTestMachine,
  releaseTestMachine,
  heartbeatTestMachine,
  fetchTestMachineLogs,
} from '../services/api';
import type { TestMachine, TestMachineCreate, TestMachineLog } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './TestMachinePage.css';

const STATUS_OPTIONS = [
  { value: 'busy', label: '忙碌', color: '#ef4444' },
  { value: 'idle', label: '空闲', color: '#22c55e' },
  { value: 'unknown', label: '未知', color: '#a8a29e' },
  { value: 'offline', label: '离线', color: '#78716c' },
] as const;

const UNIT_MINUTES = 15;
const MAX_UNITS = 8;

const ACTION_LABELS: Record<string, string> = {
  occupy: '申请占用',
  release: '释放',
  auto_release: '自动释放',
  reset: '状态重置',
  lock: '管理员锁定',
  unlock: '管理员解锁',
  create: '创建',
  update: '更新',
  delete: '删除',
};

function getStatusInfo(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[2];
}

function formatRemaining(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} 小时 ${m % 60} 分`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TestMachinePage() {
  const { isAdmin, user } = useAuth();
  const [machines, setMachines] = useState<TestMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Add / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<TestMachine | null>(null);
  const [formData, setFormData] = useState<TestMachineCreate & { status: string }>({
    name: '',
    ip_address: '',
    teamviewer_id: '',
    status: 'unknown',
    tags: [],
  });

  // Occupy modal
  const [occupyTarget, setOccupyTarget] = useState<TestMachine | null>(null);
  const [occupyUnits, setOccupyUnits] = useState(2);
  const [occupyAutoRenew, setOccupyAutoRenew] = useState(false);
  const [occupySubmitting, setOccupySubmitting] = useState(false);

  // Logs modal
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsFilterMachine, setLogsFilterMachine] = useState<TestMachine | null>(null);
  const [logs, setLogs] = useState<TestMachineLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(50);

  const loadMachines = useCallback(async () => {
    try {
      const data = await fetchTestMachines();
      setMachines(data);
      setTick(0);
    } catch {
      // Silent in polling; only alert on first load.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  // Local countdown ticker (1s)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll + heartbeat every 30s: refreshes remaining time; only machines
  // occupied with auto-renew enabled get a heartbeat that slides the window.
  const occupiedByMe = machines.filter((m) => m.occupier_user_id === user?.id);
  const autoRenewIds = occupiedByMe.filter((m) => m.auto_renew).map((m) => m.id).join(',');

  useEffect(() => {
    const t = setInterval(() => {
      loadMachines();
      for (const id of autoRenewIds.split(',').filter(Boolean).map(Number)) {
        heartbeatTestMachine(id).catch(() => {});
      }
    }, 30000);
    return () => clearInterval(t);
  }, [loadMachines, autoRenewIds]);

  // ── add / edit ──

  const openAddModal = () => {
    setEditingMachine(null);
    setFormData({ name: '', ip_address: '', teamviewer_id: '', status: 'unknown', tags: [] });
    setModalOpen(true);
  };

  const openEditModal = (machine: TestMachine) => {
    setEditingMachine(machine);
    setFormData({
      name: machine.name,
      ip_address: machine.ip_address,
      teamviewer_id: machine.teamviewer_id || '',
      status: machine.status,
      tags: [...machine.tags],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.ip_address.trim()) {
      message.warning('测试机名称和 IP 地址为必填项');
      return;
    }

    try {
      if (editingMachine) {
        await updateTestMachine(editingMachine.id, {
          name: formData.name.trim(),
          ip_address: formData.ip_address.trim(),
          teamviewer_id: formData.teamviewer_id?.trim() || undefined,
          status: formData.status,
          tags: formData.tags || [],
        });
        message.success('测试机已更新');
      } else {
        await createTestMachine({
          name: formData.name.trim(),
          ip_address: formData.ip_address.trim(),
          teamviewer_id: formData.teamviewer_id?.trim() || undefined,
          status: formData.status,
          tags: formData.tags || [],
        });
        message.success('测试机已添加');
      }
      setModalOpen(false);
      loadMachines();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '保存失败');
    }
  };

  const handleDelete = (machine: TestMachine) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除测试机 "${machine.name}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteTestMachine(machine.id);
          message.success('测试机已删除');
          loadMachines();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  // ── status quick change (admin) ──

  const handleStatusChange = async (machine: TestMachine, newStatus: string) => {
    try {
      await updateTestMachine(machine.id, { status: newStatus, locked: newStatus === 'busy' ? machine.locked : false });
      message.success('状态已更新');
      loadMachines();
    } catch {
      message.error('状态更新失败');
    }
  };

  // ── admin lock / unlock ──

  const handleLock = async (machine: TestMachine) => {
    try {
      await updateTestMachine(machine.id, { status: 'busy', locked: true });
      message.success(`测试机 "${machine.name}" 已锁定`);
      loadMachines();
    } catch {
      message.error('锁定失败');
    }
  };

  const handleUnlock = async (machine: TestMachine) => {
    try {
      await updateTestMachine(machine.id, { locked: false });
      message.success(`测试机 "${machine.name}" 已解锁`);
      loadMachines();
    } catch {
      message.error('解锁失败');
    }
  };

  // ── occupy flow ──

  const handleCardClick = (machine: TestMachine) => {
    // Only idle + unlocked machines are occupiable by clicking.
    if (machine.status === 'idle' && !machine.locked) {
      setOccupyTarget(machine);
      setOccupyUnits(2);
      setOccupyAutoRenew(false);
    }
  };

  const handleOccupy = async () => {
    if (!occupyTarget) return;
    setOccupySubmitting(true);
    try {
      await occupyTestMachine(occupyTarget.id, occupyUnits * UNIT_MINUTES, occupyAutoRenew);
      message.success(
        occupyAutoRenew
          ? `已占用 ${occupyUnits * UNIT_MINUTES} 分钟，自动续期已开启：页面保持打开将每 30 秒滑动续期，关闭页面后到期自动释放`
          : `已占用 ${occupyUnits * UNIT_MINUTES} 分钟，自动续期已关闭：到期后直接释放，不自动续期`
      );
      setOccupyTarget(null);
      loadMachines();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '申请占用失败');
    } finally {
      setOccupySubmitting(false);
    }
  };

  const handleRelease = async (machine: TestMachine) => {
    try {
      await releaseTestMachine(machine.id);
      message.success('已释放占用');
      loadMachines();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '释放失败');
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制：${text}`);
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  // ── logs ──

  const openLogs = (machine: TestMachine | null) => {
    setLogsFilterMachine(machine);
    setLogsPage(1);
    setLogsOpen(true);
    loadLogs(1, logsPageSize, machine?.id);
  };

  const loadLogs = async (page: number, pageSize: number, machineId?: number) => {
    setLogsLoading(true);
    try {
      const res = await fetchTestMachineLogs({
        machine_id: machineId,
        page,
        page_size: pageSize,
      });
      setLogs(res.items);
      setLogsTotal(res.total);
    } catch {
      message.error('加载日志失败');
    } finally {
      setLogsLoading(false);
    }
  };

  const renderStatusBadge = (machine: TestMachine) => {
    const statusInfo = getStatusInfo(machine.status);
    let label: string = statusInfo.label;
    if (machine.locked) {
      label = '已锁定';
    } else if (machine.status === 'busy' && machine.occupier_username) {
      label = '占用中';
    }
    return (
      <span
        className={`tm-status-badge ${machine.locked ? 'locked' : ''}`}
        style={{ background: `${statusInfo.color}18`, color: statusInfo.color }}
      >
        <span className="tm-status-dot" style={{ background: statusInfo.color }} />
        {label}
      </span>
    );
  };

  const renderCardExtra = (machine: TestMachine) => {
    if (machine.status === 'busy' && machine.occupier_username) {
      const remaining = machine.remaining_seconds != null ? Math.max(0, machine.remaining_seconds - tick) : null;
      return (
        <div className="tm-card-body">
          <div className="tm-card-field">
            <span className="tm-card-label">占用者</span>
            <span className="tm-card-value">{machine.occupier_username}</span>
          </div>
          {remaining != null && (
            <div className="tm-card-field">
              <span className="tm-card-label">剩余时间</span>
              <span className="tm-card-value tm-mono tm-countdown">{formatRemaining(remaining)}</span>
            </div>
          )}
          <div className="tm-card-field">
            <span className="tm-card-label">自动续期</span>
            <span className={`tm-renew-tag ${machine.auto_renew ? 'on' : 'off'}`}>
              {machine.auto_renew ? '开启' : '关闭'}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCardFooter = (machine: TestMachine) => {
    const isMine = machine.occupier_user_id === user?.id;

    if (isAdmin) {
      return (
        <div className="tm-card-footer">
          <div className="tm-card-status-select">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`tm-status-option ${machine.status === opt.value ? 'active' : ''}`}
                style={machine.status === opt.value ? { background: `${opt.color}18`, color: opt.color, borderColor: opt.color } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusChange(machine, opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="tm-card-actions">
            {machine.locked ? (
              <button className="tm-card-action-btn" onClick={(e) => { e.stopPropagation(); handleUnlock(machine); }} title="解锁">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              </button>
            ) : (
              <button className="tm-card-action-btn" onClick={(e) => { e.stopPropagation(); handleLock(machine); }} title="锁定（忙碌且不可申请）">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </button>
            )}
            {machine.status === 'busy' && machine.occupier_username && (
              <button className="tm-card-action-btn" onClick={(e) => { e.stopPropagation(); handleRelease(machine); }} title="强制释放占用">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </button>
            )}
            <button className="tm-card-action-btn" onClick={(e) => { e.stopPropagation(); openLogs(machine); }} title="查看日志">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
            <button className="tm-card-action-btn" onClick={(e) => { e.stopPropagation(); openEditModal(machine); }} title="编辑">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="tm-card-action-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(machine);
              }}
              title="删除"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    // Non-admin footer
    if (machine.status === 'busy' && isMine) {
      return (
        <div className="tm-card-footer tm-card-footer-simple">
          <span className="tm-card-footer-note">正在使用中，请及时释放</span>
          <button
            className="tm-release-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleRelease(machine);
            }}
          >
            释放占用
          </button>
        </div>
      );
    }
    if (machine.status === 'idle' && !machine.locked) {
      return (
        <div className="tm-card-footer tm-card-footer-simple">
          <span className="tm-card-footer-note">点击卡片申请占用</span>
        </div>
      );
    }
    if (machine.locked) {
      return (
        <div className="tm-card-footer tm-card-footer-simple">
          <span className="tm-card-footer-note">管理员已锁定，不可申请</span>
        </div>
      );
    }
    return null;
  };

  const canOccupy = (machine: TestMachine) => machine.status === 'idle' && !machine.locked;

  // Group machines by tag for grouped display. A machine with multiple tags
  // appears in every group it belongs to; machines without tags go to a
  // dedicated "untagged" section.
  const allTags = useMemo(
    () => [...new Set(machines.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'zh')),
    [machines]
  );
  const tagGroups = useMemo(
    () => allTags.map((tag) => ({ tag, machines: machines.filter((m) => m.tags.includes(tag)) })),
    [allTags, machines]
  );
  const untagged = useMemo(() => machines.filter((m) => m.tags.length === 0), [machines]);

  const renderCard = (machine: TestMachine) => {
    const clickable = canOccupy(machine);
    return (
      <div
        key={machine.id}
        className={[
          'tm-card',
          clickable ? 'tm-card-clickable' : '',
          machine.locked ? 'tm-card-locked' : '',
          machine.status === 'busy' && !machine.locked ? 'tm-card-occupied' : '',
        ].join(' ')}
        onClick={() => handleCardClick(machine)}
      >
        <div className="tm-card-header">
          <div className="tm-card-name">{machine.name}</div>
          {renderStatusBadge(machine)}
        </div>

        <div className="tm-card-body">
          <div className="tm-card-field">
            <span className="tm-card-label">IP 地址</span>
            <span className="tm-card-value tm-mono">{machine.ip_address}</span>
          </div>
          {machine.teamviewer_id && (
            <div className="tm-card-field">
              <span className="tm-card-label">TeamViewer</span>
              <span className="tm-card-value tm-mono">{machine.teamviewer_id}</span>
            </div>
          )}
          {machine.tags.length > 0 && (
            <div className="tm-card-tags">
              {machine.tags.map((t) => (
                <span key={t} className="tm-card-tag">#{t}</span>
              ))}
            </div>
          )}
          {renderCardExtra(machine)}
        </div>

        {renderCardFooter(machine)}
      </div>
    );
  };

  const renderGroup = (title: string, groupMachines: TestMachine[]) => (
    <section className="tm-group">
      <div className="tm-group-header">
        <h2 className="tm-group-title">{title}</h2>
        <span className="tm-group-count">{groupMachines.length} 台</span>
      </div>
      <div className="tm-grid">{groupMachines.map(renderCard)}</div>
    </section>
  );

  return (
    <div className="tm-page">
      <div className="tm-header">
        <div className="tm-header-text">
          <h1 className="tm-title">测试机状态</h1>
          <p className="tm-subtitle">查看测试机状态，空闲机器可点击申请占用（15 分钟为单位，可选自动续期，到期自动释放）</p>
        </div>
        <div className="tm-header-actions">
          {isAdmin && (
            <button className="tm-log-btn" onClick={() => openLogs(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              占用日志
            </button>
          )}
          {isAdmin && (
            <button className="tm-add-btn" onClick={openAddModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              添加测试机
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="tm-skeleton">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="tm-skeleton-card">
              <div className="tm-skeleton-line short" />
              <div className="tm-skeleton-line" />
              <div className="tm-skeleton-line short" />
            </div>
          ))}
        </div>
      ) : machines.length === 0 ? (
        <div className="tm-empty">
          <p className="tm-empty-text">暂无测试机</p>
          <p className="tm-empty-hint">
            {isAdmin ? '点击"添加测试机"来添加第一台测试机' : '请联系管理员添加测试机'}
          </p>
        </div>
      ) : (
        <div className="tm-groups">
          {tagGroups.map((g) => renderGroup(`#${g.tag}`, g.machines))}
          {untagged.length > 0 && renderGroup('未分组', untagged)}
        </div>
      )}

      {/* Add / edit modal */}
      <Modal
        title={editingMachine ? '编辑测试机' : '添加测试机'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={editingMachine ? '保存' : '添加'}
        cancelText="取消"
        destroyOnClose
      >
        <div className="tm-form">
          <div className="tm-form-field">
            <label>测试机名称 *</label>
            <input
              type="text"
              placeholder="例如：Dev-Server-01"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="tm-form-field">
            <label>IP 地址 *</label>
            <input
              type="text"
              placeholder="例如：192.168.1.100"
              value={formData.ip_address}
              onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
            />
          </div>
          <div className="tm-form-field">
            <label>TeamViewer ID（可选）</label>
            <input
              type="text"
              placeholder="例如：123 456 789"
              value={formData.teamviewer_id}
              onChange={(e) => setFormData({ ...formData, teamviewer_id: e.target.value })}
            />
          </div>
          <div className="tm-form-field">
            <label>标签（可选，可输入多个）</label>
            <Select
              mode="tags"
              value={formData.tags || []}
              onChange={(tags: string[]) => setFormData({ ...formData, tags })}
              placeholder="输入标签后回车，例如：regression"
              tokenSeparators={[',', '，']}
              options={allTags.map((t) => ({ value: t, label: t }))}
              style={{ width: '100%' }}
              maxTagCount={6}
            />
            <span className="tm-form-hint">可为测试机设置多个标签，页面将按标签分组展示</span>
          </div>
          <div className="tm-form-field">
            <label>状态</label>
            <div className="tm-form-status-group">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`tm-form-status-btn ${formData.status === opt.value ? 'active' : ''}`}
                  style={formData.status === opt.value ? { background: `${opt.color}18`, color: opt.color, borderColor: opt.color } : undefined}
                  onClick={() => setFormData({ ...formData, status: opt.value })}
                >
                  <span className="tm-form-status-dot" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Occupy modal */}
      <Modal
        title={`申请占用：${occupyTarget?.name || ''}`}
        open={!!occupyTarget}
        onOk={handleOccupy}
        onCancel={() => setOccupyTarget(null)}
        okText="确认占用"
        cancelText="取消"
        confirmLoading={occupySubmitting}
        destroyOnClose
      >
        {occupyTarget && (
          <div className="tm-form">
            <div className="tm-form-field">
              <label>IP 地址</label>
              <div className="tm-copy-row">
                <span className="tm-mono tm-copy-value">{occupyTarget.ip_address}</span>
                <button
                  type="button"
                  className="tm-copy-btn"
                  onClick={() => copyText(occupyTarget.ip_address)}
                  title="复制 IP 地址"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制
                </button>
              </div>
            </div>
            {occupyTarget.teamviewer_id && (
              <div className="tm-form-field">
                <label>TeamViewer ID</label>
                <div className="tm-copy-row">
                  <span className="tm-mono tm-copy-value">{occupyTarget.teamviewer_id}</span>
                  <button
                    type="button"
                    className="tm-copy-btn"
                    onClick={() => copyText(occupyTarget.teamviewer_id!)}
                    title="复制 TeamViewer ID"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    复制
                  </button>
                </div>
              </div>
            )}
            <div className="tm-form-field">
              <label>占用时长（15 分钟为单位）</label>
              <div className="tm-occupy-units">
                {Array.from({ length: MAX_UNITS }, (_, i) => i + 1).map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`tm-occupy-unit-btn ${occupyUnits === u ? 'active' : ''}`}
                    onClick={() => setOccupyUnits(u)}
                  >
                    {u * UNIT_MINUTES} 分钟
                  </button>
                ))}
              </div>
            </div>
            <div className="tm-form-field">
              <div className="tm-renew-row">
                <div className="tm-renew-info">
                  <span className="tm-renew-label">自动续期</span>
                  <span className="tm-renew-sub">
                    开启后，页面保持打开将每 30 秒滑动续期
                  </span>
                </div>
                <Switch
                  checked={occupyAutoRenew}
                  onChange={setOccupyAutoRenew}
                  checkedChildren="开"
                  unCheckedChildren="关"
                />
              </div>
              <span className="tm-form-hint">
                {occupyAutoRenew
                  ? '开启：页面保持打开即每 30 秒自动续期，关闭页面后到期自动释放并恢复空闲。'
                  : '关闭：到期后直接释放并恢复空闲，不会自动续期。'}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Logs modal (admin) */}
      <Modal
        title={logsFilterMachine ? `操作日志：${logsFilterMachine.name}` : '全部操作日志'}
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Table<TestMachineLog>
          rowKey="id"
          loading={logsLoading}
          dataSource={logs}
          size="small"
          pagination={{
            current: logsPage,
            pageSize: logsPageSize,
            total: logsTotal,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            onChange: (page, pageSize) => {
              setLogsPage(page);
              setLogsPageSize(pageSize);
              loadLogs(page, pageSize, logsFilterMachine?.id);
            },
          }}
          columns={[
            {
              title: '时间',
              dataIndex: 'created_at',
              width: 170,
              render: (v: string) => {
                if (!v) return '-';
                const d = new Date(v);
                return isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN', { hour12: false });
              },
            },
            { title: '测试机', dataIndex: 'machine_name', width: 140 },
            { title: '操作', dataIndex: 'action', width: 110, render: (a: string) => ACTION_LABELS[a] || a },
            { title: '操作人', dataIndex: 'username', width: 130, render: (u: string | null) => u || '-' },
            { title: '详情', dataIndex: 'detail', ellipsis: true },
          ]}
        />
      </Modal>
    </div>
  );
}
