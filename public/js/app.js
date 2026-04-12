// ========== 主應用程式 ==========
const App = {
  currentPage: 'dashboard',
  charts: {},

  init() {
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // 檢查登入狀態
    if (!API.getToken()) {
      this.showLogin();
      return;
    }
    this.setupAfterLogin();
  },

  setupAfterLogin() {
    const user = API.getUser();
    if (!user) { this.showLogin(); return; }

    this.updateSidebar(user);
    this.setupNavigation();
    this.setupToggleSidebar();
    this.navigate('dashboard');
  },

  updateClock() {
    const el = document.getElementById('currentTime');
    if (el) el.textContent = new Date().toLocaleString('zh-TW');
  },

  showLogin() {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;width:100vw;min-height:100vh;">
        <!-- 左側表單 -->
        <div style="flex:0 0 420px;display:flex;justify-content:center;align-items:center;background:linear-gradient(160deg,#111827 0%,#1f2937 50%,#374151 100%);padding:40px;">
          <div style="width:100%;max-width:320px;">
            <h4 class="mb-1" style="color:#f9fafb;">星辰電腦 NSZPC</h4>
            <p class="small mb-4" style="color:#9ca3af;">請登入以繼續</p>
            <div id="loginError" class="alert alert-danger d-none"></div>
            <form id="loginForm">
              <div class="mb-3">
                <label class="form-label" style="color:#d1d5db;">帳號</label>
                <input type="text" class="form-control" id="loginUser" required autofocus
                  style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12);color:#f9fafb;">
              </div>
              <div class="mb-3">
                <label class="form-label" style="color:#d1d5db;">密碼</label>
                <input type="password" class="form-control" id="loginPass" required
                  style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12);color:#f9fafb;">
              </div>
              <button type="submit" class="btn w-100" style="background:linear-gradient(135deg,#4b5563,#6b7280);color:#fff;border:none;">登入</button>
            </form>
            <p class="text-center mt-4" style="color:#4b5563;font-size:0.7rem;">NightStarz PC &copy; 2026</p>
          </div>
        </div>
        <!-- 右側 -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#ffffff 0%,#f9fafb 40%,#f3f4f6 100%);position:relative;overflow:hidden;">
          <!-- 網格 -->
          <svg style="position:absolute;inset:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d1d5db" stroke-width="0.4"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" opacity="0.4"/>
          </svg>
          <!-- 裝飾圓環 -->
          <div style="position:absolute;width:600px;height:600px;border-radius:50%;border:1px solid rgba(209,213,219,0.4);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
          <div style="position:absolute;width:500px;height:500px;border-radius:50%;border:1px solid rgba(209,213,219,0.25);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
          <div style="position:absolute;width:400px;height:400px;border-radius:50%;border:1px solid rgba(209,213,219,0.15);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
          <!-- 角落裝飾線 -->
          <div style="position:absolute;top:30px;right:30px;width:80px;height:80px;border-top:2px solid #d1d5db;border-right:2px solid #d1d5db;opacity:0.3;"></div>
          <div style="position:absolute;bottom:30px;left:30px;width:80px;height:80px;border-bottom:2px solid #d1d5db;border-left:2px solid #d1d5db;opacity:0.3;"></div>
          <!-- 點綴 -->
          <div style="position:absolute;top:32px;right:32px;width:6px;height:6px;border-radius:50%;background:#9ca3af;opacity:0.4;"></div>
          <div style="position:absolute;bottom:32px;left:32px;width:6px;height:6px;border-radius:50%;background:#9ca3af;opacity:0.4;"></div>
          <!-- 光暈 -->
          <div style="position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(209,213,219,0.2) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
          <!-- Logo 置中 + 卡片框 -->
          <div style="position:relative;z-index:1;text-align:center;">
            <div style="background:rgba(255,255,255,0.7);backdrop-filter:blur(12px);border-radius:20px;padding:32px;border:1px solid rgba(209,213,219,0.5);box-shadow:0 8px 40px rgba(0,0,0,0.06);">
              <img src="img/logo.png" alt="星辰電腦" style="max-width:380px;max-height:55vh;object-fit:contain;border-radius:12px;">
            </div>
            <p style="margin-top:16px;color:#9ca3af;font-size:0.78rem;letter-spacing:2px;">NIGHTSTARZ PC</p>
          </div>
        </div>
      </div>`;

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value;
      const password = document.getElementById('loginPass').value;
      try {
        const res = await API.post('/auth/login', { username, password });
        API.setToken(res.token);
        API.setUser(res.user);
        location.reload();
      } catch (err) {
        const errEl = document.getElementById('loginError');
        errEl.textContent = err.message;
        errEl.classList.remove('d-none');
      }
    });
  },

  updateSidebar(user) {
    const pages = [
      { id: 'dashboard', icon: 'speedometer2', label: '儀表板' },
      { id: 'inventory', icon: 'box-seam', label: '庫存管理' },
      { id: 'quotations', icon: 'receipt', label: '訂單管理' },
      { id: 'suppliers', icon: 'chat-dots', label: '盤商報價' },
      { id: 'purchases', icon: 'wallet2', label: '結款管理' },
      { id: 'customers', icon: 'people', label: '客戶管理' },
      { id: 'reports', icon: 'graph-up', label: '報表/保固/維修' },
      { id: 'youtube', icon: 'people-fill', label: '社群追蹤' },
    ];

    if (user.role === 'admin') {
      pages.push({ id: 'categories', icon: 'diagram-3', label: '分類管理' });
      pages.push({ id: 'users', icon: 'shield-lock', label: '權限管理' });
    }

    const perms = user.permissions || [];
    const allowed = user.role === 'admin' ? pages : pages.filter(p => perms.includes(p.id));

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const nav = sidebar.querySelector('.nav');
    nav.innerHTML = allowed.map(p => `
      <li class="nav-item">
        <a class="nav-link${p.id === 'dashboard' ? ' active' : ''}" href="#" data-page="${p.id}">
          <i class="bi bi-${p.icon}"></i> ${p.label}
        </a>
      </li>
    `).join('');

    // 底部登出與使用者資訊
    const footer = document.createElement('div');
    footer.className = 'mt-auto p-3 border-top border-secondary';
    footer.innerHTML = `
      <div class="small text-light mb-2"><i class="bi bi-person-circle"></i> ${user.displayName || user.username}</div>
      <button class="btn btn-sm btn-outline-light w-100" id="logoutBtn">
        <i class="bi bi-box-arrow-right"></i> 登出
      </button>`;
    sidebar.appendChild(footer);
    document.getElementById('logoutBtn').addEventListener('click', () => {
      API.post('/auth/logout').catch(() => {});
      API.clearToken();
      location.reload();
    });
  },

  setupNavigation() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigate(page);
      });
    });
  },

  setupToggleSidebar() {
    const btn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    if (!btn || !sidebar) return;

    // 建立 overlay
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    const closeSidebar = () => {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    };

    btn.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('show');
      overlay.classList.toggle('show', isOpen);
    });

    overlay.addEventListener('click', closeSidebar);

    // 點擊導覽連結後自動關閉 sidebar (mobile)
    sidebar.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 768) closeSidebar();
      });
    });
  },

  navigate(page) {
    this.currentPage = page;
    // 更新 active
    document.querySelectorAll('[data-page]').forEach(l => {
      l.classList.toggle('active', l.dataset.page === page);
    });

    // 銷毀舊圖表
    Object.values(this.charts).forEach(c => c.destroy && c.destroy());
    this.charts = {};

    const titles = {
      dashboard: '儀表板', inventory: '庫存管理', quotations: '訂單管理',
      suppliers: '盤商報價', purchases: '結款管理', customers: '客戶管理',
      reports: '報表/保固/維修', youtube: '社群追蹤',
      categories: '分類管理', users: '權限管理'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    // 載入頁面
    const content = document.getElementById('pageContent');
    const renderers = {
      dashboard: () => DashboardPage.render(content),
      inventory: () => InventoryPage.render(content),
      quotations: () => QuotationsPage.render(content),
      purchases: () => PurchasesPage.render(content),
      reports: () => ReportsPage.render(content),
      suppliers: () => SuppliersPage.render(content),
      customers: () => CustomersPage.render(content),
      youtube: () => SocialPage.render(content),
      categories: () => CategoriesPage.render(content),
      users: () => UsersPage.render(content),
    };
    if (renderers[page]) renderers[page]();
    else content.innerHTML = '<p class="text-muted">頁面開發中...</p>';
  },

  showModal(title, bodyHtml, footerHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml || '';
    const modal = new bootstrap.Modal(document.getElementById('mainModal'));
    modal.show();
    return modal;
  },

  closeModal() {
    const el = document.getElementById('mainModal');
    const modal = bootstrap.Modal.getInstance(el);
    if (modal) modal.hide();
  }
};

// 啟動
document.addEventListener('DOMContentLoaded', () => App.init());
