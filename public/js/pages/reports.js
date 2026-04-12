// ========== 利潤報表 + 保固 + 維修 + 通知 ==========
const ReportsPage = {
  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      const [profit, warranties, repairs, notifs] = await Promise.all([
        API.get('/reports/profit?period=monthly'),
        API.get('/reports/warranties'),
        API.get('/reports/repairs'),
        API.get('/reports/notifications'),
      ]);

      const t = profit.total || {};

      container.innerHTML = `
        <!-- Tab -->
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><a class="nav-link active" href="#" data-tab="profit"><i class="bi bi-graph-up"></i> 利潤報表</a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-tab="warranty"><i class="bi bi-shield-check"></i> 保固管理 <span class="badge bg-warning text-dark">${notifs.expiringWarranties?.length || 0}</span></a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-tab="repair"><i class="bi bi-tools"></i> 維修工單 <span class="badge bg-danger">${notifs.activeRepairs?.length || 0}</span></a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-tab="notify"><i class="bi bi-bell"></i> 通知提醒</a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-tab="export"><i class="bi bi-download"></i> 匯出/備份</a></li>
        </ul>

        <!-- 利潤報表 -->
        <div id="tabProfit">
          <div class="row g-3 mb-4">
            <div class="col-md-3 col-6"><div class="card stat-card p-3"><div class="stat-value">$${Fmt.currency(t.revenue || 0)}</div><div class="stat-label">總營收</div></div></div>
            <div class="col-md-3 col-6"><div class="card stat-card p-3"><div class="stat-value">$${Fmt.currency(t.cost || 0)}</div><div class="stat-label">總成本</div></div></div>
            <div class="col-md-3 col-6"><div class="card stat-card p-3"><div class="stat-value text-profit">$${Fmt.currency(t.profit || 0)}</div><div class="stat-label">總利潤</div></div></div>
            <div class="col-md-3 col-6"><div class="card stat-card p-3"><div class="stat-value">${t.count || 0}</div><div class="stat-label">完成訂單數</div></div></div>
          </div>
          <div class="row g-3 mb-4">
            <div class="col-md-8"><div class="chart-container"><h6 class="mb-3">月度利潤趨勢</h6><canvas id="chartProfitTrend" height="250"></canvas></div></div>
            <div class="col-md-4"><div class="chart-container"><h6 class="mb-3">客戶利潤排名</h6>
              <div style="max-height:280px;overflow-y:auto;">${(profit.byCustomer || []).map((c,i) => `
                <div class="d-flex justify-content-between py-1 ${i < profit.byCustomer.length-1 ? 'border-bottom' : ''}" style="border-color:var(--border-light)!important;">
                  <span class="small">${c.customer_name}</span><strong class="small text-profit">$${Fmt.currency(c.profit)}</strong>
                </div>`).join('')}</div>
            </div></div>
          </div>
        </div>

        <!-- 保固管理 -->
        <div id="tabWarranty" class="d-none">
          <div class="d-flex justify-content-between mb-3">
            <div class="d-flex gap-2">
              <select class="form-select form-select-sm" id="warStatusFilter" style="width:auto">
                <option value="">全部</option><option value="active">有效</option><option value="expired">已過期</option><option value="claimed">已報修</option>
              </select>
              <input type="text" class="form-control form-control-sm" placeholder="搜尋..." id="warSearch" style="width:150px">
            </div>
            <button class="btn btn-primary btn-sm" id="addWarrantyBtn"><i class="bi bi-plus-lg"></i> 新增保固</button>
          </div>
          <div class="table-container"><div class="table-responsive"><table class="table table-sm table-hover">
            <thead><tr><th>產品</th><th>序號</th><th>客戶</th><th>出貨日</th><th>保固到期</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody id="warTableBody"></tbody>
          </table></div></div>
          <div id="warPagination"></div>
        </div>

        <!-- 維修工單 -->
        <div id="tabRepair" class="d-none">
          <div class="d-flex justify-content-between mb-3">
            <div class="d-flex gap-2">
              <select class="form-select form-select-sm" id="repStatusFilter" style="width:auto">
                <option value="">全部</option><option value="received">已收件</option><option value="diagnosing">檢測中</option>
                <option value="repairing">維修中</option><option value="waiting_parts">等零件</option>
                <option value="completed">已完成</option><option value="returned">已取件</option>
              </select>
              <input type="text" class="form-control form-control-sm" placeholder="搜尋..." id="repSearch" style="width:150px">
            </div>
            <button class="btn btn-primary btn-sm" id="addRepairBtn"><i class="bi bi-plus-lg"></i> 新增工單</button>
          </div>
          <div class="table-container"><div class="table-responsive"><table class="table table-sm table-hover">
            <thead><tr><th>工單號</th><th>客戶</th><th>設備</th><th>問題</th><th>優先</th><th>狀態</th><th>收件日</th><th>操作</th></tr></thead>
            <tbody id="repTableBody"></tbody>
          </table></div></div>
          <div id="repPagination"></div>
        </div>

        <!-- 通知提醒 -->
        <div id="tabNotify" class="d-none">
          <div class="row g-3">
            ${notifs.lowStock?.length ? `<div class="col-md-6"><div class="form-section">
              <h6 class="text-danger"><i class="bi bi-exclamation-triangle"></i> 低庫存 (${notifs.lowStock.length})</h6>
              ${notifs.lowStock.map(i => `<div class="d-flex justify-content-between py-1 border-bottom" style="border-color:var(--border-light)!important;"><span>${i.name}</span><span class="text-danger">${i.quantity} / ${i.min_quantity}</span></div>`).join('')}
            </div></div>` : ''}
            ${notifs.expiringWarranties?.length ? `<div class="col-md-6"><div class="form-section">
              <h6 class="text-warning"><i class="bi bi-shield-exclamation"></i> 保固即將到期 (${notifs.expiringWarranties.length})</h6>
              ${notifs.expiringWarranties.map(w => `<div class="d-flex justify-content-between py-1 border-bottom" style="border-color:var(--border-light)!important;"><span>${w.product_name} - ${w.customer_name}</span><span class="text-warning">${w.warranty_end}</span></div>`).join('')}
            </div></div>` : ''}
            ${notifs.unpaidSettlements?.length ? `<div class="col-md-6"><div class="form-section">
              <h6 class="text-danger"><i class="bi bi-wallet"></i> 未結款 (${notifs.unpaidSettlements.length})</h6>
              ${notifs.unpaidSettlements.map(s => `<div class="d-flex justify-content-between py-1 border-bottom" style="border-color:var(--border-light)!important;"><span>${s.supplier_name}</span><span class="fw-bold">$${Fmt.currency(s.amount)}</span></div>`).join('')}
            </div></div>` : ''}
            ${notifs.activeRepairs?.length ? `<div class="col-md-6"><div class="form-section">
              <h6><i class="bi bi-tools"></i> 進行中維修 (${notifs.activeRepairs.length})</h6>
              ${notifs.activeRepairs.map(r => `<div class="d-flex justify-content-between py-1 border-bottom" style="border-color:var(--border-light)!important;"><span>${r.repair_no} ${r.customer_name}</span><span class="badge bg-light text-dark">${r.status}</span></div>`).join('')}
            </div></div>` : ''}
            <div class="col-12"><div class="form-section">
              <h6><i class="bi bi-line"></i> Line Notify</h6>
              <div class="row g-2">
                <div class="col-md-8"><input type="text" class="form-control form-control-sm" id="lineToken" placeholder="Line Notify Token"></div>
                <div class="col-md-4">
                  <button class="btn btn-sm btn-primary" id="saveLineToken">儲存 Token</button>
                  <button class="btn btn-sm btn-outline-secondary ms-1" id="testLineNotify">測試</button>
                </div>
              </div>
            </div></div>
          </div>
        </div>

        <!-- 匯出/備份 -->
        <div id="tabExport" class="d-none">
          <div class="row g-3">
            <div class="col-md-6"><div class="form-section">
              <h6><i class="bi bi-file-earmark-spreadsheet"></i> 匯出 CSV</h6>
              <div class="d-flex flex-wrap gap-2">
                <a href="/api/reports/export/inventory" class="btn btn-outline-secondary btn-sm"><i class="bi bi-box-seam"></i> 庫存</a>
                <a href="/api/reports/export/customers" class="btn btn-outline-secondary btn-sm"><i class="bi bi-people"></i> 客戶</a>
                <a href="/api/reports/export/quotations" class="btn btn-outline-secondary btn-sm"><i class="bi bi-receipt"></i> 訂單</a>
                <a href="/api/reports/export/repairs" class="btn btn-outline-secondary btn-sm"><i class="bi bi-tools"></i> 維修</a>
              </div>
            </div></div>
            <div class="col-md-6"><div class="form-section">
              <h6><i class="bi bi-database"></i> 資料備份</h6>
              <a href="/api/reports/backup" class="btn btn-primary btn-sm"><i class="bi bi-download"></i> 下載備份檔</a>
              <p class="text-muted small mt-2">備份為 SQLite 資料庫檔案，還原時覆蓋 data/shop.db 後重啟</p>
            </div></div>
          </div>
        </div>
      `;

      this.renderWarranties(warranties);
      this.renderRepairs(repairs);
      this.drawProfitChart(profit.data);
      this.bindEvents();
      this.loadLineToken();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  _warPage: 1, _repPage: 1,

  renderWarranties(list) {
    const tbody = document.getElementById('warTableBody');
    const today = new Date().toISOString().slice(0, 10);
    const pager = Pagination.paginate(list, this._warPage, 15);
    tbody.innerHTML = pager.items.length ? pager.items.map(w => {
      const isExpired = w.warranty_end && w.warranty_end < today;
      const stLabel = { active: '有效', expired: '已過期', claimed: '已報修' }[w.status] || w.status;
      const stColor = { active: '#10b981', expired: '#ef4444', claimed: '#f59e0b' }[w.status] || '#6b7280';
      return `<tr>
        <td><strong>${w.product_name}</strong></td><td class="small">${w.serial_number || '-'}</td>
        <td>${w.customer_name || '-'}</td><td class="small">${w.ship_date || '-'}</td>
        <td class="small ${isExpired ? 'text-danger fw-bold' : ''}">${w.warranty_end || '-'}</td>
        <td><span class="badge" style="background:${stColor}15;color:${stColor};">${stLabel}</span></td>
        <td><button class="btn btn-sm btn-outline-danger del-war" data-id="${w.id}"><i class="bi bi-trash"></i></button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="text-center text-muted py-3">尚無保固紀錄</td></tr>';
    const pgDiv = document.getElementById('warPagination');
    pgDiv.innerHTML = Pagination.renderControls(pager, 'warPager');
    Pagination.bindEvents('warPager', (p, s) => { this._warPage = p; this.renderWarranties(list); });
  },

  renderRepairs(list) {
    const tbody = document.getElementById('repTableBody');
    const pager = Pagination.paginate(list, this._repPage, 15);
    const stLabels = { received:'已收件', diagnosing:'檢測中', repairing:'維修中', waiting_parts:'等零件', completed:'已完成', returned:'已取件', cancelled:'已取消' };
    const stColors = { received:'#6b7280', diagnosing:'#3b82f6', repairing:'#f59e0b', waiting_parts:'#8b5cf6', completed:'#10b981', returned:'#059669', cancelled:'#ef4444' };
    const priLabels = { low:'低', normal:'一般', high:'急件', urgent:'緊急' };
    const priColors = { low:'#6b7280', normal:'#3b82f6', high:'#f59e0b', urgent:'#ef4444' };
    tbody.innerHTML = pager.items.length ? pager.items.map(r => `<tr>
      <td><strong class="cursor-pointer view-repair" data-id="${r.id}">${r.repair_no}</strong></td>
      <td>${r.customer_name || '-'}</td><td>${r.device_name || '-'}</td>
      <td class="small" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.issue || '-'}</td>
      <td><span class="badge" style="background:${priColors[r.priority]||'#6b7280'}15;color:${priColors[r.priority]||'#6b7280'};">${priLabels[r.priority]||r.priority}</span></td>
      <td><span class="badge" style="background:${stColors[r.status]||'#6b7280'}15;color:${stColors[r.status]||'#6b7280'};">${stLabels[r.status]||r.status}</span></td>
      <td class="small">${r.received_date}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary edit-repair" data-id="${r.id}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger del-repair" data-id="${r.id}"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted py-3">尚無維修工單</td></tr>';
    const pgDiv = document.getElementById('repPagination');
    pgDiv.innerHTML = Pagination.renderControls(pager, 'repPager');
    Pagination.bindEvents('repPager', (p, s) => { this._repPage = p; this.renderRepairs(list); });
  },

  drawProfitChart(data) {
    if (!data?.length) return;
    const ctx = document.getElementById('chartProfitTrend');
    if (!ctx) return;
    App.charts.profitTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.period),
        datasets: [
          { label: '營收', data: data.map(d => d.revenue || 0), borderColor: '#374151', backgroundColor: '#37415120', fill: true, tension: 0.3 },
          { label: '利潤', data: data.map(d => d.profit || 0), borderColor: '#10b981', backgroundColor: '#10b98120', fill: true, tension: 0.3 },
        ]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + Fmt.currency(v) } } },
        plugins: { tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + Fmt.currency(ctx.raw) } } }
      }
    });
  },

  bindEvents() {
    // Tab
    document.querySelector('.nav-tabs').addEventListener('click', (e) => {
      const link = e.target.closest('[data-tab]');
      if (!link) return;
      e.preventDefault();
      document.querySelectorAll('.nav-tabs .nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      ['profit','warranty','repair','notify','export'].forEach(t => {
        const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (el) el.classList.toggle('d-none', link.dataset.tab !== t);
      });
    });

    // 保固
    document.getElementById('addWarrantyBtn')?.addEventListener('click', () => this.showWarrantyForm());
    document.getElementById('warTableBody')?.addEventListener('click', async (e) => {
      const del = e.target.closest('.del-war');
      if (del) { await API.del(`/reports/warranties/${del.dataset.id}`); App.navigate('reports'); }
    });

    // 維修
    document.getElementById('addRepairBtn')?.addEventListener('click', () => this.showRepairForm());
    document.getElementById('repTableBody')?.addEventListener('click', async (e) => {
      const view = e.target.closest('.view-repair');
      const edit = e.target.closest('.edit-repair');
      const del = e.target.closest('.del-repair');
      if (view) this.viewRepair(parseInt(view.dataset.id));
      if (edit) this.editRepair(parseInt(edit.dataset.id));
      if (del) { if (confirm('確定刪除？')) { await API.del(`/reports/repairs/${del.dataset.id}`); App.navigate('reports'); } }
    });

    // Line Notify
    document.getElementById('saveLineToken')?.addEventListener('click', async () => {
      await API.put('/settings/line_notify_token', { value: document.getElementById('lineToken').value });
      showToast('Token 已儲存');
    });
    document.getElementById('testLineNotify')?.addEventListener('click', async () => {
      try {
        await API.post('/reports/line-notify', { message: '\n星辰電腦 NSZPC 通知測試成功！' });
        showToast('測試通知已發送');
      } catch (err) { showToast(err.message, 'danger'); }
    });
  },

  async loadLineToken() {
    try {
      const r = await API.get('/settings/line_notify_token');
      const el = document.getElementById('lineToken');
      if (el && r.value) el.value = r.value;
    } catch {}
  },

  showWarrantyForm() {
    App.showModal('新增保固', `<form id="warForm"><div class="row g-3">
      <div class="col-md-6"><label class="form-label">產品名稱 *</label><input type="text" class="form-control" name="product_name" required></div>
      <div class="col-md-6"><label class="form-label">序號</label><input type="text" class="form-control" name="serial_number"></div>
      <div class="col-md-6"><label class="form-label">客戶名稱</label><input type="text" class="form-control" name="customer_name"></div>
      <div class="col-md-3"><label class="form-label">出貨日</label><input type="date" class="form-control" name="ship_date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="col-md-3"><label class="form-label">保固月數</label><input type="number" class="form-control" name="warranty_months" value="12" min="1"></div>
      <div class="col-12"><label class="form-label">備註</label><input type="text" class="form-control" name="note"></div>
    </div></form>`,
    `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" id="saveWar">新增</button>`);
    document.getElementById('saveWar').addEventListener('click', async () => {
      const d = Object.fromEntries(new FormData(document.getElementById('warForm')));
      try { await API.post('/reports/warranties', d); App.closeModal(); App.navigate('reports'); showToast('保固已新增'); }
      catch (err) { showToast(err.message, 'danger'); }
    });
  },

  showRepairForm() {
    App.showModal('新增維修工單', `<form id="repForm"><div class="row g-3">
      <div class="col-md-6"><label class="form-label">客戶名稱</label><input type="text" class="form-control" name="customer_name"></div>
      <div class="col-md-6"><label class="form-label">設備名稱</label><input type="text" class="form-control" name="device_name"></div>
      <div class="col-md-6"><label class="form-label">序號</label><input type="text" class="form-control" name="serial_number"></div>
      <div class="col-md-6"><label class="form-label">優先度</label>
        <select class="form-select" name="priority"><option value="normal">一般</option><option value="high">急件</option><option value="urgent">緊急</option><option value="low">低</option></select>
      </div>
      <div class="col-12"><label class="form-label">問題描述 *</label><textarea class="form-control" name="issue" rows="3" required></textarea></div>
      <div class="col-12"><label class="form-label">備註</label><input type="text" class="form-control" name="note"></div>
    </div></form>`,
    `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" id="saveRep">建立工單</button>`);
    document.getElementById('saveRep').addEventListener('click', async () => {
      const form = document.getElementById('repForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const d = Object.fromEntries(new FormData(form));
      try { await API.post('/reports/repairs', d); App.closeModal(); App.navigate('reports'); showToast('工單已建立'); }
      catch (err) { showToast(err.message, 'danger'); }
    });
  },

  async viewRepair(id) {
    const r = await API.get(`/reports/repairs/${id}`);
    const stLabels = { received:'已收件', diagnosing:'檢測中', repairing:'維修中', waiting_parts:'等零件', completed:'已完成', returned:'已取件' };
    App.showModal(`維修工單 ${r.repair_no}`, `
      <div class="row mb-3">
        <div class="col-4"><strong>客戶:</strong> ${r.customer_name||'-'}</div>
        <div class="col-4"><strong>設備:</strong> ${r.device_name||'-'}</div>
        <div class="col-4"><strong>序號:</strong> ${r.serial_number||'-'}</div>
      </div>
      <div class="row mb-3">
        <div class="col-12"><strong>問題:</strong> ${r.issue||'-'}</div>
        ${r.diagnosis ? `<div class="col-12 mt-1"><strong>診斷:</strong> ${r.diagnosis}</div>` : ''}
        ${r.solution ? `<div class="col-12 mt-1"><strong>解決:</strong> ${r.solution}</div>` : ''}
        ${r.cost ? `<div class="col-12 mt-1"><strong>費用:</strong> $${Fmt.currency(r.cost)}</div>` : ''}
      </div>
      <h6>進度紀錄</h6>
      ${r.logs?.length ? r.logs.map(l => `<div class="d-flex justify-content-between py-1 border-bottom" style="border-color:var(--border-light)!important;">
        <span><span class="badge bg-light text-dark">${stLabels[l.status]||l.status}</span> ${l.description}</span>
        <span class="small text-muted">${l.created_at}</span>
      </div>`).join('') : '<p class="text-muted">無紀錄</p>'}
    `, '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>');
  },

  async editRepair(id) {
    const r = await API.get(`/reports/repairs/${id}`);
    App.showModal(`更新工單 ${r.repair_no}`, `<form id="editRepForm"><div class="row g-3">
      <div class="col-md-6"><label class="form-label">狀態</label>
        <select class="form-select" name="status">
          ${['received','diagnosing','repairing','waiting_parts','completed','returned','cancelled'].map(s => `<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6"><label class="form-label">費用</label><input type="number" class="form-control" name="cost" value="${r.cost||0}" min="0"></div>
      <div class="col-12"><label class="form-label">診斷</label><textarea class="form-control" name="diagnosis" rows="2">${r.diagnosis||''}</textarea></div>
      <div class="col-12"><label class="form-label">解決方案</label><textarea class="form-control" name="solution" rows="2">${r.solution||''}</textarea></div>
      <div class="col-12"><label class="form-label">進度說明</label><input type="text" class="form-control" name="log_msg" placeholder="此次更新說明"></div>
    </div></form>`,
    `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button><button class="btn btn-primary" id="updateRep">更新</button>`);
    document.getElementById('updateRep').addEventListener('click', async () => {
      const d = Object.fromEntries(new FormData(document.getElementById('editRepForm')));
      d.cost = parseInt(d.cost) || 0;
      if (d.status === 'completed' || d.status === 'returned') d.completed_date = new Date().toISOString().slice(0, 10);
      try { await API.put(`/reports/repairs/${id}`, d); App.closeModal(); App.navigate('reports'); showToast('工單已更新'); }
      catch (err) { showToast(err.message, 'danger'); }
    });
  }
};
