'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import NotSignedIn from '@/components/NotSignedIn';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="spinner-border text-secondary" />
      </div>
    );
  }

  if (!user) return <NotSignedIn />;

  return (
    <div className="d-flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content flex-grow-1">
        <TopBar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
        <div className="p-3 p-md-4">
          {children}
        </div>
      </div>
    </div>
  );
}
