import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input, Progress, Tag, Switch, Select, Pagination, Table, Popconfirm, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { fetchTestResultBuilds, updateTestResultRun } from '../services/api';
import type { TestResultRun, TestResultBuildGroup } from '../services/api';
import CollapsibleGroup from '../components/CollapsibleGroup';
import './TestResultsPage.css';

const PAGE_SIZE = 10;
const REFRESH_INTERVAL_MS = 30000;

/** 目标量存在且已完成数不小于目标量时视为完成 */
function isCompleted(run: TestResultRun): boolean {
  return run.target_amount != null && run.target_amount > 0 && run.current_done >= run.target_amount;
}

function formatDateTime(value: string | null): string {
  // 后端返回 UTC ISO（如 2026-09-28T02:32:14Z），转成本地时间展示
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString('zh-CN', { hour12: false });
}

/** 版本字段为空时的分组展示文案 */
const UNKNOWN_LABEL = '未知';

/** 超过该时长未上报（且尚未完成）的运行归入「警告」分组 */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** 状态分组键：警告 / 终止 / 进行中 / 已完成 */
type RunGroupStatus = 'warning' | 'terminated' | 'progress' | 'completed';

/** 状态分组固定展示顺序 */
const STATUS_ORDER: RunGroupStatus[] = ['warning', 'terminated', 'progress', 'completed'];

const STATUS_LABELS: Record<RunGroupStatus, string> = {
  warning: '警告',
  terminated: '终止',
  progress: '进行中',
  completed: '已完成',
};

const STATUS_COLORS: Record<RunGroupStatus, string> = {
  warning: 'warning',
  terminated: 'default',
  progress: 'processing',
  completed: 'success',
};

/**
 * 状态分组规则：进度达标 → 已完成（完成后不再要求上报）；人工终止 → 终止；
 * 未达标且超过 24 小时未上报 → 警告；其余 → 进行中。
 */
function classifyRun(run: TestResultRun): RunGroupStatus {
  if (isCompleted(run)) return 'completed';
  if (run.terminated) return 'terminated';
  const lastReport = run.updated_at ?? run.created_at;
  const isStale = lastReport == null || Date.now() - new Date(lastReport).getTime() > STALE_THRESHOLD_MS;
  return isStale ? 'warning' : 'progress';
}

/** 版本信息层分组节点（软件版本 + 构建号 + SDK 版本，叶子组，组内 runs 以表格展示） */
interface VersionNode {
  key: string;
  software: string | null;
  build: string;
  sdk: string | null;
  runs: TestResultRun[];
}

/** 硬件版本层分组节点 */
interface HardwareNode {
  key: string;
  hardware: string | null;
  runs: TestResultRun[];
  versionNodes: VersionNode[];
}

/** 状态层分组节点（最高层） */
interface StatusNode {
  key: RunGroupStatus;
  runs: TestResultRun[];
  hardwareNodes: HardwareNode[];
}

/** 空值分组固定排在最后，其余按给定比较器排序 */
function compareUnknownLast(
  a: string | null,
  b: string | null,
  cmp: (x: string, y: string) => number,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp(a, b);
}

/** 版本号降序（新版本在前），数字段按数值比较（2.10.0 > 2.9.0） */
function compareVersionDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true });
}

/** 构建号降序：纯数字按数值排序并排在非数字之前，其余按字典序 */
function compareBuildDesc(a: string, b: string): number {
  const aIsNumeric = /^\d+$/.test(a);
  const bIsNumeric = /^\d+$/.test(b);
  if (aIsNumeric && bIsNumeric) return Number(b) - Number(a);
  if (aIsNumeric !== bIsNumeric) return aIsNumeric ? -1 : 1;
  return b.localeCompare(a);
}

/** 渲染 "x/y 完成" 汇总徽标，供各层级分组标题复用 */
function renderCompletionSummary(runs: TestResultRun[]) {
  const done = runs.filter(isCompleted).length;
  const allDone = runs.length > 0 && done === runs.length;
  return (
    <span className={`tr-group-summary${allDone ? ' done' : ''}`}>
      {done}/{runs.length} 完成
    </span>
  );
}

/**
 * 从当前页 runs 构建 状态 → 硬件 → 版本信息（软件/构建号/SDK）三级分组树。
 * 各层同时累计 runs，便于在任意层级展示汇总进度。
 */
function buildHierarchy(groups: TestResultBuildGroup[]): StatusNode[] {
  interface HardwareAccum {
    hardware: string | null;
    runs: TestResultRun[];
    versionMap: Map<string, VersionNode>;
  }
  interface StatusAccum {
    runs: TestResultRun[];
    hardwareMap: Map<string, HardwareAccum>;
  }

  const statusMap = new Map<RunGroupStatus, StatusAccum>();
  for (const group of groups) {
    for (const run of group.runs) {
      const status = classifyRun(run);
      let statusBucket = statusMap.get(status);
      if (!statusBucket) {
        statusBucket = { runs: [], hardwareMap: new Map() };
        statusMap.set(status, statusBucket);
      }
      statusBucket.runs.push(run);

      const hardwareKey = run.hardware_version ?? '';
      let hardware = statusBucket.hardwareMap.get(hardwareKey);
      if (!hardware) {
        hardware = { hardware: run.hardware_version, runs: [], versionMap: new Map() };
        statusBucket.hardwareMap.set(hardwareKey, hardware);
      }
      hardware.runs.push(run);

      const versionKey = [run.software_version ?? '', run.build_number, run.sdk_version ?? ''].join('|');
      let version = hardware.versionMap.get(versionKey);
      if (!version) {
        version = {
          key: versionKey,
          software: run.software_version,
          build: run.build_number,
          sdk: run.sdk_version,
          runs: [],
        };
        hardware.versionMap.set(versionKey, version);
      }
      version.runs.push(run);
    }
  }

  // 版本信息层排序：软件版本 → 构建号 → SDK 版本，均按降序（新在前）
  const compareVersions = (a: VersionNode, b: VersionNode): number =>
    compareUnknownLast(a.software, b.software, compareVersionDesc) ||
    compareBuildDesc(a.build, b.build) ||
    compareUnknownLast(a.sdk, b.sdk, compareVersionDesc);

  return [...statusMap.entries()]
    .sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
    .map(([status, statusBucket]) => ({
      key: status,
      runs: statusBucket.runs,
      hardwareNodes: [...statusBucket.hardwareMap.entries()]
        .sort(([, a], [, b]) => compareUnknownLast(a.hardware, b.hardware, (x, y) => x.localeCompare(y, 'zh')))
        .map(([hardwareKey, hardware]) => ({
          key: hardwareKey,
          hardware: hardware.hardware,
          runs: hardware.runs,
          versionNodes: [...hardware.versionMap.values()].sort(compareVersions),
        })),
    }));
}

export default function TestResultsPage() {
  const [groups, setGroups] = useState<TestResultBuildGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [buildSearch, setBuildSearch] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<string | undefined>(undefined);
  const [machineFilter, setMachineFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  // 终止操作进行中的任务 id，防止确认框重复提交
  const [pendingRunIds, setPendingRunIds] = useState<Set<number>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchTestResultBuilds({
        build_number: buildSearch.trim() || undefined,
        test_type: testTypeFilter,
        test_machine: machineFilter,
        page,
        page_size: PAGE_SIZE,
      });
      setGroups(res.items || []);
      setTotal(res.total);
    } catch {
      // 轮询失败静默处理，保留上一次数据
    } finally {
      setLoading(false);
    }
  }, [buildSearch, testTypeFilter, machineFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 自动刷新（默认开启，可切换关闭）
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => loadData(), REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [autoRefresh, loadData]);

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBuildSearch(value);
      setPage(1);
    }, 300);
  };

  const handleSearch = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setBuildSearch(value);
    setPage(1);
  };

  // 筛选选项从当前加载的数据中提取
  const testTypeOptions = useMemo(() => {
    const present = new Set<string>();
    groups.forEach((g) => g.runs.forEach((r) => present.add(r.test_type)));
    return [...present].sort((a, b) => a.localeCompare(b, 'zh')).map((t) => ({ value: t, label: t }));
  }, [groups]);

  const machineOptions = useMemo(() => {
    const present = new Set<string>();
    groups.forEach((g) => g.runs.forEach((r) => present.add(r.test_machine)));
    return [...present].sort((a, b) => a.localeCompare(b, 'zh')).map((m) => ({ value: m, label: m }));
  }, [groups]);

  // 按 状态 → 硬件 → 版本信息 对当前页 runs 重新构建分组树
  const hierarchy = useMemo(() => buildHierarchy(groups), [groups]);

  const hasFilter = !!buildSearch.trim() || !!testTypeFilter || !!machineFilter;

  const handleTerminate = async (run: TestResultRun) => {
    setPendingRunIds((prev) => new Set(prev).add(run.id));
    try {
      await updateTestResultRun(run.id, { terminated: true });
      message.success('已标记为终止');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '标记终止失败');
    } finally {
      setPendingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(run.id);
        return next;
      });
    }
  };

  /** 状态标签：仅「警告」可交互，点击弹确认框后标记为终止 */
  const renderStatusTag = (run: TestResultRun) => {
    const status = classifyRun(run);
    if (status !== 'warning') {
      return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>;
    }
    const pending = pendingRunIds.has(run.id);
    return (
      <Popconfirm
        title="将该任务标记为终止？"
        description={`Build #${run.build_number} · ${run.test_type} · ${run.test_machine}`}
        okText="确认"
        cancelText="取消"
        onConfirm={() => handleTerminate(run)}
        disabled={pending}
      >
        <Tag color="warning" className={`tr-status-tag-clickable${pending ? ' pending' : ''}`}>
          {STATUS_LABELS.warning}
        </Tag>
      </Popconfirm>
    );
  };

  const renderProgress = (run: TestResultRun) => {
    const hasTarget = run.target_amount != null && run.target_amount > 0;
    if (!hasTarget) {
      return <span className="tr-progress-na">{run.current_done} / —</span>;
    }
    const percent = Math.min(100, Math.round((run.current_done / run.target_amount!) * 100));
    return (
      <Progress
        percent={percent}
        size="small"
        status={isCompleted(run) ? 'success' : 'active'}
        format={() => `${run.current_done} / ${run.target_amount}`}
      />
    );
  };

  return (
    <div className="tr-page">
      <div className="tr-header">
        <div className="tr-header-text">
          <h1 className="tr-title">测试结果</h1>
          <p className="tr-subtitle">自动化测试上报的进度数据，按状态 → 硬件 → 版本信息分组展示</p>
        </div>
        <div className="tr-header-actions">
          <button className="tr-refresh-btn" onClick={() => loadData()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            刷新
          </button>
          <div className="tr-auto">
            <span className="tr-auto-label">自动刷新</span>
            <Switch
              size="small"
              checked={autoRefresh}
              onChange={setAutoRefresh}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </div>
        </div>
      </div>

      <div className="tr-filters">
        <Input.Search
          placeholder="搜索构建号..."
          allowClear
          enterButton={<SearchOutlined />}
          style={{ width: 260 }}
          onSearch={handleSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <Select
          allowClear
          placeholder="全部类型"
          style={{ width: 180 }}
          value={testTypeFilter}
          onChange={(v) => {
            setTestTypeFilter(v);
            setPage(1);
          }}
          options={testTypeOptions}
        />
        <Select
          allowClear
          placeholder="全部测试机"
          style={{ width: 200 }}
          value={machineFilter}
          onChange={(v) => {
            setMachineFilter(v);
            setPage(1);
          }}
          options={machineOptions}
        />
      </div>

      {loading ? (
        <div className="tr-skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="tr-skeleton-card">
              <div className="tr-skeleton-line short" />
              <div className="tr-skeleton-line" />
              <div className="tr-skeleton-line short" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="tr-empty">
          <p className="tr-empty-text">暂无测试结果</p>
          <p className="tr-empty-hint">
            {hasFilter
              ? '没有匹配的测试结果，请调整筛选条件'
              : '自动化测试通过上报接口推送进度后，将在此按状态、硬件与版本信息层级分组展示'}
          </p>
        </div>
      ) : (
        <>
          <div className="tr-groups">
            {hierarchy.map((status, statusIdx) => (
              <CollapsibleGroup
                key={status.key}
                className="tr-lvl1"
                storageKey={`tr-l1-collapsed|${status.key}`}
                defaultCollapsed={statusIdx !== 0}
                count={status.runs.length}
                countSuffix="条"
                title={
                  <span className="tr-node-title">
                    <span className={`tr-status-dot tr-status-${status.key}`} />
                    <span className="tr-node-status">{STATUS_LABELS[status.key]}</span>
                  </span>
                }
              >
                {status.hardwareNodes.map((hardware, hardwareIdx) => (
                  <CollapsibleGroup
                    key={hardware.key}
                    className="tr-lvl2"
                    storageKey={`tr-l2-collapsed|${status.key}|${hardware.key}`}
                    defaultCollapsed={hardwareIdx !== 0}
                    title={
                      <span className="tr-node-title">
                        <span className="tr-node-hw">{hardware.hardware ?? UNKNOWN_LABEL}</span>
                        {renderCompletionSummary(hardware.runs)}
                      </span>
                    }
                  >
                    {hardware.versionNodes.map((version, versionIdx) => (
                      <CollapsibleGroup
                        key={version.key}
                        className="tr-lvl3"
                        storageKey={`tr-l3-collapsed|${status.key}|${hardware.key}|${version.key}`}
                        defaultCollapsed={versionIdx !== 0}
                        title={
                          <span className="tr-node-title">
                            <span className="tr-node-sw">{version.software ?? UNKNOWN_LABEL}</span>
                            <span className="tr-node-sep">·</span>
                            <span className="tr-node-build">Build #{version.build}</span>
                            <span className="tr-node-sep">·</span>
                            <span className="tr-node-sdk">SDK {version.sdk ?? UNKNOWN_LABEL}</span>
                            {renderCompletionSummary(version.runs)}
                          </span>
                        }
                      >
                        <Table<TestResultRun>
                          rowKey="id"
                          size="small"
                          dataSource={version.runs}
                          pagination={false}
                          columns={[
                            { title: 'TestType', dataIndex: 'test_type', width: 150 },
                            {
                              title: '测试机',
                              dataIndex: 'test_machine',
                              width: 160,
                              render: (v: string) => <span className="tr-mono">{v}</span>,
                            },
                            {
                              title: 'Description',
                              dataIndex: 'description',
                              ellipsis: true,
                              render: (v: string | null) => v || '-',
                            },
                            {
                              title: '进度',
                              key: 'progress',
                              width: 230,
                              render: (_: unknown, run: TestResultRun) => renderProgress(run),
                            },
                            {
                              title: '失败次数',
                              dataIndex: 'failed_count',
                              width: 90,
                              render: (v: number) => (
                                <span className={v > 0 ? 'tr-failed-count has-failure' : 'tr-failed-count'}>
                                  {v ?? 0}
                                </span>
                              ),
                            },
                            {
                              title: '状态',
                              key: 'status',
                              width: 100,
                              render: (_: unknown, run: TestResultRun) => renderStatusTag(run),
                            },
                            {
                              title: '最后更新',
                              dataIndex: 'updated_at',
                              width: 175,
                              render: (v: string | null) => formatDateTime(v),
                            },
                          ]}
                        />
                      </CollapsibleGroup>
                    ))}
                  </CollapsibleGroup>
                ))}
              </CollapsibleGroup>
            ))}
          </div>
          {total > PAGE_SIZE && (
            <div className="tr-pagination">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={setPage}
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
