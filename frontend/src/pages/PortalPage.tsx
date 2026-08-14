import { useState, useEffect, useRef } from 'react';
import { Modal, message } from 'antd';
import { fetchPortalLinks, createPortalLink, updatePortalLink, deletePortalLink, uploadPortalBackground } from '../services/api';
import type { PortalLink, PortalLinkCreate } from '../services/api';
import './PortalPage.css';

export default function PortalPage() {
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<PortalLink | null>(null);
  const [formData, setFormData] = useState<PortalLinkCreate>({
    name: '',
    url: '',
    description: '',
  });

  const [, setBgUploading] = useState(false);
  const [bgUploadingLinkId, setBgUploadingLinkId] = useState<number | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      const data = await fetchPortalLinks();
      setLinks(data);
    } catch {
      message.error('Failed to load portal links');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingLink(null);
    setFormData({ name: '', url: '', description: '' });
    setModalOpen(true);
  };

  const openEditModal = (link: PortalLink) => {
    setEditingLink(link);
    setFormData({
      name: link.name,
      url: link.url,
      description: link.description || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      message.warning('Name and URL are required');
      return;
    }

    try {
      if (editingLink) {
        await updatePortalLink(editingLink.id, {
          name: formData.name.trim(),
          url: formData.url.trim(),
          description: formData.description?.trim() || undefined,
        });
        message.success('Link updated');
      } else {
        await createPortalLink({
          name: formData.name.trim(),
          url: formData.url.trim(),
          description: formData.description?.trim() || undefined,
        });
        message.success('Link added');
      }
      setModalOpen(false);
      loadLinks();
    } catch {
      message.error('Failed to save link');
    }
  };

  const handleDelete = async (link: PortalLink) => {
    if (link.is_builtin) return;

    Modal.confirm({
      title: 'Confirm deletion',
      content: `Are you sure you want to delete "${link.name}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deletePortalLink(link.id);
          message.success('Link deleted');
          loadLinks();
        } catch {
          message.error('Failed to delete link');
        }
      },
    });
  };

  const handleCardClick = (link: PortalLink) => {
    if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link.url;
    }
  };

  return (
    <div className="portal-page">
      <div className="portal-header">
        <div className="portal-header-text">
          <h1 className="portal-title">Portal</h1>
          <p className="portal-subtitle">Quick access to internal tools and resources</p>
        </div>
        <button className="portal-add-btn" onClick={openAddModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add site
        </button>
      </div>

      {loading ? (
        <div className="portal-skeleton">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="portal-skeleton-card">
              <div className="portal-skeleton-line short" />
              <div className="portal-skeleton-line" />
            </div>
          ))}
        </div>
      ) : links.length === 0 ? (
        <div className="portal-empty">
          <p className="portal-empty-text">No portal links yet</p>
          <p className="portal-empty-hint">Click "Add site" to add your first internal link</p>
        </div>
      ) : (
        <div className="portal-grid">
          {links.map((link) => (
            <div
              key={link.id}
              className={`portal-card ${link.is_builtin ? 'builtin' : ''} ${link.background_image ? 'has-bg' : ''}`}
              onClick={() => handleCardClick(link)}
              style={link.background_image ? { backgroundImage: `url(${link.background_image})` } : undefined}
            >
              <div className="portal-card-name">{link.name}</div>
              {link.description && <div className="portal-card-desc">{link.description}</div>}
              <div className="portal-card-footer">
                <span className="portal-card-url">{link.url}</span>
                {link.is_builtin ? (
                  <span className="portal-card-builtin-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Builtin
                  </span>
                ) : (
                  <span />
                )}
                {!link.is_builtin && (
                  <div className="portal-card-actions">
                    <button
                      className="portal-card-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(link);
                      }}
                      title="Edit"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="portal-card-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        bgInputRef.current?.click();
                        setBgUploadingLinkId(link.id);
                      }}
                      title="Set background image"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </button>
                    <button
                      className="portal-card-action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(link);
                      }}
                      title="Delete"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input for background image upload */}
      <input
        type="file"
        ref={bgInputRef}
        style={{ display: 'none' }}
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file && bgUploadingLinkId) {
            setBgUploading(true);
            try {
              await uploadPortalBackground(bgUploadingLinkId, file);
              message.success('Background image updated');
              loadLinks();
            } catch {
              message.error('Failed to upload background image');
            } finally {
              setBgUploading(false);
              setBgUploadingLinkId(null);
              e.target.value = '';
            }
          }
        }}
      />

      <Modal
        title={editingLink ? 'Edit link' : 'Add link'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={editingLink ? 'Save' : 'Add'}
        cancelText="Cancel"
        destroyOnClose
      >
        <div className="portal-form">
          <div className="portal-form-field">
            <label>Name *</label>
            <input
              type="text"
              placeholder="e.g. Jenkins"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="portal-form-field">
            <label>URL *</label>
            <input
              type="text"
              placeholder="e.g. https://jenkins.internal.com"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
            <span className="portal-form-hint">Full URL starting with http:// or https://</span>
          </div>
          <div className="portal-form-field">
            <label>Description</label>
            <textarea
              placeholder="Brief description of this site"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
