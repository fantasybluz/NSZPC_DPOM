// ========== 儀表板頁面 ==========
const DashboardPage = {
  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';

    try {
      const [invStats, quotStats, monthly, ytApiKeySetting, ytChannelIdSetting, igFollowersSetting, igUsernameSetting] = await Promise.all([
        API.get('/inventory/stats'),
        API.get('/quotations/stats/summary').catch(() => []),
        API.get('/quotations/stats/monthly').catch(() => ({ month: '', byStatus: [], byDelivery: [], recent: [], total: {} })),
        API.get('/settings/youtube_api_key').catch(() => ({ value: '' })),
        API.get('/settings/youtube_channel_id').catch(() => ({ value: '' })),
        API.get('/settings/ig_followers').catch(() => ({ value: '' })),
        API.get('/settings/ig_username').catch(() => ({ value: '' })),
      ]);

      // YouTube 訂閱數
      let ytSubs = null, ytChannelName = '', ytThumb = '';
      const ytApiKey = ytApiKeySetting.value;
      const ytChannelId = ytChannelIdSetting.value;
      if (ytApiKey && ytChannelId) {
        try {
          const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${ytChannelId}&key=${ytApiKey}`);
          const ytData = await ytRes.json();
          if (ytData.items && ytData.items.length) {
            ytSubs = parseInt(ytData.items[0].statistics.subscriberCount);
            ytChannelName = ytData.items[0].snippet.title;
            ytThumb = ytData.items[0].snippet.thumbnails?.default?.url || '';
          }
        } catch {}
      }

      const totalCost = invStats.summary?.total_cost || 0;
      const totalValue = invStats.summary?.total_value || 0;
      const expectedProfit = totalValue - totalCost;

      // 估價單統計
      let totalRevenue = 0, totalProfit = 0, draftCount = 0, completedCount = 0, pendingCount = 0;
      if (Array.isArray(quotStats)) {
        quotStats.forEach(s => {
          if (s.status === 'completed') { completedCount = s.count; totalRevenue = s.revenue || 0; totalProfit = s.profit || 0; }
          if (s.status === 'draft') draftCount = s.count;
          if (s.status === 'pending') pendingCount = s.count;
        });
      }

      container.innerHTML = `
        <!-- 統計卡片 -->
        <div class="row g-3 mb-4">
          <div class="col-xl col-md-4 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon bg-primary bg-opacity-10 text-primary"><i class="bi bi-box-seam"></i></div>
                <div>
                  <div class="stat-value">${Fmt.currency(invStats.summary?.total_items || 0)}</div>
                  <div class="stat-label">庫存品項</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl col-md-4 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon bg-warning bg-opacity-10 text-warning"><i class="bi bi-cash-stack"></i></div>
                <div>
                  <div class="stat-value">$${Fmt.currency(totalCost)}</div>
                  <div class="stat-label">庫存成本</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl col-md-4 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon bg-success bg-opacity-10 text-success"><i class="bi bi-graph-up-arrow"></i></div>
                <div>
                  <div class="stat-value text-profit">$${Fmt.currency(expectedProfit)}</div>
                  <div class="stat-label">預計利潤</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl col-md-4 col-6">
            <div class="card stat-card p-3">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon bg-info bg-opacity-10 text-info"><i class="bi bi-receipt"></i></div>
                <div>
                  <div class="stat-value">${completedCount}</div>
                  <div class="stat-label">已完成訂單</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl col-md-4 col-6">
            <div class="card stat-card p-3" style="cursor:pointer" onclick="App.navigate('youtube')">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:rgba(255,0,0,0.08);">
                  ${ytThumb ? `<img src="${ytThumb}" style="width:100%;height:100%;border-radius:14px;object-fit:cover;">` : '<i class="bi bi-youtube" style="color:#ff0000;"></i>'}
                </div>
                <div>
                  <div class="stat-value" style="color:#ff0000;">${ytSubs !== null ? Fmt.currency(ytSubs) : '--'}</div>
                  <div class="stat-label">${ytChannelName ? ytChannelName : 'YouTube 訂閱'}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-xl col-md-4 col-6">
            <div class="card stat-card p-3" style="cursor:pointer" onclick="App.navigate('youtube')">
              <div class="d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:rgba(228,64,95,0.08);">
                  <i class="bi bi-instagram" style="color:#e4405f;"></i>
                </div>
                <div>
                  <div class="stat-value" style="color:#e4405f;">${igFollowersSetting.value ? Fmt.currency(igFollowersSetting.value) : '--'}</div>
                  <div class="stat-label">${igUsernameSetting.value ? '@' + igUsernameSetting.value : 'IG 追蹤'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 當月訂單狀況 -->
        ${this.renderMonthlyOrders(monthly)}

        <!-- 圖表區 -->
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <div class="chart-container">
              <h6 class="mb-3">庫存分類數量</h6>
              <canvas id="chartCategoryQty" height="250"></canvas>
            </div>
          </div>
          <div class="col-md-6">
            <div class="chart-container">
              <h6 class="mb-3">庫存成本 vs 售價</h6>
              <canvas id="chartCostPrice" height="250"></canvas>
            </div>
          </div>
        </div>

        <!-- 低庫存警示 -->
        ${invStats.lowStock && invStats.lowStock.length ? `
        <div class="chart-container">
          <h6 class="mb-3 text-danger"><i class="bi bi-exclamation-triangle"></i> 低庫存警示</h6>
          <div class="table-responsive">
            <table class="table table-sm">
              <thead><tr><th>分類</th><th>品名</th><th>目前數量</th><th>最低數量</th></tr></thead>
              <tbody>
                ${invStats.lowStock.map(i => `
                  <tr class="low-stock">
                    <td><span class="badge bg-light text-dark small">${i.category_path || i.category_name}</span></td>
                    <td>${i.name}</td>
                    <td class="text-danger fw-bold">${i.quantity}</td>
                    <td>${i.min_quantity}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      `;

      // 繪製圖表
      this.drawCharts(invStats.byCategory);

      // 當月訂單篩選事件
      this.bindMonthlyFilter();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  drawCharts(byCategory) {
    if (!byCategory || !byCategory.length) return;

    const labels = byCategory.map(c => c.category);
    const colors = ['#4a6cf7','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#6b7280'];

    // 數量圖表
    const ctx1 = document.getElementById('chartCategoryQty');
    if (ctx1) {
      App.charts.categoryQty = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: byCategory.map(c => c.total_qty || 0), backgroundColor: colors }]
        },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
      });
    }

    // 成本 vs 售價
    const ctx2 = document.getElementById('chartCostPrice');
    if (ctx2) {
      App.charts.costPrice = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: '成本', data: byCategory.map(c => c.total_cost || 0), backgroundColor: '#ef444480' },
            { label: '售價', data: byCategory.map(c => c.total_value || 0), backgroundColor: '#22c55e80' }
          ]
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + Fmt.currency(v) } } },
          plugins: { tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + Fmt.currency(ctx.raw) } } }
        }
      });
    }
  },

  bindMonthlyFilter() {
    const container = document.querySelector('.chart-container:has(#dashStatusCards)') || document.getElementById('dashStatusCards')?.closest('.chart-container');
    if (!container) return;

    // 點擊狀態卡片或交付 badge
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.dash-filter-card');
      if (!card) return;

      const type = card.dataset.filterType;
      const value = card.dataset.filterValue;

      // toggle: 再次點擊同一個就清除
      if (this._currentFilter?.type === type && this._currentFilter?.value === value) {
        this._currentFilter = null;
      } else {
        this._currentFilter = { type, value };
      }
      this.applyMonthlyFilter();
    });

    // 清除篩選
    document.getElementById('dashFilterClear')?.addEventListener('click', () => {
      this._currentFilter = null;
      this.applyMonthlyFilter();
    });
  },

  applyMonthlyFilter() {
    const filter = this._currentFilter;
    const filterBar = document.getElementById('dashFilterBar');
    const filterLabel = document.getElementById('dashFilterLabel');
    const tableDiv = document.getElementById('dashRecentTable');

    // 更新 active 樣式
    document.querySelectorAll('.dash-filter-card').forEach(el => {
      const isActive = filter && el.dataset.filterType === filter.type && el.dataset.filterValue === filter.value;
      el.style.outline = isActive ? '2px solid var(--accent)' : 'none';
      el.style.outlineOffset = isActive ? '1px' : '0';
    });

    // 篩選
    let filtered = this._monthlyRecent || [];
    if (filter) {
      if (filter.type === 'status') {
        filtered = filtered.filter(q => q.status === filter.value);
      } else if (filter.type === 'delivery') {
        filtered = filtered.filter(q => q.delivery_status === filter.value);
      }

      const labels = filter.type === 'status' ? this._statusLabels : this._deliveryLabels;
      const info = labels[filter.value] || { label: filter.value };
      filterBar.classList.remove('d-none');
      filterBar.classList.add('d-flex');
      filterLabel.textContent = info.label;
    } else {
      filterBar.classList.add('d-none');
      filterBar.classList.remove('d-flex');
    }

    const rows = this.buildRecentRows(filtered, this._statusLabels, this._deliveryLabels);
    if (rows) {
      tableDiv.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0">
            <thead><tr><th>單號</th><th>日期</th><th>客戶</th><th>狀態</th><th>類型</th><th class="text-end">金額</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } else {
      tableDiv.innerHTML = '<p class="text-muted small text-center py-2">無符合的訂單</p>';
    }
  },

  buildRecentRows(orders, statusLabels, deliveryLabels) {
    if (!orders?.length) return '';
    return orders.map(q => {
      const st = statusLabels[q.status] || { label: q.status, color: '#6b7280' };
      const dl = q.delivery_status ? (deliveryLabels[q.delivery_status] || { label: q.delivery_status, color: '#6b7280' }) : null;
      return `
        <tr>
          <td><strong>${q.quotation_no}</strong></td>
          <td class="small text-muted">${Fmt.date(q.created_at)}</td>
          <td>${q.customer_name || '-'}</td>
          <td><span class="badge" style="background:${st.color}15;color:${st.color};">${st.label}</span></td>
          <td>${dl ? `<span class="badge" style="background:${dl.color}15;color:${dl.color};">${dl.label}</span>` : '-'}</td>
          <td class="text-end">$${Fmt.currency(q.total_price)}</td>
        </tr>`;
    }).join('');
  },

  renderMonthlyOrders(monthly) {
    if (!monthly || !monthly.month) return '';

    const [y, m] = monthly.month.split('-');
    const monthLabel = `${y} 年 ${parseInt(m)} 月`;
    const total = monthly.total || {};

    const statusLabels = {
      draft: { label: '尚未成交', icon: 'file-earmark', color: '#6b7280' },
      deposit: { label: '已付訂金', icon: 'cash-coin', color: '#f59e0b' },
      pending: { label: '尚未結單', icon: 'hourglass-split', color: '#3b82f6' },
      completed: { label: '已完成', icon: 'check-circle', color: '#10b981' },
      cancelled: { label: '已取消', icon: 'x-circle', color: '#ef4444' },
    };

    const deliveryLabels = {
      preparing: { label: '備料中', icon: 'box-seam', color: '#8b5cf6' },
      assembling: { label: '組裝中', icon: 'tools', color: '#f59e0b' },
      testing: { label: '測試中', icon: 'speedometer2', color: '#3b82f6' },
      ready: { label: '待出貨', icon: 'truck', color: '#06b6d4' },
      shipped: { label: '已出貨', icon: 'send', color: '#10b981' },
      delivered: { label: '已送達', icon: 'check2-all', color: '#059669' },
    };

    // 儲存資料供篩選用
    this._monthlyRecent = monthly.recent || [];
    this._statusLabels = statusLabels;
    this._deliveryLabels = deliveryLabels;

    // 狀態統計卡片
    const statusCards = (monthly.byStatus || []).map(s => {
      const info = statusLabels[s.status] || { label: s.status, icon: 'circle', color: '#6b7280' };
      return `
        <div class="col">
          <div class="dash-filter-card d-flex align-items-center gap-2 p-2 rounded" style="background:${info.color}08;border:1px solid ${info.color}20;cursor:pointer;"
            data-filter-type="status" data-filter-value="${s.status}">
            <i class="bi bi-${info.icon}" style="color:${info.color};font-size:1.2rem;"></i>
            <div>
              <div class="fw-bold" style="font-size:1.1rem;">${s.count}</div>
              <div class="small" style="color:${info.color};">${info.label}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    // 交付狀態
    const deliveryCards = (monthly.byDelivery || []).map(d => {
      const info = deliveryLabels[d.delivery_status] || { label: d.delivery_status, icon: 'circle', color: '#6b7280' };
      return `
        <span class="badge dash-filter-card d-inline-flex align-items-center gap-1 py-2 px-3" style="background:${info.color}15;color:${info.color};font-size:0.82rem;cursor:pointer;"
          data-filter-type="delivery" data-filter-value="${d.delivery_status}">
          <i class="bi bi-${info.icon}"></i> ${info.label} <strong>${d.count}</strong>
        </span>`;
    }).join(' ');

    // 最近訂單
    const recentRows = this.buildRecentRows(monthly.recent || [], statusLabels, deliveryLabels);

    return `
      <div class="chart-container mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0"><i class="bi bi-calendar3"></i> ${monthLabel} 訂單狀況</h6>
          <div class="small text-muted">
            共 <strong>${total.count || 0}</strong> 筆 ｜
            營收 <strong>$${Fmt.currency(total.revenue || 0)}</strong> ｜
            毛利 <strong class="${(total.profit || 0) >= 0 ? 'text-profit' : 'text-loss'}">$${Fmt.currency(total.profit || 0)}</strong>
          </div>
        </div>

        <!-- 訂單狀態 -->
        <div class="row g-2 mb-3" id="dashStatusCards">${statusCards || '<div class="col"><p class="text-muted small">本月尚無訂單</p></div>'}</div>

        <!-- 訂單類型 -->
        ${deliveryCards ? `
          <div class="mb-3">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="small text-muted"><strong>訂單類型</strong></span>
            </div>
            <div class="d-flex flex-wrap gap-2" id="dashDeliveryCards">${deliveryCards}</div>
          </div>` : ''}

        <!-- 篩選標示 + 清除 -->
        <div class="d-none align-items-center gap-2 mb-2" id="dashFilterBar">
          <span class="small text-muted">目前篩選:</span>
          <span class="badge bg-dark" id="dashFilterLabel"></span>
          <button class="btn btn-sm btn-outline-secondary" id="dashFilterClear" style="font-size:0.75rem;padding:1px 8px;">清除</button>
        </div>

        <!-- 最近訂單 -->
        <div id="dashRecentTable">
        ${recentRows ? `
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0">
              <thead><tr><th>單號</th><th>日期</th><th>客戶</th><th>狀態</th><th>類型</th><th class="text-end">金額</th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>` : ''}
        </div>
      </div>`;
  }
};
