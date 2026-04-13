const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

export function setStoredUser(user: any) {
  localStorage.setItem('user', JSON.stringify(user));
}

async function request<T = any>(method: string, url: string, data?: any): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['x-token'] = token;

  const opts: RequestInit = { method, headers };
  if (data) opts.body = JSON.stringify(data);

  const res = await fetch(`${API_BASE}${url}`, opts);

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('請先登入');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '請求失敗' }));
    throw new Error(err.error || '請求失敗');
  }

  return res.json();
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, data?: any) => request<T>('POST', url, data),
  put: <T = any>(url: string, data?: any) => request<T>('PUT', url, data),
  del: <T = any>(url: string) => request<T>('DELETE', url),

  // 檔案上傳（不用 JSON content-type）
  async upload<T = any>(url: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['x-token'] = token;

    const res = await fetch(`${API_BASE}${url}`, { method: 'POST', headers, body: formData });
    if (res.status === 401) {
      clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('請先登入');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '上傳失敗' }));
      throw new Error(err.error || '上傳失敗');
    }
    return res.json();
  },
};
