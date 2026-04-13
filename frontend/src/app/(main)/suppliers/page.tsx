'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import * as Fmt from '@/lib/format';

interface ParsedPrice { product: string; price: number; original: string; }
interface PriceRecord { id: number; supplier_name: string; product_name: string; price: number; quote_date: string; parsed_at: string; }

export default function SuppliersPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'text' | 'ocr'>('text');
  const [supplierName, setSupplierName] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [lineMessage, setLineMessage] = useState('');
  const [parseResults, setParseResults] = useState<ParsedPrice[]>([]);

  // OCR
  const [ocrImageUrl, setOcrImageUrl] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  // History
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [search, setSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [supplierList, setSupplierList] = useState<string[]>([]);

  // Supplier list editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorText, setEditorText] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadSupplierList = useCallback(async () => {
    let custom: string[] = [];
    try {
      const res = await api.get('/settings/supplier_list');
      custom = res.value ? res.value.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    } catch {}
    let fromHistory: string[] = [];
    try {
      const p = await api.get<PriceRecord[]>('/suppliers/prices');
      const set = new Set<string>();
      p.forEach(x => { if (x.supplier_name) set.add(x.supplier_name); });
      fromHistory = [...set];
    } catch {}
    setSupplierList([...new Set([...custom, ...fromHistory])].sort());
  }, []);

  const loadHistory = useCallback(async () => {
    let url = '/suppliers/prices?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (supplierSearch) url += `supplier=${encodeURIComponent(supplierSearch)}&`;
    if (monthFilter) url += `month=${encodeURIComponent(monthFilter)}`;
    try {
      const data = await api.get<PriceRecord[]>(url);
      setPrices(data);
    } catch {}
  }, [search, supplierSearch, monthFilter]);

  useEffect(() => { loadSupplierList(); loadHistory(); }, [loadSupplierList, loadHistory]);

  const handleParse = async () => {
    if (!lineMessage.trim()) { showToast('請貼上報價訊息', 'warning'); return; }
    try {
      const result = await api.post('/suppliers/parse', { text: lineMessage, supplier_name: supplierName, quote_date: quoteDate });
      setParseResults(result.parsed);
      showToast(`成功解析 ${result.count} 筆報價`);
      loadHistory();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const handleParseOcr = async () => {
    if (!ocrText.trim()) { showToast('無 OCR 文字', 'warning'); return; }
    try {
      const result = await api.post('/suppliers/parse-ocr', { text: ocrText, supplier_name: supplierName, quote_date: quoteDate });
      setParseResults(result.parsed);
      showToast(`成功解析 ${result.count} 筆報價`);
      loadHistory();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const runOcr = async (file: File) => {
    setOcrImageUrl(URL.createObjectURL(file));
    setOcrLoading(true);
    setOcrProgress(0);
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const worker = await Tesseract.createWorker('chi_tra+eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setOcrText(data.text);
      showToast('OCR 辨識完成');
    } catch (err: any) {
      showToast('OCR 辨識失敗: ' + err.message, 'danger');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runOcr(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (tab !== 'ocr') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) runOcr(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [tab]);

  const handleDeletePrice = async (id: number) => {
    await api.del(`/suppliers/prices/${id}`);
    loadHistory();
  };

  const handleSearchChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setter(val);
  };

  // Trigger loadHistory on filter change with debounce
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadHistory(), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search, supplierSearch, monthFilter, loadHistory]);

  const saveSupplierList = async () => {
    const list = editorText.split('\n').map(s => s.trim()).filter(Boolean).join(',');
    try {
      await api.put('/settings/supplier_list', { value: list });
      showToast('盤商清單已更新');
      setEditorOpen(false);
      loadSupplierList();
    } catch (err: any) { showToast(err.message, 'danger'); }
  };

  const openEditor = async () => {
    try {
      const res = await api.get('/settings/supplier_list');
      setEditorText((res.value || '').split(',').join('\n'));
    } catch { setEditorText(''); }
    setEditorOpen(true);
  };

  // Group prices by month
  const months = [...new Set(prices.map(p => (p.quote_date || p.parsed_at || '').slice(0, 7)))].filter(Boolean).sort().reverse();
  const grouped: Record<string, PriceRecord[]> = {};
  prices.forEach(p => {
    const m = (p.quote_date || p.parsed_at || '').slice(0, 7) || 'unknown';
    (grouped[m] = grouped[m] || []).push(p);
  });

  const fmtMonth = (m: string) => {
    if (!m || m === 'unknown') return '未知';
    const [y, mon] = m.split('-');
    return `${y} 年 ${parseInt(mon)} 月`;
  };

  return (
    <>
      <div className="row g-4">
        {/* 左側: 輸入 */}
        <div className="col-md-6">
          <div className="form-section">
            <ul className="nav nav-tabs mb-3">
              <li className="nav-item">
                <a className={`nav-link ${tab === 'text' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('text'); }}>
                  <i className="bi bi-chat-dots" /> Line 訊息
                </a>
              </li>
              <li className="nav-item">
                <a className={`nav-link ${tab === 'ocr' ? 'active' : ''}`} href="#" onClick={e => { e.preventDefault(); setTab('ocr'); }}>
                  <i className="bi bi-image" /> 圖片 OCR
                </a>
              </li>
            </ul>

            <div className="row g-2 mb-3">
              <div className="col-md-6">
                <label className="form-label">盤商名稱</label>
                <div className="input-group">
                  <input type="text" className="form-control" list="supplierDl" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="選擇或輸入..." />
                  <button className="btn btn-outline-secondary" onClick={openEditor} title="管理盤商清單"><i className="bi bi-gear" /></button>
                </div>
                <datalist id="supplierDl">
                  {supplierList.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="col-md-6">
                <label className="form-label">報價日期</label>
                <input type="date" className="form-control" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
              </div>
            </div>

            {tab === 'text' ? (
              <>
                <div className="mb-3">
                  <label className="form-label">報價訊息</label>
                  <textarea className="form-control" rows={8} value={lineMessage} onChange={e => setLineMessage(e.target.value)}
                    placeholder={'貼上 Line 訊息...\n例:\nAMD R5-7600X $4,590\nRTX 4060 Ti $12,800'} />
                </div>
                <button className="btn btn-primary" onClick={handleParse}><i className="bi bi-magic" /> 解析報價</button>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label className="form-label">上傳報價單圖片</label>
                  <input type="file" className="form-control" accept="image/*" onChange={handleFileChange} />
                  <div className="ocr-paste-zone mt-2" tabIndex={0} onClick={() => showToast('請按 Ctrl+V 貼上截圖', 'info')}>
                    <i className="bi bi-clipboard" /> 或直接 <strong>Ctrl+V</strong> 貼上截圖
                  </div>
                </div>
                {ocrImageUrl && (
                  <div className="mb-3">
                    <img src={ocrImageUrl} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} alt="OCR preview" />
                  </div>
                )}
                {ocrLoading && (
                  <div className="mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <div className="spinner-border spinner-border-sm" />
                      <span>辨識中 {ocrProgress}%</span>
                    </div>
                    <div className="progress mt-2" style={{ height: 4 }}>
                      <div className="progress-bar" style={{ width: `${ocrProgress}%` }} />
                    </div>
                  </div>
                )}
                {ocrText && (
                  <div className="mb-3">
                    <label className="form-label">OCR 辨識結果 <span className="text-muted small">（可編輯後再解析）</span></label>
                    <textarea className="form-control" rows={6} value={ocrText} onChange={e => setOcrText(e.target.value)} />
                  </div>
                )}
                {ocrText && <button className="btn btn-primary" onClick={handleParseOcr}><i className="bi bi-magic" /> 解析 OCR 結果</button>}
              </>
            )}
          </div>

          {parseResults.length > 0 && (
            <div className="form-section mt-3">
              <h6><i className="bi bi-check-circle" /> 解析結果 <span className="badge bg-dark">{parseResults.length}</span></h6>
              {parseResults.map((p, i) => (
                <div key={i} className="parse-result-item">
                  <div>
                    <strong>{p.product}</strong>
                    <div className="text-muted small" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.original}</div>
                  </div>
                  <span className="badge bg-success fs-6">${Fmt.currency(p.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右側: 歷史報價 */}
        <div className="col-md-6">
          <div className="form-section">
            <h6><i className="bi bi-clock-history" /> 歷史報價紀錄</h6>
            <div className="d-flex gap-2 mb-3 flex-wrap">
              <input type="text" className="form-control form-control-sm" placeholder="搜尋商品..." value={search} onChange={handleSearchChange(setSearch)} style={{ width: 140 }} />
              <input type="text" className="form-control form-control-sm" placeholder="盤商..." value={supplierSearch} onChange={handleSearchChange(setSupplierSearch)} style={{ width: 110 }} />
              <select className="form-select form-select-sm" value={monthFilter} onChange={handleSearchChange(setMonthFilter)} style={{ width: 'auto' }}>
                <option value="">全部月份</option>
                {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            </div>
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {prices.length === 0 ? (
                <p className="text-muted text-center">尚無報價紀錄</p>
              ) : (
                Object.keys(grouped).sort().reverse().map(m => (
                  <div key={m} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="mb-0" style={{ fontSize: '0.9rem' }}><i className="bi bi-calendar3" /> {fmtMonth(m)}</h6>
                      <span className="badge bg-secondary">{grouped[m].length} 筆</span>
                    </div>
                    <table className="table table-sm table-hover mb-0">
                      <thead><tr><th>盤商</th><th>商品</th><th className="text-end">價格</th><th>日期</th><th></th></tr></thead>
                      <tbody>
                        {grouped[m].map(p => (
                          <tr key={p.id}>
                            <td><span className="badge bg-light text-dark">{p.supplier_name || '-'}</span></td>
                            <td>{p.product_name}</td>
                            <td className="text-end fw-bold">${Fmt.currency(p.price)}</td>
                            <td className="small text-muted">{p.quote_date || Fmt.date(p.parsed_at)}</td>
                            <td><button className="btn btn-sm btn-outline-danger" onClick={() => handleDeletePrice(p.id)}><i className="bi bi-x" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal show={editorOpen} onClose={() => setEditorOpen(false)} title="管理盤商清單"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={saveSupplierList}><i className="bi bi-save" /> 儲存</button>
        </>}>
        <p className="text-muted small">每行一個盤商名稱，儲存後會出現在下拉選單中。</p>
        <textarea className="form-control" rows={10} value={editorText} onChange={e => setEditorText(e.target.value)} placeholder={'原價屋\n欣亞\n立光\n聯強\n捷元'} />
      </Modal>
    </>
  );
}
