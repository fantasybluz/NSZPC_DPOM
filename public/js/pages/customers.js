// ========== 客戶管理頁面 ==========
const CustomersPage = {
  _page: 1,
  _pageSize: 20,
  _allCustomers: [],

  // 台灣各縣市座標 (SVG 上的相對座標)
  cityCoords: {
    '基隆市': { x: 218, y: 42 },
    '台北市': { x: 198, y: 55 }, '新北市': { x: 210, y: 68 },
    '桃園市': { x: 180, y: 82 },
    '新竹市': { x: 172, y: 102 }, '新竹縣': { x: 185, y: 98 },
    '苗栗縣': { x: 168, y: 125 },
    '台中市': { x: 155, y: 155 },
    '彰化縣': { x: 140, y: 178 }, '南投縣': { x: 170, y: 175 },
    '雲林縣': { x: 130, y: 200 },
    '嘉義市': { x: 135, y: 218 }, '嘉義縣': { x: 148, y: 225 },
    '台南市': { x: 125, y: 250 },
    '高雄市': { x: 145, y: 285 },
    '屏東縣': { x: 162, y: 320 },
    '宜蘭縣': { x: 225, y: 85 },
    '花蓮縣': { x: 215, y: 165 },
    '台東縣': { x: 195, y: 275 },
    '澎湖縣': { x: 68, y: 225 },
    '金門縣': { x: 22, y: 175 }, '連江縣': { x: 40, y: 22 },
  },

  sources: ['YouTube', 'Instagram', 'Line', '門市', '朋友介紹', '其他'],
  cities: ['台北市','新北市','基隆市','桃園市','新竹市','新竹縣','苗栗縣','台中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','台南市','高雄市','屏東縣','宜蘭縣','花蓮縣','台東縣','澎湖縣','金門縣','連江縣'],

  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      const [customers, dist] = await Promise.all([
        API.get('/customers'),
        API.get('/customers/stats/distribution')
      ]);

      this._allCustomers = customers;
      this._page = 1;

      container.innerHTML = `
        <!-- Tab -->
        <ul class="nav nav-tabs mb-3" id="custTab">
          <li class="nav-item"><a class="nav-link active" href="#" data-tab="list"><i class="bi bi-list-ul"></i> 客戶列表</a></li>
          <li class="nav-item"><a class="nav-link" href="#" data-tab="chart"><i class="bi bi-bar-chart"></i> 地圖/圖表</a></li>
        </ul>

        <!-- 客戶列表 Tab -->
        <div id="custTabList">
          <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div class="d-flex gap-2 flex-wrap">
              <select class="form-select form-select-sm" id="custSourceFilter" style="width:auto">
                <option value="">全部來源</option>
                ${this.sources.map(s => `<option>${s}</option>`).join('')}
              </select>
              <select class="form-select form-select-sm" id="custCityFilter" style="width:auto">
                <option value="">全部地區</option>
                ${this.cities.map(c => `<option>${c}</option>`).join('')}
              </select>
              <input type="text" class="form-control form-control-sm" placeholder="搜尋..." id="custSearch" style="width:150px">
            </div>
            <button class="btn btn-primary btn-sm" id="addCustBtn"><i class="bi bi-plus-lg"></i> 新增客戶</button>
          </div>
          <div class="table-container">
            <div class="table-responsive">
              <table class="table table-hover table-sm">
                <thead><tr><th>姓名</th><th>電話</th><th>來源</th><th>地區</th><th>建立日期</th><th>操作</th></tr></thead>
                <tbody id="custTableBody"></tbody>
              </table>
            </div>
          </div>
          <div id="custPagination"></div>
        </div>

        <!-- 圖表 Tab -->
        <div id="custTabChart" class="d-none">
          <div class="row g-4">
          <div class="col-lg-7">
            <div class="taiwan-map-container mb-3">
              <h6 class="mb-3"><i class="bi bi-geo-alt"></i> 客戶地區分佈</h6>
              <div id="taiwanMap" style="position:relative;"></div>
            </div>
            <div class="row g-3">
              <div class="col-6">
                <div class="chart-container">
                  <h6 class="mb-2 small">來源分佈</h6>
                  <canvas id="chartSource" height="200"></canvas>
                </div>
              </div>
              <div class="col-6">
                <div class="chart-container">
                  <h6 class="mb-2 small">地區排名</h6>
                  <div id="cityRanking" style="max-height:200px;overflow-y:auto;"></div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      `;

      this.renderTable(customers);
      this.renderMap(dist.byCity);
      this.renderStats(dist);
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  renderTable(customers) {
    const tbody = document.getElementById('custTableBody');
    const pgDiv = document.getElementById('custPagination');
    if (!customers.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">尚無客戶資料</td></tr>';
      if (pgDiv) pgDiv.innerHTML = '';
      return;
    }
    const sourceIcon = (s) => {
      if (s === 'YouTube') return '<i class="bi bi-youtube source-youtube"></i>';
      if (s === 'Instagram') return '<i class="bi bi-instagram source-ig"></i>';
      if (s === 'Line') return '<i class="bi bi-chat-fill source-line"></i>';
      return '<i class="bi bi-person source-other"></i>';
    };

    const pager = Pagination.paginate(customers, this._page, this._pageSize);

    tbody.innerHTML = pager.items.map(c => `
      <tr>
        <td><strong class="cursor-pointer view-cust" data-id="${c.id}">${c.name}</strong></td>
        <td>${c.phone}</td>
        <td>${sourceIcon(c.source)} ${c.source}</td>
        <td>${c.city}${c.district ? ' ' + c.district : ''}</td>
        <td class="small">${Fmt.date(c.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-cust" data-id="${c.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger del-cust" data-id="${c.id}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`).join('');

    if (pgDiv) {
      pgDiv.innerHTML = Pagination.renderControls(pager, 'custPager');
      Pagination.bindEvents('custPager', (page, size) => {
        this._page = page;
        this._pageSize = size;
        this.renderTable(this._allCustomers);
      });
    }
  },

  renderMap(byCity) {
    const mapContainer = document.getElementById('taiwanMap');
    const maxCount = Math.max(...byCity.map(c => c.count), 1);

    // 簡易 SVG 台灣地圖
    let dots = '';
    byCity.forEach(c => {
      const coords = this.cityCoords[c.city];
      if (coords) {
        const r = Math.max(6, Math.min(20, (c.count / maxCount) * 20));
        const opacity = 0.4 + (c.count / maxCount) * 0.6;
        dots += `<circle class="city-dot" cx="${coords.x}" cy="${coords.y}" r="${r}" fill="rgba(75,85,99,${opacity})" stroke="#fff" stroke-width="2">
          <title>${c.city}: ${c.count} 位客戶</title>
        </circle>
        <text x="${coords.x}" y="${coords.y + r + 12}" text-anchor="middle" font-size="10" fill="#666">${c.city.replace('市','').replace('縣','')}</text>`;
      }
    });

    // 加上全部城市的基底點
    Object.entries(this.cityCoords).forEach(([city, coords]) => {
      if (!byCity.find(c => c.city === city)) {
        dots += `<circle cx="${coords.x}" cy="${coords.y}" r="3" fill="#ddd" stroke="#fff" stroke-width="1">
          <title>${city}: 0 位客戶</title>
        </circle>`;
      }
    });

    mapContainer.innerHTML = `
      <svg viewBox="0 0 280 420" style="width:100%;max-height:380px;">
        <!-- 台灣本島 -->
        <path d="
          M 205,30 C 215,28 225,33 228,38
          C 232,42 230,48 227,52
          L 230,58 C 233,62 235,70 232,78
          L 228,85 C 230,92 228,98 225,102
          C 222,108 218,110 215,115
          L 210,125 C 208,132 205,138 200,145
          C 196,152 192,158 190,165
          L 188,175 C 187,185 186,195 185,205
          L 184,215 C 183,222 180,228 178,235
          C 175,245 172,252 168,260
          L 162,270 C 158,278 155,285 152,292
          C 148,300 145,308 143,315
          L 140,325 C 138,332 137,340 140,348
          C 142,355 148,360 155,363
          L 162,365 C 168,366 175,364 180,360
          C 185,355 188,348 190,340
          L 192,330 C 194,322 195,314 195,305
          C 195,295 194,285 192,278
          L 190,268 C 190,260 192,252 195,245
          C 198,238 202,232 205,225
          L 210,215 C 213,208 215,200 217,192
          C 219,182 220,172 220,162
          L 220,150 C 220,140 218,130 215,122
          C 213,115 212,108 213,100
          L 215,90 C 216,82 215,74 212,68
          C 210,62 208,55 207,48
          L 205,40 Z
        " fill="#e8edf5" stroke="#c5cdd8" stroke-width="1.2"/>

        <!-- 西部平原凸出 -->
        <path d="
          M 207,48 C 200,52 192,58 188,65
          C 182,74 178,82 174,90
          L 168,100 C 164,108 160,115 157,122
          C 152,132 148,142 145,152
          L 140,165 C 137,175 134,185 132,195
          C 130,205 128,212 126,220
          L 122,235 C 120,245 118,252 118,260
          C 118,268 120,275 122,282
          L 128,295 C 132,305 135,312 138,320
          C 140,325 140,332 140,340
          L 140,348
        " fill="none" stroke="#c5cdd8" stroke-width="0.8"/>

        <!-- 澎湖 -->
        <ellipse cx="68" cy="225" rx="15" ry="12" fill="#e8edf5" stroke="#c5cdd8" stroke-width="1"/>
        <!-- 金門 -->
        <ellipse cx="22" cy="175" rx="10" ry="7" fill="#e8edf5" stroke="#c5cdd8" stroke-width="1"/>
        <!-- 馬祖 -->
        <ellipse cx="40" cy="22" rx="8" ry="5" fill="#e8edf5" stroke="#c5cdd8" stroke-width="1"/>

        ${dots}
      </svg>`;
  },

  renderStats(dist) {
    // 來源圓餅圖
    if (dist.bySource.length) {
      const ctx = document.getElementById('chartSource');
      const sourceColors = { YouTube: '#ff0000', Instagram: '#e4405f', Line: '#00c300', '門市': '#4a6cf7', '朋友介紹': '#f59e0b', '其他': '#6b7280' };
      App.charts.source = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: dist.bySource.map(s => s.source),
          datasets: [{ data: dist.bySource.map(s => s.count), backgroundColor: dist.bySource.map(s => sourceColors[s.source] || '#6b7280') }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
      });
    }

    // 地區排名
    const ranking = document.getElementById('cityRanking');
    if (dist.byCity.length) {
      ranking.innerHTML = dist.byCity.map((c, i) => `
        <div class="d-flex justify-content-between align-items-center py-1 ${i < dist.byCity.length - 1 ? 'border-bottom' : ''}">
          <span class="small">${i + 1}. ${c.city}</span>
          <span class="badge bg-primary">${c.count}</span>
        </div>`).join('');
    } else {
      ranking.innerHTML = '<p class="text-muted small text-center">尚無資料</p>';
    }
  },

  bindEvents() {
    // Tab 切換
    document.getElementById('custTab').addEventListener('click', (e) => {
      const link = e.target.closest('[data-tab]');
      if (!link) return;
      e.preventDefault();
      document.querySelectorAll('#custTab .nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const tab = link.dataset.tab;
      document.getElementById('custTabList').classList.toggle('d-none', tab !== 'list');
      document.getElementById('custTabChart').classList.toggle('d-none', tab !== 'chart');
    });

    document.getElementById('addCustBtn').addEventListener('click', () => this.showForm());

    const refresh = () => this.refresh();
    document.getElementById('custSourceFilter').addEventListener('change', refresh);
    document.getElementById('custCityFilter').addEventListener('change', refresh);
    let t;
    document.getElementById('custSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, 300); });

    document.getElementById('custTableBody').addEventListener('click', async (e) => {
      const view = e.target.closest('.view-cust');
      const edit = e.target.closest('.edit-cust');
      const del = e.target.closest('.del-cust');

      if (view) this.viewCustomer(parseInt(view.dataset.id));
      if (edit) this.editCustomer(parseInt(edit.dataset.id));
      if (del) {
        if (confirm('確定刪除此客戶？')) {
          await API.del(`/customers/${del.dataset.id}`);
          showToast('已刪除');
          App.navigate('customers');
        }
      }
    });
  },

  async refresh() {
    const source = document.getElementById('custSourceFilter').value;
    const city = document.getElementById('custCityFilter').value;
    const search = document.getElementById('custSearch').value;
    let url = '/customers?';
    if (source) url += `source=${encodeURIComponent(source)}&`;
    if (city) url += `city=${encodeURIComponent(city)}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;
    const customers = await API.get(url);
    this._allCustomers = customers;
    this._page = 1;
    this.renderTable(customers);
  },

  async viewCustomer(id) {
    const c = await API.get(`/customers/${id}`);
    App.showModal(
      c.name,
      `<div class="row mb-3">
        <div class="col-6"><strong>電話:</strong> ${c.phone || '-'}</div>
        <div class="col-6"><strong>Email:</strong> ${c.email || '-'}</div>
        <div class="col-6 mt-2"><strong>來源:</strong> ${c.source || '-'}</div>
        <div class="col-6 mt-2"><strong>地區:</strong> ${c.city} ${c.district}</div>
        <div class="col-12 mt-2"><strong>地址:</strong> ${c.address || '-'}</div>
        ${c.note ? `<div class="col-12 mt-2"><strong>備註:</strong> ${c.note}</div>` : ''}
      </div>

      <h6 class="mt-4">服務紀錄 <button class="btn btn-sm btn-outline-primary ms-2 add-service" data-id="${c.id}"><i class="bi bi-plus"></i></button></h6>
      ${c.services && c.services.length ? `
        <table class="table table-sm">
          <thead><tr><th>日期</th><th>類型</th><th>說明</th><th></th></tr></thead>
          <tbody>${c.services.map(s => `
            <tr><td>${s.service_date}</td><td>${s.service_type}</td><td>${s.description}</td>
            <td><button class="btn btn-sm btn-outline-danger del-svc" data-cid="${c.id}" data-sid="${s.id}"><i class="bi bi-x"></i></button></td></tr>`).join('')}
          </tbody>
        </table>` : '<p class="text-muted">尚無服務紀錄</p>'}

      ${c.quotations && c.quotations.length ? `
        <h6 class="mt-3">相關訂單</h6>
        <table class="table table-sm">
          <thead><tr><th>單號</th><th>狀態</th><th class="text-end">金額</th><th>日期</th></tr></thead>
          <tbody>${c.quotations.map(q => `
            <tr><td>${q.quotation_no}</td><td>${q.status}</td><td class="text-end">$${Fmt.currency(q.total_price)}</td><td>${Fmt.date(q.created_at)}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}`,
      '<button class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>'
    );

    // 綁定服務紀錄事件
    document.querySelector('.add-service')?.addEventListener('click', () => this.addService(id));
    document.querySelectorAll('.del-svc').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.del(`/customers/${btn.dataset.cid}/services/${btn.dataset.sid}`);
        this.viewCustomer(id);
      });
    });
  },

  addService(customerId) {
    const form = document.createElement('div');
    form.innerHTML = `
      <div class="row g-2 mt-2 p-2 bg-light rounded">
        <div class="col-3"><input type="date" class="form-control form-control-sm" id="svcDate" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="col-3"><input type="text" class="form-control form-control-sm" id="svcType" placeholder="類型 (組裝/維修...)"></div>
        <div class="col-4"><input type="text" class="form-control form-control-sm" id="svcDesc" placeholder="說明"></div>
        <div class="col-2"><button class="btn btn-sm btn-primary w-100" id="saveSvc">新增</button></div>
      </div>`;
    document.querySelector('.add-service').after(form);

    document.getElementById('saveSvc').addEventListener('click', async () => {
      await API.post(`/customers/${customerId}/services`, {
        service_date: document.getElementById('svcDate').value,
        service_type: document.getElementById('svcType').value,
        description: document.getElementById('svcDesc').value
      });
      showToast('已新增服務紀錄');
      this.viewCustomer(customerId);
    });
  },

  async editCustomer(id) {
    const customers = await API.get('/customers');
    const c = customers.find(x => x.id === id);
    if (c) this.showForm(c);
  },

  showForm(cust = null) {
    const isEdit = !!cust;
    const body = `
      <form id="custForm">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">姓名 *</label>
            <input type="text" class="form-control" name="name" value="${cust?.name || ''}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">電話</label>
            <input type="text" class="form-control" name="phone" value="${cust?.phone || ''}">
          </div>
          <div class="col-md-6">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" name="email" value="${cust?.email || ''}">
          </div>
          <div class="col-md-6">
            <label class="form-label">來源</label>
            <select class="form-select" name="source">
              <option value="">請選擇</option>
              ${this.sources.map(s => `<option ${cust?.source === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">縣市</label>
            <select class="form-select" name="city">
              <option value="">請選擇</option>
              ${this.cities.map(c => `<option ${cust?.city === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">區域</label>
            <input type="text" class="form-control" name="district" value="${cust?.district || ''}">
          </div>
          <div class="col-md-4">
            <label class="form-label">地址</label>
            <input type="text" class="form-control" name="address" value="${cust?.address || ''}">
          </div>
          <div class="col-12">
            <label class="form-label">備註</label>
            <textarea class="form-control" name="note" rows="2">${cust?.note || ''}</textarea>
          </div>
        </div>
      </form>`;

    App.showModal(
      isEdit ? '編輯客戶' : '新增客戶',
      body,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveCustBtn">${isEdit ? '更新' : '新增'}</button>`
    );

    document.getElementById('saveCustBtn').addEventListener('click', async () => {
      const form = document.getElementById('custForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = Object.fromEntries(new FormData(form));
      try {
        if (isEdit) {
          await API.put(`/customers/${cust.id}`, data);
          showToast('已更新');
        } else {
          await API.post('/customers', data);
          showToast('已新增');
        }
        App.closeModal();
        App.navigate('customers');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }
};
