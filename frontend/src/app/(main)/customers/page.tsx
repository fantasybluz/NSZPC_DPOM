'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import PaginationComp from '@/components/ui/Pagination';
import * as Fmt from '@/lib/format';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const SOURCES = ['YouTube', 'Instagram', 'Line', '門市', '朋友介紹', '其他'];
const CITIES = ['台北市','新北市','基隆市','桃園市','新竹市','新竹縣','苗栗縣','台中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','台南市','高雄市','屏東縣','宜蘭縣','花蓮縣','台東縣','澎湖縣','金門縣','連江縣'];
const CITY_COORDS: Record<string, { x: number; y: number }> = {
  '基隆市': { x: 218, y: 42 }, '台北市': { x: 198, y: 55 }, '新北市': { x: 210, y: 68 },
  '桃園市': { x: 180, y: 82 }, '新竹市': { x: 172, y: 102 }, '新竹縣': { x: 185, y: 98 },
  '苗栗縣': { x: 168, y: 125 }, '台中市': { x: 155, y: 155 }, '彰化縣': { x: 140, y: 178 },
  '南投縣': { x: 170, y: 175 }, '雲林縣': { x: 130, y: 200 }, '嘉義市': { x: 135, y: 218 },
  '嘉義縣': { x: 148, y: 225 }, '台南市': { x: 125, y: 250 }, '高雄市': { x: 145, y: 285 },
  '屏東縣': { x: 162, y: 320 }, '宜蘭縣': { x: 225, y: 85 }, '花蓮縣': { x: 215, y: 165 },
  '台東縣': { x: 195, y: 275 }, '澎湖縣': { x: 68, y: 225 }, '金門縣': { x: 22, y: 175 }, '連江縣': { x: 40, y: 22 },
};
const SOURCE_COLORS: Record<string, string> = { YouTube: '#ff0000', Instagram: '#e4405f', Line: '#00c300', '門市': '#4a6cf7', '朋友介紹': '#f59e0b', '其他': '#6b7280' };

interface Customer { id: number; name: string; phone: string; email: string; source: string; city: string; district: string; address: string; note: string; created_at: string; services?: any[]; quotations?: any[]; }
interface Distribution { byCity: { city: string; count: number }[]; bySource: { source: string; count: number }[]; total: number; }

export default function CustomersPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'list' | 'chart'>('list');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dist, setDist] = useState<Distribution>({ byCity: [], bySource: [], total: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [sourceFilter, setSourceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Form
  const [modalOpen, setModalOpen] = useState(false);
  const [editCust, setEditCust] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', city: '', district: '', address: '', note: '' });

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);

  const loadData = useCallback(async () => {
    let url = '/customers?';
    if (sourceFilter) url += `source=${encodeURIComponent(sourceFilter)}&`;
    if (cityFilter) url += `city=${encodeURIComponent(cityFilter)}&`;
    if (searchText) url += `search=${encodeURIComponent(searchText)}`;
    try {
      const [custs, d] = await Promise.all([api.get<Customer[]>(url), api.get<Distribution>('/customers/stats/distribution')]);
      setCustomers(custs);
      setDist(d);
    } catch (err: any) { showToast(err.message, 'danger'); }
    setLoading(false);
  }, [sourceFilter, cityFilter, searchText, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchText]);

  // Pagination
  const totalPages = Math.ceil(customers.length / pageSize);
  const paginated = customers.slice((page - 1) * pageSize, page * pageSize);

  const openForm = (cust?: Customer) => {
    if (cust) {
      setEditCust(cust);
      setForm({ name: cust.name, phone: cust.phone, email: cust.email, source: cust.source, city: cust.city, district: cust.district, address: cust.address, note: cust.note });
    } else {
      setEditCust(null);
      setForm({ name: '', phone: '', email: '', source: '', city: '', district: '', address: '', note: '' });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('姓名必填', 'warning'); return; }
    try {
      if (editCust) {
        await api.put(`/customers/${editCust.id}`, form);
        showToast('已更新');
      } else {
        await api.post('/customers', form);
        showToast('已新增');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此客戶？')) return;
    try { await api.del(`/customers/${id}`); showToast('已刪除'); loadData(); } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const viewCustomer = async (id: number) => {
    const c = await api.get<Customer>(`/customers/${id}`);
    setDetail(c);
    setDetailOpen(true);
  };

  const addService = async (customerId: number, type: string, desc: string, date: string) => {
    await api.post(`/customers/${customerId}/services`, { service_type: type, description: desc, service_date: date });
    showToast('已新增服務紀錄');
    viewCustomer(customerId);
  };

  const deleteService = async (customerId: number, sid: number) => {
    await api.del(`/customers/${customerId}/services/${sid}`);
    viewCustomer(customerId);
  };

  const sourceIcon = (s: string) => {
    if (s === 'YouTube') return <i className="bi bi-youtube source-youtube" />;
    if (s === 'Instagram') return <i className="bi bi-instagram source-ig" />;
    if (s === 'Line') return <i className="bi bi-chat-fill source-line" />;
    return <i className="bi bi-person source-other" />;
  };

  // Taiwan map SVG
  const maxCount = Math.max(...dist.byCity.map(c => c.count), 1);

  if (loading) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <>
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><a className={`nav-link ${activeTab === 'list' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setActiveTab('list'); }}><i className="bi bi-list-ul" /> 客戶列表</a></li>
        <li className="nav-item"><a className={`nav-link ${activeTab === 'chart' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setActiveTab('chart'); }}><i className="bi bi-bar-chart" /> 地圖/圖表</a></li>
      </ul>

      {activeTab === 'list' && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div className="d-flex gap-2 flex-wrap">
              <select className="form-select form-select-sm" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
                <option value="">全部來源</option>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select className="form-select form-select-sm" value={cityFilter} onChange={e => { setCityFilter(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
                <option value="">全部地區</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="text" className="form-control form-control-sm" placeholder="搜尋..." value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 150 }} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => openForm()}><i className="bi bi-plus-lg" /> 新增客戶</button>
          </div>
          <div className="table-container">
            <div className="table-responsive">
              <table className="table table-hover table-sm">
                <thead><tr><th>姓名</th><th>電話</th><th>來源</th><th>地區</th><th>建立日期</th><th>操作</th></tr></thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted py-4">尚無客戶資料</td></tr>
                  ) : paginated.map(c => (
                    <tr key={c.id}>
                      <td><strong className="cursor-pointer" onClick={() => viewCustomer(c.id)}>{c.name}</strong></td>
                      <td>{c.phone}</td>
                      <td>{sourceIcon(c.source)} {c.source}</td>
                      <td>{c.city}{c.district ? ' ' + c.district : ''}</td>
                      <td className="small">{Fmt.date(c.created_at)}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openForm(c)}><i className="bi bi-pencil" /></button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(c.id)}><i className="bi bi-trash" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationComp page={page} totalPages={totalPages} total={customers.length} pageSize={pageSize}
            onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />
        </>
      )}

      {activeTab === 'chart' && (
        <div className="row g-4">
          <div className="col-lg-7">
            <div className="taiwan-map-container mb-3">
              <h6 className="mb-3"><i className="bi bi-geo-alt" /> 客戶地區分佈</h6>
              <svg viewBox="0 0 280 420" style={{ width: '100%', maxHeight: 380 }}>
                <path d="M 205,30 C 215,28 225,33 228,38 C 232,42 230,48 227,52 L 230,58 C 233,62 235,70 232,78 L 228,85 C 230,92 228,98 225,102 C 222,108 218,110 215,115 L 210,125 C 208,132 205,138 200,145 C 196,152 192,158 190,165 L 188,175 C 187,185 186,195 185,205 L 184,215 C 183,222 180,228 178,235 C 175,245 172,252 168,260 L 162,270 C 158,278 155,285 152,292 C 148,300 145,308 143,315 L 140,325 C 138,332 137,340 140,348 C 142,355 148,360 155,363 L 162,365 C 168,366 175,364 180,360 C 185,355 188,348 190,340 L 192,330 C 194,322 195,314 195,305 C 195,295 194,285 192,278 L 190,268 C 190,260 192,252 195,245 C 198,238 202,232 205,225 L 210,215 C 213,208 215,200 217,192 C 219,182 220,172 220,162 L 220,150 C 220,140 218,130 215,122 C 213,115 212,108 213,100 L 215,90 C 216,82 215,74 212,68 C 210,62 208,55 207,48 L 205,40 Z" fill="#e8edf5" stroke="#c5cdd8" strokeWidth="1.2" />
                <ellipse cx="68" cy="225" rx="15" ry="12" fill="#e8edf5" stroke="#c5cdd8" strokeWidth="1" />
                <ellipse cx="22" cy="175" rx="10" ry="7" fill="#e8edf5" stroke="#c5cdd8" strokeWidth="1" />
                <ellipse cx="40" cy="22" rx="8" ry="5" fill="#e8edf5" stroke="#c5cdd8" strokeWidth="1" />
                {Object.entries(CITY_COORDS).map(([city, coords]) => {
                  const data = dist.byCity.find(c => c.city === city);
                  const count = data?.count || 0;
                  const r = count > 0 ? Math.max(6, Math.min(20, (count / maxCount) * 20)) : 3;
                  const opacity = count > 0 ? 0.4 + (count / maxCount) * 0.6 : 0.2;
                  return (
                    <g key={city}>
                      <circle cx={coords.x} cy={coords.y} r={r} fill={count > 0 ? `rgba(75,85,99,${opacity})` : '#ddd'} stroke="#fff" strokeWidth={count > 0 ? 2 : 1}>
                        <title>{city}: {count} 位客戶</title>
                      </circle>
                      {count > 0 && <text x={coords.x} y={coords.y + r + 12} textAnchor="middle" fontSize="10" fill="#666">{city.replace('市', '').replace('縣', '')}</text>}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="row g-3">
              <div className="col-6">
                <div className="chart-container">
                  <h6 className="mb-2 small">來源分佈</h6>
                  {dist.bySource.length > 0 && (
                    <Doughnut data={{
                      labels: dist.bySource.map(s => s.source),
                      datasets: [{ data: dist.bySource.map(s => s.count), backgroundColor: dist.bySource.map(s => SOURCE_COLORS[s.source] || '#6b7280') }],
                    }} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }} />
                  )}
                </div>
              </div>
              <div className="col-6">
                <div className="chart-container">
                  <h6 className="mb-2 small">地區排名</h6>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {dist.byCity.length > 0 ? dist.byCity.map((c, i) => (
                      <div key={c.city} className={`d-flex justify-content-between align-items-center py-1 ${i < dist.byCity.length - 1 ? 'border-bottom' : ''}`}>
                        <span className="small">{i + 1}. {c.city}</span>
                        <span className="badge bg-primary">{c.count}</span>
                      </div>
                    )) : <p className="text-muted small text-center">尚無資料</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新增/編輯 Modal */}
      <Modal show={modalOpen} onClose={() => setModalOpen(false)} title={editCust ? '編輯客戶' : '新增客戶'} size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>{editCust ? '更新' : '新增'}</button>
        </>}>
        <div className="row g-3">
          <div className="col-md-6"><label className="form-label">姓名 *</label><input type="text" className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="col-md-6"><label className="form-label">電話</label><input type="text" className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div className="col-md-6"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="col-md-6"><label className="form-label">來源</label><select className="form-select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}><option value="">請選擇</option>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label">縣市</label><select className="form-select" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}><option value="">請選擇</option>{CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label">區域</label><input type="text" className="form-control" value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} /></div>
          <div className="col-md-4"><label className="form-label">地址</label><input type="text" className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div className="col-12"><label className="form-label">備註</label><textarea className="form-control" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
        </div>
      </Modal>

      {/* 客戶詳情 Modal */}
      <Modal show={detailOpen} onClose={() => setDetailOpen(false)} title={detail?.name || ''} size="lg"
        footer={<button className="btn btn-secondary" onClick={() => setDetailOpen(false)}>關閉</button>}>
        {detail && (
          <>
            <div className="row mb-3">
              <div className="col-6"><strong>電話:</strong> {detail.phone || '-'}</div>
              <div className="col-6"><strong>Email:</strong> {detail.email || '-'}</div>
              <div className="col-6 mt-2"><strong>來源:</strong> {detail.source || '-'}</div>
              <div className="col-6 mt-2"><strong>地區:</strong> {detail.city} {detail.district}</div>
              <div className="col-12 mt-2"><strong>地址:</strong> {detail.address || '-'}</div>
              {detail.note && <div className="col-12 mt-2"><strong>備註:</strong> {detail.note}</div>}
            </div>

            <h6 className="mt-4">服務紀錄</h6>
            {detail.services?.length ? (
              <table className="table table-sm">
                <thead><tr><th>日期</th><th>類型</th><th>說明</th><th></th></tr></thead>
                <tbody>
                  {detail.services.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.service_date}</td><td>{s.service_type}</td><td>{s.description}</td>
                      <td><button className="btn btn-sm btn-outline-danger" onClick={() => deleteService(detail.id, s.id)}><i className="bi bi-x" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-muted">尚無服務紀錄</p>}

            {detail.quotations?.length ? (
              <>
                <h6 className="mt-3">相關訂單</h6>
                <table className="table table-sm">
                  <thead><tr><th>單號</th><th>狀態</th><th className="text-end">金額</th><th>日期</th></tr></thead>
                  <tbody>
                    {detail.quotations.map((q: any) => (
                      <tr key={q.id}><td>{q.quotation_no}</td><td>{q.status}</td><td className="text-end">${Fmt.currency(q.total_price)}</td><td>{Fmt.date(q.created_at)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </>
        )}
      </Modal>
    </>
  );
}
