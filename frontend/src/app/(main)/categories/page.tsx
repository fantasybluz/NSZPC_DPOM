'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

  // 編輯時可以改上層分類（null = 第一層）
  const [formParent, setFormParent] = useState<number | null>(null);

  // 拖拉只在同一層排序：top = 放到目標上方，bottom = 放到目標下方。
  // 要換上層分類請用「編輯」裡的「上層分類」（原本拖到一列中間會變成子分類，很容易不小心套進去）
  const dragItem = useRef<{ id: number; parentId: number | null } | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<'top' | 'bottom' | null>(null);

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
    setEditId(null); setParentId(null); setFormName(''); setFormIcon('');
    setModalTitle('新增主分類'); setModalOpen(true);
  };

  const openAddSub = (pid: number) => {
    setEditId(null); setParentId(pid); setFormName(''); setFormIcon('');
    setModalTitle('新增子分類'); setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditId(cat.id); setParentId(null); setFormName(cat.name); setFormIcon(cat.icon || '');
    setFormParent(cat.parent_id);
    setModalTitle(`編輯: ${cat.name}`); setModalOpen(true);
  };

  // 「上層分類」可以選的：所有分類，但不能是自己或自己底下的
  const parentOptions = (() => {
    const options: { id: number; label: string }[] = [];
    const walk = (nodes: Category[], depth: number) => {
      for (const n of nodes) {
        if (n.id === editId) continue; // 自己和自己底下的都跳過
        options.push({ id: n.id, label: `${'　'.repeat(depth)}${depth ? '└ ' : ''}${n.name}` });
        if (n.children) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return options;
  })();

  const handleSave = async () => {
    if (!formName.trim()) { showToast('名稱必填', 'warning'); return; }
    try {
      if (editId) {
        await api.put(`/inventory/categories/${editId}`, { name: formName, icon: formIcon, parent_id: formParent });
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

  // ========== Drag & Drop（同層排序） ==========

  /** 同一層的分類（parentId = null 是第一層） */
  const siblingsOf = (nodes: Category[], parentId: number | null): Category[] | null => {
    if (parentId === null) return nodes;
    for (const n of nodes) {
      if (n.id === parentId) return n.children ?? [];
      if (n.children) {
        const found = siblingsOf(n.children, parentId);
        if (found) return found;
      }
    }
    return null;
  };

  /** 把同一層的 children 換成新順序 */
  const replaceSiblings = (nodes: Category[], parentId: number | null, next: Category[]): Category[] => {
    if (parentId === null) return next;
    return nodes.map(n => {
      if (n.id === parentId) return { ...n, children: next };
      if (n.children) return { ...n, children: replaceSiblings(n.children, parentId, next) };
      return n;
    });
  };

  const handleDragStart = (e: React.DragEvent, node: Category) => {
    e.stopPropagation(); // 拖子分類時不要連上層一起拖
    dragItem.current = { id: node.id, parentId: node.parent_id };
    e.dataTransfer.effectAllowed = 'move';
    const el = e.currentTarget as HTMLElement;
    setTimeout(() => (el.style.opacity = '0.4'), 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragItem.current = null;
    setDragOverId(null);
    setDragPosition(null);
  };

  // 只有同一層的分類可以放；位置只看那一列本身（不含展開的子分類），上半 = 放上方、下半 = 放下方
  const handleDragOver = (e: React.DragEvent, node: Category) => {
    const dragged = dragItem.current;
    if (!dragged || dragged.id === node.id || dragged.parentId !== node.parent_id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOverId(node.id);
    setDragPosition(e.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom');
  };

  const handleDragLeave = () => {
    setDragOverId(null);
    setDragPosition(null);
  };

  const handleDrop = async (e: React.DragEvent, targetNode: Category) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = dragPosition;
    const dragged = dragItem.current;
    setDragOverId(null);
    setDragPosition(null);
    if (!dragged || !pos || dragged.id === targetNode.id || dragged.parentId !== targetNode.parent_id) return;

    const siblings = siblingsOf(tree, targetNode.parent_id);
    if (!siblings) return;
    const moved = siblings.find(n => n.id === dragged.id);
    if (!moved) return;
    const without = siblings.filter(n => n.id !== dragged.id);
    const targetIdx = without.findIndex(n => n.id === targetNode.id);
    const next = [...without];
    next.splice(pos === 'top' ? targetIdx : targetIdx + 1, 0, moved);
    if (next.every((n, i) => n.id === siblings[i].id)) return; // 沒動

    setTree(replaceSiblings(tree, targetNode.parent_id, next));
    try {
      // 只送這一層的新順序
      await api.put('/inventory/categories/reorder', {
        items: next.map((n, idx) => ({ id: n.id, sort_order: idx + 1 })),
      });
      showToast('排序已更新');
      loadTree();
    } catch (err: any) {
      showToast(err.message, 'danger');
      loadTree();
    }
  };

  // ========== Render ==========

  const renderNode = (node: Category, depth: number): React.ReactNode => {
    const hasChildren = (node.children?.length || 0) > 0;
    const isCollapsed = collapsed.has(node.id);
    const iconColor = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
    const isDragOver = dragOverId === node.id;

    return (
      <div
        key={node.id}
        className={`cat-node ${isDragOver && dragPosition === 'top' ? 'drag-over-top' : ''} ${isDragOver && dragPosition === 'bottom' ? 'drag-over-bottom' : ''}`}
        draggable
        onDragStart={e => handleDragStart(e, node)}
        onDragEnd={handleDragEnd}
      >
        {/* 放的位置只看這一列（不含底下展開的子分類） */}
        <div className="cat-node-header" style={{ paddingLeft: `calc(12px + ${depth} * var(--cat-indent, 24px))` }}
          onDragOver={e => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, node)}>
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
            <p className="text-muted small mb-3">拖曳 <i className="bi bi-grip-vertical" /> 可排序（只能在同一層），要移到別的分類底下請按 <i className="bi bi-pencil" /> 改「上層分類」。點擊 <i className="bi bi-chevron-down" /> 展開/收合。</p>
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
              <li>拖曳 <i className="bi bi-grip-vertical" /> 排序（僅同層級）</li>
              <li>換上層分類：<i className="bi bi-pencil" /> 編輯 › 上層分類</li>
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
        {editId && (
          <div className="mb-3">
            <label className="form-label">上層分類</label>
            <select className="form-select" value={formParent ?? ''} onChange={e => setFormParent(e.target.value ? Number(e.target.value) : null)}>
              <option value="">（第一層，沒有上層）</option>
              {parentOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <div className="form-text">底下的子分類會一起移過去；已經放了庫存的分類不能當上層。</div>
          </div>
        )}
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
