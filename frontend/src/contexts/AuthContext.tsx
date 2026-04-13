'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, getToken, setToken, clearAuth, getStoredUser, setStoredUser } from '@/lib/api';
import type { PagePermission } from '@/lib/constants';

interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  permissions: PagePermission[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (page: PagePermission) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getToken();
    if (stored) {
      setTokenState(stored);
      api.get('/auth/me')
        .then(data => {
          const u: User = {
            id: data.userId,
            username: data.username,
            display_name: data.displayName,
            role: data.role,
            permissions: data.permissions,
          };
          setUser(u);
          setStoredUser(u);
        })
        .catch(() => {
          clearAuth();
          setTokenState(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post('/auth/login', { username, password });
    setToken(res.token);
    setTokenState(res.token);
    const u: User = {
      id: res.user.id,
      username: res.user.username,
      display_name: res.user.display_name,
      role: res.user.role,
      permissions: res.user.permissions,
    };
    setUser(u);
    setStoredUser(u);
  }, []);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {});
    clearAuth();
    setUser(null);
    setTokenState(null);
  }, []);

  const isAdmin = user?.role === 'admin';

  const hasPermission = useCallback((page: PagePermission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions.includes(page);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasPermission, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
