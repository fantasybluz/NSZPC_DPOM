// ========== 訂單管理頁面 ==========
const QuotationsPage = {
  _page: 1,
  _pageSize: 20,

  statusMap: {
    draft: { label: '尚未成交', badge: 'badge-draft' },
    deposit: { label: '已付訂金', badge: 'badge-deposit' },
    pending: { label: '尚未結單', badge: 'badge-pending' },
    completed: { label: '已完成', badge: 'badge-completed' },
    cancelled: { label: '已取消', badge: 'badge-cancelled' },
  },

  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      const quotations = await API.get('/quotations');

      container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div class="d-flex gap-2">
            <select class="form-select form-select-sm" id="quotStatusFilter" style="width:auto">
              <option value="all">全部狀態</option>
              <option value="draft">尚未成交</option>
              <option value="deposit">已付訂金</option>
              <option value="pending">尚未結單</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
            <select class="form-select form-select-sm" id="quotTypeFilter" style="width:auto">
              <option value="all">全部類型</option>
              <option value="">未設定</option>
              <option value="preparing">備料中</option>
              <option value="assembling">組裝中</option>
              <option value="testing">測試中</option>
              <option value="ready">待出貨</option>
              <option value="shipped">已出貨</option>
              <option value="delivered">已送達</option>
            </select>
            <input type="text" class="form-control form-control-sm" placeholder="搜尋訂單號/客戶..." id="quotSearch" style="width:200px">
          </div>
          <button class="btn btn-primary btn-sm" id="addQuotBtn"><i class="bi bi-plus-lg"></i> 新增訂單</button>
        </div>
        <div class="table-container">
          <div class="table-responsive">
            <table class="table table-hover table-sm">
              <thead>
                <tr>
                  <th>訂單號</th><th>客戶</th><th>狀態</th>
                  <th class="text-end">總成本</th><th class="text-end">總售價</th><th class="text-end">毛利</th><th class="text-end">毛利率</th>
                  <th class="text-end">訂金</th><th>建立日期</th><th>操作</th>
                </tr>
              </thead>
              <tbody id="quotTableBody"></tbody>
            </table>
          </div>
        </div>
        <div id="quotPagination"></div>
      `;

      this.renderTable(quotations);
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  renderTable(quotations) {
    const tbody = document.getElementById('quotTableBody');
    const pgDiv = document.getElementById('quotPagination');
    if (!quotations.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">尚無訂單</td></tr>';
      if (pgDiv) pgDiv.innerHTML = '';
      return;
    }
    const pager = Pagination.paginate(quotations, this._page, this._pageSize);
    tbody.innerHTML = pager.items.map(q => {
      const profit = q.total_price - q.total_cost;
      const margin = q.total_price > 0 ? (profit / q.total_price * 100) : 0;
      const st = this.statusMap[q.status] || { label: q.status, badge: 'bg-secondary' };
      return `
        <tr>
          <td><strong>${q.quotation_no}</strong></td>
          <td>${q.customer_name || '-'}</td>
          <td><span class="badge ${st.badge}">${st.label}</span></td>
          <td class="text-end">$${Fmt.currency(q.total_cost)}</td>
          <td class="text-end">$${Fmt.currency(q.total_price)}</td>
          <td class="text-end ${profit >= 0 ? 'text-profit' : 'text-loss'}">$${Fmt.currency(profit)}</td>
          <td class="text-end">${Fmt.percent(margin)}</td>
          <td class="text-end">$${Fmt.currency(q.deposit)}</td>
          <td>${Fmt.date(q.created_at)}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary view-quot" data-id="${q.id}" title="檢視"><i class="bi bi-eye"></i></button>
            <button class="btn btn-sm btn-outline-secondary edit-quot" data-id="${q.id}" title="編輯"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-success export-quot" data-id="${q.id}" title="匯出訂單"><i class="bi bi-download"></i></button>
            <button class="btn btn-sm btn-outline-warning export-qc" data-id="${q.id}" title="出機檢查單"><i class="bi bi-clipboard-check"></i></button>
            <button class="btn btn-sm btn-outline-info copy-quot" data-id="${q.id}" title="複製訂單"><i class="bi bi-copy"></i></button>
            <button class="btn btn-sm btn-outline-danger del-quot" data-id="${q.id}" title="刪除"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`;
    }).join('');

    if (pgDiv) {
      pgDiv.innerHTML = Pagination.renderControls(pager, 'quotPager');
      Pagination.bindEvents('quotPager', (page, size) => {
        this._page = page;
        this._pageSize = size;
        this.refresh();
      });
    }
  },

  bindEvents() {
    document.getElementById('addQuotBtn').addEventListener('click', () => this.showForm());
    document.getElementById('quotStatusFilter').addEventListener('change', () => this.refresh());
    document.getElementById('quotTypeFilter').addEventListener('change', () => this.refresh());
    let t;
    document.getElementById('quotSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.refresh(), 300); });

    document.getElementById('quotTableBody').addEventListener('click', async (e) => {
      const view = e.target.closest('.view-quot');
      const edit = e.target.closest('.edit-quot');
      const exp = e.target.closest('.export-quot');
      const qc = e.target.closest('.export-qc');
      const del = e.target.closest('.del-quot');

      const copy = e.target.closest('.copy-quot');

      if (view) this.viewQuotation(parseInt(view.dataset.id));
      if (edit) this.editQuotation(parseInt(edit.dataset.id));
      if (exp) this.exportQuotation(parseInt(exp.dataset.id));
      if (qc) this.exportQC(parseInt(qc.dataset.id));
      if (copy) {
        try {
          const res = await API.post(`/quotations/${copy.dataset.id}/copy`);
          showToast(`已複製訂單 ${res.quotation_no}`);
          this.refresh();
        } catch (err) { showToast(err.message, 'danger'); }
        return;
      }
      if (del) {
        if (confirm('確定刪除此訂單？')) {
          await API.del(`/quotations/${del.dataset.id}`);
          showToast('已刪除');
          this.refresh();
        }
      }
    });
  },

  async refresh() {
    const status = document.getElementById('quotStatusFilter').value;
    const type = document.getElementById('quotTypeFilter').value;
    const search = document.getElementById('quotSearch').value;
    let url = '/quotations?';
    if (status !== 'all') url += `status=${status}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;
    let quotations = await API.get(url);
    // 訂單類型前端篩選
    if (type !== 'all') {
      quotations = quotations.filter(q => (q.delivery_status || '') === type);
    }
    this.renderTable(quotations);
  },

  async viewQuotation(id) {
    const q = await API.get(`/quotations/${id}`);
    const profit = q.total_price - q.total_cost;
    const margin = q.total_price > 0 ? (profit / q.total_price * 100) : 0;
    const st = this.statusMap[q.status] || { label: q.status };

    const imagesHtml = (q.images && q.images.length) ? `
      <h6 class="mt-3"><i class="bi bi-image"></i> 附件圖片</h6>
      <div class="d-flex flex-wrap gap-2">
        ${q.images.map(img => `
          <a href="/api/quotations/${q.id}/images/${img.filename}" target="_blank">
            <img src="/api/quotations/${q.id}/images/${img.filename}" style="max-width:150px;max-height:150px;border-radius:8px;object-fit:cover;" title="${img.original_name}">
          </a>`).join('')}
      </div>` : '';

    App.showModal(
      `訂單${q.quotation_no}`,
      `<div class="row mb-3">
        <div class="col-6"><strong>客戶:</strong> ${q.customer_id ? `<a href="#" class="view-linked-cust" data-id="${q.customer_id}">${q.customer_name}</a>` : (q.customer_name || '-')}</div>
        <div class="col-6"><strong>狀態:</strong> <span class="badge ${this.statusMap[q.status]?.badge || ''}">${st.label}</span></div>
        <div class="col-6 mt-2"><strong>訂金:</strong> $${Fmt.currency(q.deposit)}</div>
        <div class="col-6 mt-2"><strong>日期:</strong> ${Fmt.date(q.created_at)}</div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead><tr><th>分類</th><th>品名</th><th>規格</th><th class="text-end">成本</th><th class="text-end">售價</th><th class="text-center">數量</th><th class="text-end">小計</th></tr></thead>
          <tbody>
            ${(q.items || []).map(i => `
              <tr>
                <td>${i.category}</td><td>${i.name}</td><td>${i.spec}</td>
                <td class="text-end">$${Fmt.currency(i.cost)}</td><td class="text-end">$${Fmt.currency(i.price)}</td>
                <td class="text-center">${i.quantity}</td><td class="text-end">$${Fmt.currency(i.price * i.quantity)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${q.service_fee ? `<tr><td colspan="6" class="text-end">服務費:</td><td class="text-end">$${Fmt.currency(q.service_fee)}</td></tr>` : ''}
            <tr class="fw-bold">
              <td colspan="6" class="text-end">總計:</td>
              <td class="text-end">$${Fmt.currency(q.total_price)}</td>
            </tr>
            <tr>
              <td colspan="6" class="text-end">毛利:</td>
              <td class="text-end ${profit >= 0 ? 'text-profit' : 'text-loss'}">$${Fmt.currency(profit)} (${Fmt.percent(margin)})</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${q.note ? `<p class="text-muted"><strong>備註:</strong> ${q.note}</p>` : ''}
      ${imagesHtml}`,
      '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>'
    );

    // 客戶名稱連結 → 跳到客戶詳情
    document.querySelector('.view-linked-cust')?.addEventListener('click', (e) => {
      e.preventDefault();
      App.closeModal();
      App.navigate('customers');
      setTimeout(() => {
        CustomersPage.viewCustomer(parseInt(e.target.dataset.id));
      }, 300);
    });
  },

  async editQuotation(id) {
    const q = await API.get(`/quotations/${id}`);
    this.showForm(q);
  },

  async showForm(quot = null) {
    const isEdit = !!quot;
    // 載入分類樹
    try { this._catTree = await API.get('/inventory/categories'); } catch { this._catTree = []; }
    const defaultCat = this._catTree[0]?.children?.[0]?.name || this._catTree[0]?.name || '';
    const items = quot?.items || [{ category: defaultCat, name: '', spec: '', cost: 0, price: 0, quantity: 1 }];

    // 載入客戶清單
    let customers = [];
    try { customers = await API.get('/customers'); } catch {}

    const body = `
      <form id="quotForm">
        <input type="hidden" name="customer_id" id="quotCustomerId" value="${quot?.customer_id || ''}">
        <div class="row g-3 mb-3">
          <div class="col-md-3">
            <label class="form-label">客戶</label>
            <div class="position-relative">
              <input type="text" class="form-control" id="quotCustomerSearch" name="customer_name"
                value="${quot?.customer_name || ''}" placeholder="搜尋或輸入客戶名稱..." autocomplete="off">
              <div id="quotCustomerDropdown" class="dropdown-menu w-100" style="max-height:200px;overflow-y:auto;"></div>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">狀態</label>
            <select class="form-select" name="status">
              ${Object.entries(this.statusMap).map(([k, v]) => `<option value="${k}" ${quot?.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">訂金</label>
            <input type="number" class="form-control" name="deposit" value="${quot?.deposit || 0}" min="0">
          </div>
          <div class="col-md-3">
            <label class="form-label">服務費</label>
            <input type="number" class="form-control" name="service_fee" value="${quot?.service_fee || 0}" min="0" id="quotServiceFee">
          </div>
        </div>

        <hr class="my-3">
        <h6 class="text-muted"><i class="bi bi-clipboard-check"></i> 出機檢查單資訊（選填）</h6>
        <div class="row g-3 mb-3">
          <div class="col-md-3">
            <label class="form-label">品項名稱</label>
            <input type="text" class="form-control" name="item_title" value="${quot?.item_title || ''}" placeholder="例: RTX 5080 高階遊戲主機">
          </div>
          <div class="col-md-3">
            <label class="form-label">需求地區</label>
            <input type="text" class="form-control" name="demand_area" value="${quot?.demand_area || ''}" placeholder="例: 新北市">
          </div>
          <div class="col-md-3">
            <label class="form-label">出貨日期</label>
            <input type="date" class="form-control" name="ship_date" value="${quot?.ship_date || ''}">
          </div>
          <div class="col-md-3">
            <label class="form-label">訂單類型</label>
            <select class="form-select" name="delivery_status">
              <option value="" ${!quot?.delivery_status ? 'selected' : ''}>未設定</option>
              <option value="preparing" ${quot?.delivery_status === 'preparing' ? 'selected' : ''}>備料中</option>
              <option value="assembling" ${quot?.delivery_status === 'assembling' ? 'selected' : ''}>組裝中</option>
              <option value="testing" ${quot?.delivery_status === 'testing' ? 'selected' : ''}>測試中</option>
              <option value="ready" ${quot?.delivery_status === 'ready' ? 'selected' : ''}>待出貨</option>
              <option value="shipped" ${quot?.delivery_status === 'shipped' ? 'selected' : ''}>已出貨</option>
              <option value="delivered" ${quot?.delivery_status === 'delivered' ? 'selected' : ''}>已送達</option>
            </select>
          </div>
        </div>
        <hr class="my-3">

        <h6>項目明細
          <button type="button" class="btn btn-sm btn-outline-primary ms-2" id="addItemRow"><i class="bi bi-plus"></i> 新增項目</button>
          <button type="button" class="btn btn-sm btn-outline-secondary ms-1" id="addFromStock"><i class="bi bi-box-seam"></i> 從庫存選取</button>
        </h6>
        <div class="table-responsive">
          <table class="table table-sm" id="quotItemsTable">
            <thead><tr><th style="width:30px"></th><th style="width:120px">分類</th><th>品名</th><th>規格</th><th style="width:100px">成本</th><th style="width:100px">售價</th><th style="width:60px">數量</th><th></th></tr></thead>
            <tbody id="quotItemsBody">
              ${items.map((i, idx) => this.itemRow(i, idx)).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5" class="text-end fw-bold">服務費:</td>
                <td id="quotServiceFeeDisplay">$${Fmt.currency(quot?.service_fee || 0)}</td>
                <td></td><td></td>
              </tr>
              <tr class="fw-bold">
                <td colspan="5" class="text-end">總計:</td>
                <td id="quotTotalPrice">$0</td>
                <td></td><td></td>
              </tr>
              <tr>
                <td colspan="5" class="text-end">毛利:</td>
                <td id="quotProfit" colspan="2">$0</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${isEdit ? `
        <h6 class="mt-3"><i class="bi bi-image"></i> 圖片附件</h6>
        <div id="quotImages" class="d-flex flex-wrap gap-2 mb-2">
          ${(quot.images || []).map(img => `
            <div class="position-relative" data-img-id="${img.id}">
              <img src="/api/quotations/${quot.id}/images/${img.filename}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">
              <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 del-img" data-img-id="${img.id}" style="padding:0 4px;font-size:10px;"><i class="bi bi-x"></i></button>
            </div>`).join('')}
        </div>
        <input type="file" class="form-control form-control-sm" id="quotImageUpload" multiple accept="image/*">
        ` : '<p class="text-muted small mt-2">儲存後可上傳圖片</p>'}

        <div class="mt-3">
          <label class="form-label">備註</label>
          <textarea class="form-control" name="note" rows="2">${quot?.note || ''}</textarea>
        </div>
      </form>
    `;

    const modal = App.showModal(
      isEdit ? `編輯訂單 ${quot.quotation_no}` : '新增訂單',
      body,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveQuotBtn">${isEdit ? '更新' : '新增'}</button>`
    );

    this.recalcTotal();

    // ===== 客戶搜尋下拉 =====
    const searchInput = document.getElementById('quotCustomerSearch');
    const dropdown = document.getElementById('quotCustomerDropdown');
    const customerIdInput = document.getElementById('quotCustomerId');
    const demandAreaInput = document.querySelector('[name="demand_area"]');

    function renderDropdown(filtered) {
      if (!filtered.length) { dropdown.classList.remove('show'); return; }
      dropdown.innerHTML = filtered.map(c =>
        `<button type="button" class="dropdown-item cust-option" data-id="${c.id}" data-name="${c.name}" data-city="${c.city || ''}" data-district="${c.district || ''}">
          <strong>${c.name}</strong> <span class="text-muted small">${c.phone || ''} ${c.city ? '· ' + c.city + (c.district ? ' ' + c.district : '') : ''}</span>
        </button>`
      ).join('');
      dropdown.classList.add('show');
    }

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { dropdown.classList.remove('show'); customerIdInput.value = ''; return; }
      const filtered = customers.filter(c =>
        c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
      ).slice(0, 10);
      renderDropdown(filtered);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim() && customers.length) {
        searchInput.dispatchEvent(new Event('input'));
      }
    });

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.cust-option');
      if (!opt) return;
      searchInput.value = opt.dataset.name;
      customerIdInput.value = opt.dataset.id;
      dropdown.classList.remove('show');
      // 自動帶入需求地區
      if (demandAreaInput && !demandAreaInput.value && opt.dataset.city) {
        demandAreaInput.value = opt.dataset.city + (opt.dataset.district ? ' ' + opt.dataset.district : '');
      }
    });

    // 點擊外部關閉
    document.getElementById('mainModal').addEventListener('click', (e) => {
      if (!e.target.closest('#quotCustomerSearch') && !e.target.closest('#quotCustomerDropdown')) {
        dropdown.classList.remove('show');
      }
    });

    // 手動輸入時清除 customer_id（表示非選擇的客戶）
    searchInput.addEventListener('keydown', () => {
      customerIdInput.value = '';
    });

    // 服務費即時更新
    document.getElementById('quotServiceFee').addEventListener('input', () => this.recalcTotal());

    document.getElementById('addItemRow').addEventListener('click', () => {
      const tbody = document.getElementById('quotItemsBody');
      const idx = tbody.children.length;
      tbody.insertAdjacentHTML('beforeend', this.itemRow({ category: '', name: '', spec: '', cost: 0, price: 0, quantity: 1 }, idx));
      this.recalcTotal();
    });

    // 從庫存快速選取
    document.getElementById('addFromStock').addEventListener('click', async () => {
      const inv = await API.get('/inventory');
      let html = '<input type="text" class="form-control form-control-sm mb-2" id="stockSearchInput" placeholder="搜尋庫存品名...">';
      html += '<div style="max-height:400px;overflow-y:auto;" id="stockList">';
      html += inv.map(i => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom stock-pick-row" style="border-color:var(--border-light)!important;cursor:pointer;"
          data-name="${i.name}" data-brand="${i.brand}" data-spec="${i.spec}" data-cost="${Math.round(i.avg_cost||0)}" data-price="${i.price}" data-cat="${i.category_path||i.category_name}">
          <div><strong>${i.name}</strong> <span class="small text-muted">${i.brand} ${i.spec}</span><br><span class="badge bg-light text-dark small">${i.category_path||i.category_name}</span></div>
          <div class="text-end"><div>售 $${Fmt.currency(i.price)}</div><div class="small text-muted">成本 $${Fmt.currency(Math.round(i.avg_cost||0))}</div></div>
        </div>`).join('');
      html += '</div>';

      App.showModal('從庫存選取', html, '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>');

      // 搜尋
      document.getElementById('stockSearchInput').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.stock-pick-row').forEach(row => {
          const match = row.dataset.name.toLowerCase().includes(q) || row.dataset.brand.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
        });
      });

      // 點擊選取
      document.getElementById('stockList').addEventListener('click', (e) => {
        const row = e.target.closest('.stock-pick-row');
        if (!row) return;
        const tbody = document.getElementById('quotItemsBody');
        // 取得分類（用子分類名或第一段）
        const catParts = (row.dataset.cat || '').split(' › ');
        const cat = catParts[catParts.length - 1] || '';
        tbody.insertAdjacentHTML('beforeend', this.itemRow({
          category: cat, name: row.dataset.name, spec: `${row.dataset.brand} ${row.dataset.spec}`.trim(),
          cost: parseInt(row.dataset.cost), price: parseInt(row.dataset.price), quantity: 1
        }));
        this.recalcTotal();
        showToast(`已加入 ${row.dataset.name}`);
      });
    });

    document.getElementById('quotItemsBody').addEventListener('click', (e) => {
      if (e.target.closest('.remove-item')) {
        e.target.closest('tr').remove();
        this.recalcTotal();
      }
    });

    document.getElementById('quotItemsBody').addEventListener('input', () => this.recalcTotal());

    // ===== 拖曳排序 =====
    const tbody = document.getElementById('quotItemsBody');
    let dragRow = null;

    tbody.addEventListener('dragstart', (e) => {
      dragRow = e.target.closest('tr');
      if (!dragRow) return;
      dragRow.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });

    tbody.addEventListener('dragend', (e) => {
      if (dragRow) dragRow.style.opacity = '1';
      dragRow = null;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
    });

    tbody.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('tr');
      if (!target || target === dragRow) return;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      target.classList.add('drag-over');
    });

    tbody.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('tr');
      if (!target || !dragRow || target === dragRow) return;
      const rows = [...tbody.querySelectorAll('tr')];
      const dragIdx = rows.indexOf(dragRow);
      const targetIdx = rows.indexOf(target);
      if (dragIdx < targetIdx) {
        target.after(dragRow);
      } else {
        target.before(dragRow);
      }
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
    });

    // 圖片刪除
    if (isEdit) {
      document.querySelectorAll('.del-img').forEach(btn => {
        btn.addEventListener('click', async () => {
          await API.del(`/quotations/${quot.id}/images/${btn.dataset.imgId}`);
          btn.closest('[data-img-id]').remove();
          showToast('圖片已刪除');
        });
      });

      // 圖片上傳
      document.getElementById('quotImageUpload').addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        const formData = new FormData();
        for (const f of files) formData.append('images', f);

        const res = await fetch(`/api/quotations/${quot.id}/images`, {
          method: 'POST',
          headers: { 'x-token': API.getToken() },
          body: formData
        });
        const result = await res.json();
        const container = document.getElementById('quotImages');
        result.forEach(img => {
          container.insertAdjacentHTML('beforeend', `
            <div class="position-relative" data-img-id="${img.id}">
              <img src="/api/quotations/${quot.id}/images/${img.filename}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">
            </div>`);
        });
        showToast(`已上傳 ${result.length} 張圖片`);
        e.target.value = '';
      });
    }

    document.getElementById('saveQuotBtn').addEventListener('click', async () => {
      const form = document.getElementById('quotForm');
      const formData = Object.fromEntries(new FormData(form));
      const rows = document.querySelectorAll('#quotItemsBody tr');
      const itemsArr = [];
      rows.forEach(row => {
        const inputs = row.querySelectorAll('input, select');
        if (inputs.length >= 6) {
          itemsArr.push({
            category: inputs[0].value,
            name: inputs[1].value,
            spec: inputs[2].value,
            cost: parseInt(inputs[3].value) || 0,
            price: parseInt(inputs[4].value) || 0,
            quantity: parseInt(inputs[5].value) || 1
          });
        }
      });

      const data = {
        customer_id: formData.customer_id ? parseInt(formData.customer_id) : null,
        customer_name: formData.customer_name,
        status: formData.status,
        deposit: parseInt(formData.deposit) || 0,
        service_fee: parseInt(formData.service_fee) || 0,
        note: formData.note,
        item_title: formData.item_title || '',
        demand_area: formData.demand_area || '',
        ship_date: formData.ship_date || '',
        delivery_status: formData.delivery_status || '',
        items: itemsArr.filter(i => i.name)
      };

      try {
        if (isEdit) {
          await API.put(`/quotations/${quot.id}`, data);
          showToast('已更新');
        } else {
          const res = await API.post('/quotations', data);
          showToast('已新增，可在編輯中上傳圖片');
        }

        // 成交後自動建立客戶（如果沒有 customer_id 且狀態不是尚未成交）
        if (!data.customer_id && data.customer_name && data.status !== 'draft') {
          try {
            const newCust = await API.post('/customers', {
              name: data.customer_name,
              city: data.demand_area || '',
            });
            // 回寫 customer_id
            const qId = isEdit ? quot.id : null;
            if (qId && newCust.id) {
              await API.put(`/quotations/${qId}`, { ...data, customer_id: newCust.id });
            }
            showToast(`已自動建立客戶: ${data.customer_name}`);
          } catch {}
        }

        App.closeModal();
        this.refresh();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  },

  // 從 catTree 動態生成訂單分類選項
  buildQuotCatOptions(selected) {
    const opt = (name) => `<option ${selected === name ? 'selected' : ''}>${name}</option>`;
    let html = '';
    for (const p of (this._catTree || [])) {
      if (p.children?.length) {
        html += `<optgroup label="${p.name}">`;
        p.children.forEach(c => { html += opt(c.name); });
        html += '</optgroup>';
      } else {
        html += opt(p.name);
      }
    }
    html += opt('服務');
    html += opt('其他');
    return html;
  },

  itemRow(item, idx) {
    const catOptions = this.buildQuotCatOptions(item.category);
    return `
      <tr draggable="true" class="quot-drag-row">
        <td class="drag-handle" style="cursor:grab;width:30px;text-align:center;color:#94a3b8;"><i class="bi bi-grip-vertical"></i></td>
        <td><select class="form-select form-select-sm">${catOptions}</select></td>
        <td><input type="text" class="form-control form-control-sm" value="${item.name || ''}" placeholder="品名"></td>
        <td><input type="text" class="form-control form-control-sm" value="${item.spec || ''}" placeholder="規格"></td>
        <td><input type="number" class="form-control form-control-sm" value="${item.cost || 0}" min="0"></td>
        <td><input type="number" class="form-control form-control-sm" value="${item.price || 0}" min="0"></td>
        <td><input type="number" class="form-control form-control-sm" value="${item.quantity || 1}" min="1" style="width:60px"></td>
        <td><button type="button" class="btn btn-sm btn-outline-danger remove-item"><i class="bi bi-x"></i></button></td>
      </tr>`;
  },

  recalcTotal() {
    const rows = document.querySelectorAll('#quotItemsBody tr');
    let totalCost = 0, totalPrice = 0;
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input[type="number"]');
      if (inputs.length >= 3) {
        const cost = parseInt(inputs[0].value) || 0;
        const price = parseInt(inputs[1].value) || 0;
        const qty = parseInt(inputs[2].value) || 1;
        totalCost += cost * qty;
        totalPrice += price * qty;
      }
    });

    const serviceFee = parseInt(document.getElementById('quotServiceFee')?.value) || 0;
    totalPrice += serviceFee;

    const el1 = document.getElementById('quotTotalPrice');
    const el2 = document.getElementById('quotProfit');
    const el3 = document.getElementById('quotServiceFeeDisplay');
    if (el1) el1.textContent = `$${Fmt.currency(totalPrice)}`;
    if (el3) el3.textContent = `$${Fmt.currency(serviceFee)}`;
    if (el2) {
      const profit = totalPrice - totalCost;
      const margin = totalPrice > 0 ? (profit / totalPrice * 100) : 0;
      el2.textContent = `$${Fmt.currency(profit)} (${Fmt.percent(margin)})`;
      el2.className = profit >= 0 ? 'text-profit' : 'text-loss';
    }
  },

  async exportQuotation(id) {
    const q = await API.get(`/quotations/${id}`);
    const profit = q.total_price - q.total_cost;

    // 嘗試從客戶資料帶入地址
    let custAddr = '', custPhone = '', custName = q.customer_name || '';
    if (q.customer_id) {
      try {
        const cust = await API.get(`/customers/${q.customer_id}`);
        custAddr = [cust.city, cust.district, cust.address].filter(Boolean).join('');
        custPhone = cust.phone || '';
        custName = cust.name || custName;
      } catch {}
    }

    // 匯出設定彈窗
    const exportOpts = await new Promise(resolve => {
      App.showModal('匯出訂單', `
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">有效期限（天）</label>
            <input type="number" class="form-control" id="quotValidDays" value="7" min="1" max="365">
          </div>
          <div class="col-md-8">
            <label class="form-label">客戶名稱</label>
            <input type="text" class="form-control" id="quotExpName" value="${custName}">
          </div>
          <div class="col-md-6">
            <label class="form-label">聯絡電話</label>
            <input type="text" class="form-control" id="quotExpPhone" value="${custPhone}">
          </div>
          <div class="col-md-6">
            <label class="form-label">配送地址</label>
            <input type="text" class="form-control" id="quotExpAddr" value="${custAddr}" placeholder="選填">
          </div>
        </div>
      `, `<button class="btn btn-secondary" data-bs-dismiss="modal" id="quotExportCancel">取消</button>
          <button class="btn btn-primary" id="quotExportConfirm"><i class="bi bi-download"></i> 匯出</button>`);
      document.getElementById('quotExportConfirm').addEventListener('click', () => {
        App.closeModal();
        resolve({
          days: parseInt(document.getElementById('quotValidDays').value) || 7,
          name: document.getElementById('quotExpName').value,
          phone: document.getElementById('quotExpPhone').value,
          addr: document.getElementById('quotExpAddr').value,
        });
      });
      document.getElementById('quotExportCancel').addEventListener('click', () => resolve(null));
    });
    if (!exportOpts) return;
    const { days, name: expName, phone: expPhone, addr: expAddr } = exportOpts;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>訂單${q.quotation_no}</title>
<style>
  body { font-family: -apple-system, 'Microsoft JhengHei', sans-serif; padding: 40px; color: #333; }
  h1 { text-align: center; margin-bottom: 5px; }
  .info { display: flex; justify-content: space-between; margin: 20px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; }
  .text-right { text-align: right; }
  .total-row { font-weight: bold; background: #f9f9f9; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
  .note { margin-top: 20px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
  @media print { body { padding: 20px; } }
</style></head><body>
<h1>估價單</h1>
<p style="text-align:center;color:#666">訂單號: ${q.quotation_no}</p>
<div class="info">
  <div><strong>客戶:</strong> ${expName || '-'}</div>
  <div><strong>日期:</strong> ${Fmt.date(q.created_at)}</div>
</div>
${(expPhone || expAddr) ? `<div class="info" style="margin-top:0;">
  ${expPhone ? `<div><strong>電話:</strong> ${expPhone}</div>` : ''}
  ${expAddr ? `<div><strong>配送地址:</strong> ${expAddr}</div>` : ''}
</div>` : ''}
<table>
  <thead><tr><th>#</th><th>分類</th><th>品名</th><th>規格</th><th class="text-right">單價</th><th class="text-right">數量</th><th class="text-right">小計</th></tr></thead>
  <tbody>
    ${(q.items || []).map((i, idx) => `
    <tr><td>${idx + 1}</td><td>${i.category}</td><td>${i.name}</td><td>${i.spec}</td>
    <td class="text-right">$${Fmt.currency(i.price)}</td><td class="text-right">${i.quantity}</td>
    <td class="text-right">$${Fmt.currency(i.price * i.quantity)}</td></tr>`).join('')}
  </tbody>
  <tfoot>
    ${q.service_fee ? `<tr><td colspan="6" class="text-right">服務費</td><td class="text-right">$${Fmt.currency(q.service_fee)}</td></tr>` : ''}
    <tr class="total-row"><td colspan="6" class="text-right">總計</td><td class="text-right">$${Fmt.currency(q.total_price)}</td></tr>
    ${q.deposit ? `<tr><td colspan="6" class="text-right">已付訂金</td><td class="text-right">$${Fmt.currency(q.deposit)}</td></tr>
    <tr class="total-row"><td colspan="6" class="text-right">尚需付款</td><td class="text-right">$${Fmt.currency(q.total_price - q.deposit)}</td></tr>` : ''}
  </tfoot>
</table>
${q.note ? `<div class="note"><strong>備註:</strong> ${q.note}</div>` : ''}
<div class="footer">此估價單有效期限為 ${days} 天</div>
</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  },

  async exportQC(id) {
    const q = await API.get(`/quotations/${id}`);
    let catTree = [];
    try { catTree = await API.get('/inventory/categories'); } catch {}

    // 從父分類名稱找到所有子分類名稱
    const getCatNames = (parentName) => {
      const parent = catTree.find(c => c.name === parentName);
      if (!parent) return [parentName];
      if (parent.children?.length) return parent.children.map(c => c.name);
      return [parentName];
    };

    // 從項目中提取配置（支援父分類名稱自動展開子分類）
    const getSpec = (parentName) => {
      const names = getCatNames(parentName);
      const items = (q.items || []).filter(i => names.includes(i.category));
      if (!items.length) return '待補充';
      return items.map(i => `${i.name}${i.spec ? ' ' + i.spec : ''}`).join(', ');
    };

    // 取店家資訊
    let shopAddr = '', shopPhone = '', shopLine = '';
    try {
      const [a, p, l] = await Promise.all([
        API.get('/settings/shop_address'),
        API.get('/settings/shop_phone'),
        API.get('/settings/shop_line'),
      ]);
      shopAddr = a.value || '(請至設定頁面填寫)';
      shopPhone = p.value || '(請至設定頁面填寫)';
      shopLine = l.value || '(請至設定頁面填寫)';
    } catch {}

    const deliveryLabels = {
      '': '未設定', preparing: '備料中', assembling: '組裝中',
      testing: '測試中', ready: '待出貨', shipped: '已出貨', delivered: '已送達'
    };

    const qcNo = `QC-${(q.ship_date || '').replace(/-/g, '')}-${String(q.id).padStart(6, '0')}`;
    const now = new Date().toLocaleString('zh-TW');

    const chk = (label) => `<td class="chk-label">${label}</td><td class="chk-box"></td>`;
    const chk2 = (label) => `<td class="chk-label">${label}</td><td class="chk-box chk-wide"></td>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>出機檢查單 ${qcNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Microsoft JhengHei', sans-serif; padding: 40px; color: #333; font-size: 13px; }
  h1 { font-size: 28px; margin-bottom: 2px; }
  .subtitle { color: #888; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; }
  .shop-name { font-size: 14px; color: #666; margin-top: 4px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .header-right { text-align: right; font-size: 12px; color: #555; }
  .header-right div { margin-bottom: 3px; }

  .info-row { display: flex; gap: 20px; margin-bottom: 20px; }
  .info-box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 14px; }
  .info-box h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #555; }
  .info-box p { margin: 4px 0; font-size: 13px; }

  h2 { font-size: 15px; font-weight: 700; margin: 18px 0 10px 0; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; font-size: 12px; }
  th { background: #f5f5f5; font-weight: 600; }

  .config-table td:nth-child(odd) { font-weight: 600; background: #fafafa; width: 12%; }
  .config-table td:nth-child(even) { width: 38%; }

  .section-header { background: #f0f0f0; font-weight: 700; font-size: 12px; }
  .section-header td { padding: 6px 10px; }

  .chk-label { width: 30%; }
  .chk-box { width: 3.3%; min-width: 28px; text-align: center; }
  .chk-wide { width: 20%; }

  .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 40px; padding-top: 10px; }
  .sign-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; }

  @media print {
    body { padding: 20px; }
    @page { margin: 15mm; }
  }
</style></head><body>

<div class="header">
  <div>
    <div class="subtitle">S H I P P I N G &nbsp; Q C</div>
    <h1>出機檢查單</h1>
    <div class="shop-name">星辰電腦 NSZPC</div>
  </div>
  <div class="header-right">
    <div><strong>檢查單號：</strong>${qcNo}</div>
    <div><strong>建立時間：</strong>${now}</div>
    <div><strong>訂單類型：</strong>${deliveryLabels[q.delivery_status] || '未設定'}</div>
  </div>
</div>

<div class="info-row">
  <div class="info-box">
    <h3>出機資訊</h3>
    <p><strong>品項：</strong>${q.item_title || q.customer_name + ' 主機' || '-'}</p>
    <p><strong>需求地區：</strong>${q.demand_area || '-'}</p>
    <p><strong>出貨日期：</strong>${q.ship_date || '-'}</p>
  </div>
  <div class="info-box">
    <h3>店家資訊</h3>
    <p><strong>地址：</strong>${shopAddr}</p>
    <p><strong>電話：</strong>${shopPhone}</p>
    <p><strong>LINE：</strong>${shopLine}</p>
  </div>
</div>

<h2>本機配置</h2>
<table class="config-table">
  <tr><td>CPU</td><td>${getSpec('CPU')}</td><td>主機板</td><td>${getSpec('主機板')}</td></tr>
  <tr><td>RAM</td><td>${getSpec('記憶體')}</td><td>硬碟</td><td>${getSpec('硬碟')}</td></tr>
  <tr><td>顯示卡</td><td>${getSpec('顯示卡')}</td><td>散熱器</td><td>${getSpec('散熱')}</td></tr>
  <tr><td>電源供應器</td><td>${getSpec('電源供應器')}</td><td>機殼</td><td>${getSpec('機殼')}</td></tr>
</table>

<h2>出貨前測試檢測表</h2>
<table>
  <tr class="section-header"><td colspan="6">Windows 系統 (OS)（Windows / Bios）</td></tr>
  <tr>${chk('系統安裝')}${chk('BIOS 優化')}${chk('零組件相關驅動程式')}</tr>
  <tr>${chk('主板驅動安裝')}${chk('顯卡驅動安裝')}${chk('主板(燈光/音效等)')}</tr>
  <tr>${chk('水冷螢幕驅動')}${chk('硬碟4K對齊')}<td></td><td></td></tr>

  <tr class="section-header"><td colspan="6">測試 OCCT（30M/1H）</td></tr>
  <tr>${chk('CPU + RAM')}${chk('CPU')}${chk('RAM')}</tr>
  <tr>${chk('LINPACK')}${chk('3D ADA')}${chk('VRAM')}</tr>
  <tr>${chk('POWER')}<td colspan="4"></td></tr>

  <tr class="section-header"><td colspan="6">測試 R23（測 CPU）</td></tr>
  <tr>${chk('Multi Core')}${chk2('Single Core')}</tr>

  <tr class="section-header"><td colspan="6">測試 AIDA64 + FURMARK（測 CPU / GPU）3H</td></tr>
  <tr><td class="chk-label">CPU 滿載功耗/溫度</td><td class="chk-box"></td>${chk2('GPU 滿載功耗/溫度')}</tr>

  <tr class="section-header"><td colspan="6">其他測試/配件檢查 AS SSD Benchmark</td></tr>
  <tr>${chk('待機瓦數')}${chk('滿載瓦數')}${chk('整體穩定性')}</tr>
  <tr>${chk('WIFI/藍芽')}${chk('前後音源孔')}${chk('前後USB')}</tr>
  <tr>${chk('燈光同步')}${chk('電源線')}${chk('WIFI天線')}</tr>
</table>

<div class="footer-row">
  <div>出貨日期：${q.ship_date || '________'}</div>
  <div>出貨確認簽章：<span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></div>
</div>

</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
};
