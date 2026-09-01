import { useState, useEffect, useCallback } from 'react';
import { Breadcrumb, Button, Empty, message, Modal, Space, Spin, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  fetchFileList,
  getFileDownloadUrl,
  getFilePreviewUrl,
  getZipDownloadUrl,
} from '../services/api';
import type { FileEntry } from '../services/api';
import './FileManagerPage.css';

// ── helpers ──

function formatSize(size: number | null): string {
  if (size == null) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

/** Trigger a download via a plain fetch with the JWT header, then save the blob. */
async function downloadViaFetch(url: string, fileName: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `下载失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // keep the generic message when the body is not JSON
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

// ── preview helpers ──

type PreviewKind = 'md' | 'text' | 'image' | 'pdf';

/** Extension whitelist shared with the backend /files/preview endpoint. */
const PREVIEW_KINDS: Record<string, PreviewKind> = {
  md: 'md',
  markdown: 'md',
  txt: 'text',
  log: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  pdf: 'pdf',
};

function previewKindOf(name: string): PreviewKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return PREVIEW_KINDS[name.slice(dot + 1).toLowerCase()] ?? null;
}

// ── page ──

export default function FileManagerPage() {
  const [path, setPath] = useState('');
  const [items, setItems] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    entry: FileEntry;
    kind: PreviewKind;
    content?: string;
    blobUrl?: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async (targetPath: string) => {
    setLoading(true);
    try {
      const data = await fetchFileList(targetPath);
      setPath(data.path);
      setItems(data.items);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.message || '加载目录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  // Breadcrumb trail: root → dir1 → dir2; each segment navigates back.
  const segments = path ? path.split('/') : [];
  const crumbs = [
    { title: '根目录', key: '' },
    ...segments.map((seg, idx) => ({
      title: seg,
      key: segments.slice(0, idx + 1).join('/'),
    })),
  ];

  const handleEnterDir = (dirPath: string) => {
    load(dirPath);
  };

  const handleDownload = async (entry: FileEntry) => {
    const target = path ? `${path}/${entry.name}` : entry.name;
    setDownloading(entry.name);
    try {
      await downloadViaFetch(getFileDownloadUrl(target), entry.name);
      message.success(`已开始下载 ${entry.name}`);
    } catch (err: any) {
      message.error(err?.message || `下载 ${entry.name} 失败`);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadZip = async (entry: FileEntry) => {
    const target = path ? `${path}/${entry.name}` : entry.name;
    setDownloading(entry.name);
    try {
      await downloadViaFetch(getZipDownloadUrl(target), `${entry.name}.zip`);
      message.success(`已开始打包下载 ${entry.name}.zip`);
    } catch (err: any) {
      message.error(err?.message || `打包下载 ${entry.name} 失败`);
    } finally {
      setDownloading(null);
    }
  };

  const handlePreview = async (entry: FileEntry) => {
    const kind = previewKindOf(entry.name);
    if (!kind) return;
    const target = path ? `${path}/${entry.name}` : entry.name;
    setPreviewLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(getFilePreviewUrl(target), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let detail = `预览失败 (${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          // keep the generic message when the body is not JSON
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      if (kind === 'md' || kind === 'text') {
        setPreview({ entry, kind, content: await blob.text() });
      } else {
        // images / PDFs are shown from an object URL; revoked on modal close
        setPreview({ entry, kind, blobUrl: URL.createObjectURL(blob) });
      }
    } catch (err: any) {
      message.error(err?.message || `预览 ${entry.name} 失败`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
    setPreview(null);
  };

  const columns: ColumnsType<FileEntry> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <span
          className={`file-name ${record.is_dir ? 'is-dir' : ''}`}
          onClick={() => record.is_dir && handleEnterDir(path ? `${path}/${name}` : name)}
        >
          <span className="file-icon">{record.is_dir ? '📁' : '📄'}</span>
          {name}
        </span>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number | null, record) => (record.is_dir ? '-' : formatSize(size)),
    },
    {
      title: '修改时间',
      dataIndex: 'modified_at',
      key: 'modified_at',
      width: 200,
      render: formatTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, record) =>
        record.is_dir ? (
          <Button
            size="small"
            loading={downloading === record.name}
            onClick={() => handleDownloadZip(record)}
          >
            下载 zip
          </Button>
        ) : (
          <Space size={4}>
            {previewKindOf(record.name) && (
              <Button size="small" onClick={() => handlePreview(record)}>
                预览
              </Button>
            )}
            <Button
              size="small"
              type="primary"
              loading={downloading === record.name}
              onClick={() => handleDownload(record)}
            >
              下载
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <h2>文件管理</h2>
        <Tooltip title="局域网共享目录，内容由共享访问权限决定">
          <span className="file-manager-hint">局域网共享</span>
        </Tooltip>
      </div>

      <div className="file-manager-toolbar">
        <Breadcrumb
          items={crumbs.map((c) => ({
            title: (
              <a onClick={() => handleEnterDir(c.key)}>{c.title}</a>
            ),
          }))}
        />
        {path && (
          <Button size="small" onClick={() => handleEnterDir('')}>
            ↑ 返回上级
          </Button>
        )}
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="目录为空" style={{ marginTop: 48 }} />
        ) : (
          <Table<FileEntry>
            rowKey="name"
            columns={columns}
            dataSource={items}
            pagination={false}
            size="middle"
            className="file-manager-table"
            onRow={(record) => ({
              onDoubleClick: () => record.is_dir && handleEnterDir(path ? `${path}/${record.name}` : record.name),
            })}
          />
        )}
      </Spin>

      <Modal
        open={preview !== null}
        title={preview?.entry.name}
        onCancel={closePreview}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0, maxWidth: '100vw' }}
        rootClassName="fm-preview-modal"
      >
        {previewLoading ? (
          <div className="fm-preview-loading">
            <Spin />
          </div>
        ) : preview?.kind === 'md' ? (
          <div className="fm-preview-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content ?? ''}</ReactMarkdown>
          </div>
        ) : preview?.kind === 'text' ? (
          <pre className="fm-preview-text">{preview.content}</pre>
        ) : preview?.kind === 'image' ? (
          <div className="fm-preview-image">
            <img src={preview.blobUrl} alt={preview.entry.name} />
          </div>
        ) : preview?.kind === 'pdf' ? (
          <iframe className="fm-preview-pdf" src={preview.blobUrl} title={preview.entry.name} />
        ) : null}
      </Modal>
    </div>
  );
}
