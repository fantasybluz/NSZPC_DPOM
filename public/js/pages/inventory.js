// ========== 庫存管理頁面 ==========
const InventoryPage = {
  catTree: [],
  selectedCatId: null,
  allItems: [],

  // 遞迴建構 <option>/<optgroup>（給表單下拉用）
  buildCategoryOptions(selectedId, nodes, depth) {
    nodes = nodes || this.catTree;
    depth = depth || 0;
    let html = '';
    for (const node of nodes) {
      if (node.children?.length) {
        html += `<optgroup label="${'　'.repeat(depth)}${node.name}">`;
        html += this.buildCategoryOptions(selectedId, node.children, depth + 1);
        html += '</optgroup>';
      } else {
        html += `<option value="${node.id}" ${selectedId == node.id ? 'selected' : ''}>${'　'.repeat(depth)}${node.name}</option>`;
      }
    }
    return html;
  },

  // 遞迴計算某節點包含的庫存數量
  countItems(node) {
    if (!this._countCache) {
      this._countCache = {};
      this.allItems.forEach(i => { this._countCache[i.category_id] = (this._countCache[i.category_id] || 0) + 1; });
    }
    if (node.children?.length) return node.children.reduce((s, c) => s + this.countItems(c), 0);
    return this._countCache[node.id] || 0;
  },

  // 遞迴取得所有子孫 ID
  getDescendantIds(node) {
    const ids = [node.id];
    if (node.children) for (const c of node.children) ids.push(...this.getDescendantIds(c));
    return ids;
  },

  // 遞迴找到選中的節點所在路徑（展開用）
  isInPath(node, targetId) {
    if (node.id == targetId) return true;
    if (node.children) return node.children.some(c => this.isInPath(c, targetId));
    return false;
  },

  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      this.catTree = await API.get('/inventory/categories');
      this.allItems = await API.get('/inventory');
      this.selectedCatId = null;
      this._countCache = null;

      container.innerHTML = `
        <!-- 橫向分類樹 -->
        <div class="inv-cat-bar mb-3" id="invCatBar"></div>

        <!-- 工具列 -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <h6 class="mb-0" id="invCatTitle"><i class="bi bi-box-seam"></i> 全部庫存</h6>
            <span class="badge bg-light text-dark" id="invItemCount">0</span>
          </div>
          <div class="d-flex gap-2">
            <input type="text" class="form-control form-control-sm" placeholder="搜尋..." id="invSearch" style="width:140px;max-width:200px;">
            <button class="btn btn-primary btn-sm" id="addInvBtn"><i class="bi bi-plus-lg"></i><span class="d-none d-sm-inline"> 新增</span></button>
          </div>
        </div>
        <div class="d-flex gap-4 mb-3 small" id="invStatsBar"></div>
        <div id="invContent"></div>
        <div id="invPagination"></div>
      `;

      this.renderTree();
      this.renderRight(this.allItems);
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  // ===== 橫向分類列 =====
  renderTree() {
    this._countCache = null;
    const bar = document.getElementById('invCatBar');

    // 頂層分類 tab
    let html = `<div class="inv-cat-tabs">`;
    html += `<button class="inv-cat-tab ${this.selectedCatId === null ? 'active' : ''}" data-cat-id="">
      <i class="bi bi-grid-3x3-gap"></i> 全部 <span class="inv-cat-count">${this.allItems.length}</span></button>`;

    for (const node of this.catTree) {
      const count = this.countItems(node);
      const isActive = this.selectedCatId == node.id || (node.children && this.isInPath(node, this.selectedCatId));
      html += `<button class="inv-cat-tab ${isActive ? 'active' : ''}" data-cat-id="${node.id}">
        <i class="bi bi-${node.icon || 'folder'}"></i> ${node.name} <span class="inv-cat-count">${count}</span></button>`;
    }
    html += `</div>`;

    // 子分類列（如果選中的父分類有子分類）
    const activeParent = this.catTree.find(n => n.id == this.selectedCatId || (n.children && this.isInPath(n, this.selectedCatId)));
    if (activeParent?.children?.length) {
      html += `<div class="inv-cat-sub">`;
      // 「全部」子選項 = 選父分類本身
      html += `<button class="inv-cat-sub-tab ${this.selectedCatId == activeParent.id ? 'active' : ''}" data-cat-id="${activeParent.id}">全部</button>`;
      for (const child of activeParent.children) {
        const cCount = this.countItems(child);
        const hasGrand = child.children?.length > 0;
        const isChildActive = this.selectedCatId == child.id || (hasGrand && this.isInPath(child, this.selectedCatId));
        html += `<button class="inv-cat-sub-tab ${isChildActive ? 'active' : ''}" data-cat-id="${child.id}">
          ${child.name} <span class="inv-cat-count">${cCount}</span></button>`;
      }
      html += `</div>`;

      // 第三層（如果有）
      const activeSub = activeParent.children.find(c => c.id == this.selectedCatId || (c.children && this.isInPath(c, this.selectedCatId)));
      if (activeSub?.children?.length) {
        html += `<div class="inv-cat-sub" style="margin-top:4px;">`;
        html += `<button class="inv-cat-sub-tab ${this.selectedCatId == activeSub.id ? 'active' : ''}" data-cat-id="${activeSub.id}">全部</button>`;
        for (const grand of activeSub.children) {
          const gCount = this.countItems(grand);
          html += `<button class="inv-cat-sub-tab ${this.selectedCatId == grand.id ? 'active' : ''}" data-cat-id="${grand.id}">
            ${grand.name} <span class="inv-cat-count">${gCount}</span></button>`;
        }
        html += `</div>`;
      }
    }

    bar.innerHTML = html;
  },

  // ===== 右側表格 =====
  renderRight(items) {
    const content = document.getElementById('invContent');
    const statsBar = document.getElementById('invStatsBar');
    const countEl = document.getElementById('invItemCount');
    const titleEl = document.getElementById('invCatTitle');

    // 標題：從分類樹找到選中的路徑
    let title = '<i class="bi bi-box-seam"></i> 全部庫存';
    if (this.selectedCatId) {
      const findPath = (nodes, path) => {
        for (const n of nodes) {
          const cur = [...path, n.name];
          if (n.id == this.selectedCatId) return cur;
          if (n.children) { const r = findPath(n.children, cur); if (r) return r; }
        }
        return null;
      };
      const path = findPath(this.catTree, []);
      if (path) title = path.map(p => `<span>${p}</span>`).join(' <span class="text-muted">›</span> ');
    }
    titleEl.innerHTML = title;
    countEl.textContent = items.length + ' 項';

    let totalCost = 0, totalValue = 0, totalQty = 0;
    items.forEach(i => { totalCost += Math.round(i.avg_cost || 0) * i.quantity; totalValue += i.price * i.quantity; totalQty += i.quantity; });
    const totalProfit = totalValue - totalCost;
    statsBar.innerHTML = `
      <div class="stat-pill"><i class="bi bi-archive"></i> 總數量 <strong>${Fmt.currency(totalQty)}</strong></div>
      <div class="stat-pill"><i class="bi bi-cash-stack"></i> 成本 <strong>$${Fmt.currency(totalCost)}</strong></div>
      <div class="stat-pill"><i class="bi bi-tag"></i> 售價 <strong>$${Fmt.currency(totalValue)}</strong></div>
      <div class="stat-pill ${totalProfit >= 0 ? 'text-profit' : 'text-loss'}"><i class="bi bi-graph-up-arrow"></i> 利潤 <strong>$${Fmt.currency(totalProfit)}</strong></div>
    `;

    if (!items.length) {
      content.innerHTML = '<div class="table-container p-4 text-center text-muted">此分類尚無庫存</div>';
      document.getElementById('invPagination').innerHTML = '';
      return;
    }

    // 分頁
    const pager = Pagination.paginate(items, this._page, this._pageSize);
    items = pager.items;

    content.innerHTML = `
      <div class="table-container">
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0">
            <thead>
              <tr>
                ${this.selectedCatId ? '' : '<th>分類</th>'}
                <th>品名</th><th>品牌</th><th>規格</th>
                <th class="text-end">成本</th><th class="text-end">售價</th><th class="text-end">利潤</th>
                <th class="text-center">數量</th><th style="width:110px">操作</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => {
                const cost = Math.round(i.avg_cost || 0);
                const profit = i.price - cost;
                const profitClass = profit > 0 ? 'text-profit' : profit < 0 ? 'text-loss' : '';
                const isLow = i.min_quantity > 0 && i.quantity <= i.min_quantity;
                return `
                  <tr class="${isLow ? 'low-stock' : ''}">
                    ${this.selectedCatId ? '' : `<td><span class="badge bg-light text-dark small">${i.category_path || i.category_name}</span></td>`}
                    <td><strong class="cursor-pointer detail-inv" data-id="${i.id}">${i.name}</strong></td>
                    <td>${i.brand}</td>
                    <td class="small text-muted">${i.spec}</td>
                    <td class="text-end">$${Fmt.currency(cost)}</td>
                    <td class="text-end">$${Fmt.currency(i.price)}</td>
                    <td class="text-end ${profitClass}">$${Fmt.currency(profit)}</td>
                    <td class="text-center">${isLow ? '<i class="bi bi-exclamation-triangle-fill text-danger"></i> ' : ''}${i.quantity}</td>
                    <td class="text-nowrap">
                      <button class="btn btn-sm btn-outline-success stock-in-btn" data-id="${i.id}" data-name="${i.name}" title="進貨"><i class="bi bi-box-arrow-in-down"></i></button>
                      <button class="btn btn-sm btn-outline-warning stock-out-btn" data-id="${i.id}" data-name="${i.name}" data-qty="${i.quantity}" title="出貨"><i class="bi bi-box-arrow-up"></i></button>
                      <button class="btn btn-sm btn-outline-secondary edit-inv" data-id="${i.id}" title="編輯"><i class="bi bi-pencil"></i></button>
                      <button class="btn btn-sm btn-outline-danger del-inv" data-id="${i.id}" title="刪除"><i class="bi bi-trash"></i></button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    // 分頁控制
    document.getElementById('invPagination').innerHTML = Pagination.renderControls(pager, 'invPager');
    Pagination.bindEvents('invPager', (page, size) => {
      this._page = page;
      this._pageSize = size;
      this.filterAndRender();
    });
  },

  _page: 1,
  _pageSize: 20,

  // ===== 事件 =====
  bindEvents() {
    // 分類 tab 點擊
    document.getElementById('invCatBar').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-cat-id]');
      if (!tab) return;
      this.selectedCatId = tab.dataset.catId || null;
      this._page = 1;
      this.renderTree();
      this.filterAndRender();
    });

    let searchTimer;
    document.getElementById('invSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.filterAndRender(), 300);
    });

    document.getElementById('addInvBtn').addEventListener('click', () => this.showForm());

    document.getElementById('invContent').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-inv');
      const delBtn = e.target.closest('.del-inv');
      const inBtn = e.target.closest('.stock-in-btn');
      const outBtn = e.target.closest('.stock-out-btn');
      const detailBtn = e.target.closest('.detail-inv');

      if (detailBtn) this.showDetail(parseInt(detailBtn.dataset.id));
      if (inBtn) this.showStockIn(parseInt(inBtn.dataset.id), inBtn.dataset.name);
      if (outBtn) this.showStockOut(parseInt(outBtn.dataset.id), outBtn.dataset.name, parseInt(outBtn.dataset.qty));
      if (editBtn) {
        const item = this.allItems.find(i => i.id === parseInt(editBtn.dataset.id));
        if (item) this.showForm(item);
      }
      if (delBtn) {
        if (confirm('確定要刪除此商品？')) {
          await API.del(`/inventory/${delBtn.dataset.id}`);
          showToast('已刪除');
          await this.reloadAll();
        }
      }
    });
  },

  filterAndRender() {
    const search = (document.getElementById('invSearch')?.value || '').toLowerCase();
    let items = this.allItems;

    if (this.selectedCatId) {
      // 遞迴找到選中的分類節點
      const findNode = (nodes) => {
        for (const n of nodes) {
          if (n.id == this.selectedCatId) return n;
          if (n.children) { const r = findNode(n.children); if (r) return r; }
        }
        return null;
      };
      const node = findNode(this.catTree);
      if (node) {
        const ids = this.getDescendantIds(node);
        items = items.filter(i => ids.includes(i.category_id));
      }
    }

    if (search) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(search) ||
        i.brand.toLowerCase().includes(search) ||
        (i.spec || '').toLowerCase().includes(search)
      );
    }

    this.renderRight(items);
  },

  async reloadAll() {
    this.allItems = await API.get('/inventory');
    this._countCache = null;
    this.renderTree();
    this.filterAndRender();
  },

  async refresh() { await this.reloadAll(); },

  // ===== 表單 =====
  showForm(item = null) {
    const isEdit = !!item;
    const body = `
      <form id="invForm">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">分類 *</label>
            <select class="form-select" name="category_id" required>
              ${this.buildCategoryOptions(item?.category_id || this.selectedCatId)}
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">品名 *</label>
            <input type="text" class="form-control" name="name" value="${item?.name || ''}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">品牌</label>
            <input type="text" class="form-control" name="brand" value="${item?.brand || ''}">
          </div>
          <div class="col-md-6">
            <label class="form-label">規格</label>
            <input type="text" class="form-control" name="spec" value="${item?.spec || ''}">
          </div>
          <div class="col-md-4">
            <label class="form-label">售價</label>
            <input type="number" class="form-control" name="price" value="${item?.price || 0}" min="0">
          </div>
          <div class="col-md-4">
            <label class="form-label">最低庫存警示</label>
            <input type="number" class="form-control" name="min_quantity" value="${item?.min_quantity || 0}" min="0">
          </div>
          <div class="col-md-4">
            <label class="form-label">備註</label>
            <input type="text" class="form-control" name="note" value="${item?.note || ''}">
          </div>
          ${!isEdit ? `
          <div class="col-12"><hr class="my-1"><h6 class="text-muted small">初始進貨（選填）</h6></div>
          <div class="col-md-4">
            <label class="form-label">進貨數量</label>
            <input type="number" class="form-control" name="initial_qty" value="0" min="0">
          </div>
          <div class="col-md-4">
            <label class="form-label">進貨單價</label>
            <input type="number" class="form-control" name="initial_cost" value="0" min="0">
          </div>
          <div class="col-md-4">
            <label class="form-label">進貨來源</label>
            <input type="text" class="form-control" name="supplier" placeholder="例: 原價屋">
          </div>` : ''}
        </div>
      </form>`;

    App.showModal(isEdit ? '編輯商品' : '新增商品', body,
      `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button type="button" class="btn btn-primary" id="saveInvBtn">${isEdit ? '更新' : '新增'}</button>`);

    document.getElementById('saveInvBtn').addEventListener('click', async () => {
      const form = document.getElementById('invForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = Object.fromEntries(new FormData(form));
      data.category_id = parseInt(data.category_id);
      data.price = parseInt(data.price) || 0;
      data.min_quantity = parseInt(data.min_quantity) || 0;
      if (data.initial_qty) data.initial_qty = parseInt(data.initial_qty) || 0;
      if (data.initial_cost) data.initial_cost = parseInt(data.initial_cost) || 0;
      try {
        if (isEdit) { await API.put(`/inventory/${item.id}`, data); showToast('已更新'); }
        else { await API.post('/inventory', data); showToast('已新增'); }
        App.closeModal();
        await this.reloadAll();
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  showStockIn(id, name) {
    App.showModal(`進貨: ${name}`, `
      <form id="stockInForm"><div class="row g-3">
        <div class="col-md-4"><label class="form-label">數量 *</label><input type="number" class="form-control" name="quantity" required min="1" value="1"></div>
        <div class="col-md-4"><label class="form-label">進貨單價 *</label><input type="number" class="form-control" name="unit_cost" required min="1"></div>
        <div class="col-md-4"><label class="form-label">來源</label><input type="text" class="form-control" name="supplier" placeholder="例: 原價屋"></div>
        <div class="col-12"><label class="form-label">備註</label><input type="text" class="form-control" name="note"></div>
      </div></form>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-success" id="doStockIn"><i class="bi bi-box-arrow-in-down"></i> 確認進貨</button>`);
    document.getElementById('doStockIn').addEventListener('click', async () => {
      const form = document.getElementById('stockInForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const d = Object.fromEntries(new FormData(form));
      try {
        await API.post(`/inventory/${id}/stock-in`, { quantity: parseInt(d.quantity), unit_cost: parseInt(d.unit_cost), supplier: d.supplier, note: d.note });
        showToast('進貨完成'); App.closeModal(); await this.reloadAll();
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  showStockOut(id, name, currentQty) {
    App.showModal(`出貨: ${name}`, `
      <p class="text-muted">目前庫存: <strong>${currentQty}</strong></p>
      <form id="stockOutForm"><div class="row g-3">
        <div class="col-md-6"><label class="form-label">出貨數量 *</label><input type="number" class="form-control" name="quantity" required min="1" max="${currentQty}" value="1"></div>
        <div class="col-md-6"><label class="form-label">原因</label><input type="text" class="form-control" name="reason" value="出貨"></div>
      </div></form>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-warning" id="doStockOut"><i class="bi bi-box-arrow-up"></i> 確認出貨</button>`);
    document.getElementById('doStockOut').addEventListener('click', async () => {
      const form = document.getElementById('stockOutForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const d = Object.fromEntries(new FormData(form));
      try {
        const result = await API.post(`/inventory/${id}/stock-out`, { quantity: parseInt(d.quantity), reason: d.reason });
        showToast(`出貨成功，成本 $${Fmt.currency(result.totalCost)}`); App.closeModal(); await this.reloadAll();
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  async showDetail(id) {
    const d = await API.get(`/inventory/${id}/detail`);
    const methodLabel = d.cost_method === 'fifo' ? '先進先出 (FIFO)' : '加權平均';
    App.showModal(`${d.name}`, `
      <div class="row mb-3">
        <div class="col-6"><strong>分類:</strong> ${d.category_path || d.category_name}</div>
        <div class="col-6"><strong>品牌:</strong> ${d.brand || '-'}</div>
        <div class="col-6 mt-1"><strong>規格:</strong> ${d.spec || '-'}</div>
        <div class="col-6 mt-1"><strong>成本方法:</strong> ${methodLabel}</div>
      </div>
      <div class="row mb-3">
        <div class="col-3"><strong>庫存:</strong> ${d.quantity}</div>
        <div class="col-3"><strong>售價:</strong> $${Fmt.currency(d.price)}</div>
        <div class="col-3"><strong>均價:</strong> $${Fmt.currency(Math.round(d.avg_cost))}</div>
        <div class="col-3"><strong>FIFO:</strong> $${Fmt.currency(d.fifo_cost)}</div>
      </div>
      <h6 class="mt-3"><i class="bi bi-stack"></i> 進貨批次</h6>
      ${d.batches.length ? `<div class="table-responsive"><table class="table table-sm">
        <thead><tr><th>日期</th><th>來源</th><th class="text-end">單價</th><th class="text-center">進貨</th><th class="text-center">剩餘</th></tr></thead>
        <tbody>${d.batches.map(b => `<tr class="${b.remaining === 0 ? 'text-muted' : ''}">
          <td>${b.batch_date}</td><td>${b.supplier || '-'}</td><td class="text-end">$${Fmt.currency(b.unit_cost)}</td>
          <td class="text-center">${b.quantity}</td><td class="text-center fw-bold">${b.remaining}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="text-muted small">尚無進貨紀錄</p>'}
      <h6 class="mt-3"><i class="bi bi-clock-history"></i> 異動紀錄</h6>
      ${d.logs.length ? `<div class="table-responsive" style="max-height:200px;overflow-y:auto;"><table class="table table-sm">
        <thead><tr><th>時間</th><th>類型</th><th class="text-center">數量</th><th class="text-end">單價</th><th>原因</th></tr></thead>
        <tbody>${d.logs.map(l => `<tr><td class="small">${l.created_at}</td>
          <td><span class="badge ${l.type === 'in' ? 'bg-success' : 'bg-warning'}">${l.type === 'in' ? '進貨' : '出貨'}</span></td>
          <td class="text-center">${l.change_qty > 0 ? '+' : ''}${l.change_qty}</td>
          <td class="text-end">$${Fmt.currency(l.unit_cost)}</td><td class="small">${l.reason}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="text-muted small">尚無異動紀錄</p>'}
    `, '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>');
  }
};
