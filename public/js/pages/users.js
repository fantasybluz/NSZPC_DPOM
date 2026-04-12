// ========== 使用者權限管理頁面 (僅管理員) ==========
const UsersPage = {
  allPages: [
    { id: 'dashboard', label: '儀表板' },
    { id: 'inventory', label: '庫存管理' },
    { id: 'quotations', label: '訂單管理' },
    { id: 'suppliers', label: '盤商報價' },
    { id: 'purchases', label: '結款管理' },
    { id: 'reports', label: '報表/保固/維修' },
    { id: 'customers', label: '客戶管理' },
    { id: 'youtube', label: '社群追蹤 / 設定' },
    { id: 'categories', label: '分類管理' },
  ],

  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      const users = await API.get('/auth/users');
      container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
          <p class="text-muted mb-0">管理使用者帳號與頁面存取權限</p>
          <button class="btn btn-primary btn-sm" id="addUserBtn"><i class="bi bi-plus-lg"></i> 新增使用者</button>
        </div>
        <div class="table-container">
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr><th>帳號</th><th>顯示名稱</th><th>角色</th><th>頁面權限</th><th>狀態</th><th>操作</th></tr>
              </thead>
              <tbody id="userTableBody"></tbody>
            </table>
          </div>
        </div>
      `;

      this.renderTable(users);
      document.getElementById('addUserBtn').addEventListener('click', () => this.showForm());
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  renderTable(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td>${u.display_name}</td>
        <td><span class="badge ${u.role === 'admin' ? 'bg-danger' : 'bg-secondary'}">${u.role === 'admin' ? '管理員' : '使用者'}</span></td>
        <td>
          ${u.role === 'admin' ? '<span class="text-muted">全部權限</span>' :
            (u.permissions || []).map(p => {
              const page = this.allPages.find(x => x.id === p);
              return `<span class="badge bg-light text-dark me-1">${page ? page.label : p}</span>`;
            }).join('')}
        </td>
        <td>${u.is_active ? '<span class="badge bg-success">啟用</span>' : '<span class="badge bg-secondary">停用</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-user" data-user='${JSON.stringify(u).replace(/'/g, "&#39;")}'><i class="bi bi-pencil"></i></button>
          ${u.username !== 'admin' ? `<button class="btn btn-sm btn-outline-danger del-user" data-id="${u.id}"><i class="bi bi-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.edit-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = JSON.parse(btn.dataset.user);
        this.showForm(user);
      });
    });

    tbody.querySelectorAll('.del-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('確定刪除此使用者？')) {
          await API.del(`/auth/users/${btn.dataset.id}`);
          showToast('已刪除');
          App.navigate('users');
        }
      });
    });
  },

  showForm(user = null) {
    const isEdit = !!user;
    const perms = user?.permissions || [];

    const body = `
      <form id="userForm">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">帳號 *</label>
            <input type="text" class="form-control" name="username" value="${user?.username || ''}" ${isEdit ? 'readonly' : 'required'}>
          </div>
          <div class="col-md-6">
            <label class="form-label">${isEdit ? '新密碼 (留空不變)' : '密碼 *'}</label>
            <input type="password" class="form-control" name="password" ${isEdit ? '' : 'required'}>
          </div>
          <div class="col-md-6">
            <label class="form-label">顯示名稱</label>
            <input type="text" class="form-control" name="display_name" value="${user?.display_name || ''}">
          </div>
          <div class="col-md-3">
            <label class="form-label">角色</label>
            <select class="form-select" name="role">
              <option value="user" ${user?.role === 'user' ? 'selected' : ''}>使用者</option>
              <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>管理員</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">狀態</label>
            <select class="form-select" name="is_active">
              <option value="1" ${user?.is_active !== 0 ? 'selected' : ''}>啟用</option>
              <option value="0" ${user?.is_active === 0 ? 'selected' : ''}>停用</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label">頁面權限 <span class="text-muted small">(管理員自動擁有全部權限)</span></label>
            <div class="d-flex flex-wrap gap-3" id="permCheckboxes">
              ${this.allPages.map(p => `
                <div class="form-check">
                  <input type="checkbox" class="form-check-input" id="perm_${p.id}" value="${p.id}" ${perms.includes(p.id) ? 'checked' : ''}>
                  <label class="form-check-label" for="perm_${p.id}">${p.label}</label>
                </div>`).join('')}
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary mt-2" id="selectAllPerms">全選</button>
          </div>
        </div>
      </form>`;

    App.showModal(
      isEdit ? `編輯使用者: ${user.username}` : '新增使用者',
      body,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveUserBtn">${isEdit ? '更新' : '新增'}</button>`
    );

    document.getElementById('selectAllPerms').addEventListener('click', () => {
      document.querySelectorAll('#permCheckboxes input').forEach(cb => cb.checked = true);
    });

    document.getElementById('saveUserBtn').addEventListener('click', async () => {
      const form = document.getElementById('userForm');
      const formData = Object.fromEntries(new FormData(form));
      const permissions = [];
      document.querySelectorAll('#permCheckboxes input:checked').forEach(cb => permissions.push(cb.value));

      const data = {
        display_name: formData.display_name,
        role: formData.role,
        is_active: parseInt(formData.is_active),
        permissions
      };

      try {
        if (isEdit) {
          if (formData.password) data.password = formData.password;
          await API.put(`/auth/users/${user.id}`, data);
          showToast('已更新');
        } else {
          if (!formData.username || !formData.password) {
            showToast('帳號密碼必填', 'warning');
            return;
          }
          data.username = formData.username;
          data.password = formData.password;
          await API.post('/auth/users', data);
          showToast('已新增');
        }
        App.closeModal();
        App.navigate('users');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }
};
