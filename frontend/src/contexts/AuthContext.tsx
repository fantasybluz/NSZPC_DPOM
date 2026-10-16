'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, ApiError, clearAuth, setStoredUser, LOGOUT_URL } from '@/lib/api';
import type { PagePermission } from '@/lib/constants';

interface User {
  id: number;
  email: string;
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  permissions: PagePermission[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** 沒有登入成功的原因（例如 email 還沒開通） */
  error: string;
  logout: () => void;
  hasPermission: (page: PagePermission) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 登入交給 Cloudflare Access，這裡只問後端「我是誰」（email 對到的使用者、角色、權限）
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/me')
      .then(data => {
        const u: User = {
          id: data.userId,
          email: data.email,
          username: data.username,
          display_name: data.displayName,
          role: data.role,
          permissions: data.permissions,
        };
        setUser(u);
        setStoredUser(u);
      })
      .catch((err: unknown) => {
        clearAuth();
        setError(err instanceof ApiError || err instanceof Error ? err.message : '無法取得登入資訊');
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    window.location.assign(LOGOUT_URL);
  }, []);

  const isAdmin = user?.role === 'admin';

  const hasPermission = useCallback((page: PagePermission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions.includes(page);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, error, logout, hasPermission, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
