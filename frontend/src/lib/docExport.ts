'use client';

import { useRef, useState, type RefObject } from 'react';

// 文件匯出：把 ref 指到的 DOM 節點轉成 PDF / JPG，或渲染成可直接貼上的 PNG。
// 參考 Bluz Computer Studio（bluz_computer_studio/frontend/src/lib/useDocExport.ts）的做法。
export function useDocExport(
  docRef: RefObject<HTMLDivElement | null>,
  fileBase: () => string,
  flash: (msg: string, type?: 'success' | 'danger' | 'warning') => void,
) {
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapBlob = useRef<Blob | null>(null);

  const snapshot = async () => {
    const html2canvas = (await import('html2canvas')).default;
    return html2canvas(docRef.current!, { scale: 2, backgroundColor: '#fff', useCORS: true });
  };

  const safeName = () => (fileBase() || 'quotation').replace(/[^\w-]/g, '_');

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      flash((e as Error).message || '匯出失敗', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const exportJPG = () => run(async () => {
    const canvas = await snapshot();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.95);
    a.download = `${safeName()}.jpg`;
    a.click();
  });

  // A4 直式，內容超過一頁就自動接到下一頁
  const exportPDF = () => run(async () => {
    const canvas = await snapshot();
    const img = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;
    let left = imgH;
    let pos = 0;
    while (left > 0) {
      pdf.addImage(img, 'JPEG', 0, pos, pw, imgH);
      left -= ph;
      if (left > 0) {
        pdf.addPage();
        pos -= ph;
      }
    }
    pdf.save(`${safeName()}.pdf`);
  });

  // 在頁面上渲染成圖片，之後可一鍵複製（貼到 LINE）或按右鍵複製
  const renderImage = () => run(async () => {
    const canvas = await snapshot();
    // 剪貼簿只吃 image/png（Chromium 不支援寫入 JPEG）
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('產生圖片失敗');
    snapBlob.current = blob;
    setSnapUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    flash('已產生圖片，可按「複製圖片」或在圖片上按右鍵複製');
  });

  const copyImage = async () => {
    if (!snapBlob.current) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': snapBlob.current })]);
      flash('已複製圖片，可直接貼到 LINE');
    } catch {
      flash('這個瀏覽器不支援一鍵複製圖片，請在圖片上按右鍵 → 複製圖片', 'warning');
    }
  };

  const clearImage = () => {
    setSnapUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    snapBlob.current = null;
  };

  return { exportPDF, exportJPG, renderImage, copyImage, clearImage, snapUrl, busy };
}

/** 複製純文字；沒有 clipboard API 時退回舊招 */
export async function copyText(text: string, flash: (msg: string, type?: 'success' | 'danger' | 'warning') => void, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    flash(okMsg);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    flash(ok ? okMsg : '複製失敗，請直接選取文字複製', ok ? 'success' : 'danger');
  }
}
