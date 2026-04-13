'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import PaginationComp from '@/components/ui/Pagination';
import * as Fmt from '@/lib/format';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

/* ── types ── */
interface ProfitData {
  total: { revenue: number; cost: number; profit: number; count: number };
  data: { period: string; revenue: number; profit: number }[];
  byCustomer: { customer_name: string; profit: number }[];
  byArea: { area: string; profit: number }[];
}

interface Warranty {
  id: number;
  quotation_id?: number;
  customer_id?: number;
  customer_name: string;
  product_name: string;
  serial_number: string;
  ship_date: string;
  warranty_months: number;
  warranty_end: string;
  status: string;
  note: string;
}

interface Repair {
  id: number;
  repair_no: string;
  customer_name: string;
  device_name: string;
  serial_number: string;
  issue: string;
  diagnosis?: string;
  solution?: string;
  cost?: number;
  priority: string;
  status: string;
  received_date: string;
  completed_date?: string;
  note: string;
  logs?: { status: string; description: string; created_at: string }[];
}

interface Notifications {
  lowStock: { name: string; quantity: number; min_quantity: number }[];
  expiringWarranties: { product_name: string; customer_name: string; warranty_end: string }[];
  unpaidSettlements: { supplier_name: string; amount: number }[];
  activeRepairs: { repair_no: string; customer_name: string; status: string }[];
}

type Tab = 'profit' | 'warranty' | 'repair' | 'notify' | 'export';

const STATUS_LABELS: Record<string, string> = {
  active: '有效', expired: '已過期', claimed: '已報修',
};
const STATUS_COLORS: Record<string, string> = {
  active: '#10b981', expired: '#ef4444', claimed: '#f59e0b',
};

const REP_STATUS_LABELS: Record<string, string> = {
  received: '已收件', diagnosing: '檢測中', repairing: '維修中',
  waiting_parts: '等零件', completed: '已完成', returned: '已取件', cancelled: '已取消',
};
const REP_STATUS_COLORS: Record<string, string> = {
  received: '#6b7280', diagnosing: '#3b82f6', repairing: '#f59e0b',
  waiting_parts: '#8b5cf6', completed: '#10b981', returned: '#059669', cancelled: '#ef4444',
};
const PRI_LABELS: Record<string, string> = { low: '低', normal: '一般', high: '急件', urgent: '緊急' };
const PRI_COLORS: Record<string, string> = { low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/* ── helpers ── */
function badge(label: string, color: string) {
  return (
    <span className="badge" style={{ background: `${color}15`, color }}>{label}</span>
  );
}

export default function ReportsPage() {
  const { showToast } = useToast();

  /* tab */
  const [tab, setTab] = useState<Tab>('profit');

  /* profit */
  const [profitPeriod, setProfitPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [profit, setProfit] = useState<ProfitData | null>(null);

  /* warranties */
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [warPage, setWarPage] = useState(1);
  const [warPageSize, setWarPageSize] = useState(15);
  const [warStatus, setWarStatus] = useState('');
  const [warSearch, setWarSearch] = useState('');
  const [showWarModal, setShowWarModal] = useState(false);
  const [warForm, setWarForm] = useState({ product_name: '', serial_number: '', customer_name: '', ship_date: new Date().toISOString().slice(0, 10), warranty_months: 12, note: '' });

  /* repairs */
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [repPage, setRepPage] = useState(1);
  const [repPageSize, setRepPageSize] = useState(15);
  const [repStatus, setRepStatus] = useState('');
  const [repSearch, setRepSearch] = useState('');
  const [showRepModal, setShowRepModal] = useState(false);
  const [repForm, setRepForm] = useState({ customer_name: '', device_name: '', serial_number: '', priority: 'normal', issue: '', note: '' });
  const [showRepView, setShowRepView] = useState(false);
  const [viewRepair, setViewRepair] = useState<Repair | null>(null);
  const [showRepEdit, setShowRepEdit] = useState(false);
  const [editRepair, setEditRepair] = useState<Repair | null>(null);
  const [editRepForm, setEditRepForm] = useState({ status: '', cost: 0, diagnosis: '', solution: '', log_msg: '' });

  /* notifications */
  const [notifs, setNotifs] = useState<Notifications | null>(null);

  /* line notify */
  const [lineToken, setLineToken] = useState('');

  /* ── fetch data ── */
  const fetchProfit = useCallback(async (period: 'monthly' | 'yearly') => {
    try {
      const data = await api.get<ProfitData>(`/reports/profit?period=${period}`);
      setProfit(data);
    } catch { /* ignore */ }
  }, []);

  const fetchWarranties = useCallback(async () => {
    try {
      const data = await api.get<Warranty[]>('/reports/warranties');
      setWarranties(data);
    } catch { /* ignore */ }
  }, []);

  const fetchRepairs = useCallback(async () => {
    try {
      const data = await api.get<Repair[]>('/reports/repairs');
      setRepairs(data);
    } catch { /* ignore */ }
  }, []);

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await api.get<Notifications>('/reports/notifications');
      setNotifs(data);
    } catch { /* ignore */ }
  }, []);

  const fetchLineToken = useCallback(async () => {
    try {
      const r = await api.get<{ value: string }>('/settings/line_notify_token');
      if (r.value) setLineToken(r.value);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchProfit(profitPeriod);
    fetchWarranties();
    fetchRepairs();
    fetchNotifs();
    fetchLineToken();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchProfit(profitPeriod); }, [profitPeriod, fetchProfit]);

  /* ── filtered + paginated warranties ── */
  const filteredWarranties = useMemo(() => {
    let list = warranties;
    if (warStatus) list = list.filter(w => w.status === warStatus);
    if (warSearch) {
      const q = warSearch.toLowerCase();
      list = list.filter(w =>
        w.product_name?.toLowerCase().includes(q) ||
        w.customer_name?.toLowerCase().includes(q) ||
        w.serial_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [warranties, warStatus, warSearch]);

  const warTotalPages = Math.max(1, Math.ceil(filteredWarranties.length / warPageSize));
  const pagedWarranties = filteredWarranties.slice((warPage - 1) * warPageSize, warPage * warPageSize);

  /* ── filtered + paginated repairs ── */
  const filteredRepairs = useMemo(() => {
    let list = repairs;
    if (repStatus) list = list.filter(r => r.status === repStatus);
    if (repSearch) {
      const q = repSearch.toLowerCase();
      list = list.filter(r =>
        r.customer_name?.toLowerCase().includes(q) ||
        r.device_name?.toLowerCase().includes(q) ||
        r.repair_no?.toLowerCase().includes(q) ||
        r.issue?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [repairs, repStatus, repSearch]);

  const repTotalPages = Math.max(1, Math.ceil(filteredRepairs.length / repPageSize));
  const pagedRepairs = filteredRepairs.slice((repPage - 1) * repPageSize, repPage * repPageSize);

  /* ── warranty CRUD ── */
  const handleAddWarranty = async () => {
    if (!warForm.product_name) { showToast('請填寫產品名稱', 'warning'); return; }
    try {
      await api.post('/reports/warranties', warForm);
      showToast('保固已新增');
      setShowWarModal(false);
      fetchWarranties();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleDelWarranty = async (id: number) => {
    if (!confirm('確定刪除此保固紀錄？')) return;
    try {
      await api.del(`/reports/warranties/${id}`);
      showToast('保固已刪除');
      fetchWarranties();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ── repair CRUD ── */
  const handleAddRepair = async () => {
    if (!repForm.issue) { showToast('請填寫問題描述', 'warning'); return; }
    try {
      await api.post('/reports/repairs', repForm);
      showToast('工單已建立');
      setShowRepModal(false);
      fetchRepairs();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleViewRepair = async (id: number) => {
    try {
      const r = await api.get<Repair>(`/reports/repairs/${id}`);
      setViewRepair(r);
      setShowRepView(true);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleOpenEditRepair = async (id: number) => {
    try {
      const r = await api.get<Repair>(`/reports/repairs/${id}`);
      setEditRepair(r);
      setEditRepForm({ status: r.status, cost: r.cost || 0, diagnosis: r.diagnosis || '', solution: r.solution || '', log_msg: '' });
      setShowRepEdit(true);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleUpdateRepair = async () => {
    if (!editRepair) return;
    const payload: any = { ...editRepForm, cost: parseInt(String(editRepForm.cost)) || 0 };
    if (payload.status === 'completed' || payload.status === 'returned') {
      payload.completed_date = new Date().toISOString().slice(0, 10);
    }
    try {
      await api.put(`/reports/repairs/${editRepair.id}`, payload);
      showToast('工單已更新');
      setShowRepEdit(false);
      fetchRepairs();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleDelRepair = async (id: number) => {
    if (!confirm('確定刪除？')) return;
    try {
      await api.del(`/reports/repairs/${id}`);
      showToast('工單已刪除');
      fetchRepairs();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ── line notify ── */
  const handleSaveLineToken = async () => {
    try {
      await api.put('/settings/line_notify_token', { value: lineToken });
      showToast('Token 已儲存');
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleTestLineNotify = async () => {
    try {
      await api.post('/reports/line-notify', { message: '\n星辰電腦 NSZPC 通知測試成功！' });
      showToast('測試通知已發送');
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  /* ── export ── */
  const handleExport = (type: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    window.open(`${API_BASE}/reports/export/${type}?token=${token}`, '_blank');
  };

  /* ── chart data ── */
  const chartData = useMemo(() => {
    if (!profit?.data?.length) return null;
    return {
      labels: profit.data.map(d => d.period),
      datasets: [
        {
          label: '營收',
          data: profit.data.map(d => d.revenue || 0),
          borderColor: '#374151',
          backgroundColor: '#37415120',
          fill: true,
          tension: 0.3,
        },
        {
          label: '利潤',
          data: profit.data.map(d => d.profit || 0),
          borderColor: '#10b981',
          backgroundColor: '#10b98120',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [profit]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v: any) => '$' + Fmt.currency(v) },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: any) => ctx.dataset.label + ': $' + Fmt.currency(ctx.raw),
        },
      },
    },
  }), []);

  const t = profit?.total || { revenue: 0, cost: 0, profit: 0, count: 0 };
  const today = new Date().toISOString().slice(0, 10);

  /* ── render ── */
  return (
    <>
      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <a className={`nav-link ${tab === 'profit' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('profit'); }}>
            <i className="bi bi-graph-up" /> 利潤報表
          </a>
        </li>
        <li className="nav-item">
          <a className={`nav-link ${tab === 'warranty' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('warranty'); }}>
            <i className="bi bi-shield-check" /> 保固管理{' '}
            {(notifs?.expiringWarranties?.length ?? 0) > 0 && (
              <span className="badge bg-warning text-dark">{notifs!.expiringWarranties.length}</span>
            )}
          </a>
        </li>
        <li className="nav-item">
          <a className={`nav-link ${tab === 'repair' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('repair'); }}>
            <i className="bi bi-tools" /> 維修工單{' '}
            {(notifs?.activeRepairs?.length ?? 0) > 0 && (
              <span className="badge bg-danger">{notifs!.activeRepairs.length}</span>
            )}
          </a>
        </li>
        <li className="nav-item">
          <a className={`nav-link ${tab === 'notify' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('notify'); }}>
            <i className="bi bi-bell" /> 通知提醒
          </a>
        </li>
        <li className="nav-item">
          <a className={`nav-link ${tab === 'export' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('export'); }}>
            <i className="bi bi-download" /> 匯出/備份
          </a>
        </li>
      </ul>

      {/* ════ Profit Tab ════ */}
      {tab === 'profit' && (
        <div>
          {/* Period toggle */}
          <div className="d-flex justify-content-end mb-3">
            <div className="btn-group btn-group-sm">
              <button className={`btn ${profitPeriod === 'monthly' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setProfitPeriod('monthly')}>月報</button>
              <button className={`btn ${profitPeriod === 'yearly' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setProfitPeriod('yearly')}>年報</button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="row g-3 mb-4">
            <div className="col-md-3 col-6">
              <div className="card stat-card p-3">
                <div className="stat-value">${Fmt.currency(t.revenue)}</div>
                <div className="stat-label">總營收</div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div className="card stat-card p-3">
                <div className="stat-value">${Fmt.currency(t.cost)}</div>
                <div className="stat-label">總成本</div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div className="card stat-card p-3">
                <div className="stat-value text-profit">${Fmt.currency(t.profit)}</div>
                <div className="stat-label">總利潤</div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div className="card stat-card p-3">
                <div className="stat-value">{t.count}</div>
                <div className="stat-label">完成訂單數</div>
              </div>
            </div>
          </div>

          {/* Chart + top customers */}
          <div className="row g-3 mb-4">
            <div className="col-md-8">
              <div className="chart-container">
                <h6 className="mb-3">{profitPeriod === 'monthly' ? '月度' : '年度'}利潤趨勢</h6>
                {chartData ? <Line data={chartData} options={chartOptions} /> : <p className="text-muted text-center py-5">無資料</p>}
              </div>
            </div>
            <div className="col-md-4">
              <div className="chart-container">
                <h6 className="mb-3">客戶利潤排名</h6>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {(profit?.byCustomer || []).map((c, i) => (
                    <div key={i} className={`d-flex justify-content-between py-1 ${i < (profit?.byCustomer?.length ?? 1) - 1 ? 'border-bottom' : ''}`} style={{ borderColor: 'var(--border-light)' }}>
                      <span className="small">{c.customer_name}</span>
                      <strong className="small text-profit">${Fmt.currency(c.profit)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ Warranty Tab ════ */}
      {tab === 'warranty' && (
        <div>
          <div className="d-flex justify-content-between mb-3">
            <div className="d-flex gap-2">
              <select className="form-select form-select-sm" style={{ width: 'auto' }} value={warStatus} onChange={e => { setWarStatus(e.target.value); setWarPage(1); }}>
                <option value="">全部</option>
                <option value="active">有效</option>
                <option value="expired">已過期</option>
                <option value="claimed">已報修</option>
              </select>
              <input type="text" className="form-control form-control-sm" placeholder="搜尋..." style={{ width: 150 }} value={warSearch} onChange={e => { setWarSearch(e.target.value); setWarPage(1); }} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setWarForm({ product_name: '', serial_number: '', customer_name: '', ship_date: new Date().toISOString().slice(0, 10), warranty_months: 12, note: '' });
              setShowWarModal(true);
            }}>
              <i className="bi bi-plus-lg" /> 新增保固
            </button>
          </div>

          <div className="table-container">
            <div className="table-responsive">
              <table className="table table-sm table-hover">
                <thead>
                  <tr><th>產品</th><th>序號</th><th>客戶</th><th>出貨日</th><th>保固到期</th><th>狀態</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {pagedWarranties.length ? pagedWarranties.map(w => {
                    const isExpired = w.warranty_end && w.warranty_end < today;
                    const stLabel = STATUS_LABELS[w.status] || w.status;
                    const stColor = STATUS_COLORS[w.status] || '#6b7280';
                    return (
                      <tr key={w.id}>
                        <td><strong>{w.product_name}</strong></td>
                        <td className="small">{w.serial_number || '-'}</td>
                        <td>{w.customer_name || '-'}</td>
                        <td className="small">{w.ship_date || '-'}</td>
                        <td className={`small ${isExpired ? 'text-danger fw-bold' : ''}`}>{w.warranty_end || '-'}</td>
                        <td>{badge(stLabel, stColor)}</td>
                        <td>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelWarranty(w.id)}>
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={7} className="text-center text-muted py-3">尚無保固紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationComp
            page={warPage}
            totalPages={warTotalPages}
            total={filteredWarranties.length}
            pageSize={warPageSize}
            onPageChange={setWarPage}
            onPageSizeChange={s => { setWarPageSize(s); setWarPage(1); }}
          />
        </div>
      )}

      {/* ════ Repair Tab ════ */}
      {tab === 'repair' && (
        <div>
          <div className="d-flex justify-content-between mb-3">
            <div className="d-flex gap-2">
              <select className="form-select form-select-sm" style={{ width: 'auto' }} value={repStatus} onChange={e => { setRepStatus(e.target.value); setRepPage(1); }}>
                <option value="">全部</option>
                <option value="received">已收件</option>
                <option value="diagnosing">檢測中</option>
                <option value="repairing">維修中</option>
                <option value="waiting_parts">等零件</option>
                <option value="completed">已完成</option>
                <option value="returned">已取件</option>
              </select>
              <input type="text" className="form-control form-control-sm" placeholder="搜尋..." style={{ width: 150 }} value={repSearch} onChange={e => { setRepSearch(e.target.value); setRepPage(1); }} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setRepForm({ customer_name: '', device_name: '', serial_number: '', priority: 'normal', issue: '', note: '' });
              setShowRepModal(true);
            }}>
              <i className="bi bi-plus-lg" /> 新增工單
            </button>
          </div>

          <div className="table-container">
            <div className="table-responsive">
              <table className="table table-sm table-hover">
                <thead>
                  <tr><th>工單號</th><th>客戶</th><th>設備</th><th>問題</th><th>優先</th><th>狀態</th><th>收件日</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {pagedRepairs.length ? pagedRepairs.map(r => (
                    <tr key={r.id}>
                      <td>
                        <strong className="cursor-pointer text-primary" style={{ cursor: 'pointer' }} onClick={() => handleViewRepair(r.id)}>
                          {r.repair_no}
                        </strong>
                      </td>
                      <td>{r.customer_name || '-'}</td>
                      <td>{r.device_name || '-'}</td>
                      <td className="small" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.issue || '-'}
                      </td>
                      <td>{badge(PRI_LABELS[r.priority] || r.priority, PRI_COLORS[r.priority] || '#6b7280')}</td>
                      <td>{badge(REP_STATUS_LABELS[r.status] || r.status, REP_STATUS_COLORS[r.status] || '#6b7280')}</td>
                      <td className="small">{r.received_date}</td>
                      <td className="text-nowrap">
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => handleOpenEditRepair(r.id)}>
                          <i className="bi bi-pencil" />
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelRepair(r.id)}>
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} className="text-center text-muted py-3">尚無維修工單</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationComp
            page={repPage}
            totalPages={repTotalPages}
            total={filteredRepairs.length}
            pageSize={repPageSize}
            onPageChange={setRepPage}
            onPageSizeChange={s => { setRepPageSize(s); setRepPage(1); }}
          />
        </div>
      )}

      {/* ════ Notification Tab ════ */}
      {tab === 'notify' && (
        <div className="row g-3">
          {notifs?.lowStock?.length ? (
            <div className="col-md-6">
              <div className="form-section">
                <h6 className="text-danger"><i className="bi bi-exclamation-triangle" /> 低庫存 ({notifs.lowStock.length})</h6>
                {notifs.lowStock.map((item, i) => (
                  <div key={i} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: 'var(--border-light)' }}>
                    <span>{item.name}</span>
                    <span className="text-danger">{item.quantity} / {item.min_quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notifs?.expiringWarranties?.length ? (
            <div className="col-md-6">
              <div className="form-section">
                <h6 className="text-warning"><i className="bi bi-shield-exclamation" /> 保固即將到期 ({notifs.expiringWarranties.length})</h6>
                {notifs.expiringWarranties.map((w, i) => (
                  <div key={i} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: 'var(--border-light)' }}>
                    <span>{w.product_name} - {w.customer_name}</span>
                    <span className="text-warning">{w.warranty_end}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notifs?.unpaidSettlements?.length ? (
            <div className="col-md-6">
              <div className="form-section">
                <h6 className="text-danger"><i className="bi bi-wallet" /> 未結款 ({notifs.unpaidSettlements.length})</h6>
                {notifs.unpaidSettlements.map((s, i) => (
                  <div key={i} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: 'var(--border-light)' }}>
                    <span>{s.supplier_name}</span>
                    <span className="fw-bold">${Fmt.currency(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notifs?.activeRepairs?.length ? (
            <div className="col-md-6">
              <div className="form-section">
                <h6><i className="bi bi-tools" /> 進行中維修 ({notifs.activeRepairs.length})</h6>
                {notifs.activeRepairs.map((r, i) => (
                  <div key={i} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: 'var(--border-light)' }}>
                    <span>{r.repair_no} {r.customer_name}</span>
                    <span className="badge bg-light text-dark">{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Line Notify */}
          <div className="col-12">
            <div className="form-section">
              <h6><i className="bi bi-line" /> Line Notify</h6>
              <div className="row g-2">
                <div className="col-md-8">
                  <input type="text" className="form-control form-control-sm" placeholder="Line Notify Token" value={lineToken} onChange={e => setLineToken(e.target.value)} />
                </div>
                <div className="col-md-4">
                  <button className="btn btn-sm btn-primary" onClick={handleSaveLineToken}>儲存 Token</button>
                  <button className="btn btn-sm btn-outline-secondary ms-1" onClick={handleTestLineNotify}>測試</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ Export Tab ════ */}
      {tab === 'export' && (
        <div className="row g-3">
          <div className="col-md-6">
            <div className="form-section">
              <h6><i className="bi bi-file-earmark-spreadsheet" /> 匯出 CSV</h6>
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleExport('inventory')}>
                  <i className="bi bi-box-seam" /> 庫存
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleExport('customers')}>
                  <i className="bi bi-people" /> 客戶
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleExport('quotations')}>
                  <i className="bi bi-receipt" /> 訂單
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleExport('repairs')}>
                  <i className="bi bi-tools" /> 維修
                </button>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-section">
              <h6><i className="bi bi-database" /> 資料備份</h6>
              <button className="btn btn-primary btn-sm" onClick={() => handleExport('../backup')}>
                <i className="bi bi-download" /> 下載備份檔
              </button>
              <p className="text-muted small mt-2">備份為 SQLite 資料庫檔案，還原時覆蓋 data/shop.db 後重啟</p>
            </div>
          </div>
        </div>
      )}

      {/* ════ Modals ════ */}

      {/* Add Warranty Modal */}
      <Modal show={showWarModal} onClose={() => setShowWarModal(false)} title="新增保固" footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowWarModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleAddWarranty}>新增</button>
        </>
      }>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">產品名稱 *</label>
            <input type="text" className="form-control" value={warForm.product_name} onChange={e => setWarForm(f => ({ ...f, product_name: e.target.value }))} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">序號</label>
            <input type="text" className="form-control" value={warForm.serial_number} onChange={e => setWarForm(f => ({ ...f, serial_number: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label">客戶名稱</label>
            <input type="text" className="form-control" value={warForm.customer_name} onChange={e => setWarForm(f => ({ ...f, customer_name: e.target.value }))} />
          </div>
          <div className="col-md-3">
            <label className="form-label">出貨日</label>
            <input type="date" className="form-control" value={warForm.ship_date} onChange={e => setWarForm(f => ({ ...f, ship_date: e.target.value }))} />
          </div>
          <div className="col-md-3">
            <label className="form-label">保固月數</label>
            <input type="number" className="form-control" value={warForm.warranty_months} min={1} onChange={e => setWarForm(f => ({ ...f, warranty_months: parseInt(e.target.value) || 12 }))} />
          </div>
          <div className="col-12">
            <label className="form-label">備註</label>
            <input type="text" className="form-control" value={warForm.note} onChange={e => setWarForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Add Repair Modal */}
      <Modal show={showRepModal} onClose={() => setShowRepModal(false)} title="新增維修工單" footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowRepModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleAddRepair}>建立工單</button>
        </>
      }>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">客戶名稱</label>
            <input type="text" className="form-control" value={repForm.customer_name} onChange={e => setRepForm(f => ({ ...f, customer_name: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label">設備名稱</label>
            <input type="text" className="form-control" value={repForm.device_name} onChange={e => setRepForm(f => ({ ...f, device_name: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label">序號</label>
            <input type="text" className="form-control" value={repForm.serial_number} onChange={e => setRepForm(f => ({ ...f, serial_number: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label">優先度</label>
            <select className="form-select" value={repForm.priority} onChange={e => setRepForm(f => ({ ...f, priority: e.target.value }))}>
              <option value="normal">一般</option>
              <option value="high">急件</option>
              <option value="urgent">緊急</option>
              <option value="low">低</option>
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">問題描述 *</label>
            <textarea className="form-control" rows={3} value={repForm.issue} onChange={e => setRepForm(f => ({ ...f, issue: e.target.value }))} required />
          </div>
          <div className="col-12">
            <label className="form-label">備註</label>
            <input type="text" className="form-control" value={repForm.note} onChange={e => setRepForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* View Repair Modal */}
      <Modal show={showRepView} onClose={() => setShowRepView(false)} title={`維修工單 ${viewRepair?.repair_no || ''}`} footer={
        <button className="btn btn-secondary" onClick={() => setShowRepView(false)}>關閉</button>
      }>
        {viewRepair && (
          <>
            <div className="row mb-3">
              <div className="col-4"><strong>客戶:</strong> {viewRepair.customer_name || '-'}</div>
              <div className="col-4"><strong>設備:</strong> {viewRepair.device_name || '-'}</div>
              <div className="col-4"><strong>序號:</strong> {viewRepair.serial_number || '-'}</div>
            </div>
            <div className="row mb-3">
              <div className="col-12"><strong>問題:</strong> {viewRepair.issue || '-'}</div>
              {viewRepair.diagnosis && <div className="col-12 mt-1"><strong>診斷:</strong> {viewRepair.diagnosis}</div>}
              {viewRepair.solution && <div className="col-12 mt-1"><strong>解決:</strong> {viewRepair.solution}</div>}
              {viewRepair.cost ? <div className="col-12 mt-1"><strong>費用:</strong> ${Fmt.currency(viewRepair.cost)}</div> : null}
            </div>
            <h6>進度紀錄</h6>
            {viewRepair.logs?.length ? viewRepair.logs.map((l, i) => (
              <div key={i} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: 'var(--border-light)' }}>
                <span>
                  <span className="badge bg-light text-dark">{REP_STATUS_LABELS[l.status] || l.status}</span>{' '}
                  {l.description}
                </span>
                <span className="small text-muted">{l.created_at}</span>
              </div>
            )) : <p className="text-muted">無紀錄</p>}
          </>
        )}
      </Modal>

      {/* Edit Repair Modal */}
      <Modal show={showRepEdit} onClose={() => setShowRepEdit(false)} title={`更新工單 ${editRepair?.repair_no || ''}`} footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowRepEdit(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleUpdateRepair}>更新</button>
        </>
      }>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">狀態</label>
            <select className="form-select" value={editRepForm.status} onChange={e => setEditRepForm(f => ({ ...f, status: e.target.value }))}>
              {['received', 'diagnosing', 'repairing', 'waiting_parts', 'completed', 'returned', 'cancelled'].map(s => (
                <option key={s} value={s}>{REP_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">費用</label>
            <input type="number" className="form-control" value={editRepForm.cost} min={0} onChange={e => setEditRepForm(f => ({ ...f, cost: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="col-12">
            <label className="form-label">診斷</label>
            <textarea className="form-control" rows={2} value={editRepForm.diagnosis} onChange={e => setEditRepForm(f => ({ ...f, diagnosis: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="form-label">解決方案</label>
            <textarea className="form-control" rows={2} value={editRepForm.solution} onChange={e => setEditRepForm(f => ({ ...f, solution: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="form-label">進度說明</label>
            <input type="text" className="form-control" placeholder="此次更新說明" value={editRepForm.log_msg} onChange={e => setEditRepForm(f => ({ ...f, log_msg: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </>
  );
}
