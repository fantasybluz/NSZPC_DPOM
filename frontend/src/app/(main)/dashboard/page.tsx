'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import * as Fmt from '@/lib/format';
import StatCard from '@/components/ui/StatCard';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const STATUS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  draft: { label: '尚未成交', icon: 'file-earmark', color: '#6b7280' },
  deposit: { label: '已付訂金', icon: 'cash-coin', color: '#f59e0b' },
  pending: { label: '尚未結單', icon: 'hourglass-split', color: '#3b82f6' },
  completed: { label: '已完成', icon: 'check-circle', color: '#10b981' },
  cancelled: { label: '已取消', icon: 'x-circle', color: '#ef4444' },
};

const DELIVERY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  preparing: { label: '備料中', icon: 'box-seam', color: '#8b5cf6' },
  assembling: { label: '組裝中', icon: 'tools', color: '#f59e0b' },
  testing: { label: '測試中', icon: 'speedometer2', color: '#3b82f6' },
  ready: { label: '待出貨', icon: 'truck', color: '#06b6d4' },
  shipped: { label: '已出貨', icon: 'send', color: '#10b981' },
  delivered: { label: '已送達', icon: 'check2-all', color: '#059669' },
};

const CHART_COLORS = ['#4a6cf7', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#6b7280'];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invStats, setInvStats] = useState<any>(null);
  const [quotStats, setQuotStats] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any>(null);
  const [ytSubs, setYtSubs] = useState<number | null>(null);
  const [ytName, setYtName] = useState('');
  const [ytThumb, setYtThumb] = useState('');
  const [igFollowers, setIgFollowers] = useState('');
  const [igUsername, setIgUsername] = useState('');
  const [filter, setFilter] = useState<{ type: string; value: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [inv, quot, mon, ytKey, ytId, igF, igU] = await Promise.all([
          api.get('/inventory/stats'),
          api.get('/quotations/stats/summary').catch(() => []),
          api.get('/quotations/stats/monthly').catch(() => ({ month: '', byStatus: [], byDelivery: [], recent: [], total: {} })),
          api.get('/settings/youtube_api_key').catch(() => ({ value: '' })),
          api.get('/settings/youtube_channel_id').catch(() => ({ value: '' })),
          api.get('/settings/ig_followers').catch(() => ({ value: '' })),
          api.get('/settings/ig_username').catch(() => ({ value: '' })),
        ]);
        setInvStats(inv);
        setQuotStats(Array.isArray(quot) ? quot : []);
        setMonthly(mon);
        setIgFollowers(igF.value || '');
        setIgUsername(igU.value || '');

        // YouTube
        if (ytKey.value && ytId.value) {
          try {
            const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${ytId.value}&key=${ytKey.value}`);
            const data = await res.json();
            if (data.items?.length) {
              setYtSubs(parseInt(data.items[0].statistics.subscriberCount));
              setYtName(data.items[0].snippet.title);
              setYtThumb(data.items[0].snippet.thumbnails?.default?.url || '');
            }
          } catch {}
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  const totalCost = invStats?.summary?.total_cost || 0;
  const totalValue = invStats?.summary?.total_value || 0;
  const expectedProfit = totalValue - totalCost;
  const completedCount = quotStats.find(s => s.status === 'completed')?.count || 0;

  const byCategory = invStats?.byCategory || [];
  const labels = byCategory.map((c: any) => c.category);

  // 當月訂單
  const total = monthly?.total || {};
  const monthLabel = monthly?.month ? `${monthly.month.split('-')[0]} 年 ${parseInt(monthly.month.split('-')[1])} 月` : '';

  // 篩選訂單
  const filteredRecent = filter
    ? (monthly?.recent || []).filter((q: any) =>
      filter.type === 'status' ? q.status === filter.value : q.delivery_status === filter.value)
    : (monthly?.recent || []);

  const toggleFilter = (type: string, value: string) => {
    setFilter(prev => (prev?.type === type && prev?.value === value) ? null : { type, value });
  };

  return (
    <>
      {/* 統計卡片 */}
      <div className="row g-3 mb-4">
        <div className="col-xl col-md-4 col-6">
          <StatCard icon="bi-box-seam" iconBg="rgba(59,130,246,0.1)" iconColor="#3b82f6" label="庫存品項" value={Fmt.currency(invStats?.summary?.total_items || 0)} />
        </div>
        <div className="col-xl col-md-4 col-6">
          <StatCard icon="bi-cash-stack" iconBg="rgba(245,158,11,0.1)" iconColor="#f59e0b" label="庫存成本" value={`$${Fmt.currency(totalCost)}`} />
        </div>
        <div className="col-xl col-md-4 col-6">
          <StatCard icon="bi-graph-up-arrow" iconBg="rgba(16,185,129,0.1)" iconColor="#10b981" label="預計利潤" value={`$${Fmt.currency(expectedProfit)}`} />
        </div>
        <div className="col-xl col-md-4 col-6">
          <StatCard icon="bi-receipt" iconBg="rgba(6,182,212,0.1)" iconColor="#06b6d4" label="已完成訂單" value={completedCount} />
        </div>
        <div className="col-xl col-md-4 col-6" style={{ cursor: 'pointer' }} onClick={() => router.push('/social')}>
          <div className="stat-card p-3">
            <div className="d-flex align-items-center gap-3">
              <div className="stat-icon" style={{ background: 'rgba(255,0,0,0.08)' }}>
                {ytThumb ? <img src={ytThumb} style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} alt="" /> : <i className="bi bi-youtube" style={{ color: '#ff0000' }} />}
              </div>
              <div>
                <div className="stat-value" style={{ color: '#ff0000' }}>{ytSubs !== null ? Fmt.currency(ytSubs) : '--'}</div>
                <div className="stat-label">{ytName || 'YouTube 訂閱'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl col-md-4 col-6" style={{ cursor: 'pointer' }} onClick={() => router.push('/social')}>
          <div className="stat-card p-3">
            <div className="d-flex align-items-center gap-3">
              <div className="stat-icon" style={{ background: 'rgba(228,64,95,0.08)' }}>
                <i className="bi bi-instagram" style={{ color: '#e4405f' }} />
              </div>
              <div>
                <div className="stat-value" style={{ color: '#e4405f' }}>{igFollowers ? Fmt.currency(parseInt(igFollowers)) : '--'}</div>
                <div className="stat-label">{igUsername ? `@${igUsername}` : 'IG 追蹤'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 當月訂單 */}
      {monthly?.month && (
        <div className="chart-container mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="mb-0"><i className="bi bi-calendar3" /> {monthLabel} 訂單狀況</h6>
            <div className="small text-muted">
              共 <strong>{total.count || 0}</strong> 筆 | 營收 <strong>${Fmt.currency(total.revenue || 0)}</strong> | 毛利 <strong className={(total.profit || 0) >= 0 ? 'text-profit' : 'text-loss'}>${Fmt.currency(total.profit || 0)}</strong>
            </div>
          </div>

          <div className="row g-2 mb-3">
            {(monthly.byStatus || []).map((s: any) => {
              const info = STATUS_LABELS[s.status] || { label: s.status, icon: 'circle', color: '#6b7280' };
              const isActive = filter?.type === 'status' && filter?.value === s.status;
              return (
                <div className="col" key={s.status}>
                  <div className="d-flex align-items-center gap-2 p-2 rounded" onClick={() => toggleFilter('status', s.status)}
                    style={{ background: `${info.color}08`, border: `1px solid ${info.color}20`, cursor: 'pointer', outline: isActive ? '2px solid var(--accent)' : 'none', outlineOffset: 1 }}>
                    <i className={`bi bi-${info.icon}`} style={{ color: info.color, fontSize: '1.2rem' }} />
                    <div>
                      <div className="fw-bold" style={{ fontSize: '1.1rem' }}>{s.count}</div>
                      <div className="small" style={{ color: info.color }}>{info.label}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(monthly.byDelivery || []).length > 0 && (
            <div className="mb-3">
              <span className="small text-muted"><strong>訂單類型</strong></span>
              <div className="d-flex flex-wrap gap-2 mt-1">
                {(monthly.byDelivery || []).map((d: any) => {
                  const info = DELIVERY_LABELS[d.delivery_status] || { label: d.delivery_status, icon: 'circle', color: '#6b7280' };
                  const isActive = filter?.type === 'delivery' && filter?.value === d.delivery_status;
                  return (
                    <span key={d.delivery_status} className="badge d-inline-flex align-items-center gap-1 py-2 px-3" onClick={() => toggleFilter('delivery', d.delivery_status)}
                      style={{ background: `${info.color}15`, color: info.color, fontSize: '0.82rem', cursor: 'pointer', outline: isActive ? '2px solid var(--accent)' : 'none' }}>
                      <i className={`bi bi-${info.icon}`} /> {info.label} <strong>{d.count}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {filter && (
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="small text-muted">目前篩選:</span>
              <span className="badge bg-dark">{(filter.type === 'status' ? STATUS_LABELS : DELIVERY_LABELS)[filter.value]?.label || filter.value}</span>
              <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: '0.75rem', padding: '1px 8px' }} onClick={() => setFilter(null)}>清除</button>
            </div>
          )}

          {filteredRecent.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead><tr><th>單號</th><th>日期</th><th>客戶</th><th>狀態</th><th>類型</th><th className="text-end">金額</th></tr></thead>
                <tbody>
                  {filteredRecent.map((q: any) => {
                    const st = STATUS_LABELS[q.status] || { label: q.status, color: '#6b7280' };
                    const dl = q.delivery_status ? (DELIVERY_LABELS[q.delivery_status] || { label: q.delivery_status, color: '#6b7280' }) : null;
                    return (
                      <tr key={q.id}>
                        <td><strong>{q.quotation_no}</strong></td>
                        <td className="small text-muted">{Fmt.date(q.created_at)}</td>
                        <td>{q.customer_name || '-'}</td>
                        <td><span className="badge" style={{ background: `${st.color}15`, color: st.color }}>{st.label}</span></td>
                        <td>{dl ? <span className="badge" style={{ background: `${dl.color}15`, color: dl.color }}>{dl.label}</span> : '-'}</td>
                        <td className="text-end">${Fmt.currency(q.total_price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted small text-center py-2">無符合的訂單</p>
          )}
        </div>
      )}

      {/* 圖表 */}
      {byCategory.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <div className="chart-container">
              <h6 className="mb-3">庫存分類數量</h6>
              <Doughnut data={{
                labels,
                datasets: [{ data: byCategory.map((c: any) => c.total_qty || 0), backgroundColor: CHART_COLORS }]
              }} options={{ responsive: true, plugins: { legend: { position: 'right' } } }} />
            </div>
          </div>
          <div className="col-md-6">
            <div className="chart-container">
              <h6 className="mb-3">庫存成本 vs 售價</h6>
              <Bar data={{
                labels,
                datasets: [
                  { label: '成本', data: byCategory.map((c: any) => c.total_cost || 0), backgroundColor: '#ef444480' },
                  { label: '售價', data: byCategory.map((c: any) => c.total_value || 0), backgroundColor: '#22c55e80' },
                ]
              }} options={{
                responsive: true,
                scales: { y: { beginAtZero: true } },
              }} />
            </div>
          </div>
        </div>
      )}

      {/* 低庫存警示 */}
      {invStats?.lowStock?.length > 0 && (
        <div className="chart-container">
          <h6 className="mb-3 text-danger"><i className="bi bi-exclamation-triangle" /> 低庫存警示</h6>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>分類</th><th>品名</th><th>目前數量</th><th>最低數量</th></tr></thead>
              <tbody>
                {invStats.lowStock.map((i: any) => (
                  <tr key={i.id} className="low-stock">
                    <td><span className="badge bg-light text-dark small">{i.category_path || i.category_name}</span></td>
                    <td>{i.name}</td>
                    <td className="text-danger fw-bold">{i.quantity}</td>
                    <td>{i.min_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
