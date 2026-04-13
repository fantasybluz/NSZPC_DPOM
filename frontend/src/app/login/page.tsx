'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return setError('請輸入帳號密碼');
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      }}>
      <div className="card shadow-lg border-0" style={{ width: 400, maxWidth: '90vw', borderRadius: 16 }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
              style={{ width: 56, height: 56, background: '#f1f5f9' }}>
              <i className="bi bi-pc-display fs-3 text-dark" />
            </div>
            <h4 className="fw-bold mb-1">星辰電腦</h4>
            <p className="text-muted small">管理系統登入</p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-danger py-2 small">{error}</div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-semibold">帳號</label>
              <div className="input-group">
                <span className="input-group-text"><i className="bi bi-person" /></span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="請輸入帳號"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label small fw-semibold">密碼</label>
              <div className="input-group">
                <span className="input-group-text"><i className="bi bi-lock" /></span>
                <input
                  type="password"
                  className="form-control"
                  placeholder="請輸入密碼"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-100 py-2" disabled={loading}>
              {loading ? (
                <span className="spinner-border spinner-border-sm me-2" />
              ) : (
                <i className="bi bi-box-arrow-in-right me-2" />
              )}
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
