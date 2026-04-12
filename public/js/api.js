// API 工具 - 含認證
const API = {
  getToken() {
    return localStorage.getItem('token');
  },
  setToken(token) {
    localStorage.setItem('token', token);
  },
  clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },
  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  },
  headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) h['x-token'] = token;
    return h;
  },
  async request(method, url, data) {
    const opts = { method, headers: this.headers() };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(`/api${url}`, opts);
    if (res.status === 401) {
      this.clearToken();
      window.App && App.showLogin();
      throw new Error('請先登入');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '請求失敗' }));
      throw new Error(err.error || '請求失敗');
    }
    return res.json();
  },
  get(url) { return this.request('GET', url); },
  post(url, data) { return this.request('POST', url, data); },
  put(url, data) { return this.request('PUT', url, data); },
  del(url) { return this.request('DELETE', url); }
};

// 格式化工具
const Fmt = {
  currency(n) {
    return new Intl.NumberFormat('zh-TW').format(n || 0);
  },
  date(str) {
    if (!str) return '';
    return str.slice(0, 10);
  },
  percent(n) {
    return (n || 0).toFixed(1) + '%';
  }
};

// Toast 通知
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3 shadow-lg`;
  toast.style.zIndex = '9999';
  toast.style.minWidth = '250px';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 2500);
  setTimeout(() => toast.remove(), 3000);
}
