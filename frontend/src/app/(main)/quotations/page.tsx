'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import PaginationComp from '@/components/ui/Pagination';
import * as Fmt from '@/lib/format';
import QuoteDocModal, { type QuoteDocData } from '@/components/QuoteDocModal';
import PublishModal from '@/components/PublishModal';
import InspectionModal from '@/components/InspectionModal';

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
  inventory_id?: number | null;
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

interface InvItem {
  id: number;
  category_name: string;
  name: string;
  brand: string;
  spec: string;
  price: number;
  quantity: number;
  avg_cost: number;
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

  // 產出報價單（A4 預覽、PDF / JPG / 貼 LINE 的圖片）
  const [quoteDoc, setQuoteDoc] = useState<QuoteDocData | null>(null);
  // 發布到官網（變成 NSZ_PC 的出機紀錄）
  const [publishId, setPublishId] = useState<number | null>(null);
  const closePublish = useCallback(() => setPublishId(null), []);
  // 出機檢測表（填實測數據、存起來、匯出給客人；原本是開新視窗列印空白的檢查單）
  const [inspectionId, setInspectionId] = useState<number | null>(null);

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

  // Inventory items (for 品名 autocomplete)
  const [inventoryItems, setInventoryItems] = useState<InvItem[]>([]);
  const [itemDropdownIdx, setItemDropdownIdx] = useState<number | null>(null);

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

  // Close inventory dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-inv-search]') || target.closest('[data-inv-dropdown]')) return;
      setItemDropdownIdx(null);
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
    // Load categories, customers and inventory items in parallel
    const [cats, custs, invs] = await Promise.all([
      api.get<CatNode[]>('/inventory/categories').catch(() => []),
      api.get<Customer[]>('/customers').catch(() => []),
      api.get<InvItem[]>('/inventory').catch(() => []),
    ]);
    setCatTree(cats);
    setCustomers(custs);
    setInventoryItems(invs);
    setItemDropdownIdx(null);

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
      setFormItems(quot.items?.length ? quot.items.map(i => ({ ...i, inventory_id: i.inventory_id ?? null })) : [{ category: '', name: '', spec: '', cost: 0, price: 0, quantity: 1, inventory_id: null }]);
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
      setFormItems([{ category: defaultCat, name: '', spec: '', cost: 0, price: 0, quantity: 1, inventory_id: null }]);
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
    const validItems = formItems.filter(i => i.name.trim()).map(i => ({
      category: i.category,
      name: i.name,
      spec: i.spec,
      cost: i.cost,
      price: i.price,
      quantity: i.quantity,
      inventory_id: i.inventory_id ?? null,
    }));
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

  // 產出報價單：讀訂單和客戶資料，打開 QuoteDocModal（原本是開新視窗列印一張簡單的表）
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
        } catch { /* 客戶被刪了就用訂單上的名字 */ }
      }
      setQuoteDoc({
        quotation_no: q.quotation_no,
        created_at: q.created_at,
        customer_name: custName,
        customer_phone: custPhone,
        customer_address: custAddr,
        item_title: q.item_title,
        service_fee: q.service_fee || 0,
        deposit: q.deposit || 0,
        total_price: q.total_price || 0,
        note: q.note || '',
        items: (q.items || []).map((i) => ({ category: i.category, name: i.name, spec: i.spec, price: i.price, quantity: i.quantity })),
      });
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

  // Check if a category name exists as a leaf in catTree
  const catExists = (name: string): boolean => {
    for (const p of catTree) {
      if (p.children?.length) {
        if (p.children.some(c => c.name === name)) return true;
      } else if (p.name === name) {
        return true;
      }
    }
    return false;
  };

  const selectInvItem = (idx: number, inv: InvItem) => {
    setFormItems(prev => {
      const next = [...prev];
      const fullName = inv.brand ? `${inv.brand} ${inv.name}` : inv.name;
      next[idx] = {
        ...next[idx],
        category: catExists(inv.category_name) ? inv.category_name : next[idx].category,
        name: fullName,
        spec: inv.spec || '',
        cost: Math.round(inv.avg_cost || 0),
        price: inv.price || 0,
        inventory_id: inv.id,
      };
      return next;
    });
    setItemDropdownIdx(null);
  };

  const filteredInv = (() => {
    if (itemDropdownIdx === null) return [];
    const row = formItems[itemDropdownIdx];
    if (!row) return [];
    const q = (row.name || '').trim().toLowerCase();
    if (!q) return [];
    return inventoryItems.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.brand || '').toLowerCase().includes(q) ||
      (i.spec || '').toLowerCase().includes(q)
    ).slice(0, 10);
  })();

  const removeItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    const defaultCat = catTree[0]?.children?.[0]?.name || catTree[0]?.name || '';
    setFormItems(prev => [...prev, { category: defaultCat, name: '', spec: '', cost: 0, price: 0, quantity: 1, inventory_id: null }]);
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
                      <button className="btn btn-sm btn-outline-success ms-1" onClick={() => exportQuotation(q.id)} title="產出報價單"><i className="bi bi-file-earmark-text" /></button>
                      <button className="btn btn-sm btn-outline-warning ms-1" onClick={() => setInspectionId(q.id)} title="出機檢測表"><i className="bi bi-clipboard-check" /></button>
                      <button className="btn btn-sm btn-outline-success ms-1" onClick={() => setPublishId(q.id)} title="發布到官網"><i className="bi bi-globe" /></button>
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
      <QuoteDocModal data={quoteDoc} onClose={() => setQuoteDoc(null)} />
      <PublishModal quotationId={publishId} onClose={closePublish} />
      <InspectionModal quotationId={inspectionId} onClose={() => setInspectionId(null)} />

      <Modal show={detailOpen} onClose={() => setDetailOpen(false)} title={detail ? `訂單${detail.quotation_no}` : ''} size="lg"
        footer={<>
          {detail && (
            <>
              <button className="btn btn-outline-success" onClick={() => { setDetailOpen(false); setPublishId(detail.id); }}>
                <i className="bi bi-globe" /> 發布到官網
              </button>
              <button className="btn btn-primary" onClick={() => { setDetailOpen(false); exportQuotation(detail.id); }}>
                <i className="bi bi-file-earmark-text" /> 產出報價單
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={() => setDetailOpen(false)}>關閉</button>
        </>}>
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
                  <td>
                    <div className="position-relative" data-inv-search>
                      <div className="input-group input-group-sm">
                        {item.inventory_id != null && (
                          <span className="input-group-text" title="已連結庫存（成立時會扣帳）" style={{ padding: '0 6px' }}>
                            <i className="bi bi-link-45deg text-success" />
                          </span>
                        )}
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={item.name}
                          placeholder="品名（可搜尋庫存）"
                          autoComplete="off"
                          onChange={e => {
                            const val = e.target.value;
                            setFormItems(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], name: val, inventory_id: null };
                              return next;
                            });
                            setItemDropdownIdx(val.trim() ? idx : null);
                          }}
                          onFocus={() => { if (item.name.trim()) setItemDropdownIdx(idx); }}
                        />
                      </div>
                      {itemDropdownIdx === idx && filteredInv.length > 0 && (
                        <div
                          className="dropdown-menu show"
                          data-inv-dropdown
                          style={{ maxHeight: 240, overflowY: 'auto', minWidth: 320 }}
                        >
                          {filteredInv.map(inv => (
                            <button
                              key={inv.id}
                              type="button"
                              className="dropdown-item"
                              onClick={() => selectInvItem(idx, inv)}
                            >
                              <div><strong>{inv.brand ? `${inv.brand} ` : ''}{inv.name}</strong></div>
                              <div className="small text-muted">
                                {inv.category_name}{inv.spec ? ` · ${inv.spec}` : ''} · 庫存 {inv.quantity} · ${Fmt.currency(inv.price)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
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
