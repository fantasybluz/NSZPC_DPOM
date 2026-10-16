const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// 登入交給 Cloudflare Access：整個網站在 Access 後面，瀏覽器帶著 Access 的 cookie，
// API 那邊驗 Access 的 JWT（src/routes/auth.ts）。前端不存 token。

/** Cloudflare Access 的登出網址 */
export const LOGOUT_URL = '/cdn-cgi/access/logout';

/** 清掉舊版存在瀏覽器的登入資料（現在不存了，留著是為了清乾淨以前的） */
export function clearAuth() {
  try { localStorage.removeItem('user'); localStorage.removeItem('token'); } catch { /* 存取不了就算了 */ }
}

/** API 回的錯誤（帶 HTTP 狀態，403 = 還沒開通 / 停用） */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: string[]) {
    super(message);
  }
}

/** Access 的登入過期了：整頁重新載入，讓 Cloudflare 重新要求登入（避免無限重整，一分鐘最多一次） */
function reloginOnce() {
  if (typeof window === 'undefined') return;
  const key = 'nszpc:relogin';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (res.status === 401) {
    reloginOnce();
    throw new ApiError('登入已過期，請重新整理頁面', 401);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: fallback }));
    throw new ApiError(err.error || fallback, res.status, Array.isArray(err.details) ? err.details : undefined);
  }
  return res.json();
}

async function request<T = any>(method: string, url: string, data?: any): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (data) opts.body = JSON.stringify(data);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}`, opts);
  } catch {
    // Access 登入過期時 Cloudflare 會把 API 轉去登入頁（跨網域），fetch 會直接失敗
    reloginOnce();
    throw new ApiError('連線失敗，請重新整理頁面', 0);
  }
  return handle<T>(res, '請求失敗');
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, data?: any) => request<T>('POST', url, data),
  put: <T = any>(url: string, data?: any) => request<T>('PUT', url, data),
  del: <T = any>(url: string) => request<T>('DELETE', url),

  // 檔案上傳（不用 JSON content-type）
  async upload<T = any>(url: string, formData: FormData): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, { method: 'POST', body: formData, credentials: 'same-origin' });
    return handle<T>(res, '上傳失敗');
  },
};
