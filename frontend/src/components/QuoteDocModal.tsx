'use client';

// 「產出報價單」：A4 報價單預覽，匯出 PDF / JPG、產生可以直接貼到 LINE 的圖片，
// 再加三段可以複製的純文字（採購清單、文字版報價、匯款資訊）。
// 版面和匯出做法參考 Bluz Computer Studio（bluz_computer_studio 的 QuotePreview / QuoteEditor）。
// 店家資訊、備註、匯款帳號存在設定（/api/settings/quote_doc），所有報價單共用。

import { forwardRef, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { copyText, useDocExport } from '@/lib/docExport';
import * as Fmt from '@/lib/format';
import Modal from '@/components/ui/Modal';

export interface QuoteDocItem {
  category: string;
  name: string;
  spec: string;
  price: number;
  quantity: number;
}

export interface QuoteDocData {
  quotation_no: string;
  created_at: string;
  customer_name: string;
  item_title: string;
  service_fee: number;
  deposit: number;
  total_price: number;
  note: string;
  items: QuoteDocItem[];
  customer_phone?: string;
  customer_address?: string;
}

interface QuoteDocSettings {
  companyName: string;
  companyInfo: string;
  validUntil: string;
  notes: string;
  bankInfo: string;
  remitNote: string;
}

const DEFAULT_SETTINGS: QuoteDocSettings = {
  companyName: '星辰電腦 NSZPC',
  companyInfo: '高雄市前鎮區凱旋三路217號\nInstagram：nightstarzpc\nFacebook：nightstarzpc',
  validUntil: '報價後 7 天內有效',
  notes:
    '1. 整機店保一年；其餘零件依原廠保固條款辦理。\n' +
    '2. 出機前完成燒機與功能檢測。\n' +
    '3. 零件價格浮動快，以下訂當天價格為準。',
  bankInfo: '',
  remitNote: '匯款後請告知帳號末五碼，謝謝！',
};

const SETTINGS_KEY = 'quote_doc';
const money = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString('en-US')}`;
const lineDesc = (it: QuoteDocItem) => [it.name, it.spec].map((s) => (s || '').trim()).filter(Boolean).join(' ');

/** 要被擷取的那張 A4 報價單（只用 .qdoc 底下的樣式，不受 Bootstrap 影響） */
const QuoteDocument = forwardRef<HTMLDivElement, { q: QuoteDocData; s: QuoteDocSettings }>(function QuoteDocument({ q, s }, ref) {
  const items = q.items.filter((it) => lineDesc(it) !== '');
  const itemsTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const remaining = q.total_price - q.deposit;
  const clientInfo = [q.customer_phone, q.customer_address].filter(Boolean).join('\n');

  return (
    <div className="qdoc" ref={ref}>
      <div className="qdoc-head">
        <div>
          {/* 用原生 <img>（同網址的 /nsz-logo.png），html2canvas 才擷取得到 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qdoc-logo" src="/nsz-logo.png" alt="星辰電腦 logo" />
          <div className="qdoc-company">{s.companyName}</div>
          <div className="qdoc-company-info">{s.companyInfo}</div>
        </div>
        <div className="qdoc-title-block">
          <div className="qdoc-title">報價單</div>
          <div className="qdoc-meta">
            <div>單號：<b>{q.quotation_no}</b></div>
            <div>日期：<b>{Fmt.date(q.created_at)}</b></div>
            {s.validUntil && <div>{s.validUntil}</div>}
          </div>
        </div>
      </div>

      <div className="qdoc-bill">
        <div className="qdoc-lbl">報價對象 BILL TO</div>
        <div className="qdoc-client">{q.customer_name || '—'}</div>
        {clientInfo && <div className="qdoc-client-info">{clientInfo}</div>}
        {q.item_title && <div className="qdoc-client-info">品項：{q.item_title}</div>}
      </div>

      <table className="qdoc-items">
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th style={{ width: 100 }}>類別</th>
            <th>規格 / 型號</th>
            <th className="num" style={{ width: 56 }}>數量</th>
            <th className="num" style={{ width: 110 }}>單價</th>
            <th className="num" style={{ width: 120 }}>小計</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><b>{it.category || '—'}</b></td>
              <td>{lineDesc(it)}</td>
              <td className="num">{it.quantity}</td>
              <td className="num">{money(it.price)}</td>
              <td className="num">{money(it.price * it.quantity)}</td>
            </tr>
          ))}
          {q.service_fee > 0 && (
            <tr>
              <td>{items.length + 1}</td>
              <td><b>服務費</b></td>
              <td>組裝、燒機測試、系統安裝</td>
              <td className="num">1</td>
              <td className="num">{money(q.service_fee)}</td>
              <td className="num">{money(q.service_fee)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="qdoc-totals">
        <table>
          <tbody>
            <tr><td className="lbl">品項小計</td><td className="val">{money(itemsTotal)}</td></tr>
            {q.service_fee > 0 && <tr><td className="lbl">服務費</td><td className="val">{money(q.service_fee)}</td></tr>}
            <tr className="grand"><td className="lbl">總計</td><td className="val">{money(q.total_price)}</td></tr>
            {q.deposit > 0 && (
              <>
                <tr><td className="lbl">已付訂金</td><td className="val">- {money(q.deposit)}</td></tr>
                <tr className="grand"><td className="lbl">尚需付款</td><td className="val">{money(remaining)}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {(s.notes || q.note) && (
        <div className="qdoc-notes">
          <div className="qdoc-lbl">備註 NOTES</div>
          <div className="qdoc-notes-body">{[q.note, s.notes].filter((x) => x && x.trim()).join('\n')}</div>
        </div>
      )}
    </div>
  );
});

export default function QuoteDocModal({ data, onClose }: { data: QuoteDocData | null; onClose: () => void }) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<QuoteDocSettings>(DEFAULT_SETTINGS);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const { exportPDF, exportJPG, renderImage, copyImage, clearImage, snapUrl, busy } = useDocExport(
    docRef,
    () => data?.quotation_no || 'quotation',
    showToast,
  );

  useEffect(() => {
    if (!data) return;
    clearImage();
    api.get<{ value: string }>(`/settings/${SETTINGS_KEY}`)
      .then((r) => {
        if (!r.value) return;
        try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(r.value) }); } catch { /* 用預設值 */ }
      })
      .catch(() => { /* 用預設值 */ });
    // clearImage 每次 render 都是新的函式，這裡只在換一張單時跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return null;
  const set = <K extends keyof QuoteDocSettings>(key: K, value: QuoteDocSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put(`/settings/${SETTINGS_KEY}`, { value: JSON.stringify(settings) });
      showToast('報價單設定已儲存（之後的報價單都會用）');
      setEditing(false);
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const items = data.items.filter((it) => lineDesc(it) !== '');
  const qty = (it: QuoteDocItem) => (it.quantity > 1 ? ` x${it.quantity}` : '');

  // 採購清單：只列品項，給採購直接複製
  const purchaseText = items.map((it) => `${it.category || '其他'}：${lineDesc(it)}${qty(it)}`).join('\n');

  // 文字版報價：逐項列出售價與總計，直接貼 LINE
  const clientText = items.length === 0 ? '' : [
    '品項｜品項名稱｜數量｜金額',
    ...items.map((it) => `✔️${it.category || '其他'}｜${lineDesc(it)}｜${it.quantity}｜${Math.round(it.price * it.quantity).toLocaleString('en-US')}`),
    ...(data.service_fee > 0 ? [`✔️服務費｜組裝、燒機測試、系統安裝｜1｜${Math.round(data.service_fee).toLocaleString('en-US')}`] : []),
    `總金額：${money(data.total_price)}`,
    ...(data.deposit > 0 ? [`已付訂金：${money(data.deposit)}`, `尚需付款：${money(data.total_price - data.deposit)}`] : []),
  ].join('\n');

  // 匯款資訊：金額自動帶入（有訂金就帶尚需付款）
  const remitAmount = data.deposit > 0 ? data.total_price - data.deposit : data.total_price;
  const bankText = settings.bankInfo.trim()
    ? [`匯款資訊:\n${settings.bankInfo.trim()}\n匯款金額: ${money(remitAmount)}`, settings.remitNote.trim()].filter(Boolean).join('\n\n')
    : '';

  const textBlock = (title: string, text: string, okMsg: string, empty: string) => (
    <div className="col-md-4">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span className="small fw-semibold text-secondary">{title}</span>
        <button className="btn btn-sm btn-outline-secondary" disabled={!text} onClick={() => copyText(text, showToast, okMsg)}>
          <i className="bi bi-clipboard" /> 複製
        </button>
      </div>
      <pre className="qdoc-text">{text || empty}</pre>
    </div>
  );

  return (
    <Modal show onClose={onClose} title={`報價單 ${data.quotation_no}`} size="xl"
      footer={<button className="btn btn-secondary" onClick={onClose}>關閉</button>}>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <button className="btn btn-primary" disabled={busy} onClick={exportPDF}><i className="bi bi-file-earmark-pdf" /> 下載 PDF</button>
        <button className="btn btn-outline-primary" disabled={busy} onClick={exportJPG}><i className="bi bi-file-earmark-image" /> 下載 JPG</button>
        <button className="btn btn-warning" disabled={busy} onClick={renderImage}><i className="bi bi-image" /> 產生圖片（貼 LINE）</button>
        <button className="btn btn-outline-secondary ms-auto" onClick={() => setEditing((v) => !v)}>
          <i className="bi bi-gear" /> 報價單設定
        </button>
      </div>

      {editing && (
        <div className="card card-body mb-3">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small">店名</label>
              <input className="form-control" value={settings.companyName} onChange={(e) => set('companyName', e.target.value)} />
              <label className="form-label small mt-2">店家資訊（地址、電話、LINE…，一行一項）</label>
              <textarea className="form-control" rows={3} value={settings.companyInfo} onChange={(e) => set('companyInfo', e.target.value)} />
              <label className="form-label small mt-2">有效期限（印在單號下面）</label>
              <input className="form-control" value={settings.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label small">備註（每張報價單都會印；訂單自己的備註會排在前面）</label>
              <textarea className="form-control" rows={4} value={settings.notes} onChange={(e) => set('notes', e.target.value)} />
              <label className="form-label small mt-2">匯款帳號（銀行、帳號，一行一項；不會印在報價單上）</label>
              <textarea className="form-control" rows={2} value={settings.bankInfo} onChange={(e) => set('bankInfo', e.target.value)} />
              <label className="form-label small mt-2">匯款後的說明</label>
              <input className="form-control" value={settings.remitNote} onChange={(e) => set('remitNote', e.target.value)} />
            </div>
          </div>
          <div className="mt-2 text-end">
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveSettings}>{saving ? '儲存中…' : '儲存設定'}</button>
          </div>
        </div>
      )}

      {snapUrl && (
        <div className="card card-body mb-3">
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="small text-secondary">圖片已產生，可以一鍵複製後貼到 LINE，或在圖片上按右鍵 → 複製圖片</span>
            <button className="btn btn-sm btn-warning ms-auto" onClick={copyImage}><i className="bi bi-clipboard-check" /> 複製圖片</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={clearImage}>收起</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={snapUrl} alt="報價單圖片" style={{ maxWidth: '100%', border: '1px solid #ddd' }} />
        </div>
      )}

      <div className="row g-3 mb-3">
        {textBlock('採購清單（純文字）', purchaseText, '已複製採購清單', '（還沒有品項）')}
        {textBlock('文字版報價（貼 LINE）', clientText, '已複製報價文字', '（還沒有品項）')}
        {textBlock('匯款資訊', bankText, '已複製匯款資訊', '請先在「報價單設定」填匯款帳號')}
      </div>

      <div className="qdoc-scroll">
        <QuoteDocument ref={docRef} q={data} s={settings} />
      </div>
    </Modal>
  );
}
