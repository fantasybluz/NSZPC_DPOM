'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import PaginationComp from '@/components/ui/Pagination';
import * as Fmt from '@/lib/format';

// ========== Types ==========
interface CatNode {
  id: number;
  name: string;
  icon?: string;
  children?: CatNode[];
}

interface InvItem {
  id: number;
  category_id: number;
  category_name: string;
  category_path?: string;
  name: string;
  brand: string;
  spec: string;
  price: number;
  quantity: number;
  avg_cost: number;
  min_quantity: number;
  note?: string;
}

interface Batch {
  batch_date: string;
  supplier?: string;
  unit_cost: number;
  quantity: number;
  remaining: number;
}

interface LogEntry {
  created_at: string;
  type: 'in' | 'out';
  change_qty: number;
  unit_cost: number;
  reason: string;
}

interface ItemDetail extends InvItem {
  cost_method: string;
  fifo_cost: number;
  batches: Batch[];
  logs: LogEntry[];
}

// ========== Helpers ==========
function getDescendantIds(node: CatNode): number[] {
  const ids = [node.id];
  if (node.children) {
    for (const c of node.children) ids.push(...getDescendantIds(c));
  }
  return ids;
}

function isInPath(node: CatNode, targetId: number): boolean {
  if (node.id === targetId) return true;
  if (node.children) return node.children.some(c => isInPath(c, targetId));
  return false;
}

function findNode(nodes: CatNode[], id: number): CatNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const r = findNode(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

function findPath(nodes: CatNode[], targetId: number, path: string[] = []): string[] | null {
  for (const n of nodes) {
    const cur = [...path, n.name];
    if (n.id === targetId) return cur;
    if (n.children) {
      const r = findPath(n.children, targetId, cur);
      if (r) return r;
    }
  }
  return null;
}

function countItemsInNode(node: CatNode, countMap: Record<number, number>): number {
  if (node.children?.length) {
    return node.children.reduce((s, c) => s + countItemsInNode(c, countMap), 0);
  }
  return countMap[node.id] || 0;
}

// ========== Category Options (recursive) ==========
function CategoryOptions({ nodes, selectedId, depth = 0 }: { nodes: CatNode[]; selectedId: number | null; depth?: number }) {
  return (
    <>
      {nodes.map(node => {
        if (node.children?.length) {
          return (
            <optgroup key={node.id} label={'\u3000'.repeat(depth) + node.name}>
              <CategoryOptions nodes={node.children} selectedId={selectedId} depth={depth + 1} />
            </optgroup>
          );
        }
        return (
          <option key={node.id} value={node.id}>
            {'\u3000'.repeat(depth)}{node.name}
          </option>
        );
      })}
    </>
  );
}

// ========== Main Component ==========
export default function InventoryPage() {
  const { showToast } = useToast();

  // Data
  const [catTree, setCatTree] = useState<CatNode[]>([]);
  const [allItems, setAllItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [formModal, setFormModal] = useState<{ show: boolean; item: InvItem | null }>({ show: false, item: null });
  const [stockInModal, setStockInModal] = useState<{ show: boolean; id: number; name: string }>({ show: false, id: 0, name: '' });
  const [stockOutModal, setStockOutModal] = useState<{ show: boolean; id: number; name: string; qty: number }>({ show: false, id: 0, name: '', qty: 0 });
  const [detailModal, setDetailModal] = useState<{ show: boolean; detail: ItemDetail | null }>({ show: false, detail: null });

  // Form state
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    brand: '',
    spec: '',
    price: '0',
    min_quantity: '0',
    note: '',
    initial_qty: '0',
    initial_cost: '0',
    supplier: '',
  });
  const [stockInData, setStockInData] = useState({ quantity: '1', unit_cost: '', supplier: '', note: '' });
  const [stockOutData, setStockOutData] = useState({ quantity: '1', reason: '出貨' });

  // ===== Load data =====
  const loadData = useCallback(async () => {
    try {
      const [cats, items] = await Promise.all([
        api.get<CatNode[]>('/inventory/categories'),
        api.get<InvItem[]>('/inventory'),
      ]);
      setCatTree(cats);
      setAllItems(items);
      setError('');
    } catch (err: any) {
      setError(err.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ===== Count map =====
  const countMap = useMemo(() => {
    const m: Record<number, number> = {};
    allItems.forEach(i => { m[i.category_id] = (m[i.category_id] || 0) + 1; });
    return m;
  }, [allItems]);

  // ===== Filtered items =====
  const filteredItems = useMemo(() => {
    let items = allItems;

    if (selectedCatId !== null) {
      const node = findNode(catTree, selectedCatId);
      if (node) {
        const ids = getDescendantIds(node);
        items = items.filter(i => ids.includes(i.category_id));
      }
    }

    const s = search.toLowerCase();
    if (s) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(s) ||
        i.brand.toLowerCase().includes(s) ||
        (i.spec || '').toLowerCase().includes(s)
      );
    }

    return items;
  }, [allItems, catTree, selectedCatId, search]);

  // ===== Stats =====
  const stats = useMemo(() => {
    let totalCost = 0, totalValue = 0, totalQty = 0;
    filteredItems.forEach(i => {
      totalCost += Math.round(i.avg_cost || 0) * i.quantity;
      totalValue += i.price * i.quantity;
      totalQty += i.quantity;
    });
    return { totalQty, totalCost, totalValue, totalProfit: totalValue - totalCost };
  }, [filteredItems]);

  // ===== Pagination =====
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ===== Category title =====
  const catTitle = useMemo(() => {
    if (!selectedCatId) return null;
    return findPath(catTree, selectedCatId);
  }, [catTree, selectedCatId]);

  // ===== Handlers =====
  const handleCatClick = useCallback((id: number | null) => {
    setSelectedCatId(id);
    setPage(1);
  }, []);

  const handleSearchInput = useCallback((val: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('確定要刪除此商品？')) return;
    try {
      await api.del(`/inventory/${id}`);
      showToast('已刪除', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [loadData, showToast]);

  // ===== Form modal =====
  const openForm = useCallback((item: InvItem | null = null) => {
    setFormData({
      category_id: String(item?.category_id || selectedCatId || ''),
      name: item?.name || '',
      brand: item?.brand || '',
      spec: item?.spec || '',
      price: String(item?.price || 0),
      min_quantity: String(item?.min_quantity || 0),
      note: item?.note || '',
      initial_qty: '0',
      initial_cost: '0',
      supplier: '',
    });
    setFormModal({ show: true, item });
  }, [selectedCatId]);

  const handleFormSave = useCallback(async () => {
    if (!formData.category_id || !formData.name.trim()) {
      showToast('請填寫必填欄位', 'danger');
      return;
    }
    const payload: any = {
      category_id: parseInt(formData.category_id),
      name: formData.name,
      brand: formData.brand,
      spec: formData.spec,
      price: parseInt(formData.price) || 0,
      min_quantity: parseInt(formData.min_quantity) || 0,
      note: formData.note,
    };
    if (!formModal.item) {
      payload.initial_qty = parseInt(formData.initial_qty) || 0;
      payload.initial_cost = parseInt(formData.initial_cost) || 0;
      payload.supplier = formData.supplier;
    }
    try {
      if (formModal.item) {
        await api.put(`/inventory/${formModal.item.id}`, payload);
        showToast('已更新', 'success');
      } else {
        await api.post('/inventory', payload);
        showToast('已新增', 'success');
      }
      setFormModal({ show: false, item: null });
      await loadData();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [formData, formModal.item, loadData, showToast]);

  // ===== Stock In =====
  const openStockIn = useCallback((id: number, name: string) => {
    setStockInData({ quantity: '1', unit_cost: '', supplier: '', note: '' });
    setStockInModal({ show: true, id, name });
  }, []);

  const handleStockIn = useCallback(async () => {
    const qty = parseInt(stockInData.quantity);
    const cost = parseInt(stockInData.unit_cost);
    if (!qty || qty < 1 || !cost || cost < 1) {
      showToast('請填寫數量和單價', 'danger');
      return;
    }
    try {
      await api.post(`/inventory/${stockInModal.id}/stock-in`, {
        quantity: qty,
        unit_cost: cost,
        supplier: stockInData.supplier,
        note: stockInData.note,
      });
      showToast('進貨完成', 'success');
      setStockInModal({ show: false, id: 0, name: '' });
      await loadData();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [stockInData, stockInModal.id, loadData, showToast]);

  // ===== Stock Out =====
  const openStockOut = useCallback((id: number, name: string, qty: number) => {
    setStockOutData({ quantity: '1', reason: '出貨' });
    setStockOutModal({ show: true, id, name, qty });
  }, []);

  const handleStockOut = useCallback(async () => {
    const qty = parseInt(stockOutData.quantity);
    if (!qty || qty < 1) {
      showToast('請填寫出貨數量', 'danger');
      return;
    }
    try {
      const result = await api.post<{ totalCost: number }>(`/inventory/${stockOutModal.id}/stock-out`, {
        quantity: qty,
        reason: stockOutData.reason,
      });
      showToast(`出貨成功，成本 $${Fmt.currency(result.totalCost)}`, 'success');
      setStockOutModal({ show: false, id: 0, name: '', qty: 0 });
      await loadData();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [stockOutData, stockOutModal.id, loadData, showToast]);

  // ===== Detail =====
  const openDetail = useCallback(async (id: number) => {
    try {
      const detail = await api.get<ItemDetail>(`/inventory/${id}/detail`);
      setDetailModal({ show: true, detail });
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  }, [showToast]);

  // ===== Render helpers =====
  const renderCatBar = () => {
    // Find active parent for sub-category rendering
    const activeParent = catTree.find(n =>
      n.id === selectedCatId || (n.children && isInPath(n, selectedCatId!))
    );

    return (
      <div className="inv-cat-bar mb-3">
        {/* Top-level tabs */}
        <div className="inv-cat-tabs">
          <button
            className={`inv-cat-tab ${selectedCatId === null ? 'active' : ''}`}
            onClick={() => handleCatClick(null)}
          >
            <i className="bi bi-grid-3x3-gap" /> 全部 <span className="inv-cat-count">{allItems.length}</span>
          </button>
          {catTree.map(node => {
            const count = countItemsInNode(node, countMap);
            const isActive = selectedCatId === node.id || (node.children ? isInPath(node, selectedCatId!) : false);
            return (
              <button
                key={node.id}
                className={`inv-cat-tab ${isActive ? 'active' : ''}`}
                onClick={() => handleCatClick(node.id)}
              >
                <i className={`bi bi-${node.icon || 'folder'}`} /> {node.name}{' '}
                <span className="inv-cat-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-category row */}
        {activeParent?.children?.length ? (
          <div className="inv-cat-sub">
            <button
              className={`inv-cat-sub-tab ${selectedCatId === activeParent.id ? 'active' : ''}`}
              onClick={() => handleCatClick(activeParent.id)}
            >
              全部
            </button>
            {activeParent.children.map(child => {
              const cCount = countItemsInNode(child, countMap);
              const hasGrand = (child.children?.length || 0) > 0;
              const isChildActive = selectedCatId === child.id || (hasGrand && isInPath(child, selectedCatId!));
              return (
                <button
                  key={child.id}
                  className={`inv-cat-sub-tab ${isChildActive ? 'active' : ''}`}
                  onClick={() => handleCatClick(child.id)}
                >
                  {child.name} <span className="inv-cat-count">{cCount}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Third level */}
        {(() => {
          if (!activeParent?.children?.length) return null;
          const activeSub = activeParent.children.find(c =>
            c.id === selectedCatId || (c.children && isInPath(c, selectedCatId!))
          );
          if (!activeSub?.children?.length) return null;
          return (
            <div className="inv-cat-sub" style={{ marginTop: 4 }}>
              <button
                className={`inv-cat-sub-tab ${selectedCatId === activeSub.id ? 'active' : ''}`}
                onClick={() => handleCatClick(activeSub.id)}
              >
                全部
              </button>
              {activeSub.children.map(grand => {
                const gCount = countItemsInNode(grand, countMap);
                return (
                  <button
                    key={grand.id}
                    className={`inv-cat-sub-tab ${selectedCatId === grand.id ? 'active' : ''}`}
                    onClick={() => handleCatClick(grand.id)}
                  >
                    {grand.name} <span className="inv-cat-count">{gCount}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  };

  // ===== Loading / Error =====
  if (loading) {
    return (
      <div className="text-center p-5">
        <div className="spinner-border" />
      </div>
    );
  }
  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  // ===== Main render =====
  return (
    <>
      {/* Category bar */}
      {renderCatBar()}

      {/* Toolbar */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0">
            {catTitle ? (
              catTitle.map((p, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-muted"> &rsaquo; </span>}
                  <span>{p}</span>
                </span>
              ))
            ) : (
              <><i className="bi bi-box-seam" /> 全部庫存</>
            )}
          </h6>
          <span className="badge bg-light text-dark">{filteredItems.length} 項</span>
        </div>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="搜尋..."
            style={{ width: 140, maxWidth: 200 }}
            onChange={e => handleSearchInput(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => openForm()}>
            <i className="bi bi-plus-lg" />
            <span className="d-none d-sm-inline"> 新增</span>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="d-flex gap-4 mb-3 small">
        <div className="stat-pill">
          <i className="bi bi-archive" /> 總數量 <strong>{Fmt.currency(stats.totalQty)}</strong>
        </div>
        <div className="stat-pill">
          <i className="bi bi-cash-stack" /> 成本 <strong>${Fmt.currency(stats.totalCost)}</strong>
        </div>
        <div className="stat-pill">
          <i className="bi bi-tag" /> 售價 <strong>${Fmt.currency(stats.totalValue)}</strong>
        </div>
        <div className={`stat-pill ${stats.totalProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
          <i className="bi bi-graph-up-arrow" /> 利潤 <strong>${Fmt.currency(stats.totalProfit)}</strong>
        </div>
      </div>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <div className="table-container p-4 text-center text-muted">此分類尚無庫存</div>
      ) : (
        <>
          <div className="table-container">
            <div className="table-responsive">
              <table className="table table-hover table-sm mb-0">
                <thead>
                  <tr>
                    {!selectedCatId && <th>分類</th>}
                    <th>品名</th>
                    <th>品牌</th>
                    <th>規格</th>
                    <th className="text-end">成本</th>
                    <th className="text-end">售價</th>
                    <th className="text-end">利潤</th>
                    <th className="text-center">數量</th>
                    <th style={{ width: 110 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map(item => {
                    const cost = Math.round(item.avg_cost || 0);
                    const profit = item.price - cost;
                    const profitClass = profit > 0 ? 'text-profit' : profit < 0 ? 'text-loss' : '';
                    const isLow = item.min_quantity > 0 && item.quantity <= item.min_quantity;
                    return (
                      <tr key={item.id} className={isLow ? 'low-stock' : ''}>
                        {!selectedCatId && (
                          <td>
                            <span className="badge bg-light text-dark small">
                              {item.category_path || item.category_name}
                            </span>
                          </td>
                        )}
                        <td>
                          <strong
                            className="cursor-pointer detail-inv"
                            onClick={() => openDetail(item.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            {item.name}
                          </strong>
                        </td>
                        <td>{item.brand}</td>
                        <td className="small text-muted">{item.spec}</td>
                        <td className="text-end">${Fmt.currency(cost)}</td>
                        <td className="text-end">${Fmt.currency(item.price)}</td>
                        <td className={`text-end ${profitClass}`}>${Fmt.currency(profit)}</td>
                        <td className="text-center">
                          {isLow && <i className="bi bi-exclamation-triangle-fill text-danger" />}{' '}
                          {item.quantity}
                        </td>
                        <td className="text-nowrap">
                          <button
                            className="btn btn-sm btn-outline-success"
                            title="進貨"
                            onClick={() => openStockIn(item.id, item.name)}
                          >
                            <i className="bi bi-box-arrow-in-down" />
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-outline-warning"
                            title="出貨"
                            onClick={() => openStockOut(item.id, item.name, item.quantity)}
                          >
                            <i className="bi bi-box-arrow-up" />
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            title="編輯"
                            onClick={() => {
                              const it = allItems.find(i => i.id === item.id);
                              if (it) openForm(it);
                            }}
                          >
                            <i className="bi bi-pencil" />
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-outline-danger"
                            title="刪除"
                            onClick={() => handleDelete(item.id)}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationComp
            page={safePage}
            totalPages={totalPages}
            total={filteredItems.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={s => { setPageSize(s); setPage(1); }}
          />
        </>
      )}

      {/* ===== Add/Edit Modal ===== */}
      <Modal
        show={formModal.show}
        onClose={() => setFormModal({ show: false, item: null })}
        title={formModal.item ? '編輯商品' : '新增商品'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setFormModal({ show: false, item: null })}>
              取消
            </button>
            <button className="btn btn-primary" onClick={handleFormSave}>
              {formModal.item ? '更新' : '新增'}
            </button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">分類 *</label>
            <select
              className="form-select"
              value={formData.category_id}
              onChange={e => setFormData(d => ({ ...d, category_id: e.target.value }))}
              required
            >
              <option value="">-- 選擇分類 --</option>
              <CategoryOptions nodes={catTree} selectedId={formData.category_id ? parseInt(formData.category_id) : null} />
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">品名 *</label>
            <input
              type="text"
              className="form-control"
              value={formData.name}
              onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
              required
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">品牌</label>
            <input
              type="text"
              className="form-control"
              value={formData.brand}
              onChange={e => setFormData(d => ({ ...d, brand: e.target.value }))}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">規格</label>
            <input
              type="text"
              className="form-control"
              value={formData.spec}
              onChange={e => setFormData(d => ({ ...d, spec: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">售價</label>
            <input
              type="number"
              className="form-control"
              value={formData.price}
              min={0}
              onChange={e => setFormData(d => ({ ...d, price: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">最低庫存警示</label>
            <input
              type="number"
              className="form-control"
              value={formData.min_quantity}
              min={0}
              onChange={e => setFormData(d => ({ ...d, min_quantity: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">備註</label>
            <input
              type="text"
              className="form-control"
              value={formData.note}
              onChange={e => setFormData(d => ({ ...d, note: e.target.value }))}
            />
          </div>
          {!formModal.item && (
            <>
              <div className="col-12">
                <hr className="my-1" />
                <h6 className="text-muted small">初始進貨（選填）</h6>
              </div>
              <div className="col-md-4">
                <label className="form-label">進貨數量</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.initial_qty}
                  min={0}
                  onChange={e => setFormData(d => ({ ...d, initial_qty: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">進貨單價</label>
                <input
                  type="number"
                  className="form-control"
                  value={formData.initial_cost}
                  min={0}
                  onChange={e => setFormData(d => ({ ...d, initial_cost: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">進貨來源</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="例: 原價屋"
                  value={formData.supplier}
                  onChange={e => setFormData(d => ({ ...d, supplier: e.target.value }))}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ===== Stock In Modal ===== */}
      <Modal
        show={stockInModal.show}
        onClose={() => setStockInModal({ show: false, id: 0, name: '' })}
        title={`進貨: ${stockInModal.name}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStockInModal({ show: false, id: 0, name: '' })}>
              取消
            </button>
            <button className="btn btn-success" onClick={handleStockIn}>
              <i className="bi bi-box-arrow-in-down" /> 確認進貨
            </button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">數量 *</label>
            <input
              type="number"
              className="form-control"
              value={stockInData.quantity}
              min={1}
              required
              onChange={e => setStockInData(d => ({ ...d, quantity: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">進貨單價 *</label>
            <input
              type="number"
              className="form-control"
              value={stockInData.unit_cost}
              min={1}
              required
              onChange={e => setStockInData(d => ({ ...d, unit_cost: e.target.value }))}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">來源</label>
            <input
              type="text"
              className="form-control"
              placeholder="例: 原價屋"
              value={stockInData.supplier}
              onChange={e => setStockInData(d => ({ ...d, supplier: e.target.value }))}
            />
          </div>
          <div className="col-12">
            <label className="form-label">備註</label>
            <input
              type="text"
              className="form-control"
              value={stockInData.note}
              onChange={e => setStockInData(d => ({ ...d, note: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* ===== Stock Out Modal ===== */}
      <Modal
        show={stockOutModal.show}
        onClose={() => setStockOutModal({ show: false, id: 0, name: '', qty: 0 })}
        title={`出貨: ${stockOutModal.name}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStockOutModal({ show: false, id: 0, name: '', qty: 0 })}>
              取消
            </button>
            <button className="btn btn-warning" onClick={handleStockOut}>
              <i className="bi bi-box-arrow-up" /> 確認出貨
            </button>
          </>
        }
      >
        <p className="text-muted">
          目前庫存: <strong>{stockOutModal.qty}</strong>
        </p>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">出貨數量 *</label>
            <input
              type="number"
              className="form-control"
              value={stockOutData.quantity}
              min={1}
              max={stockOutModal.qty}
              required
              onChange={e => setStockOutData(d => ({ ...d, quantity: e.target.value }))}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">原因</label>
            <input
              type="text"
              className="form-control"
              value={stockOutData.reason}
              onChange={e => setStockOutData(d => ({ ...d, reason: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* ===== Detail Modal ===== */}
      <Modal
        show={detailModal.show}
        onClose={() => setDetailModal({ show: false, detail: null })}
        title={detailModal.detail?.name || ''}
        size="lg"
        footer={
          <button className="btn btn-secondary" onClick={() => setDetailModal({ show: false, detail: null })}>
            關閉
          </button>
        }
      >
        {detailModal.detail && (() => {
          const d = detailModal.detail!;
          const methodLabel = d.cost_method === 'fifo' ? '先進先出 (FIFO)' : '加權平均';
          return (
            <>
              <div className="row mb-3">
                <div className="col-6"><strong>分類:</strong> {d.category_path || d.category_name}</div>
                <div className="col-6"><strong>品牌:</strong> {d.brand || '-'}</div>
                <div className="col-6 mt-1"><strong>規格:</strong> {d.spec || '-'}</div>
                <div className="col-6 mt-1"><strong>成本方法:</strong> {methodLabel}</div>
              </div>
              <div className="row mb-3">
                <div className="col-3"><strong>庫存:</strong> {d.quantity}</div>
                <div className="col-3"><strong>售價:</strong> ${Fmt.currency(d.price)}</div>
                <div className="col-3"><strong>均價:</strong> ${Fmt.currency(Math.round(d.avg_cost))}</div>
                <div className="col-3"><strong>FIFO:</strong> ${Fmt.currency(d.fifo_cost)}</div>
              </div>

              <h6 className="mt-3"><i className="bi bi-stack" /> 進貨批次</h6>
              {d.batches.length ? (
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>來源</th>
                        <th className="text-end">單價</th>
                        <th className="text-center">進貨</th>
                        <th className="text-center">剩餘</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.batches.map((b, i) => (
                        <tr key={i} className={b.remaining === 0 ? 'text-muted' : ''}>
                          <td>{b.batch_date}</td>
                          <td>{b.supplier || '-'}</td>
                          <td className="text-end">${Fmt.currency(b.unit_cost)}</td>
                          <td className="text-center">{b.quantity}</td>
                          <td className="text-center fw-bold">{b.remaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted small">尚無進貨紀錄</p>
              )}

              <h6 className="mt-3"><i className="bi bi-clock-history" /> 異動紀錄</h6>
              {d.logs.length ? (
                <div className="table-responsive" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>類型</th>
                        <th className="text-center">數量</th>
                        <th className="text-end">單價</th>
                        <th>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.logs.map((l, i) => (
                        <tr key={i}>
                          <td className="small">{l.created_at}</td>
                          <td>
                            <span className={`badge ${l.type === 'in' ? 'bg-success' : 'bg-warning'}`}>
                              {l.type === 'in' ? '進貨' : '出貨'}
                            </span>
                          </td>
                          <td className="text-center">
                            {l.change_qty > 0 ? '+' : ''}{l.change_qty}
                          </td>
                          <td className="text-end">${Fmt.currency(l.unit_cost)}</td>
                          <td className="small">{l.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted small">尚無異動紀錄</p>
              )}
            </>
          );
        })()}
      </Modal>
    </>
  );
}
