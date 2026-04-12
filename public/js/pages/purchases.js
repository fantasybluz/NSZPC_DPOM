// ========== 結款管理頁面 ==========
const PurchasesPage = {
  suppliers: [],

  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      const [stats, suppliers, settlements] = await Promise.all([
        API.get('/purchases/stats'),
        API.get('/purchases/suppliers'),
        API.get('/purchases/settlements'),
      ]);
      this.suppliers = suppliers;

      const paymentLabels = { weekly: '周結', monthly: '月結', cod: '寄貨付款' };

      container.innerHTML = `
        <!-- 統計卡片 -->
        <div class="row g-3 mb-4">
          <div class="col-md-3 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:rgba(107,114,128,0.08);"><i class="bi bi-calendar-week" style="color:var(--accent);"></i></div>
                <div><div class="stat-value">$${Fmt.currency(stats.weekTotal)}</div><div class="stat-label">本週進貨</div></div>
              </div>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:rgba(107,114,128,0.08);"><i class="bi bi-calendar-month" style="color:var(--accent);"></i></div>
                <div><div class="stat-value">$${Fmt.currency(stats.monthTotal)}</div><div class="stat-label">本月進貨</div></div>
              </div>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:rgba(239,68,68,0.08);"><i class="bi bi-exclamation-circle" style="color:var(--danger);"></i></div>
                <div><div class="stat-value text-loss">$${Fmt.currency(stats.unpaid)}</div><div class="stat-label">尚未結款</div></div>
              </div>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:rgba(16,185,129,0.08);"><i class="bi bi-check-circle" style="color:var(--success);"></i></div>
                <div><div class="stat-value text-profit">$${Fmt.currency(stats.paid)}</div><div class="stat-label">已結款</div></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 盤商進貨圖表 -->
        ${stats.bySupplier?.length ? `
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <div class="chart-container">
              <h6 class="mb-3">本月各盤商進貨金額</h6>
              <canvas id="chartSupplierAmount" height="220"></canvas>
            </div>
          </div>
          <div class="col-md-6">
            <div class="chart-container">
              <h6 class="mb-3">本月各盤商進貨比例</h6>
              <canvas id="chartSupplierPie" height="220"></canvas>
            </div>
          </div>
        </div>` : ''}

        <div class="row g-4">
          <!-- 左側：盤商 + 進貨 -->
          <div class="col-lg-7">
            <!-- 盤商管理 -->
            <div class="form-section">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="bi bi-building"></i> 盤商管理</h6>
                <button class="btn btn-primary btn-sm" id="addSupplierBtn"><i class="bi bi-plus-lg"></i> 新增盤商</button>
              </div>
              <div class="table-responsive">
                <table class="table table-sm table-hover mb-0">
                  <thead><tr><th>盤商</th><th>結款方式</th><th>聯絡</th><th>本月進貨</th><th>操作</th></tr></thead>
                  <tbody>
                    ${suppliers.length ? suppliers.map(s => {
                      const monthData = (stats.bySupplier || []).find(b => b.supplier_name === s.name);
                      return `<tr>
                        <td><strong>${s.name}</strong></td>
                        <td><span class="badge bg-light text-dark">${paymentLabels[s.payment_type] || s.payment_type}</span></td>
                        <td class="small text-muted">${s.contact || '-'}</td>
                        <td class="text-end">$${Fmt.currency(monthData?.total || 0)} <span class="text-muted small">(${monthData?.order_count || 0}筆)</span></td>
                        <td>
                          <button class="btn btn-sm btn-outline-secondary edit-supplier" data-id="${s.id}" data-name="${s.name}" data-type="${s.payment_type}" data-contact="${s.contact || ''}" data-note="${s.note || ''}"><i class="bi bi-pencil"></i></button>
                          <button class="btn btn-sm btn-outline-danger del-supplier" data-id="${s.id}"><i class="bi bi-trash"></i></button>
                        </td>
                      </tr>`;
                    }).join('') : '<tr><td colspan="5" class="text-center text-muted py-3">尚無盤商</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 進貨紀錄 -->
            <div class="form-section">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="bi bi-cart3"></i> 進貨紀錄</h6>
                <button class="btn btn-primary btn-sm" id="addOrderBtn"><i class="bi bi-plus-lg"></i> 新增進貨</button>
              </div>
              <div id="ordersList"></div>
            </div>
          </div>

          <!-- 右側：結款管理 -->
          <div class="col-lg-5">
            <div class="form-section">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="bi bi-wallet2"></i> 結款紀錄</h6>
                <button class="btn btn-primary btn-sm" id="addSettlementBtn"><i class="bi bi-plus-lg"></i> 新增結款</button>
              </div>
              <div class="d-flex gap-2 mb-3">
                <select class="form-select form-select-sm" id="stlStatusFilter" style="width:auto">
                  <option value="">全部</option>
                  <option value="unpaid">尚未結款</option>
                  <option value="paid">已結款</option>
                </select>
              </div>
              <div id="settlementsList"></div>
            </div>
          </div>
        </div>
      `;

      this.loadOrders();
      this.renderSettlements(settlements);
      this.bindEvents();
      this.drawCharts(stats);

      // 拖曳功能
      setTimeout(() => {
        Draggable.splitPanel('.row.g-4:last-of-type', '.col-lg-7', '.col-lg-5', { minLeft: 350, minRight: 280, storageKey: 'purch_split' });
      }, 100);
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  async loadOrders() {
    const orders = await API.get('/purchases/orders');
    const div = document.getElementById('ordersList');
    if (!orders.length) { div.innerHTML = '<p class="text-muted text-center">尚無進貨紀錄</p>'; return; }

    const statusLabels = { pending: '待確認', confirmed: '已確認', received: '已到貨', cancelled: '已取消' };
    const statusColors = { pending: '#f59e0b', confirmed: '#3b82f6', received: '#10b981', cancelled: '#ef4444' };
    const taxLabels = { tax_included: '含稅', tax_excluded: '未稅', tax_free: '免稅' };

    div.innerHTML = `<div class="table-responsive"><table class="table table-sm table-hover mb-0">
      <thead><tr><th>日期</th><th>盤商</th><th>稅別</th><th class="text-end">金額</th><th>狀態</th><th>操作</th></tr></thead>
      <tbody>${orders.map(o => `
        <tr>
          <td class="small">${o.order_date}</td>
          <td>${o.supplier_name}</td>
          <td><span class="badge bg-light text-dark small">${taxLabels[o.tax_type] || '含稅'}</span></td>
          <td class="text-end fw-bold">$${Fmt.currency(o.total_amount)}${o.tax_amount ? `<div class="small text-muted">稅 $${Fmt.currency(o.tax_amount)}</div>` : ''}</td>
          <td><span class="badge" style="background:${statusColors[o.status] || '#6b7280'}20;color:${statusColors[o.status] || '#6b7280'};">${statusLabels[o.status] || o.status}</span></td>
          <td class="text-nowrap">
            ${o.status === 'pending' ? `<button class="btn btn-sm btn-outline-success confirm-order" data-id="${o.id}" title="確認到貨入庫"><i class="bi bi-check-lg"></i></button>` : ''}
            <button class="btn btn-sm btn-outline-secondary view-order" data-id="${o.id}" title="檢視"><i class="bi bi-eye"></i></button>
            <button class="btn btn-sm btn-outline-danger del-order" data-id="${o.id}" title="刪除"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    // 套用欄寬拖曳
    setTimeout(() => Draggable.resizableColumns('#ordersList table'), 50);
  },

  renderSettlements(settlements) {
    const div = document.getElementById('settlementsList');
    if (!settlements.length) { div.innerHTML = '<p class="text-muted text-center">尚無結款紀錄</p>'; return; }

    const taxLabels = { tax_included: '含稅', tax_excluded: '未稅', tax_free: '免稅' };
    div.innerHTML = settlements.map(s => `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom" style="border-color:var(--border-light)!important;">
        <div>
          <strong class="cursor-pointer view-settlement" data-id="${s.id}" data-supplier="${s.supplier_id}" data-start="${s.period_start}" data-end="${s.period_end}">${s.supplier_name}</strong>
          <span class="badge bg-light text-dark small ms-1">${taxLabels[s.tax_type] || '含稅'}</span>
          <div class="small text-muted">${s.period_start || ''} ~ ${s.period_end || ''}${s.tax_amount ? ` (稅 $${Fmt.currency(s.tax_amount)})` : ''}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <strong>$${Fmt.currency(s.amount)}</strong>
          ${s.status === 'unpaid'
            ? `<button class="btn btn-sm btn-outline-success mark-paid" data-id="${s.id}" title="標記已結款"><i class="bi bi-check-lg"></i></button>`
            : '<span class="badge bg-light text-success">已結</span>'}
          <button class="btn btn-sm btn-outline-danger del-settlement" data-id="${s.id}"><i class="bi bi-x"></i></button>
        </div>
      </div>
    `).join('');
  },

  bindEvents() {
    // 新增盤商
    document.getElementById('addSupplierBtn').addEventListener('click', () => this.showSupplierForm());

    // 盤商操作
    document.querySelector('.table')?.addEventListener('click', (e) => {
      const edit = e.target.closest('.edit-supplier');
      const del = e.target.closest('.del-supplier');
      if (edit) this.showSupplierForm({ id: edit.dataset.id, name: edit.dataset.name, payment_type: edit.dataset.type, contact: edit.dataset.contact, note: edit.dataset.note });
      if (del) { if (confirm('確定刪除？')) API.del(`/purchases/suppliers/${del.dataset.id}`).then(() => App.navigate('purchases')).catch(e => showToast(e.message, 'danger')); }
    });

    // 新增進貨
    document.getElementById('addOrderBtn').addEventListener('click', () => this.showOrderForm());

    // 進貨操作
    document.getElementById('ordersList').addEventListener('click', async (e) => {
      const confirm = e.target.closest('.confirm-order');
      const view = e.target.closest('.view-order');
      const del = e.target.closest('.del-order');
      if (confirm) this.showReceiveForm(parseInt(confirm.dataset.id));
      if (view) this.viewOrder(parseInt(view.dataset.id));
      if (del) { if (window.confirm('確定刪除？')) { await API.del(`/purchases/orders/${del.dataset.id}`); App.navigate('purchases'); } }
    });

    // 新增結款
    document.getElementById('addSettlementBtn').addEventListener('click', () => this.showSettlementForm());

    // 結款操作
    document.getElementById('settlementsList').addEventListener('click', async (e) => {
      const pay = e.target.closest('.mark-paid');
      const del = e.target.closest('.del-settlement');
      const view = e.target.closest('.view-settlement');
      if (pay) { await API.put(`/purchases/settlements/${pay.dataset.id}`, { status: 'paid', paid_date: new Date().toISOString().slice(0, 10) }); App.navigate('purchases'); showToast('已標記結款'); }
      if (del) { await API.del(`/purchases/settlements/${del.dataset.id}`); App.navigate('purchases'); }
      if (view) this.viewSettlement(view.dataset.supplier, view.dataset.start, view.dataset.end);
    });

    // 結款篩選
    document.getElementById('stlStatusFilter').addEventListener('change', async () => {
      const status = document.getElementById('stlStatusFilter').value;
      const url = status ? `/purchases/settlements?status=${status}` : '/purchases/settlements';
      const data = await API.get(url);
      this.renderSettlements(data);
    });
  },

  // ===== 盤商表單 =====
  showSupplierForm(data) {
    const isEdit = !!data?.id;
    App.showModal(isEdit ? '編輯盤商' : '新增盤商', `
      <form id="supplierForm"><div class="row g-3">
        <div class="col-md-6"><label class="form-label">名稱 *</label><input type="text" class="form-control" name="name" value="${data?.name || ''}" required></div>
        <div class="col-md-6"><label class="form-label">結款方式</label>
          <select class="form-select" name="payment_type">
            <option value="weekly" ${data?.payment_type === 'weekly' ? 'selected' : ''}>周結</option>
            <option value="monthly" ${data?.payment_type === 'monthly' ? 'selected' : ''}>月結</option>
            <option value="cod" ${data?.payment_type === 'cod' ? 'selected' : ''}>寄貨付款</option>
          </select>
        </div>
        <div class="col-md-6"><label class="form-label">預設稅別</label>
          <select class="form-select" name="default_tax_type">
            <option value="tax_included" ${data?.default_tax_type === 'tax_included' ? 'selected' : ''}>含稅</option>
            <option value="tax_excluded" ${data?.default_tax_type === 'tax_excluded' ? 'selected' : ''}>未稅</option>
          </select>
        </div>
        <div class="col-md-3"><label class="form-label">聯絡方式</label><input type="text" class="form-control" name="contact" value="${data?.contact || ''}"></div>
        <div class="col-md-3"><label class="form-label">備註</label><input type="text" class="form-control" name="note" value="${data?.note || ''}"></div>
      </div></form>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveSupplier">${isEdit ? '更新' : '新增'}</button>`);

    document.getElementById('saveSupplier').addEventListener('click', async () => {
      const form = document.getElementById('supplierForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const d = Object.fromEntries(new FormData(form));
      try {
        if (isEdit) await API.put(`/purchases/suppliers/${data.id}`, d);
        else await API.post('/purchases/suppliers', d);
        App.closeModal(); App.navigate('purchases'); showToast(isEdit ? '已更新' : '已新增');
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  // ===== 進貨表單 =====
  poItemRow() {
    return `<tr class="po-item-row">
      <td><input type="text" class="form-control form-control-sm" placeholder="品名" data-field="name"></td>
      <td><input type="text" class="form-control form-control-sm" placeholder="品牌" data-field="brand"></td>
      <td><input type="text" class="form-control form-control-sm" placeholder="規格" data-field="spec"></td>
      <td><input type="number" class="form-control form-control-sm" value="1" min="1" style="width:60px" data-field="qty"></td>
      <td><input type="number" class="form-control form-control-sm" value="0" min="0" style="width:90px" data-field="cost"></td>
      <td class="text-end fw-bold po-row-total" style="min-width:80px;">$0</td>
      <td><button type="button" class="btn btn-sm btn-outline-danger rm-po-item"><i class="bi bi-x"></i></button></td>
    </tr>`;
  },

  recalcPO() {
    let grandTotal = 0;
    document.querySelectorAll('#poItemsBody .po-item-row').forEach(row => {
      const qty = parseInt(row.querySelector('[data-field="qty"]').value) || 0;
      const cost = parseInt(row.querySelector('[data-field="cost"]').value) || 0;
      const rowTotal = qty * cost;
      grandTotal += rowTotal;
      row.querySelector('.po-row-total').textContent = '$' + Fmt.currency(rowTotal);
    });
    const taxType = document.getElementById('poTaxType')?.value || 'tax_included';
    let taxAmt = 0;
    // 含稅：金額已含 5% 稅，反算稅金；未稅：不加稅
    if (taxType === 'tax_included') taxAmt = Math.round(grandTotal - grandTotal / 1.05);
    const total = grandTotal;

    const footer = document.getElementById('poTotalFooter');
    if (footer) {
      footer.innerHTML = `
        <td colspan="5" class="text-end fw-bold">合計</td><td class="text-end fw-bold" style="font-size:1.05rem;">$${Fmt.currency(total)}</td><td></td>
      </tr>${taxAmt ? `<tr>
        <td colspan="5" class="text-end text-muted small">其中含稅額 (5%)</td><td class="text-end text-muted">$${Fmt.currency(taxAmt)}</td><td></td>
      </tr>` : ''}<tr style="display:none">
      `;
    }
  },

  showOrderForm() {
    const today = new Date().toISOString().slice(0, 10);
    App.showModal('新增進貨', `
      <form id="orderForm"><div class="row g-3">
        <div class="col-md-4"><label class="form-label">盤商 *</label>
          <select class="form-select" name="supplier_id" required id="poSupplierSelect">
            ${this.suppliers.map(s => `<option value="${s.id}" data-tax="${s.default_tax_type || 'tax_included'}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4"><label class="form-label">進貨日期</label><input type="date" class="form-control" name="order_date" value="${today}"></div>
        <div class="col-md-4"><label class="form-label">稅別</label>
          <select class="form-select" name="tax_type" id="poTaxType">
            <option value="tax_included">含稅</option>
            <option value="tax_excluded">未稅</option>
          </select>
        </div>
        <div class="col-12"><label class="form-label">備註</label><input type="text" class="form-control" name="note"></div>
      </div>
      <h6 class="mt-3">進貨明細 <button type="button" class="btn btn-sm btn-outline-primary ms-2" id="addPOItem"><i class="bi bi-plus"></i></button></h6>
      <div class="table-responsive">
        <table class="table table-sm"><thead><tr><th>品名</th><th>品牌</th><th>規格</th><th>數量</th><th>成本</th><th>小計</th><th></th></tr></thead>
        <tbody id="poItemsBody">${this.poItemRow()}</tbody>
        <tfoot><tr id="poTotalFooter"><td colspan="5" class="text-end">合計</td><td class="text-end fw-bold">$0</td><td></td></tr></tfoot></table>
      </div></form>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveOrder">建立進貨</button>`);

    // 盤商切換 → 自動帶入預設稅別
    const supSelect = document.getElementById('poSupplierSelect');
    const taxSelect = document.getElementById('poTaxType');
    supSelect.addEventListener('change', () => {
      const opt = supSelect.options[supSelect.selectedIndex];
      taxSelect.value = opt.dataset.tax || 'tax_included';
    });
    // 初始帶入
    const initOpt = supSelect.options[supSelect.selectedIndex];
    if (initOpt?.dataset.tax) taxSelect.value = initOpt.dataset.tax;

    // 即時計算
    document.getElementById('poItemsBody').addEventListener('input', () => this.recalcPO());
    taxSelect.addEventListener('change', () => this.recalcPO());

    document.getElementById('addPOItem').addEventListener('click', () => {
      document.getElementById('poItemsBody').insertAdjacentHTML('beforeend', this.poItemRow());
      this.recalcPO();
    });
    document.getElementById('poItemsBody').addEventListener('click', e => { if (e.target.closest('.rm-po-item')) { e.target.closest('tr').remove(); this.recalcPO(); } });

    document.getElementById('saveOrder').addEventListener('click', async () => {
      const form = document.getElementById('orderForm');
      const fd = Object.fromEntries(new FormData(form));
      const items = [];
      document.querySelectorAll('#poItemsBody tr').forEach(row => {
        const name = row.querySelector('[data-field="name"]').value;
        if (name) items.push({
          product_name: name,
          brand: row.querySelector('[data-field="brand"]').value || '',
          spec: row.querySelector('[data-field="spec"]').value || '',
          quantity: parseInt(row.querySelector('[data-field="qty"]').value) || 1,
          unit_price: parseInt(row.querySelector('[data-field="cost"]').value) || 0,
        });
      });
      try {
        await API.post('/purchases/orders', { supplier_id: parseInt(fd.supplier_id), order_date: fd.order_date, tax_type: fd.tax_type, note: fd.note, items });
        App.closeModal(); App.navigate('purchases'); showToast('進貨已建立');
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  // ===== 到貨確認（選擇入庫） =====
  async showReceiveForm(orderId) {
    const order = await API.get(`/purchases/orders/${orderId}`);
    const inventory = await API.get('/inventory');

    App.showModal(`確認到貨 — ${order.supplier_name}`, `
      <p class="text-muted small">選擇「入庫商品」可直接將到貨數量加入庫存。不選擇則僅標記到貨。</p>
      <table class="table table-sm">
        <thead><tr><th>品名</th><th>品牌</th><th>規格</th><th>數量</th><th>成本</th><th>入庫至</th></tr></thead>
        <tbody>${(order.items || []).map((item, idx) => `
          <tr>
            <td>${item.product_name}</td>
            <td class="small">${item.brand || ''}</td>
            <td class="small text-muted">${item.spec || ''}</td>
            <td>${item.quantity}</td>
            <td>$${Fmt.currency(item.unit_price)}</td>
            <td>
              <select class="form-select form-select-sm stock-target" data-idx="${idx}" data-qty="${item.quantity}" data-cost="${item.unit_price}">
                <option value="">不入庫（客戶訂單）</option>
                ${inventory.map(inv => `<option value="${inv.id}">${inv.name} (庫存:${inv.quantity})</option>`).join('')}
              </select>
            </td>
          </tr>`).join('')}</tbody>
      </table>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-success" id="confirmReceive"><i class="bi bi-check-lg"></i> 確認到貨</button>`);

    document.getElementById('confirmReceive').addEventListener('click', async () => {
      const stockItems = [];
      document.querySelectorAll('.stock-target').forEach(sel => {
        const invId = parseInt(sel.value);
        if (invId) stockItems.push({ inventory_id: invId, quantity: parseInt(sel.dataset.qty), unit_cost: parseInt(sel.dataset.cost) });
      });
      try {
        await API.post(`/purchases/orders/${orderId}/receive`, { stock_items: stockItems });
        App.closeModal(); App.navigate('purchases');
        showToast(`已確認到貨${stockItems.length ? `，${stockItems.length} 項已入庫` : ''}`);
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  async viewOrder(id) {
    const o = await API.get(`/purchases/orders/${id}`);
    App.showModal(`進貨單 #${o.id}`, `
      <div class="row mb-3">
        <div class="col-4"><strong>盤商:</strong> ${o.supplier_name}</div>
        <div class="col-4"><strong>日期:</strong> ${o.order_date}</div>
        <div class="col-4"><strong>金額:</strong> $${Fmt.currency(o.total_amount)}</div>
      </div>
      ${o.note ? `<p class="text-muted small">備註: ${o.note}</p>` : ''}
      <table class="table table-sm">
        <thead><tr><th>品名</th><th>品牌</th><th>規格</th><th class="text-center">數量</th><th class="text-end">成本</th><th class="text-end">小計</th></tr></thead>
        <tbody>${(o.items || []).map(i => `<tr><td>${i.product_name}</td><td class="small">${i.brand || ''}</td><td class="small text-muted">${i.spec || ''}</td><td class="text-center">${i.quantity}</td><td class="text-end">$${Fmt.currency(i.unit_price)}</td><td class="text-end">$${Fmt.currency(i.unit_price * i.quantity)}</td></tr>`).join('')}</tbody>
      </table>`,
      '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>');
  },

  // ===== 結款表單 =====
  showSettlementForm() {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    App.showModal('新增結款', `
      <form id="stlForm"><div class="row g-3">
        <div class="col-md-4"><label class="form-label">盤商 *</label>
          <select class="form-select" name="supplier_id" required id="stlSupplierSelect">
            ${this.suppliers.map(s => `<option value="${s.id}" data-tax="${s.default_tax_type || 'tax_included'}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4"><label class="form-label">金額 *</label><input type="number" class="form-control" name="amount" required min="0"></div>
        <div class="col-md-4"><label class="form-label">稅別</label>
          <select class="form-select" name="tax_type" id="stlTaxType">
            <option value="tax_included">含稅</option>
            <option value="tax_excluded">未稅</option>
          </select>
        </div>
        <div class="col-md-6"><label class="form-label">期間起</label><input type="date" class="form-control" name="period_start" value="${monthStart}"></div>
        <div class="col-md-6"><label class="form-label">期間迄</label><input type="date" class="form-control" name="period_end" value="${today}"></div>
        <div class="col-12"><label class="form-label">備註</label><input type="text" class="form-control" name="note"></div>
      </div></form>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveStl">建立</button>`);

    // 盤商切換帶入稅別
    const stlSup = document.getElementById('stlSupplierSelect');
    const stlTax = document.getElementById('stlTaxType');
    stlSup.addEventListener('change', () => { stlTax.value = stlSup.options[stlSup.selectedIndex].dataset.tax || 'tax_included'; });
    const stlInitOpt = stlSup.options[stlSup.selectedIndex];
    if (stlInitOpt?.dataset.tax) stlTax.value = stlInitOpt.dataset.tax;

    document.getElementById('saveStl').addEventListener('click', async () => {
      const form = document.getElementById('stlForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const d = Object.fromEntries(new FormData(form));
      try {
        await API.post('/purchases/settlements', { supplier_id: parseInt(d.supplier_id), amount: parseInt(d.amount), tax_type: d.tax_type, period_start: d.period_start, period_end: d.period_end, note: d.note });
        App.closeModal(); App.navigate('purchases'); showToast('結款紀錄已建立');
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  // ===== 圖表 =====
  drawCharts(stats) {
    if (!stats.bySupplier?.length) return;
    const labels = stats.bySupplier.map(s => s.supplier_name);
    const data = stats.bySupplier.map(s => s.total);
    const colors = ['#374151','#6b7280','#9ca3af','#d1d5db','#e5e7eb','#f3f4f6'];

    const ctx1 = document.getElementById('chartSupplierAmount');
    if (ctx1) {
      App.charts.supplierAmount = new Chart(ctx1, {
        type: 'bar',
        data: { labels, datasets: [{ label: '進貨金額', data, backgroundColor: colors.map(c => c + '80') }] },
        options: {
          responsive: true, indexAxis: 'y',
          scales: { x: { beginAtZero: true, ticks: { callback: v => '$' + Fmt.currency(v) } } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '$' + Fmt.currency(ctx.raw) } } }
        }
      });
    }

    const ctx2 = document.getElementById('chartSupplierPie');
    if (ctx2) {
      App.charts.supplierPie = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors }] },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
      });
    }
  },

  // ===== 查看結款期間明細 =====
  async viewSettlement(supplierId, start, end) {
    const orders = await API.get(`/purchases/orders?supplier_id=${supplierId}`);
    const filtered = orders.filter(o => {
      if (start && o.order_date < start) return false;
      if (end && o.order_date > end) return false;
      return true;
    });

    const supplier = this.suppliers.find(s => s.id == supplierId);
    let total = 0;
    filtered.forEach(o => total += o.total_amount);

    App.showModal(`結款明細 — ${supplier?.name || ''}`, `
      <p class="text-muted small">期間: ${start || '-'} ~ ${end || '-'} | 共 ${filtered.length} 筆 | 合計 <strong>$${Fmt.currency(total)}</strong></p>
      ${filtered.length ? `
        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead><tr><th>日期</th><th>狀態</th><th class="text-end">金額</th></tr></thead>
            <tbody>${filtered.map(o => {
              const stLabel = { pending: '待確認', confirmed: '已確認', received: '已到貨' }[o.status] || o.status;
              return `<tr><td>${o.order_date}</td><td>${stLabel}</td><td class="text-end fw-bold">$${Fmt.currency(o.total_amount)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '<p class="text-muted text-center">此期間無進貨紀錄</p>'}
    `, '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>');
  }
};
