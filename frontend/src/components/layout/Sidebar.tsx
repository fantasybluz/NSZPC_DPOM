'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS } from '@/lib/constants';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasPermission, isAdmin } = useAuth();

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

        <div className="mt-auto p-3 border-top border-secondary border-opacity-25">
          <div className="small text-white-50 mb-2">
            <i className="bi bi-person-circle me-1" />
            <span>{user?.display_name || user?.username}</span>
          </div>
          <button className="btn btn-outline-light btn-sm w-100" onClick={logout}>
            <i className="bi bi-box-arrow-left me-1" />
            <span>登出</span>
          </button>
        </div>
      </nav>
    </>
  );
}
