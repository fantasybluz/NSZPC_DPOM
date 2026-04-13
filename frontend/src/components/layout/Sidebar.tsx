'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { NAV_ITEMS } from '@/lib/constants';
import { api } from '@/lib/api';
import Modal from '@/components/ui/Modal';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [version, setVersion] = useState('');
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    api.get('/version').then(res => setVersion(res.version || '')).catch(() => {});
  }, []);

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return hasPermission(item.id);
  });

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) { showToast('請填寫密碼', 'warning'); return; }
    if (newPwd !== confirmPwd) { showToast('新密碼不一致', 'warning'); return; }
    if (newPwd.length < 4) { showToast('新密碼至少 4 個字元', 'warning'); return; }

    setPwdLoading(true);
    try {
      await api.put('/auth/change-password', { current_password: currentPwd, new_password: newPwd });
      showToast('密碼已修改');
      setPwdModalOpen(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={onClose} />
      <nav className={`sidebar text-white ${open ? 'show' : ''}`}>
        <div className="sidebar-header">
          <h5 className="text-white mb-0">
            <i className="bi bi-pc-display me-2" />
            <span>星辰電腦</span>
          </h5>
        </div>

        <div className="nav flex-column flex-grow-1 py-2">
          {visibleItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              onClick={onClose}
            >
              <i className={`bi ${item.icon}`} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="mt-auto p-3 border-top border-secondary border-opacity-25">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="small text-white-50">
              <i className="bi bi-person-circle me-1" />
              <span>{user?.display_name || user?.username}</span>
            </div>
            <button className="btn btn-link btn-sm text-white-50 p-0" onClick={() => setPwdModalOpen(true)} title="修改密碼">
              <i className="bi bi-key" />
            </button>
          </div>
          <button className="btn btn-outline-light btn-sm w-100" onClick={logout}>
            <i className="bi bi-box-arrow-left me-1" />
            <span>登出</span>
          </button>
          {version && (
            <div className="text-center mt-2">
              <small className="text-white-50" style={{ fontSize: '0.7rem' }}>v{version}</small>
            </div>
          )}
        </div>
      </nav>

      <Modal show={pwdModalOpen} onClose={() => setPwdModalOpen(false)} title="修改密碼"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setPwdModalOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleChangePassword} disabled={pwdLoading}>
            {pwdLoading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-check-lg me-1" />}
            確認修改
          </button>
        </>}>
        <div className="mb-3">
          <label className="form-label">目前密碼</label>
          <input type="password" className="form-control" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label">新密碼</label>
          <input type="password" className="form-control" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label">確認新密碼</label>
          <input type="password" className="form-control" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
