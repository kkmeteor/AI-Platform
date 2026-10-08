import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input, Progress, Tag, Switch, Select, Pagination, Table } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { fetchTestResultBuilds } from '../services/api';
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

export default function TestResultsPage() {
  const [groups, setGroups] = useState<TestResultBuildGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [buildSearch, setBuildSearch] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<string | undefined>(undefined);
  const [machineFilter, setMachineFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

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

  const hasFilter = !!buildSearch.trim() || !!testTypeFilter || !!machineFilter;

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
          <p className="tr-subtitle">自动化测试上报的进度数据，按构建号分组展示</p>
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
              : '自动化测试通过上报接口推送进度后，将在此按构建号分组展示'}
          </p>
        </div>
      ) : (
        <>
          <div className="tr-groups">
            {groups.map((g, idx) => {
              const done = g.runs.filter(isCompleted).length;
              const allDone = done === g.runs.length && g.runs.length > 0;
              const version = [g.hardware_version, g.software_version, g.sdk_version].filter(Boolean).join(' / ');
              return (
                <CollapsibleGroup
                  key={g.build_number}
                  storageKey={`tr-group-collapsed-${g.build_number}`}
                  defaultCollapsed={idx !== 0}
                  title={
                    <span className="tr-group-title">
                      <span className="tr-group-build">Build #{g.build_number}</span>
                      {version && <span className="tr-group-version">{version}</span>}
                      <span className={`tr-group-summary${allDone ? ' done' : ''}`}>
                        {done}/{g.runs.length} 完成
                      </span>
                    </span>
                  }
                >
                  <Table<TestResultRun>
                    rowKey="id"
                    size="small"
                    dataSource={g.runs}
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
                          <span className={v > 0 ? 'tr-failed-count has-failure' : 'tr-failed-count'}>{v ?? 0}</span>
                        ),
                      },
                      {
                        title: '状态',
                        key: 'status',
                        width: 100,
                        render: (_: unknown, run: TestResultRun) =>
                          isCompleted(run) ? <Tag color="success">已完成</Tag> : <Tag color="processing">进行中</Tag>,
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
              );
            })}
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
