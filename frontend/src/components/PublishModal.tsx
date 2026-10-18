'use client';

// 「發布到官網」：把訂單變成官網（NSZ_PC）的出機紀錄。
// 先用訂單內容帶一份草稿（規格從品項分類對應、售價 = 總價 − 服務費），可以改完再發布；
// 官網上不會出現客戶姓名、電話、成本、服務費。

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';

interface Draft {
  date: string;
  item: string;
  requirementIntro: string;
  youtubeEmbedUrl: string;
  tags: string[];
  location: string;
  salePrice: number;
  status: 'pending' | 'shipping' | 'delivered' | 'cancelled';
  cpu: string;
  motherboard: string;
  ram: string;
  storage: string;
  gpu: string;
  psu: string;
  cooler: string;
  pcCase: string;
}

interface DraftResponse {
  draft: Draft;
  /** publishable = false：HEIC／HEIF，不能放上官網 */
  images: { id: number; filename: string; original_name: string; publishable?: boolean }[];
  tagOptions: string[];
  websiteOrderId: string;
  websiteUrl: string;
}

const SPEC_LABELS: [keyof Draft, string][] = [
  ['cpu', 'CPU'], ['motherboard', '主機板'], ['ram', '記憶體'], ['storage', '硬碟'],
  ['gpu', '顯示卡'], ['psu', '電源供應器'], ['cooler', '散熱'], ['pcCase', '機殼'],
];

const MAX_IMAGES = 10;
const HEIC_NOTE = 'HEIC 照片不能放上官網（多數瀏覽器看不到），請改傳 JPG';
/** 放上官網只收 JPG、PNG、WebP、GIF（後端也擋）；舊的回應沒有 publishable 就看副檔名 */
const canPublish = (img: DraftResponse['images'][number]) =>
  img.publishable ?? /\.(jpe?g|png|webp|gif)$/i.test(img.filename);

const STATUS_LABELS: Record<Draft['status'], string> = {
  pending: '準備中', shipping: '出貨中', delivered: '已交機', cancelled: '已取消',
};

export default function PublishModal({ quotationId, onClose }: { quotationId: number | null; onClose: () => void }) {
  const { showToast } = useToast();
  const [data, setData] = useState<DraftResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tagText, setTagText] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (quotationId === null) return;
    setData(null); setDraft(null); setErrors([]);
    api.get<DraftResponse>(`/quotations/${quotationId}/publish-draft`)
      .then((r) => {
        setData(r);
        setDraft(r.draft);
        setTagText(r.draft.tags.join('、'));
        setPicked(new Set(r.images.filter(canPublish).slice(0, MAX_IMAGES).map((i) => i.id)));
      })
      .catch((err) => { showToast(err.message, 'danger'); onClose(); });
  }, [quotationId, showToast, onClose]);

  if (quotationId === null) return null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const tags = tagText.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean);
  const toggleTag = (t: string) => setTagText((tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]).join('、'));

  // 官網要求每個欄位都有值，先在這裡擋
  const missing = draft ? [
    !draft.item.trim() && '標題',
    !draft.requirementIntro.trim() && '需求介紹',
    !tags.length && '標籤',
    !draft.location.trim() && '交機地區',
    ...SPEC_LABELS.filter(([k]) => !String(draft[k]).trim()).map(([, label]) => label),
  ].filter(Boolean) as string[] : [];

  const publish = async () => {
    if (!draft) return;
    if (missing.length) { showToast(`還沒填：${missing.join('、')}`, 'warning'); return; }
    setBusy(true); setErrors([]);
    try {
      const r = await api.post<{ url: string }>(`/quotations/${quotationId}/publish`, {
        draft: { ...draft, tags }, imageIds: [...picked],
      });
      showToast(data?.websiteOrderId ? '已更新官網的出機紀錄' : '已發布到官網');
      window.open(r.url, '_blank', 'noopener');
      onClose();
    } catch (err: any) {
      showToast(err.message, 'danger');
      if (err.details) setErrors(err.details);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!confirm('確定要從官網拿掉這筆出機紀錄？（照片也會一起刪）')) return;
    setBusy(true);
    try {
      await api.del(`/quotations/${quotationId}/publish`);
      showToast('已從官網拿掉');
      onClose();
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show onClose={onClose} title={data?.websiteOrderId ? '更新官網的出機紀錄' : '發布到官網'} size="xl"
      footer={<>
        {data?.websiteOrderId && (
          <>
            <a className="btn btn-outline-secondary me-auto" href={data.websiteUrl} target="_blank" rel="noopener noreferrer">
              <i className="bi bi-box-arrow-up-right" /> 看官網上的這筆
            </a>
            <button className="btn btn-outline-danger" disabled={busy} onClick={unpublish}>從官網拿掉</button>
          </>
        )}
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={busy || !draft} onClick={publish}>
          {busy ? '處理中…' : data?.websiteOrderId ? '更新官網' : '發布'}
        </button>
      </>}>
      {!draft || !data ? (
        <div className="text-center p-4"><div className="spinner-border" /></div>
      ) : (
        <>
          <p className="text-muted small">
            官網上只會顯示規格、照片和售價，<strong>不會</strong>出現客戶姓名、電話、成本或服務費。規格已經從訂單品項帶好，可以改。
          </p>
          {errors.length > 0 && <div className="alert alert-danger small">{errors.join('、')}</div>}

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">標題 *</label>
              <input className="form-control" value={draft.item} onChange={(e) => set('item', e.target.value)} placeholder="例如：白色海景房電競主機" />
            </div>
            <div className="col-md-3">
              <label className="form-label">出貨日期 *</label>
              <input type="date" className="form-control" value={draft.date.replace(/\//g, '-')} onChange={(e) => set('date', e.target.value.replace(/-/g, '/'))} />
            </div>
            <div className="col-md-3">
              <label className="form-label">狀態</label>
              <select className="form-select" value={draft.status} onChange={(e) => set('status', e.target.value as Draft['status'])}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">交機地區 *</label>
              <input className="form-control" value={draft.location} onChange={(e) => set('location', e.target.value)} placeholder="例如：高雄市前鎮區" />
            </div>
            <div className="col-md-3">
              <label className="form-label">售價（不含服務費）</label>
              <input type="number" className="form-control" value={draft.salePrice} onChange={(e) => set('salePrice', Number(e.target.value))} />
            </div>
            <div className="col-md-3">
              <label className="form-label">YouTube 影片網址</label>
              <input className="form-control" value={draft.youtubeEmbedUrl} onChange={(e) => set('youtubeEmbedUrl', e.target.value)} placeholder="可不填" />
            </div>
            <div className="col-12">
              <label className="form-label">需求介紹 *（客人的需求、這台的重點）</label>
              <textarea className="form-control" rows={3} value={draft.requirementIntro} onChange={(e) => set('requirementIntro', e.target.value)} />
            </div>
            <div className="col-12">
              <label className="form-label">標籤 *（用頓號或空白分開）</label>
              <input className="form-control" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="例如：白色主題、電競、ITX" />
              {data.tagOptions.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mt-2">
                  {data.tagOptions.slice(0, 30).map((t) => (
                    <button key={t} type="button" onClick={() => toggleTag(t)}
                      className={`btn btn-sm ${tags.includes(t) ? 'btn-primary' : 'btn-outline-secondary'}`}>{t}</button>
                  ))}
                </div>
              )}
            </div>
            {SPEC_LABELS.map(([k, label]) => (
              <div className="col-md-6" key={k}>
                <label className="form-label">{label} *</label>
                <input className="form-control" value={String(draft[k])} onChange={(e) => set(k, e.target.value as never)} placeholder="訂單裡沒有這類品項，請手動填" />
              </div>
            ))}
            <div className="col-12">
              <label className="form-label">照片（勾選要放上官網的，最多 {MAX_IMAGES} 張）</label>
              {data.images.length === 0 ? (
                <p className="text-muted small mb-0">這張訂單還沒有照片，可以先到「編輯」上傳。</p>
              ) : (
                <div className="d-flex flex-wrap gap-2">
                  {data.images.map((img) => {
                    if (!canPublish(img)) {
                      // HEIC：瀏覽器多半顯示不出來，也不能選
                      return (
                        <div key={img.id} title={`${img.original_name}：${HEIC_NOTE}`}
                          className="border rounded d-flex flex-column align-items-center justify-content-center text-muted small opacity-50"
                          style={{ width: 120, height: 90, cursor: 'not-allowed' }}>
                          <i className="bi bi-file-earmark-image fs-4" />
                          <span>HEIC 不能選</span>
                        </div>
                      );
                    }
                    const on = picked.has(img.id);
                    return (
                      <button key={img.id} type="button"
                        onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(img.id)) n.delete(img.id); else if (n.size < MAX_IMAGES) n.add(img.id); return n; })}
                        className={`p-0 border rounded ${on ? 'border-primary border-3' : 'opacity-50'}`} style={{ background: 'none' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/quotations/${quotationId}/images/${img.filename}`} alt={img.original_name}
                          style={{ width: 120, height: 90, objectFit: 'cover', display: 'block', borderRadius: 4 }} />
                      </button>
                    );
                  })}
                </div>
              )}
              {data.images.some((img) => !canPublish(img)) && (
                <p className="text-muted small mt-2 mb-0"><i className="bi bi-info-circle" /> {HEIC_NOTE}</p>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
