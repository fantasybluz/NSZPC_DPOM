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

  // Drag state: top=插入上方, bottom=插入下方, middle=變成子分類
  const dragItem = useRef<{ id: number; parentId: number | null } | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<'top' | 'middle' | 'bottom' | null>(null);

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
    setModalTitle(`編輯: ${cat.name}`); setModalOpen(true);
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

  // ========== Drag & Drop ==========
  // top/bottom = 插入目標的上方/下方（同層排序）
  // middle = 變成目標的子分類

  // 遞迴檢查是否為某節點的子孫（防止拖到自己的子分類底下造成循環）
  const isDescendant = (nodes: Category[], ancestorId: number, targetId: number): boolean => {
    for (const n of nodes) {
      if (n.id === ancestorId) {
        const check = (children: Category[] | undefined): boolean => {
          if (!children) return false;
          for (const c of children) {
            if (c.id === targetId) return true;
            if (check(c.children)) return true;
          }
          return false;
        };
        return check(n.children);
      }
      if (n.children && isDescendant(n.children, ancestorId, targetId)) return true;
    }
    return false;
  };

  const handleDragStart = (e: React.DragEvent, node: Category) => {
    dragItem.current = { id: node.id, parentId: node.parent_id };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => (e.target as HTMLElement).style.opacity = '0.4', 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragItem.current = null;
    setDragOverId(null);
    setDragPosition(null);
  };

  const handleDragOver = (e: React.DragEvent, node: Category) => {
    if (!dragItem.current) return;
    if (dragItem.current.id === node.id) return;
    // 不能拖到自己的子孫底下
    if (isDescendant(tree, dragItem.current.id, node.id)) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const h = rect.height;
    const y = e.clientY - rect.top;
    // 三區域: 上 25% = top, 中間 50% = middle, 下 25% = bottom
    let pos: 'top' | 'middle' | 'bottom';
    if (y < h * 0.25) pos = 'top';
    else if (y > h * 0.75) pos = 'bottom';
    else pos = 'middle';

    setDragOverId(node.id);
    setDragPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
    setDragPosition(null);
  };

  // 從樹中移除某節點，回傳 [新樹, 被移除的節點]
  const removeFromTree = (nodes: Category[], id: number): [Category[], Category | null] => {
    let removed: Category | null = null;
    const result = nodes.filter(n => {
      if (n.id === id) { removed = n; return false; }
      return true;
    }).map(n => {
      if (removed) return n; // 已經找到了
      if (!n.children) return n;
      const [newChildren, r] = removeFromTree(n.children, id);
      if (r) removed = r;
      return { ...n, children: newChildren.length > 0 ? newChildren : undefined };
    });
    return [result, removed];
  };

  // 在樹中的目標位置插入節點
  const insertIntoTree = (
    nodes: Category[],
    targetId: number,
    movedNode: Category,
    position: 'top' | 'middle' | 'bottom'
  ): Category[] => {
    if (position === 'middle') {
      // 變成目標的子分類
      return nodes.map(n => {
        if (n.id === targetId) {
          const children = n.children ? [...n.children, { ...movedNode, parent_id: n.id, children: movedNode.children }] : [{ ...movedNode, parent_id: n.id, children: movedNode.children }];
          return { ...n, children };
        }
        if (n.children) return { ...n, children: insertIntoTree(n.children, targetId, movedNode, position) };
        return n;
      });
    }

    // top/bottom: 插入同層
    const result: Category[] = [];
    for (const n of nodes) {
      if (n.id === targetId) {
        const inserted = { ...movedNode, parent_id: n.parent_id, children: movedNode.children };
        if (position === 'top') { result.push(inserted); result.push(n); }
        else { result.push(n); result.push(inserted); }
      } else {
        if (n.children) {
          result.push({ ...n, children: insertIntoTree(n.children, targetId, movedNode, position) });
        } else {
          result.push(n);
        }
      }
    }
    return result;
  };

  const handleDrop = async (e: React.DragEvent, targetNode: Category) => {
    e.preventDefault();
    e.stopPropagation();

    const pos = dragPosition;
    setDragOverId(null);
    setDragPosition(null);

    if (!dragItem.current || !pos) return;
    if (dragItem.current.id === targetNode.id) return;
    if (isDescendant(tree, dragItem.current.id, targetNode.id)) return;

    // 1. 從樹中移除被拖的節點
    const [treeWithout, moved] = removeFromTree(tree, dragItem.current.id);
    if (!moved) return;

    // 2. 插入到目標位置
    const newTree = insertIntoTree(treeWithout, targetNode.id, moved, pos);
    setTree(newTree);

    // 3. 展開目標（如果是放到 middle）
    if (pos === 'middle') {
      setCollapsed(prev => {
        const next = new Set(prev);
        next.delete(targetNode.id);
        return next;
      });
    }

    // 4. 儲存到後端
    const items: { id: number; sort_order: number; parent_id: number | null }[] = [];
    const collect = (nodes: Category[], pid: number | null) => {
      nodes.forEach((n, idx) => {
        items.push({ id: n.id, sort_order: idx + 1, parent_id: pid });
        if (n.children) collect(n.children, n.id);
      });
    };
    collect(newTree, null);

    try {
      await api.put('/inventory/categories/reorder', { items });
      showToast(pos === 'middle' ? '已移至子分類' : '排序已更新');
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
        className={`cat-node ${isDragOver && dragPosition === 'top' ? 'drag-over-top' : ''} ${isDragOver && dragPosition === 'bottom' ? 'drag-over-bottom' : ''} ${isDragOver && dragPosition === 'middle' ? 'drag-over-middle' : ''}`}
        draggable
        onDragStart={e => handleDragStart(e, node)}
        onDragEnd={handleDragEnd}
        onDragOver={e => handleDragOver(e, node)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, node)}
      >
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
            <p className="text-muted small mb-3">拖曳 <i className="bi bi-grip-vertical" /> 可排序（同層級），點擊 <i className="bi bi-chevron-down" /> 展開/收合。</p>
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
