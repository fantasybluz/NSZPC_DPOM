'use client';

// 出機檢測表：填實測數據（高壓測試的溫度功耗、逐項檢查）→ 存起來 → 匯出 A4 給客人（PDF / JPG / 貼 LINE 的圖片）。
// 版面和架構參考 Bluz Computer Studio（bluz_computer_studio 的 InspectionEditor / InspectionSheet），
// 項目照星辰原本的出機檢查單。後端：src/routes/inspections.ts、預設項目 src/lib/inspection.ts。

import { forwardRef, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useDocExport } from '@/lib/docExport';
import Modal from '@/components/ui/Modal';

type CheckStatus = 'pass' | 'fail' | 'na';
type StressStatus = 'pass' | 'warn' | 'fail';
type Conclusion = 'pass' | 'conditional' | 'fail';
type Section = 'system' | 'function';

interface StressRow { target: string; tool: string; duration: string; tempMax: number; powerMax: number; clock: string; extra: string; status: StressStatus; note: string }
interface Check { section: Section; name: string; value: string; status: CheckStatus; note: string }
interface Report {
  reportNo: string; testDate: string; clientName: string; machineSpec: string; osVersion: string; tester: string;
  ambientTemp: number; stress: StressRow[]; checks: Check[]; conclusion: Conclusion; notes: string;
}

const STATUS_LABEL: Record<string, string> = { pass: '正常', warn: '偏高', fail: '異常', na: '不適用' };
const CONCLUSION_LABEL: Record<Conclusion, string> = {
  pass: '檢測通過，可出機',
  conditional: '有條件通過（見備註）',
  fail: '未通過，需處理',
};

// 每一區印在檢測表上的說明：讓客人看得懂這一項在測什麼（改寫自 Bluz Computer Studio 的說明）
const SECTION_INFO: Record<Section | 'stress', { title: string; desc: string }> = {
  stress: {
    title: '一、高壓測試（Stress Test）',
    desc: '把 CPU、顯示卡、記憶體、電源推到接近滿載並持續運轉，模擬長時間重度使用（遊戲、算圖、直播）。' +
      '目的是在出機前逼出散熱不足、供電不穩、記憶體不穩定等平常開機不會出現的問題。' +
      '溫度需在原廠容許範圍內、沒有因過熱大幅降頻，全程無藍屏、無重開、無運算錯誤才算通過。',
  },
  system: {
    title: '二、系統與驅動',
    desc: '確認作業系統、BIOS 設定與所有硬體的驅動程式都已正確安裝，裝置管理員沒有未知裝置。' +
      '驅動不對常會出現效能不如預期、音訊爆音、網路斷線等狀況，使用者通常會誤以為是硬體壞了。',
  },
  function: {
    title: '三、功能與配件檢查',
    desc: '逐一實測每個接口與功能，確認不是「有裝上去」而是「真的能用」：前後 USB、音源孔、Wi-Fi / 藍牙、燈光同步，' +
      '並量測待機與滿載的整機功耗、確認配件（電源線、天線）都在箱內。',
  },
};

// 溫度示警門檻（°C）：超過就在編輯器提醒，狀態仍由檢測人員決定
const TEMP_WARN: Record<string, number> = { CPU: 95, GPU: 83, 硬碟: 70 };
const isTempHigh = (r: StressRow) => {
  const key = Object.keys(TEMP_WARN).find((k) => r.target.includes(k));
  return key !== undefined && r.tempMax > 0 && r.tempMax >= TEMP_WARN[key];
};

const dash = (s: string) => (s.trim() === '' ? '—' : s);
const unit = (n: number, u: string) => (n > 0 ? `${n} ${u}` : '—');

const Badge = ({ status }: { status: string }) => <span className={`qbadge ${status}`}>{STATUS_LABEL[status] ?? status}</span>;

/** 要被擷取的那張 A4 檢測表 */
const InspectionSheet = forwardRef<HTMLDivElement, { r: Report; companyName: string; companyInfo: string }>(
  function InspectionSheet({ r, companyName, companyInfo }, ref) {
    const bySection = (s: Section) => r.checks.filter((c) => c.section === s);
    const failCount = r.stress.filter((s) => s.status === 'fail').length + r.checks.filter((c) => c.status === 'fail').length;
    const passCount = r.stress.filter((s) => s.status === 'pass').length + r.checks.filter((c) => c.status === 'pass').length;

    const checkTable = (section: Section, valueHeader: string) => {
      const rows = bySection(section);
      if (!rows.length) return null;
      return (
        <div className="qinsp-sec">
          <div className="qinsp-title">{SECTION_INFO[section].title}</div>
          <div className="qinsp-desc">{SECTION_INFO[section].desc}</div>
          <table className="qinsp">
            <thead><tr><th style={{ width: 180 }}>項目</th><th>{valueHeader}</th><th style={{ width: 190 }}>備註</th><th className="c" style={{ width: 64 }}>狀態</th></tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={i}><td className="name">{c.name}</td><td>{dash(c.value)}</td><td>{dash(c.note)}</td><td className="c"><Badge status={c.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div className="qdoc" ref={ref}>
        <div className="qdoc-head">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qdoc-logo" src="/nsz-logo.png" alt="星辰電腦 logo" />
            <div className="qdoc-company">{companyName}</div>
            <div className="qdoc-company-info">{companyInfo}</div>
          </div>
          <div className="qdoc-title-block">
            <div className="qdoc-title">檢測表</div>
            <div className="qdoc-meta">
              <div>單號：<b>{dash(r.reportNo)}</b></div>
              <div>檢測日期：<b>{dash(r.testDate)}</b></div>
              <div>室溫：<b>{unit(r.ambientTemp, '°C')}</b></div>
            </div>
          </div>
        </div>

        <div className="qinsp-info">
          <div className="cell"><div className="k">客戶</div><div className="v">{dash(r.clientName)}</div></div>
          <div className="cell"><div className="k">檢測人員</div><div className="v">{dash(r.tester)}</div></div>
          <div className="cell full"><div className="k">作業系統</div><div className="v">{dash(r.osVersion)}</div></div>
          <div className="cell full"><div className="k">機器規格</div><div className="v">{dash(r.machineSpec)}</div></div>
        </div>

        {r.stress.length > 0 && (
          <div className="qinsp-sec">
            <div className="qinsp-title">{SECTION_INFO.stress.title}</div>
            <div className="qinsp-desc">{SECTION_INFO.stress.desc}</div>
            <table className="qinsp">
              <thead>
                <tr>
                  <th style={{ width: 72 }}>受測對象</th><th>測試工具</th><th className="c" style={{ width: 70 }}>持續時間</th>
                  <th className="c" style={{ width: 64 }}>最高溫度</th><th className="c" style={{ width: 64 }}>最高功耗</th>
                  <th className="c" style={{ width: 86 }}>時脈 / 分數</th><th className="c" style={{ width: 56 }}>結果</th>
                </tr>
              </thead>
              <tbody>
                {r.stress.map((s, i) => (
                  <tr key={i}>
                    <td className="name">{s.target}</td>
                    <td>
                      {dash(s.tool)}
                      {s.extra.trim() !== '' && <div style={{ color: '#667', fontSize: 11, marginTop: 2 }}>{s.extra}</div>}
                      {s.note.trim() !== '' && <div style={{ color: '#a3252a', fontSize: 11, marginTop: 2 }}>{s.note}</div>}
                    </td>
                    <td className="c">{dash(s.duration)}</td>
                    <td className="c">{unit(s.tempMax, '°C')}</td>
                    <td className="c">{unit(s.powerMax, 'W')}</td>
                    <td className="c">{dash(s.clock)}</td>
                    <td className="c"><Badge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {checkTable('system', '版本 / 設定')}
        {checkTable('function', '實測結果')}

        <div className="qinsp-verdict">
          <div>
            <div className="qdoc-lbl">檢測結論 CONCLUSION</div>
            <div className="val">{CONCLUSION_LABEL[r.conclusion]}</div>
          </div>
          <div className="meta">
            <div>檢查項目共 {r.stress.length + r.checks.length} 項</div>
            <div>正常 {passCount} 項 · 異常 {failCount} 項</div>
          </div>
        </div>

        {r.notes.trim() !== '' && (
          <div className="qdoc-notes">
            <div className="qdoc-lbl">備註 NOTES</div>
            <div className="qdoc-notes-body">{r.notes}</div>
          </div>
        )}

        <div className="qinsp-sign">
          <div>出貨日期：________________</div>
          <div>出貨確認簽章：<span className="line" /></div>
        </div>
      </div>
    );
  },
);

export default function InspectionModal({ quotationId, onClose }: { quotationId: number | null; onClose: () => void }) {
  const { showToast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState({ name: '星辰電腦 NSZPC', info: '' });
  const docRef = useRef<HTMLDivElement>(null);
  const { exportPDF, exportJPG, renderImage, copyImage, clearImage, snapUrl, busy } = useDocExport(
    docRef, () => report?.reportNo || 'inspection', showToast,
  );

  useEffect(() => {
    if (quotationId === null) return;
    setReport(null); setDirty(false); clearImage();
    api.get<{ saved: boolean; report: Report }>(`/quotations/${quotationId}/inspection`)
      .then((r) => { setReport(r.report); setSaved(r.saved); })
      .catch((err) => { showToast(err.message, 'danger'); onClose(); });
    // 店名、店家資訊跟報價單共用（報價單設定）
    api.get<{ value: string }>('/settings/quote_doc')
      .then((r) => {
        if (!r.value) return;
        try { const s = JSON.parse(r.value); setCompany({ name: s.companyName || '星辰電腦 NSZPC', info: s.companyInfo || '' }); } catch { /* 用預設 */ }
      })
      .catch(() => { /* 用預設 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  if (quotationId === null) return null;

  const update = (patch: Partial<Report>) => { setReport((r) => (r ? { ...r, ...patch } : r)); setDirty(true); };
  const setStress = (i: number, patch: Partial<StressRow>) =>
    report && update({ stress: report.stress.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setCheck = (i: number, patch: Partial<Check>) =>
    report && update({ checks: report.checks.map((c, k) => (k === i ? { ...c, ...patch } : c)) });

  const save = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await api.put(`/quotations/${quotationId}/inspection`, report);
      setSaved(true); setDirty(false);
      showToast('檢測表已儲存');
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !confirm('檢測表還沒儲存，確定要關閉？')) return;
    onClose();
  };

  const statusSelect = (value: string, options: string[], onChange: (v: string) => void) => (
    <select className="form-select form-select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}
    </select>
  );

  return (
    <Modal show onClose={close} title={`出機檢測表${report ? ` ${report.reportNo}` : ''}${saved ? '' : '（未儲存）'}`} size="xl"
      footer={<>
        <button className="btn btn-secondary" onClick={close}>關閉</button>
        <button className="btn btn-primary" disabled={saving || !report} onClick={save}>{saving ? '儲存中…' : '儲存'}</button>
      </>}>
      {!report ? (
        <div className="text-center p-4"><div className="spinner-border" /></div>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button className="btn btn-primary" disabled={busy} onClick={exportPDF}><i className="bi bi-file-earmark-pdf" /> 下載 PDF</button>
            <button className="btn btn-outline-primary" disabled={busy} onClick={exportJPG}><i className="bi bi-file-earmark-image" /> 下載 JPG</button>
            <button className="btn btn-warning" disabled={busy} onClick={renderImage}><i className="bi bi-image" /> 產生圖片（貼 LINE）</button>
            {dirty && <span className="align-self-center small text-warning ms-auto">有修改還沒儲存</span>}
          </div>

          {snapUrl && (
            <div className="card card-body mb-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="small text-secondary">圖片已產生，可以一鍵複製後貼到 LINE</span>
                <button className="btn btn-sm btn-warning ms-auto" onClick={copyImage}><i className="bi bi-clipboard-check" /> 複製圖片</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={clearImage}>收起</button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={snapUrl} alt="檢測表圖片" style={{ maxWidth: '100%', border: '1px solid #ddd' }} />
            </div>
          )}

          {/* 基本資料 */}
          <div className="row g-2 mb-3">
            <div className="col-md-3"><label className="form-label small">單號</label><input className="form-control form-control-sm" value={report.reportNo} onChange={(e) => update({ reportNo: e.target.value })} /></div>
            <div className="col-md-3"><label className="form-label small">檢測日期</label><input className="form-control form-control-sm" value={report.testDate} onChange={(e) => update({ testDate: e.target.value })} /></div>
            <div className="col-md-2"><label className="form-label small">室溫 °C</label><input type="number" className="form-control form-control-sm" value={report.ambientTemp} onChange={(e) => update({ ambientTemp: Number(e.target.value) })} /></div>
            <div className="col-md-2"><label className="form-label small">客戶</label><input className="form-control form-control-sm" value={report.clientName} onChange={(e) => update({ clientName: e.target.value })} /></div>
            <div className="col-md-2"><label className="form-label small">檢測人員</label><input className="form-control form-control-sm" value={report.tester} onChange={(e) => update({ tester: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label small">作業系統</label><input className="form-control form-control-sm" value={report.osVersion} onChange={(e) => update({ osVersion: e.target.value })} /></div>
            <div className="col-md-8"><label className="form-label small">機器規格（從訂單帶入，可以改）</label><textarea className="form-control form-control-sm" rows={3} value={report.machineSpec} onChange={(e) => update({ machineSpec: e.target.value })} /></div>
          </div>

          {/* 高壓測試 */}
          <h6 className="fw-bold">{SECTION_INFO.stress.title}</h6>
          <div className="table-responsive mb-2">
            <table className="table table-sm align-middle">
              <thead className="small text-secondary">
                <tr><th>對象</th><th>工具</th><th>時間</th><th style={{ width: 80 }}>溫度 °C</th><th style={{ width: 80 }}>功耗 W</th><th>時脈 / 分數</th><th>補充 / 備註</th><th style={{ width: 96 }}>結果</th><th /></tr>
              </thead>
              <tbody>
                {report.stress.map((s, i) => (
                  <tr key={i}>
                    <td><input className="form-control form-control-sm" style={{ minWidth: 80 }} value={s.target} onChange={(e) => setStress(i, { target: e.target.value })} /></td>
                    <td><input className="form-control form-control-sm" style={{ minWidth: 150 }} value={s.tool} onChange={(e) => setStress(i, { tool: e.target.value })} /></td>
                    <td><input className="form-control form-control-sm" style={{ minWidth: 80 }} value={s.duration} onChange={(e) => setStress(i, { duration: e.target.value })} /></td>
                    <td>
                      <input type="number" className={`form-control form-control-sm ${isTempHigh(s) ? 'border-warning bg-warning-subtle' : ''}`} value={s.tempMax || ''} onChange={(e) => setStress(i, { tempMax: Number(e.target.value) })} title={isTempHigh(s) ? '溫度偏高，請確認散熱' : ''} />
                    </td>
                    <td><input type="number" className="form-control form-control-sm" value={s.powerMax || ''} onChange={(e) => setStress(i, { powerMax: Number(e.target.value) })} /></td>
                    <td><input className="form-control form-control-sm" style={{ minWidth: 90 }} placeholder="時脈或跑分" value={s.clock} onChange={(e) => setStress(i, { clock: e.target.value })} /></td>
                    <td>
                      <input className="form-control form-control-sm mb-1" style={{ minWidth: 150 }} placeholder="補充（例如讀寫速度、錯誤數）" value={s.extra} onChange={(e) => setStress(i, { extra: e.target.value })} />
                      <input className="form-control form-control-sm" placeholder="異常說明（紅字）" value={s.note} onChange={(e) => setStress(i, { note: e.target.value })} />
                    </td>
                    <td>{statusSelect(s.status, ['pass', 'warn', 'fail'], (v) => setStress(i, { status: v as StressStatus }))}</td>
                    <td><button className="btn btn-sm btn-outline-danger" title="刪除這列" onClick={() => update({ stress: report.stress.filter((_, k) => k !== i) })}><i className="bi bi-x" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-sm btn-outline-secondary mb-4" onClick={() => update({ stress: [...report.stress, { target: '', tool: '', duration: '', tempMax: 0, powerMax: 0, clock: '', extra: '', status: 'pass', note: '' }] })}>
            <i className="bi bi-plus" /> 新增一列
          </button>

          {/* 系統與驅動、功能與配件 */}
          {(['system', 'function'] as Section[]).map((section) => (
            <div key={section} className="mb-4">
              <h6 className="fw-bold">{SECTION_INFO[section].title}</h6>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-2">
                  <thead className="small text-secondary"><tr><th>項目</th><th>{section === 'system' ? '版本 / 設定' : '實測結果'}</th><th>備註</th><th style={{ width: 110 }}>狀態</th><th /></tr></thead>
                  <tbody>
                    {report.checks.map((c, i) => c.section !== section ? null : (
                      <tr key={i}>
                        <td><input className="form-control form-control-sm" style={{ minWidth: 150 }} value={c.name} onChange={(e) => setCheck(i, { name: e.target.value })} /></td>
                        <td><input className="form-control form-control-sm" style={{ minWidth: 120 }} value={c.value} onChange={(e) => setCheck(i, { value: e.target.value })} /></td>
                        <td><input className="form-control form-control-sm" style={{ minWidth: 120 }} value={c.note} onChange={(e) => setCheck(i, { note: e.target.value })} /></td>
                        <td>{statusSelect(c.status, ['pass', 'fail', 'na'], (v) => setCheck(i, { status: v as CheckStatus }))}</td>
                        <td><button className="btn btn-sm btn-outline-danger" title="刪除這項" onClick={() => update({ checks: report.checks.filter((_, k) => k !== i) })}><i className="bi bi-x" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => update({ checks: [...report.checks, { section, name: '', value: '', status: 'pass', note: '' }] })}>
                <i className="bi bi-plus" /> 新增一項
              </button>
            </div>
          ))}

          {/* 結論 */}
          <div className="row g-2 mb-4">
            <div className="col-md-4">
              <label className="form-label small fw-bold">檢測結論</label>
              <select className="form-select" value={report.conclusion} onChange={(e) => update({ conclusion: e.target.value as Conclusion })}>
                {Object.entries(CONCLUSION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-md-8">
              <label className="form-label small fw-bold">備註（印在檢測表上）</label>
              <textarea className="form-control" rows={3} value={report.notes} onChange={(e) => update({ notes: e.target.value })} />
            </div>
          </div>

          <h6 className="fw-bold">預覽</h6>
          <div className="qdoc-scroll">
            <InspectionSheet ref={docRef} r={report} companyName={company.name} companyInfo={company.info} />
          </div>
        </>
      )}
    </Modal>
  );
}
