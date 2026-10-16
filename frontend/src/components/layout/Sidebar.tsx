'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS } from '@/lib/constants';
import { api } from '@/lib/api';

// 換網域時改這裡
const WEBSITE_ADMIN_URL = 'https://nszpc.bluz.dev/admin';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasPermission, isAdmin } = useAuth();

  const [version, setVersion] = useState('');
  useEffect(() => {
    api.get('/version').then(res => setVersion(res.version || '')).catch(() => {});
  }, []);

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return hasPermission(item.id);
  });

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

        {/* 官網（NSZ_PC）的後台：推薦配單、文章、網站內容；出機紀錄從訂單「發布到官網」 */}
        <a className="nav-link" href={WEBSITE_ADMIN_URL} target="_blank" rel="noopener noreferrer">
          <i className="bi bi-globe" />
          <span>官網後台</span>
        </a>

        <div className="mt-auto p-3 border-top border-secondary border-opacity-25">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="small text-white-50">
              <i className="bi bi-person-circle me-1" />
              <span title={user?.email}>{user?.display_name || user?.username}</span>
            </div>
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

    </>
  );
}
