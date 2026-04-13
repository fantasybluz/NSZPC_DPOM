'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';

const ICONS = ['cpu', 'gpu-card', 'motherboard', 'memory', 'device-hdd', 'fan', 'droplet-half', 'lightning-charge', 'pc-display', 'mouse2', 'keyboard', 'display', 'headset'];
const DEPTH_COLORS = ['var(--primary)', '#6b7280', '#9ca3af', '#d1d5db'];

interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  icon: string;
  sort_order: number;
  children?: Category[];
}

export default function CategoriesPage() {
  const [tree, setTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const loadTree = useCallback(async () => {
    try {
      const data = await api.get<Category[]>('/inventory/categories');
      setTree(data);
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const openAddRoot = () => {
    setEditId(null);
    setParentId(null);
    setFormName('');
    setFormIcon('');
    setModalTitle('新增主分類');
    setModalOpen(true);
  };

  const openAddSub = (pid: number) => {
    setEditId(null);
    setParentId(pid);
    setFormName('');
    setFormIcon('');
    setModalTitle('新增子分類');
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditId(cat.id);
    setParentId(null);
    setFormName(cat.name);
    setFormIcon(cat.icon || '');
    setModalTitle(`編輯: ${cat.name}`);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { showToast('名稱必填', 'warning'); return; }
    try {
      if (editId) {
        await api.put(`/inventory/categories/${editId}`, { name: formName, icon: formIcon });
        showToast('已更新');
      } else {
        const data: any = { name: formName, icon: formIcon };
        if (parentId) data.parent_id = parentId;
        await api.post('/inventory/categories', data);
        showToast('已新增');
      }
      setModalOpen(false);
      loadTree();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此分類（含所有子分類）？')) return;
    try {
      await api.del(`/inventory/categories/${id}`);
      showToast('已刪除');
      loadTree();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const toggleCollapse = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderNode = (node: Category, depth: number): React.ReactNode => {
    const hasChildren = (node.children?.length || 0) > 0;
    const isCollapsed = collapsed.has(node.id);
    const iconColor = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];

    return (
      <div key={node.id} className="cat-node">
        <div className="cat-node-header" style={{ paddingLeft: 12 + depth * 24 }}>
          <div className="d-flex align-items-center gap-2">
            <span className="cat-drag-handle"><i className="bi bi-grip-vertical" /></span>
            {hasChildren ? (
              <i className={`bi bi-chevron-${isCollapsed ? 'right' : 'down'}`}
                style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                onClick={() => toggleCollapse(node.id)} />
            ) : <span style={{ width: 12 }} />}
            <i className={`bi bi-${node.icon || 'folder'}`} style={{ color: iconColor }} />
            <strong style={{ fontSize: depth === 0 ? '0.95rem' : '0.88rem' }}>{node.name}</strong>
            {hasChildren && <span className="badge bg-light text-dark small">{node.children!.length}</span>}
          </div>
          <div className="d-flex gap-1">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => openAddSub(node.id)} title="新增子分類"><i className="bi bi-plus" /></button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(node)} title="編輯"><i className="bi bi-pencil" /></button>
            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(node.id)} title="刪除"><i className="bi bi-trash" /></button>
          </div>
        </div>
        {hasChildren && !isCollapsed && (
          <div className="cat-node-children">
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isAdmin) return <div className="alert alert-danger">權限不足</div>;
  if (loading) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <>
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="form-section">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0"><i className="bi bi-diagram-3" /> 商品分類管理</h6>
              <button className="btn btn-primary btn-sm" onClick={openAddRoot}><i className="bi bi-plus-lg" /> 新增主分類</button>
            </div>
            <p className="text-muted small mb-3">點擊 <i className="bi bi-chevron-down" /> 展開/收合，每個分類都可新增子分類（無深度限制）。</p>
            <div>
              {tree.length === 0 ? (
                <p className="text-muted text-center">尚無分類，點右上角新增</p>
              ) : (
                tree.map(node => renderNode(node, 0))
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="form-section">
            <h6><i className="bi bi-info-circle" /> 說明</h6>
            <ul className="small text-muted" style={{ lineHeight: 1.8 }}>
              <li>例: <strong>CPU &gt; AMD &gt; AM5</strong>（三層）</li>
              <li>例: <strong>顯示卡 &gt; 華碩</strong>（兩層）</li>
              <li>例: <strong>電源供應器</strong>（單層）</li>
              <li>庫存只能歸在<strong>最末端分類</strong></li>
              <li>有庫存的分類無法刪除</li>
            </ul>
            <h6 className="mt-3"><i className="bi bi-bootstrap-icons" /> 可用圖示</h6>
            <div className="d-flex flex-wrap gap-2 small">
              {ICONS.map(i => (
                <span key={i} className="badge bg-light text-dark" title={i}><i className={`bi bi-${i}`} /> {i}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal show={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>{editId ? '更新' : '新增'}</button>
        </>}>
        <div className="mb-3">
          <label className="form-label">名稱 *</label>
          <input type="text" className="form-control" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例: AMD、AM5、水冷" />
        </div>
        <div className="mb-3">
          <label className="form-label">圖示</label>
          <div className="input-group">
            <span className="input-group-text"><i className={`bi bi-${formIcon || 'folder'}`} /></span>
            <input type="text" className="form-control" value={formIcon} onChange={e => setFormIcon(e.target.value)} placeholder="例: cpu, fan" />
          </div>
        </div>
      </Modal>
    </>
  );
}
