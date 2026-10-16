'use client';

import { useAuth } from '@/contexts/AuthContext';

/** 登入了 Cloudflare Access，但系統裡沒有這個帳號（或停用、設定問題）時顯示 */
export default function NotSignedIn() {
  const { error, logout } = useAuth();
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="card shadow-sm" style={{ maxWidth: 440 }}>
        <div className="card-body p-4 text-center">
          <i className="bi bi-person-lock fs-1 text-secondary" />
          <h5 className="mt-3">無法進入系統</h5>
          <p className="text-muted mb-4">{error || '請重新整理頁面再試一次'}</p>
          <div className="d-flex gap-2 justify-content-center">
            <button className="btn btn-outline-secondary" onClick={() => window.location.reload()}>重新整理</button>
            <button className="btn btn-primary" onClick={logout}>換帳號登入</button>
          </div>
        </div>
      </div>
    </div>
  );
}
