'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import StatCard from '@/components/ui/StatCard';
import * as Fmt from '@/lib/format';
import {
  Chart as ChartJS,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(BarElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend);

/* ========== Types ========== */
interface Stats {
  weekTotal: number;
  monthTotal: number;
  unpaid: number;
  paid: number;
  bySupplier?: { supplier_name: string; total: number; order_count: number }[];
}

interface Supplier {
  id: number;
  name: string;
  payment_type: string;
  default_tax_type: string;
  contact: string;
  note: string;
}

interface OrderItem {
  product_name: string;
  brand: string;
  spec: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: number;
  supplier_id: number;
  supplier_name: string;
  order_date: string;
  tax_type: string;
  tax_amount: number;
  total_amount: number;
  status: string;
  note: string;
  items?: OrderItem[];
}

interface Settlement {
  id: number;
  supplier_id: number;
  supplier_name: string;
  amount: number;
  tax_type: string;
  tax_amount: number;
  period_start: string;
  period_end: string;
  status: string;
  paid_date: string;
  note: string;
}

/* ========== Labels ========== */
const paymentLabels: Record<string, string> = { weekly: '周結', monthly: '月結', cod: '貨到付款' };
const taxLabels: Record<string, string> = { tax_included: '含稅', tax_excluded: '未稅', tax_free: '免稅' };
const statusLabels: Record<string, string> = { pending: '待確認', confirmed: '已確認', received: '已到貨', cancelled: '已取消' };
const statusColors: Record<string, string> = { pending: '#f59e0b', confirmed: '#3b82f6', received: '#10b981', cancelled: '#ef4444' };
const chartColors = ['#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6'];

/* ========== PO Item Row helper ========== */
interface POItemFormData {
  id: number;
  name: string;
  brand: string;
  spec: string;
  qty: number;
  cost: number;
}

let poItemIdCounter = 0;
function newPOItem(): POItemFormData {
  return { id: poItemIdCounter++, name: '', brand: '', spec: '', qty: 1, cost: 0 };
}

/* ========== Component ========== */
export default function PurchasesPage() {
  const { showToast } = useToast();

  // Data
  const [stats, setStats] = useState<Stats | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [stlStatusFilter, setStlStatusFilter] = useState('');

  // Modals
  const [supplierModal, setSupplierModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', payment_type: 'weekly', default_tax_type: 'tax_included', contact: '', note: '' });

  const [orderModal, setOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), tax_type: 'tax_included', note: '' });
  const [poItems, setPoItems] = useState<POItemFormData[]>([newPOItem()]);

  const [receiveModal, setReceiveModal] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [inventory, setInventory] = useState<{ id: number; name: string; quantity: number }[]>([]);
  const [stockTargets, setStockTargets] = useState<Record<number, string>>({});

  const [viewOrderModal, setViewOrderModal] = useState(false);
  const [viewOrderData, setViewOrderData] = useState<Order | null>(null);

  const [settlementModal, setSettlementModal] = useState(false);
  const [stlForm, setStlForm] = useState({ supplier_id: '', amount: '', tax_type: 'tax_included', period_start: '', period_end: '', note: '' });

  const [viewStlModal, setViewStlModal] = useState(false);
  const [viewStlOrders, setViewStlOrders] = useState<Order[]>([]);
  const [viewStlInfo, setViewStlInfo] = useState({ name: '', start: '', end: '' });

  /* ===== Data Loading ===== */
  const loadAll = useCallback(async () => {
    try {
      const [s, sup, stl] = await Promise.all([
        api.get<Stats>('/purchases/stats'),
        api.get<Supplier[]>('/purchases/suppliers'),
        api.get<Settlement[]>('/purchases/settlements'),
      ]);
      setStats(s);
      setSuppliers(sup);
      setSettlements(stl);
      const ord = await api.get<Order[]>('/purchases/orders');
      setOrders(ord);
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadSettlements = useCallback(async (status?: string) => {
    const url = status ? `/purchases/settlements?status=${status}` : '/purchases/settlements';
    try {
      const data = await api.get<Settlement[]>(url);
      setSettlements(data);
    } catch {}
  }, []);

  useEffect(() => { loadSettlements(stlStatusFilter || undefined); }, [stlStatusFilter, loadSettlements]);

  /* ===== Supplier CRUD ===== */
  const openSupplierForm = (s?: Supplier) => {
    if (s) {
      setEditSupplier(s);
      setSupplierForm({ name: s.name, payment_type: s.payment_type, default_tax_type: s.default_tax_type || 'tax_included', contact: s.contact || '', note: s.note || '' });
    } else {
      setEditSupplier(null);
      setSupplierForm({ name: '', payment_type: 'weekly', default_tax_type: 'tax_included', contact: '', note: '' });
    }
    setSupplierModal(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) { showToast('請輸入盤商名稱', 'warning'); return; }
    try {
      if (editSupplier) {
        await api.put(`/purchases/suppliers/${editSupplier.id}`, supplierForm);
        showToast('已更新');
      } else {
        await api.post('/purchases/suppliers', supplierForm);
        showToast('已新增');
      }
      setSupplierModal(false);
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const deleteSupplier = async (id: number) => {
    if (!confirm('確定刪除？')) return;
    try {
      await api.del(`/purchases/suppliers/${id}`);
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ===== Order CRUD ===== */
  const openOrderForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    const firstSup = suppliers[0];
    setOrderForm({
      supplier_id: firstSup ? String(firstSup.id) : '',
      order_date: today,
      tax_type: firstSup?.default_tax_type || 'tax_included',
      note: '',
    });
    setPoItems([newPOItem()]);
    setOrderModal(true);
  };

  const handleSupplierChangeInOrder = (supplierId: string) => {
    const sup = suppliers.find(s => s.id === Number(supplierId));
    setOrderForm(prev => ({
      ...prev,
      supplier_id: supplierId,
      tax_type: sup?.default_tax_type || prev.tax_type,
    }));
  };

  const updatePOItem = (id: number, field: keyof POItemFormData, value: string | number) => {
    setPoItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removePOItem = (id: number) => {
    setPoItems(prev => prev.length > 1 ? prev.filter(item => item.id !== id) : prev);
  };

  const calcPOTotal = () => {
    return poItems.reduce((sum, item) => sum + (item.qty * item.cost), 0);
  };

  const calcTaxAmount = (total: number, taxType: string) => {
    if (taxType === 'tax_included') return Math.round(total - total / 1.05);
    return 0;
  };

  const saveOrder = async () => {
    if (!orderForm.supplier_id) { showToast('請選擇盤商', 'warning'); return; }
    const items = poItems
      .filter(i => i.name.trim())
      .map(i => ({ product_name: i.name, brand: i.brand, spec: i.spec, quantity: i.qty || 1, unit_price: i.cost || 0 }));
    if (!items.length) { showToast('請至少新增一項商品', 'warning'); return; }
    try {
      await api.post('/purchases/orders', {
        supplier_id: parseInt(orderForm.supplier_id),
        order_date: orderForm.order_date,
        tax_type: orderForm.tax_type,
        note: orderForm.note,
        items,
      });
      setOrderModal(false);
      showToast('進貨已建立');
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const deleteOrder = async (id: number) => {
    if (!confirm('確定刪除？')) return;
    try {
      await api.del(`/purchases/orders/${id}`);
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ===== View Order ===== */
  const viewOrder = async (id: number) => {
    try {
      const o = await api.get<Order>(`/purchases/orders/${id}`);
      setViewOrderData(o);
      setViewOrderModal(true);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ===== Receive Order ===== */
  const openReceiveForm = async (orderId: number) => {
    try {
      const [order, inv] = await Promise.all([
        api.get<Order>(`/purchases/orders/${orderId}`),
        api.get<{ id: number; name: string; quantity: number }[]>('/inventory'),
      ]);
      setReceiveOrder(order);
      setInventory(inv);
      setStockTargets({});
      setReceiveModal(true);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const confirmReceive = async () => {
    if (!receiveOrder) return;
    const stockItems: { inventory_id: number; quantity: number; unit_cost: number }[] = [];
    (receiveOrder.items || []).forEach((item, idx) => {
      const invId = parseInt(stockTargets[idx] || '');
      if (invId) stockItems.push({ inventory_id: invId, quantity: item.quantity, unit_cost: item.unit_price });
    });
    try {
      await api.post(`/purchases/orders/${receiveOrder.id}/receive`, { stock_items: stockItems });
      setReceiveModal(false);
      showToast(`已確認到貨${stockItems.length ? `，${stockItems.length} 項已入庫` : ''}`);
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ===== Settlement CRUD ===== */
  const openSettlementForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    const firstSup = suppliers[0];
    setStlForm({
      supplier_id: firstSup ? String(firstSup.id) : '',
      amount: '',
      tax_type: firstSup?.default_tax_type || 'tax_included',
      period_start: monthStart,
      period_end: today,
      note: '',
    });
    setSettlementModal(true);
  };

  const handleSupplierChangeInStl = (supplierId: string) => {
    const sup = suppliers.find(s => s.id === Number(supplierId));
    setStlForm(prev => ({
      ...prev,
      supplier_id: supplierId,
      tax_type: sup?.default_tax_type || prev.tax_type,
    }));
  };

  const saveSettlement = async () => {
    if (!stlForm.supplier_id || !stlForm.amount) { showToast('請填寫盤商與金額', 'warning'); return; }
    try {
      await api.post('/purchases/settlements', {
        supplier_id: parseInt(stlForm.supplier_id),
        amount: parseInt(stlForm.amount),
        tax_type: stlForm.tax_type,
        period_start: stlForm.period_start,
        period_end: stlForm.period_end,
        note: stlForm.note,
      });
      setSettlementModal(false);
      showToast('結款紀錄已建立');
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const markPaid = async (id: number) => {
    try {
      await api.put(`/purchases/settlements/${id}`, { status: 'paid', paid_date: new Date().toISOString().slice(0, 10) });
      showToast('已標記結款');
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const deleteSettlement = async (id: number) => {
    if (!confirm('確定刪除？')) return;
    try {
      await api.del(`/purchases/settlements/${id}`);
      loadAll();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ===== View Settlement Detail ===== */
  const viewSettlement = async (supplierId: number, start: string, end: string) => {
    try {
      const allOrders = await api.get<Order[]>(`/purchases/orders?supplier_id=${supplierId}`);
      const filtered = allOrders.filter(o => {
        if (start && o.order_date < start) return false;
        if (end && o.order_date > end) return false;
        return true;
      });
      const supplier = suppliers.find(s => s.id === supplierId);
      setViewStlOrders(filtered);
      setViewStlInfo({ name: supplier?.name || '', start, end });
      setViewStlModal(true);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ===== Charts ===== */
  const bySupplier = stats?.bySupplier || [];
  const barData = {
    labels: bySupplier.map(s => s.supplier_name),
    datasets: [{
      label: '進貨金額',
      data: bySupplier.map(s => s.total),
      backgroundColor: chartColors.map(c => c + '80'),
    }],
  };
  const barOptions = {
    responsive: true,
    indexAxis: 'y' as const,
    scales: {
      x: { beginAtZero: true, ticks: { callback: (v: any) => '$' + Fmt.currency(v) } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => '$' + Fmt.currency(ctx.raw) } },
    },
  };
  const doughnutData = {
    labels: bySupplier.map(s => s.supplier_name),
    datasets: [{
      data: bySupplier.map(s => s.total),
      backgroundColor: chartColors,
    }],
  };
  const doughnutOptions = {
    responsive: true,
    plugins: { legend: { position: 'right' as const } },
  };

  /* ===== PO Totals ===== */
  const poGrandTotal = calcPOTotal();
  const poTaxAmount = calcTaxAmount(poGrandTotal, orderForm.tax_type);

  if (loading) {
    return <div className="text-center p-5"><div className="spinner-border" /></div>;
  }

  return (
    <>
      {/* ===== Stat Cards ===== */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <StatCard icon="bi-calendar-week" iconBg="rgba(107,114,128,0.08)" iconColor="var(--accent)" label="本週進貨" value={`$${Fmt.currency(stats?.weekTotal)}`} />
        </div>
        <div className="col-md-3 col-6">
          <StatCard icon="bi-calendar-month" iconBg="rgba(107,114,128,0.08)" iconColor="var(--accent)" label="本月進貨" value={`$${Fmt.currency(stats?.monthTotal)}`} />
        </div>
        <div className="col-md-3 col-6">
          <StatCard icon="bi-exclamation-circle" iconBg="rgba(239,68,68,0.08)" iconColor="var(--danger)" label="尚未結款" value={`$${Fmt.currency(stats?.unpaid)}`} />
        </div>
        <div className="col-md-3 col-6">
          <StatCard icon="bi-check-circle" iconBg="rgba(16,185,129,0.08)" iconColor="var(--success)" label="已結款" value={`$${Fmt.currency(stats?.paid)}`} />
        </div>
      </div>

      {/* ===== Charts ===== */}
      {bySupplier.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <div className="chart-container">
              <h6 className="mb-3">本月各盤商進貨金額</h6>
              <Bar data={barData} options={barOptions} height={220} />
            </div>
          </div>
          <div className="col-md-6">
            <div className="chart-container">
              <h6 className="mb-3">本月各盤商進貨比例</h6>
              <Doughnut data={doughnutData} options={doughnutOptions} height={220} />
            </div>
          </div>
        </div>
      )}

      <div className="row g-4">
        {/* ===== Left: Suppliers + Orders ===== */}
        <div className="col-lg-7">

          {/* Supplier Management */}
          <div className="form-section">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0"><i className="bi bi-building" /> 盤商管理</h6>
              <button className="btn btn-primary btn-sm" onClick={() => openSupplierForm()}>
                <i className="bi bi-plus-lg" /> 新增盤商
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr><th>盤商</th><th>結款方式</th><th>聯絡</th><th>本月進貨</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {suppliers.length ? suppliers.map(s => {
                    const monthData = bySupplier.find(b => b.supplier_name === s.name);
                    return (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td><span className="badge bg-light text-dark">{paymentLabels[s.payment_type] || s.payment_type}</span></td>
                        <td className="small text-muted">{s.contact || '-'}</td>
                        <td className="text-end">
                          ${Fmt.currency(monthData?.total || 0)}{' '}
                          <span className="text-muted small">({monthData?.order_count || 0}筆)</span>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openSupplierForm(s)}>
                            <i className="bi bi-pencil" />
                          </button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deleteSupplier(s.id)}>
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={5} className="text-center text-muted py-3">尚無盤商</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Purchase Orders */}
          <div className="form-section">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0"><i className="bi bi-cart3" /> 進貨紀錄</h6>
              <button className="btn btn-primary btn-sm" onClick={openOrderForm}>
                <i className="bi bi-plus-lg" /> 新增進貨
              </button>
            </div>
            {orders.length === 0 ? (
              <p className="text-muted text-center">尚無進貨紀錄</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead>
                    <tr><th>日期</th><th>盤商</th><th>稅別</th><th className="text-end">金額</th><th>狀態</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td className="small">{o.order_date}</td>
                        <td>{o.supplier_name}</td>
                        <td><span className="badge bg-light text-dark small">{taxLabels[o.tax_type] || '含稅'}</span></td>
                        <td className="text-end fw-bold">
                          ${Fmt.currency(o.total_amount)}
                          {o.tax_amount ? <div className="small text-muted">稅 ${Fmt.currency(o.tax_amount)}</div> : null}
                        </td>
                        <td>
                          <span className="badge" style={{
                            background: (statusColors[o.status] || '#6b7280') + '20',
                            color: statusColors[o.status] || '#6b7280',
                          }}>
                            {statusLabels[o.status] || o.status}
                          </span>
                        </td>
                        <td className="text-nowrap">
                          {o.status === 'pending' && (
                            <button className="btn btn-sm btn-outline-success me-1" title="確認到貨入庫" onClick={() => openReceiveForm(o.id)}>
                              <i className="bi bi-check-lg" />
                            </button>
                          )}
                          <button className="btn btn-sm btn-outline-secondary me-1" title="檢視" onClick={() => viewOrder(o.id)}>
                            <i className="bi bi-eye" />
                          </button>
                          <button className="btn btn-sm btn-outline-danger" title="刪除" onClick={() => deleteOrder(o.id)}>
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ===== Right: Settlements ===== */}
        <div className="col-lg-5">
          <div className="form-section">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0"><i className="bi bi-wallet2" /> 結款紀錄</h6>
              <button className="btn btn-primary btn-sm" onClick={openSettlementForm}>
                <i className="bi bi-plus-lg" /> 新增結款
              </button>
            </div>
            <div className="d-flex gap-2 mb-3">
              <select className="form-select form-select-sm" style={{ width: 'auto' }} value={stlStatusFilter} onChange={e => setStlStatusFilter(e.target.value)}>
                <option value="">全部</option>
                <option value="unpaid">尚未結款</option>
                <option value="paid">已結款</option>
              </select>
            </div>
            {settlements.length === 0 ? (
              <p className="text-muted text-center">尚無結款紀錄</p>
            ) : (
              settlements.map(s => (
                <div key={s.id} className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ borderColor: 'var(--border-light)' }}>
                  <div>
                    <strong
                      className="cursor-pointer"
                      onClick={() => viewSettlement(s.supplier_id, s.period_start, s.period_end)}
                    >
                      {s.supplier_name}
                    </strong>
                    <span className="badge bg-light text-dark small ms-1">{taxLabels[s.tax_type] || '含稅'}</span>
                    <div className="small text-muted">
                      {s.period_start || ''} ~ {s.period_end || ''}
                      {s.tax_amount ? ` (稅 $${Fmt.currency(s.tax_amount)})` : ''}
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <strong>${Fmt.currency(s.amount)}</strong>
                    {s.status === 'unpaid' ? (
                      <button className="btn btn-sm btn-outline-success" title="標記已結款" onClick={() => markPaid(s.id)}>
                        <i className="bi bi-check-lg" />
                      </button>
                    ) : (
                      <span className="badge bg-light text-success">已結</span>
                    )}
                    <button className="btn btn-sm btn-outline-danger" onClick={() => deleteSettlement(s.id)}>
                      <i className="bi bi-x" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ===== Supplier Modal ===== */}
      <Modal show={supplierModal} onClose={() => setSupplierModal(false)} title={editSupplier ? '編輯盤商' : '新增盤商'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setSupplierModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={saveSupplier}>{editSupplier ? '更新' : '新增'}</button>
        </>}
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">名稱 *</label>
            <input type="text" className="form-control" value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">結款方式</label>
            <select className="form-select" value={supplierForm.payment_type} onChange={e => setSupplierForm(f => ({ ...f, payment_type: e.target.value }))}>
              <option value="weekly">周結</option>
              <option value="monthly">月結</option>
              <option value="cod">貨到付款</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">預設稅別</label>
            <select className="form-select" value={supplierForm.default_tax_type} onChange={e => setSupplierForm(f => ({ ...f, default_tax_type: e.target.value }))}>
              <option value="tax_included">含稅</option>
              <option value="tax_excluded">未稅</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">聯絡方式</label>
            <input type="text" className="form-control" value={supplierForm.contact} onChange={e => setSupplierForm(f => ({ ...f, contact: e.target.value }))} />
          </div>
          <div className="col-md-3">
            <label className="form-label">備註</label>
            <input type="text" className="form-control" value={supplierForm.note} onChange={e => setSupplierForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* ===== Order Modal ===== */}
      <Modal show={orderModal} onClose={() => setOrderModal(false)} title="新增進貨" size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setOrderModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={saveOrder}>建立進貨</button>
        </>}
      >
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">盤商 *</label>
            <select className="form-select" value={orderForm.supplier_id} onChange={e => handleSupplierChangeInOrder(e.target.value)}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">進貨日期</label>
            <input type="date" className="form-control" value={orderForm.order_date} onChange={e => setOrderForm(f => ({ ...f, order_date: e.target.value }))} />
          </div>
          <div className="col-md-4">
            <label className="form-label">稅別</label>
            <select className="form-select" value={orderForm.tax_type} onChange={e => setOrderForm(f => ({ ...f, tax_type: e.target.value }))}>
              <option value="tax_included">含稅</option>
              <option value="tax_excluded">未稅</option>
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">備註</label>
            <input type="text" className="form-control" value={orderForm.note} onChange={e => setOrderForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </div>

        <h6 className="mt-3">
          進貨明細{' '}
          <button type="button" className="btn btn-sm btn-outline-primary ms-2" onClick={() => setPoItems(prev => [...prev, newPOItem()])}>
            <i className="bi bi-plus" />
          </button>
        </h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr><th>品名</th><th>品牌</th><th>規格</th><th>數量</th><th>成本</th><th>小計</th><th></th></tr>
            </thead>
            <tbody>
              {poItems.map(item => (
                <tr key={item.id}>
                  <td><input type="text" className="form-control form-control-sm" placeholder="品名" value={item.name} onChange={e => updatePOItem(item.id, 'name', e.target.value)} /></td>
                  <td><input type="text" className="form-control form-control-sm" placeholder="品牌" value={item.brand} onChange={e => updatePOItem(item.id, 'brand', e.target.value)} /></td>
                  <td><input type="text" className="form-control form-control-sm" placeholder="規格" value={item.spec} onChange={e => updatePOItem(item.id, 'spec', e.target.value)} /></td>
                  <td><input type="number" className="form-control form-control-sm" value={item.qty} min={1} style={{ width: 60 }} onChange={e => updatePOItem(item.id, 'qty', parseInt(e.target.value) || 0)} /></td>
                  <td><input type="number" className="form-control form-control-sm" value={item.cost} min={0} style={{ width: 90 }} onChange={e => updatePOItem(item.id, 'cost', parseInt(e.target.value) || 0)} /></td>
                  <td className="text-end fw-bold" style={{ minWidth: 80 }}>${Fmt.currency(item.qty * item.cost)}</td>
                  <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removePOItem(item.id)}><i className="bi bi-x" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-end fw-bold">合計</td>
                <td className="text-end fw-bold" style={{ fontSize: '1.05rem' }}>${Fmt.currency(poGrandTotal)}</td>
                <td></td>
              </tr>
              {poTaxAmount > 0 && (
                <tr>
                  <td colSpan={5} className="text-end text-muted small">其中含稅額 (5%)</td>
                  <td className="text-end text-muted">${Fmt.currency(poTaxAmount)}</td>
                  <td></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </Modal>

      {/* ===== Receive Order Modal ===== */}
      <Modal show={receiveModal} onClose={() => setReceiveModal(false)} title={`確認到貨 — ${receiveOrder?.supplier_name || ''}`} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setReceiveModal(false)}>取消</button>
          <button className="btn btn-success" onClick={confirmReceive}><i className="bi bi-check-lg" /> 確認到貨</button>
        </>}
      >
        <p className="text-muted small">選擇「入庫商品」可直接將到貨數量加入庫存。不選擇則僅標記到貨。</p>
        <table className="table table-sm">
          <thead>
            <tr><th>品名</th><th>品牌</th><th>規格</th><th>數量</th><th>成本</th><th>入庫至</th></tr>
          </thead>
          <tbody>
            {(receiveOrder?.items || []).map((item, idx) => (
              <tr key={idx}>
                <td>{item.product_name}</td>
                <td className="small">{item.brand || ''}</td>
                <td className="small text-muted">{item.spec || ''}</td>
                <td>{item.quantity}</td>
                <td>${Fmt.currency(item.unit_price)}</td>
                <td>
                  <select className="form-select form-select-sm" value={stockTargets[idx] || ''} onChange={e => setStockTargets(prev => ({ ...prev, [idx]: e.target.value }))}>
                    <option value="">不入庫（客戶訂單）</option>
                    {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name} (庫存:{inv.quantity})</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      {/* ===== View Order Modal ===== */}
      <Modal show={viewOrderModal} onClose={() => setViewOrderModal(false)} title={`進貨單 #${viewOrderData?.id || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setViewOrderModal(false)}>關閉</button>}
      >
        {viewOrderData && (
          <>
            <div className="row mb-3">
              <div className="col-4"><strong>盤商:</strong> {viewOrderData.supplier_name}</div>
              <div className="col-4"><strong>日期:</strong> {viewOrderData.order_date}</div>
              <div className="col-4"><strong>金額:</strong> ${Fmt.currency(viewOrderData.total_amount)}</div>
            </div>
            {viewOrderData.note && <p className="text-muted small">備註: {viewOrderData.note}</p>}
            <table className="table table-sm">
              <thead>
                <tr><th>品名</th><th>品牌</th><th>規格</th><th className="text-center">數量</th><th className="text-end">成本</th><th className="text-end">小計</th></tr>
              </thead>
              <tbody>
                {(viewOrderData.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.product_name}</td>
                    <td className="small">{item.brand || ''}</td>
                    <td className="small text-muted">{item.spec || ''}</td>
                    <td className="text-center">{item.quantity}</td>
                    <td className="text-end">${Fmt.currency(item.unit_price)}</td>
                    <td className="text-end">${Fmt.currency(item.unit_price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>

      {/* ===== Settlement Modal ===== */}
      <Modal show={settlementModal} onClose={() => setSettlementModal(false)} title="新增結款"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setSettlementModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={saveSettlement}>建立</button>
        </>}
      >
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">盤商 *</label>
            <select className="form-select" value={stlForm.supplier_id} onChange={e => handleSupplierChangeInStl(e.target.value)}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">金額 *</label>
            <input type="number" className="form-control" value={stlForm.amount} min={0} onChange={e => setStlForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="col-md-4">
            <label className="form-label">稅別</label>
            <select className="form-select" value={stlForm.tax_type} onChange={e => setStlForm(f => ({ ...f, tax_type: e.target.value }))}>
              <option value="tax_included">含稅</option>
              <option value="tax_excluded">未稅</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">期間起</label>
            <input type="date" className="form-control" value={stlForm.period_start} onChange={e => setStlForm(f => ({ ...f, period_start: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label">期間迄</label>
            <input type="date" className="form-control" value={stlForm.period_end} onChange={e => setStlForm(f => ({ ...f, period_end: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="form-label">備註</label>
            <input type="text" className="form-control" value={stlForm.note} onChange={e => setStlForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* ===== View Settlement Detail Modal ===== */}
      <Modal show={viewStlModal} onClose={() => setViewStlModal(false)} title={`結款明細 — ${viewStlInfo.name}`}
        footer={<button className="btn btn-secondary" onClick={() => setViewStlModal(false)}>關閉</button>}
      >
        {(() => {
          const total = viewStlOrders.reduce((sum, o) => sum + o.total_amount, 0);
          return (
            <>
              <p className="text-muted small">
                期間: {viewStlInfo.start || '-'} ~ {viewStlInfo.end || '-'} | 共 {viewStlOrders.length} 筆 | 合計 <strong>${Fmt.currency(total)}</strong>
              </p>
              {viewStlOrders.length ? (
                <div className="table-responsive">
                  <table className="table table-sm table-hover">
                    <thead><tr><th>日期</th><th>狀態</th><th className="text-end">金額</th></tr></thead>
                    <tbody>
                      {viewStlOrders.map(o => (
                        <tr key={o.id}>
                          <td>{o.order_date}</td>
                          <td>{statusLabels[o.status] || o.status}</td>
                          <td className="text-end fw-bold">${Fmt.currency(o.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted text-center">此期間無進貨紀錄</p>
              )}
            </>
          );
        })()}
      </Modal>
    </>
  );
}
