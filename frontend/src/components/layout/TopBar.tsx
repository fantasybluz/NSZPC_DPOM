'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/constants';

interface TopBarProps {
  onToggleSidebar: () => void;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentPage = NAV_ITEMS.find(item => item.href === pathname);
  const title = currentPage?.label || '';

  return (
    <div className="top-bar d-flex justify-content-between align-items-center px-4 py-2">
      <div className="d-flex align-items-center gap-3">
        <button
          className="btn btn-link text-dark d-md-none p-0"
          onClick={onToggleSidebar}
        >
          <i className="bi bi-list fs-4" />
        </button>
        <h5 className="mb-0">{title}</h5>
      </div>
      <small className="text-muted d-none d-sm-block">{time}</small>
    </div>
  );
}
