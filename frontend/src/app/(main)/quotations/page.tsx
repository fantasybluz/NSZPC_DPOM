'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import PaginationComp from '@/components/ui/Pagination';
import * as Fmt from '@/lib/format';

// ===== Constants =====

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft:     { label: '尚未成交', badge: 'badge-draft' },
  deposit:   { label: '已付訂金', badge: 'badge-deposit' },
  pending:   { label: '尚未結單', badge: 'badge-pending' },
  completed: { label: '已完成',   badge: 'badge-completed' },
  cancelled: { label: '已取消',   badge: 'badge-cancelled' },
};

const DELIVERY_LABELS: Record<string, string> = {
  '':          '未設定',
  preparing:   '備料中',
  assembling:  '組裝中',
  testing:     '測試中',
  ready:       '待出貨',
  shipped:     '已出貨',
  delivered:   '已送達',
};

// ===== Interfaces =====

interface QuotItem {
  category: string;
  name: string;
  spec: string;
  cost: number;
  price: number;
  quantity: number;
}

interface QuotImage {
  id: number;
  filename: string;
  original_name: string;
}

interface Quotation {
  id: number;
  quotation_no: string;
  customer_id: number | null;
  customer_name: string;
  status: string;
  delivery_status: string;
  total_cost: number;
  total_price: number;
  service_fee: number;
  deposit: number;
  note: string;
  item_title: string;
  demand_area: string;
  ship_date: string;
  created_at: string;
  items?: QuotItem[];
  images?: QuotImage[];
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  city: string;
  district: string;
}

interface CatNode {
  name: string;
  children?: CatNode[];
}

// ===== Component =====

export default function QuotationsPage() {
  const { showToast } = useToast();

  // List state
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Quotation | null>(null);

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editQuot, setEditQuot] = useState<Quotation | null>(null);
  const [formCustomerId, setFormCustomerId] = useState<number | null>(null);
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formStatus, setFormStatus] = useState('draft');
  const [formDeposit, setFormDeposit] = useState(0);
  const [formServiceFee, setFormServiceFee] = useState(0);
  const [formItemTitle, setFormItemTitle] = useState('');
  const [formDemandArea, setFormDemandArea] = useState('');
  const [formShipDate, setFormShipDate] = useState('');
  const [formDeliveryStatus, setFormDeliveryStatus] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formItems, setFormItems] = useState<QuotItem[]>([{ category: '', name: '', spec: '', cost: 0, price: 0, quantity: 1 }]);
  const [formImages, setFormImages] = useState<QuotImage[]>([]);

  // Customer search
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custDropdownOpen, setCustDropdownOpen] = useState(false);
  const [custSearchText, setCustSearchText] = useState('');
  const custSearchRef = useRef<HTMLDivElement>(null);

  // Category tree
  const [catTree, setCatTree] = useState<CatNode[]>([]);

  // Delete confirm modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ===== Data loading =====

  const loadData = useCallback(async () => {
    try {
      let url = '/quotations?';
      if (statusFilter !== 'all') url += `status=${statusFilter}&`;
      if (searchText) url += `search=${encodeURIComponent(searchText)}`;
      let data = await api.get<Quotation[]>(url);
      // Delivery status is filtered client-side
      if (typeFilter !== 'all') {
        data = data.filter(q => (q.delivery_status || '') === typeFilter);
      }
      setQuotations(data);
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
    setLoading(false);
  }, [statusFilter, typeFilter, searchText, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchText]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custSearchRef.current && !custSearchRef.current.contains(e.target as Node)) {
        setCustDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ===== Pagination =====

  const totalPages = Math.ceil(quotations.length / pageSize);
  const paginated = quotations.slice((page - 1) * pageSize, page * pageSize);

  // ===== Form helpers =====

  const buildCatOptions = (selected: string) => {
    const options: { label: string; value: string; group?: string }[] = [];
    for (const p of catTree) {
      if (p.children?.length) {
        for (const c of p.children) {
          options.push({ label: c.name, value: c.name, group: p.name });
        }
      } else {
        options.push({ label: p.name, value: p.name });
      }
    }
    options.push({ label: '服務', value: '服務' });
    options.push({ label: '其他', value: '其他' });

    // Group them
    const groups: Record<string, { label: string; value: string }[]> = {};
    const ungrouped: { label: string; value: string }[] = [];
    for (const opt of options) {
      if (opt.group) {
        if (!groups[opt.group]) groups[opt.group] = [];
        groups[opt.group].push(opt);
      } else {
        ungrouped.push(opt);
      }
    }

    return (
      <>
        {Object.entries(groups).map(([group, opts]) => (
          <optgroup key={group} label={group}>
            {opts.map(o => <option key={o.value} value={o.value} selected={o.value === selected}>{o.label}</option>)}
          </optgroup>
        ))}
        {ungrouped.map(o => <option key={o.value} value={o.value} selected={o.value === selected}>{o.label}</option>)}
      </>
    );
  };

  const recalcTotals = (items: QuotItem[], serviceFee: number) => {
    let totalCost = 0;
    let totalPrice = 0;
    for (const item of items) {
      totalCost += (item.cost || 0) * (item.quantity || 1);
      totalPrice += (item.price || 0) * (item.quantity || 1);
    }
    totalPrice += serviceFee;
    const profit = totalPrice - totalCost;
    const margin = totalPrice > 0 ? (profit / totalPrice * 100) : 0;
    return { totalCost, totalPrice, profit, margin };
  };

  // ===== Actions =====

  const openForm = async (quot?: Quotation) => {
    // Load categories and customers in parallel
    const [cats, custs] = await Promise.all([
      api.get<CatNode[]>('/inventory/categories').catch(() => []),
      api.get<Customer[]>('/customers').catch(() => []),
    ]);
    setCatTree(cats);
    setCustomers(custs);

    if (quot) {
      setEditQuot(quot);
      setFormCustomerId(quot.customer_id);
      setFormCustomerName(quot.customer_name || '');
      setCustSearchText(quot.customer_name || '');
      setFormStatus(quot.status);
      setFormDeposit(quot.deposit || 0);
      setFormServiceFee(quot.service_fee || 0);
      setFormItemTitle(quot.item_title || '');
      setFormDemandArea(quot.demand_area || '');
      setFormShipDate(quot.ship_date || '');
      setFormDeliveryStatus(quot.delivery_status || '');
      setFormNote(quot.note || '');
      setFormItems(quot.items?.length ? quot.items.map(i => ({ ...i })) : [{ category: '', name: '', spec: '', cost: 0, price: 0, quantity: 1 }]);
      setFormImages(quot.images || []);
    } else {
      const defaultCat = cats[0]?.children?.[0]?.name || cats[0]?.name || '';
      setEditQuot(null);
      setFormCustomerId(null);
      setFormCustomerName('');
      setCustSearchText('');
      setFormStatus('draft');
      setFormDeposit(0);
      setFormServiceFee(0);
      setFormItemTitle('');
      setFormDemandArea('');
      setFormShipDate('');
      setFormDeliveryStatus('');
      setFormNote('');
      setFormItems([{ category: defaultCat, name: '', spec: '', cost: 0, price: 0, quantity: 1 }]);
      setFormImages([]);
    }
    setCustDropdownOpen(false);
    setFormOpen(true);
  };

  const editQuotation = async (id: number) => {
    try {
      const q = await api.get<Quotation>(`/quotations/${id}`);
      openForm(q);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleSave = async () => {
    const validItems = formItems.filter(i => i.name.trim());
    const data = {
      customer_id: formCustomerId || null,
      customer_name: formCustomerName,
      status: formStatus,
      deposit: formDeposit,
      service_fee: formServiceFee,
      note: formNote,
      item_title: formItemTitle,
      demand_area: formDemandArea,
      ship_date: formShipDate,
      delivery_status: formDeliveryStatus,
      items: validItems,
    };

    try {
      if (editQuot) {
        await api.put(`/quotations/${editQuot.id}`, data);
        showToast('已更新');
      } else {
        await api.post('/quotations', data);
        showToast('已新增，可在編輯中上傳圖片');
      }

      // Auto-create customer if no customer_id and status is not draft
      if (!data.customer_id && data.customer_name && data.status !== 'draft') {
        try {
          const newCust = await api.post<Customer>('/customers', {
            name: data.customer_name,
            city: data.demand_area || '',
          });
          if (editQuot && newCust.id) {
            await api.put(`/quotations/${editQuot.id}`, { ...data, customer_id: newCust.id });
          }
          showToast(`已自動建立客戶: ${data.customer_name}`);
        } catch { /* ignore */ }
      }

      setFormOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const viewQuotation = async (id: number) => {
    try {
      const q = await api.get<Quotation>(`/quotations/${id}`);
      setDetail(q);
      setDetailOpen(true);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const copyQuotation = async (id: number) => {
    try {
      const res = await api.post<Quotation>(`/quotations/${id}/copy`);
      showToast(`已複製訂單 ${res.quotation_no}`);
      loadData();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const confirmDelete = (id: number) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.del(`/quotations/${deleteId}`);
      showToast('已刪除');
      setDeleteOpen(false);
      setDeleteId(null);
      loadData();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editQuot || !e.target.files?.length) return;
    const formData = new FormData();
    for (const f of Array.from(e.target.files)) {
      formData.append('images', f);
    }
    try {
      const result = await api.upload<QuotImage[]>(`/quotations/${editQuot.id}/images`, formData);
      setFormImages(prev => [...prev, ...result]);
      showToast(`已上傳 ${result.length} 張圖片`);
      e.target.value = '';
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleImageDelete = async (imgId: number) => {
    if (!editQuot) return;
    try {
      await api.del(`/quotations/${editQuot.id}/images/${imgId}`);
      setFormImages(prev => prev.filter(img => img.id !== imgId));
      showToast('圖片已刪除');
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  // Export quotation (print)
  const exportQuotation = async (id: number) => {
    try {
      const q = await api.get<Quotation>(`/quotations/${id}`);
      let custName = q.customer_name || '';
      let custPhone = '';
      let custAddr = '';
      if (q.customer_id) {
        try {
          const cust = await api.get<any>(`/customers/${q.customer_id}`);
          custAddr = [cust.city, cust.district, cust.address].filter(Boolean).join('');
          custPhone = cust.phone || '';
          custName = cust.name || custName;
        } catch { /* ignore */ }
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>訂單${q.quotation_no}</title>
<style>
  body { font-family: -apple-system, 'Microsoft JhengHei', sans-serif; padding: 40px; color: #333; }
  h1 { text-align: center; margin-bottom: 5px; }
  .info { display: flex; justify-content: space-between; margin: 20px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; }
  .text-right { text-align: right; }
  .total-row { font-weight: bold; background: #f9f9f9; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
  .note { margin-top: 20px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
  @media print { body { padding: 20px; } }
</style></head><body>
<h1>估價單</h1>
<p style="text-align:center;color:#666">訂單號: ${q.quotation_no}</p>
<div class="info">
  <div><strong>客戶:</strong> ${custName || '-'}</div>
  <div><strong>日期:</strong> ${Fmt.date(q.created_at)}</div>
</div>
${(custPhone || custAddr) ? `<div class="info" style="margin-top:0;">
  ${custPhone ? `<div><strong>電話:</strong> ${custPhone}</div>` : ''}
  ${custAddr ? `<div><strong>配送地址:</strong> ${custAddr}</div>` : ''}
</div>` : ''}
<table>
  <thead><tr><th>#</th><th>分類</th><th>品名</th><th>規格</th><th class="text-right">單價</th><th class="text-right">數量</th><th class="text-right">小計</th></tr></thead>
  <tbody>
    ${(q.items || []).map((i, idx) => `
    <tr><td>${idx + 1}</td><td>${i.category}</td><td>${i.name}</td><td>${i.spec}</td>
    <td class="text-right">$${Fmt.currency(i.price)}</td><td class="text-right">${i.quantity}</td>
    <td class="text-right">$${Fmt.currency(i.price * i.quantity)}</td></tr>`).join('')}
  </tbody>
  <tfoot>
    ${q.service_fee ? `<tr><td colspan="6" class="text-right">服務費</td><td class="text-right">$${Fmt.currency(q.service_fee)}</td></tr>` : ''}
    <tr class="total-row"><td colspan="6" class="text-right">總計</td><td class="text-right">$${Fmt.currency(q.total_price)}</td></tr>
    ${q.deposit ? `<tr><td colspan="6" class="text-right">已付訂金</td><td class="text-right">$${Fmt.currency(q.deposit)}</td></tr>
    <tr class="total-row"><td colspan="6" class="text-right">尚需付款</td><td class="text-right">$${Fmt.currency(q.total_price - q.deposit)}</td></tr>` : ''}
  </tfoot>
</table>
${q.note ? `<div class="note"><strong>備註:</strong> ${q.note}</div>` : ''}
<div class="footer">此估價單有效期限為 7 天</div>
</body></html>`);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  // Export QC sheet (print)
  const exportQC = async (id: number) => {
    try {
      const q = await api.get<Quotation>(`/quotations/${id}`);
      let localCatTree: CatNode[] = [];
      try { localCatTree = await api.get<CatNode[]>('/inventory/categories'); } catch { /* ignore */ }

      let shopAddr = '(請至設定頁面填寫)';
      let shopPhone = '(請至設定頁面填寫)';
      let shopLine = '(請至設定頁面填寫)';
      try {
        const [a, p, l] = await Promise.all([
          api.get<{ value: string }>('/settings/shop_address'),
          api.get<{ value: string }>('/settings/shop_phone'),
          api.get<{ value: string }>('/settings/shop_line'),
        ]);
        shopAddr = a.value || shopAddr;
        shopPhone = p.value || shopPhone;
        shopLine = l.value || shopLine;
      } catch { /* ignore */ }

      const getCatNames = (parentName: string): string[] => {
        const parent = localCatTree.find(c => c.name === parentName);
        if (!parent) return [parentName];
        if (parent.children?.length) return parent.children.map(c => c.name);
        return [parentName];
      };

      const getSpec = (parentName: string): string => {
        const names = getCatNames(parentName);
        const items = (q.items || []).filter(i => names.includes(i.category));
        if (!items.length) return '待補充';
        return items.map(i => `${i.name}${i.spec ? ' ' + i.spec : ''}`).join(', ');
      };

      const qcNo = `QC-${(q.ship_date || '').replace(/-/g, '')}-${String(q.id).padStart(6, '0')}`;
      const now = new Date().toLocaleString('zh-TW');

      const chk = (label: string) => `<td class="chk-label">${label}</td><td class="chk-box"></td>`;
      const chk2 = (label: string) => `<td class="chk-label">${label}</td><td class="chk-box chk-wide"></td>`;

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>出機檢查單 ${qcNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Microsoft JhengHei', sans-serif; padding: 40px; color: #333; font-size: 13px; }
  h1 { font-size: 28px; margin-bottom: 2px; }
  .subtitle { color: #888; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; }
  .shop-name { font-size: 14px; color: #666; margin-top: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .header-right { text-align: right; font-size: 12px; color: #555; }
  .header-right div { margin-bottom: 3px; }
  .info-row { display: flex; gap: 20px; margin-bottom: 20px; }
  .info-box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 14px; }
  .info-box h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #555; }
  .info-box p { margin: 4px 0; font-size: 13px; }
  h2 { font-size: 15px; font-weight: 700; margin: 18px 0 10px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; font-size: 12px; }
  th { background: #f5f5f5; font-weight: 600; }
  .config-table td:nth-child(odd) { font-weight: 600; background: #fafafa; width: 12%; }
  .config-table td:nth-child(even) { width: 38%; }
  .section-header { background: #f0f0f0; font-weight: 700; font-size: 12px; }
  .section-header td { padding: 6px 10px; }
  .chk-label { width: 30%; }
  .chk-box { width: 3.3%; min-width: 28px; text-align: center; }
  .chk-wide { width: 20%; }
  .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 40px; padding-top: 10px; }
  .sign-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; }
  @media print { body { padding: 20px; } @page { margin: 15mm; } }
</style></head><body>
<div class="header">
  <div>
    <div class="subtitle">S H I P P I N G &nbsp; Q C</div>
    <h1>出機檢查單</h1>
    <div class="shop-name">星辰電腦 NSZPC</div>
  </div>
  <div class="header-right">
    <div><strong>檢查單號：</strong>${qcNo}</div>
    <div><strong>建立時間：</strong>${now}</div>
    <div><strong>訂單類型：</strong>${DELIVERY_LABELS[q.delivery_status] || '未設定'}</div>
  </div>
</div>
<div class="info-row">
  <div class="info-box">
    <h3>出機資訊</h3>
    <p><strong>品項：</strong>${q.item_title || (q.customer_name + ' 主機') || '-'}</p>
    <p><strong>需求地區：</strong>${q.demand_area || '-'}</p>
    <p><strong>出貨日期：</strong>${q.ship_date || '-'}</p>
  </div>
  <div class="info-box">
    <h3>店家資訊</h3>
    <p><strong>地址：</strong>${shopAddr}</p>
    <p><strong>電話：</strong>${shopPhone}</p>
    <p><strong>LINE：</strong>${shopLine}</p>
  </div>
</div>
<h2>本機配置</h2>
<table class="config-table">
  <tr><td>CPU</td><td>${getSpec('CPU')}</td><td>主機板</td><td>${getSpec('主機板')}</td></tr>
  <tr><td>RAM</td><td>${getSpec('記憶體')}</td><td>硬碟</td><td>${getSpec('硬碟')}</td></tr>
  <tr><td>顯示卡</td><td>${getSpec('顯示卡')}</td><td>散熱器</td><td>${getSpec('散熱')}</td></tr>
  <tr><td>電源供應器</td><td>${getSpec('電源供應器')}</td><td>機殼</td><td>${getSpec('機殼')}</td></tr>
</table>
<h2>出貨前測試檢測表</h2>
<table>
  <tr class="section-header"><td colspan="6">Windows 系統 (OS)（Windows / Bios）</td></tr>
  <tr>${chk('系統安裝')}${chk('BIOS 優化')}${chk('零組件相關驅動程式')}</tr>
  <tr>${chk('主板驅動安裝')}${chk('顯卡驅動安裝')}${chk('主板(燈光/音效等)')}</tr>
  <tr>${chk('水冷螢幕驅動')}${chk('硬碟4K對齊')}<td></td><td></td></tr>
  <tr class="section-header"><td colspan="6">測試 OCCT（30M/1H）</td></tr>
  <tr>${chk('CPU + RAM')}${chk('CPU')}${chk('RAM')}</tr>
  <tr>${chk('LINPACK')}${chk('3D ADA')}${chk('VRAM')}</tr>
  <tr>${chk('POWER')}<td colspan="4"></td></tr>
  <tr class="section-header"><td colspan="6">測試 R23（測 CPU）</td></tr>
  <tr>${chk('Multi Core')}${chk2('Single Core')}</tr>
  <tr class="section-header"><td colspan="6">測試 AIDA64 + FURMARK（測 CPU / GPU）3H</td></tr>
  <tr><td class="chk-label">CPU 滿載功耗/溫度</td><td class="chk-box"></td>${chk2('GPU 滿載功耗/溫度')}</tr>
  <tr class="section-header"><td colspan="6">其他測試/配件檢查 AS SSD Benchmark</td></tr>
  <tr>${chk('待機瓦數')}${chk('滿載瓦數')}${chk('整體穩定性')}</tr>
  <tr>${chk('WIFI/藍芽')}${chk('前後音源孔')}${chk('前後USB')}</tr>
  <tr>${chk('燈光同步')}${chk('電源線')}${chk('WIFI天線')}</tr>
</table>
<div class="footer-row">
  <div>出貨日期：${q.ship_date || '________'}</div>
  <div>出貨確認簽章：<span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></div>
</div>
</body></html>`);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  // ===== Item row helpers =====

  const updateItem = (idx: number, field: keyof QuotItem, value: string | number) => {
    setFormItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    const defaultCat = catTree[0]?.children?.[0]?.name || catTree[0]?.name || '';
    setFormItems(prev => [...prev, { category: defaultCat, name: '', spec: '', cost: 0, price: 0, quantity: 1 }]);
  };

  // Drag and drop for items
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd = () => { dragIdx.current = null; setDragOverIdx(null); };
  const handleDrop = (idx: number) => {
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    setFormItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  // ===== Customer search filtering =====

  const filteredCustomers = customers.filter(c => {
    const q = custSearchText.trim().toLowerCase();
    if (!q) return false;
    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  }).slice(0, 10);

  // ===== Computed totals for form =====

  const formTotals = recalcTotals(formItems, formServiceFee);

  // ===== Render =====

  if (loading) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';

  return (
    <>
      {/* Toolbar */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex gap-2">
          <select className="form-select form-select-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
            <option value="all">全部狀態</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="form-select form-select-sm" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
            <option value="all">全部類型</option>
            {Object.entries(DELIVERY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" className="form-control form-control-sm" placeholder="搜尋訂單號/客戶..." value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 200 }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => openForm()}><i className="bi bi-plus-lg" /> 新增訂單</button>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-responsive">
          <table className="table table-hover table-sm">
            <thead>
              <tr>
                <th>訂單號</th><th>客戶</th><th>狀態</th>
                <th className="text-end">總成本</th><th className="text-end">總售價</th><th className="text-end">毛利</th><th className="text-end">毛利率</th>
                <th className="text-end">訂金</th><th>建立日期</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-muted py-4">尚無訂單</td></tr>
              ) : paginated.map(q => {
                const profit = q.total_price - q.total_cost;
                const margin = q.total_price > 0 ? (profit / q.total_price * 100) : 0;
                const st = STATUS_MAP[q.status] || { label: q.status, badge: 'bg-secondary' };
                return (
                  <tr key={q.id}>
                    <td><strong>{q.quotation_no}</strong></td>
                    <td>{q.customer_name || '-'}</td>
                    <td>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      {q.delivery_status && (
                        <span className="badge bg-light text-dark ms-1">{DELIVERY_LABELS[q.delivery_status] || q.delivery_status}</span>
                      )}
                    </td>
                    <td className="text-end">${Fmt.currency(q.total_cost)}</td>
                    <td className="text-end">${Fmt.currency(q.total_price)}</td>
                    <td className={`text-end ${profit >= 0 ? 'text-profit' : 'text-loss'}`}>${Fmt.currency(profit)}</td>
                    <td className="text-end">{Fmt.percent(margin)}</td>
                    <td className="text-end">${Fmt.currency(q.deposit)}</td>
                    <td>{Fmt.date(q.created_at)}</td>
                    <td className="text-nowrap">
                      <button className="btn btn-sm btn-outline-primary" onClick={() => viewQuotation(q.id)} title="檢視"><i className="bi bi-eye" /></button>
                      <button className="btn btn-sm btn-outline-secondary ms-1" onClick={() => editQuotation(q.id)} title="編輯"><i className="bi bi-pencil" /></button>
                      <button className="btn btn-sm btn-outline-success ms-1" onClick={() => exportQuotation(q.id)} title="匯出訂單"><i className="bi bi-download" /></button>
                      <button className="btn btn-sm btn-outline-warning ms-1" onClick={() => exportQC(q.id)} title="出機檢查單"><i className="bi bi-clipboard-check" /></button>
                      <button className="btn btn-sm btn-outline-info ms-1" onClick={() => copyQuotation(q.id)} title="複製訂單"><i className="bi bi-copy" /></button>
                      <button className="btn btn-sm btn-outline-danger ms-1" onClick={() => confirmDelete(q.id)} title="刪除"><i className="bi bi-trash" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationComp page={page} totalPages={totalPages} total={quotations.length} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />

      {/* ===== Detail Modal ===== */}
      <Modal show={detailOpen} onClose={() => setDetailOpen(false)} title={detail ? `訂單${detail.quotation_no}` : ''} size="lg"
        footer={<button className="btn btn-secondary" onClick={() => setDetailOpen(false)}>關閉</button>}>
        {detail && (() => {
          const profit = detail.total_price - detail.total_cost;
          const margin = detail.total_price > 0 ? (profit / detail.total_price * 100) : 0;
          const st = STATUS_MAP[detail.status] || { label: detail.status, badge: '' };
          return (
            <>
              <div className="row mb-3">
                <div className="col-6"><strong>客戶:</strong> {detail.customer_name || '-'}</div>
                <div className="col-6"><strong>狀態:</strong> <span className={`badge ${STATUS_MAP[detail.status]?.badge || ''}`}>{st.label}</span></div>
                <div className="col-6 mt-2"><strong>訂金:</strong> ${Fmt.currency(detail.deposit)}</div>
                <div className="col-6 mt-2"><strong>日期:</strong> {Fmt.date(detail.created_at)}</div>
                {detail.delivery_status && (
                  <div className="col-6 mt-2"><strong>訂單類型:</strong> {DELIVERY_LABELS[detail.delivery_status] || detail.delivery_status}</div>
                )}
                {detail.item_title && <div className="col-6 mt-2"><strong>品項名稱:</strong> {detail.item_title}</div>}
                {detail.demand_area && <div className="col-6 mt-2"><strong>需求地區:</strong> {detail.demand_area}</div>}
                {detail.ship_date && <div className="col-6 mt-2"><strong>出貨日期:</strong> {detail.ship_date}</div>}
              </div>
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr><th>分類</th><th>品名</th><th>規格</th><th className="text-end">成本</th><th className="text-end">售價</th><th className="text-center">數量</th><th className="text-end">小計</th></tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((i, idx) => (
                      <tr key={idx}>
                        <td>{i.category}</td><td>{i.name}</td><td>{i.spec}</td>
                        <td className="text-end">${Fmt.currency(i.cost)}</td>
                        <td className="text-end">${Fmt.currency(i.price)}</td>
                        <td className="text-center">{i.quantity}</td>
                        <td className="text-end">${Fmt.currency(i.price * i.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {detail.service_fee ? (
                      <tr><td colSpan={6} className="text-end">服務費:</td><td className="text-end">${Fmt.currency(detail.service_fee)}</td></tr>
                    ) : null}
                    <tr className="fw-bold">
                      <td colSpan={6} className="text-end">總計:</td>
                      <td className="text-end">${Fmt.currency(detail.total_price)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="text-end">毛利:</td>
                      <td className={`text-end ${profit >= 0 ? 'text-profit' : 'text-loss'}`}>${Fmt.currency(profit)} ({Fmt.percent(margin)})</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {detail.note && <p className="text-muted"><strong>備註:</strong> {detail.note}</p>}
              {detail.images && detail.images.length > 0 && (
                <>
                  <h6 className="mt-3"><i className="bi bi-image" /> 附件圖片</h6>
                  <div className="d-flex flex-wrap gap-2">
                    {detail.images.map(img => (
                      <a key={img.id} href={`${apiBase}/quotations/${detail.id}/images/${img.filename}`} target="_blank" rel="noreferrer">
                        <img src={`${apiBase}/quotations/${detail.id}/images/${img.filename}`} style={{ maxWidth: 150, maxHeight: 150, borderRadius: 8, objectFit: 'cover' }} title={img.original_name} alt={img.original_name} />
                      </a>
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}
      </Modal>

      {/* ===== Create/Edit Form Modal ===== */}
      <Modal show={formOpen} onClose={() => setFormOpen(false)} title={editQuot ? `編輯訂單 ${editQuot.quotation_no}` : '新增訂單'} size="xl"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setFormOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>{editQuot ? '更新' : '新增'}</button>
        </>}>

        {/* Row 1: Customer, Status, Deposit, Service Fee */}
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <label className="form-label">客戶</label>
            <div className="position-relative" ref={custSearchRef}>
              <input
                type="text"
                className="form-control"
                value={custSearchText}
                placeholder="搜尋或輸入客戶名稱..."
                autoComplete="off"
                onChange={e => {
                  const val = e.target.value;
                  setCustSearchText(val);
                  setFormCustomerName(val);
                  setFormCustomerId(null);
                  setCustDropdownOpen(!!val.trim());
                }}
                onFocus={() => { if (custSearchText.trim()) setCustDropdownOpen(true); }}
              />
              {custDropdownOpen && filteredCustomers.length > 0 && (
                <div className="dropdown-menu show w-100" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        setCustSearchText(c.name);
                        setFormCustomerName(c.name);
                        setFormCustomerId(c.id);
                        setCustDropdownOpen(false);
                        // Auto-fill demand area
                        if (!formDemandArea && c.city) {
                          setFormDemandArea(c.city + (c.district ? ' ' + c.district : ''));
                        }
                      }}
                    >
                      <strong>{c.name}</strong>{' '}
                      <span className="text-muted small">{c.phone || ''} {c.city ? '· ' + c.city + (c.district ? ' ' + c.district : '') : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="col-md-3">
            <label className="form-label">狀態</label>
            <select className="form-select" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">訂金</label>
            <input type="number" className="form-control" value={formDeposit} min={0} onChange={e => setFormDeposit(parseInt(e.target.value) || 0)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">服務費</label>
            <input type="number" className="form-control" value={formServiceFee} min={0} onChange={e => setFormServiceFee(parseInt(e.target.value) || 0)} />
          </div>
        </div>

        <hr className="my-3" />
        <h6 className="text-muted"><i className="bi bi-clipboard-check" /> 出機檢查單資訊（選填）</h6>

        {/* Row 2: QC info */}
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <label className="form-label">品項名稱</label>
            <input type="text" className="form-control" value={formItemTitle} placeholder="例: RTX 5080 高階遊戲主機" onChange={e => setFormItemTitle(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">需求地區</label>
            <input type="text" className="form-control" value={formDemandArea} placeholder="例: 新北市" onChange={e => setFormDemandArea(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">出貨日期</label>
            <input type="date" className="form-control" value={formShipDate} onChange={e => setFormShipDate(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">訂單類型</label>
            <select className="form-select" value={formDeliveryStatus} onChange={e => setFormDeliveryStatus(e.target.value)}>
              {Object.entries(DELIVERY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <hr className="my-3" />

        {/* Items */}
        <h6>
          項目明細
          <button type="button" className="btn btn-sm btn-outline-primary ms-2" onClick={addItem}><i className="bi bi-plus" /> 新增項目</button>
        </h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={{ width: 120 }}>分類</th>
                <th>品名</th>
                <th>規格</th>
                <th style={{ width: 100 }}>成本</th>
                <th style={{ width: 100 }}>售價</th>
                <th style={{ width: 60 }}>數量</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formItems.map((item, idx) => (
                <tr
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(idx)}
                  className={dragOverIdx === idx ? 'drag-over' : ''}
                >
                  <td className="drag-handle" style={{ cursor: 'grab', width: 30, textAlign: 'center', color: '#94a3b8' }}><i className="bi bi-grip-vertical" /></td>
                  <td>
                    <select className="form-select form-select-sm" value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}>
                      {buildCatOptions(item.category)}
                    </select>
                  </td>
                  <td><input type="text" className="form-control form-control-sm" value={item.name} placeholder="品名" onChange={e => updateItem(idx, 'name', e.target.value)} /></td>
                  <td><input type="text" className="form-control form-control-sm" value={item.spec} placeholder="規格" onChange={e => updateItem(idx, 'spec', e.target.value)} /></td>
                  <td><input type="number" className="form-control form-control-sm" value={item.cost} min={0} onChange={e => updateItem(idx, 'cost', parseInt(e.target.value) || 0)} /></td>
                  <td><input type="number" className="form-control form-control-sm" value={item.price} min={0} onChange={e => updateItem(idx, 'price', parseInt(e.target.value) || 0)} /></td>
                  <td><input type="number" className="form-control form-control-sm" value={item.quantity} min={1} style={{ width: 60 }} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)} /></td>
                  <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeItem(idx)}><i className="bi bi-x" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-end fw-bold">服務費:</td>
                <td>${Fmt.currency(formServiceFee)}</td>
                <td></td><td></td>
              </tr>
              <tr className="fw-bold">
                <td colSpan={5} className="text-end">總計:</td>
                <td>${Fmt.currency(formTotals.totalPrice)}</td>
                <td></td><td></td>
              </tr>
              <tr>
                <td colSpan={5} className="text-end">毛利:</td>
                <td colSpan={2} className={formTotals.profit >= 0 ? 'text-profit' : 'text-loss'}>
                  ${Fmt.currency(formTotals.profit)} ({Fmt.percent(formTotals.margin)})
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Images */}
        {editQuot ? (
          <>
            <h6 className="mt-3"><i className="bi bi-image" /> 圖片附件</h6>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {formImages.map(img => (
                <div key={img.id} className="position-relative">
                  <img src={`${apiBase}/quotations/${editQuot.id}/images/${img.filename}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }} alt={img.original_name} />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger position-absolute top-0 end-0"
                    style={{ padding: '0 4px', fontSize: 10 }}
                    onClick={() => handleImageDelete(img.id)}
                  >
                    <i className="bi bi-x" />
                  </button>
                </div>
              ))}
            </div>
            <input type="file" className="form-control form-control-sm" multiple accept="image/*" onChange={handleImageUpload} />
          </>
        ) : (
          <p className="text-muted small mt-2">儲存後可上傳圖片</p>
        )}

        {/* Note */}
        <div className="mt-3">
          <label className="form-label">備註</label>
          <textarea className="form-control" rows={2} value={formNote} onChange={e => setFormNote(e.target.value)} />
        </div>
      </Modal>

      {/* ===== Delete Confirm Modal ===== */}
      <Modal show={deleteOpen} onClose={() => setDeleteOpen(false)} title="確認刪除"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>取消</button>
          <button className="btn btn-danger" onClick={handleDelete}>刪除</button>
        </>}>
        <p>確定刪除此訂單？此操作無法復原。</p>
      </Modal>
    </>
  );
}
