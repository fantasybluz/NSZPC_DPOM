// ========== 盤商報價頁面 ==========
const SuppliersPage = {
  async render(container) {
    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = `
      <div class="row g-4">
        <!-- 左側: 輸入 -->
        <div class="col-md-6">
          <!-- Tab 切換：文字 / 圖片 OCR -->
          <div class="form-section">
            <ul class="nav nav-tabs mb-3" id="parseTab">
              <li class="nav-item">
                <a class="nav-link active" href="#" data-tab="text"><i class="bi bi-chat-dots"></i> Line 訊息</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" href="#" data-tab="ocr"><i class="bi bi-image"></i> 圖片 OCR</a>
              </li>
            </ul>

            <!-- 共用欄位 -->
            <div class="row g-2 mb-3">
              <div class="col-md-6">
                <label class="form-label">盤商名稱</label>
                <div class="input-group">
                  <input type="text" class="form-control" id="supplierName" list="supplierList" placeholder="選擇或輸入..." autocomplete="off">
                  <button class="btn btn-outline-secondary" type="button" id="editSuppliersBtn" title="管理盤商清單"><i class="bi bi-gear"></i></button>
                </div>
                <datalist id="supplierList"></datalist>
              </div>
              <div class="col-md-6">
                <label class="form-label">報價日期</label>
                <input type="date" class="form-control" id="quoteDate" value="${today}">
              </div>
            </div>

            <!-- 文字輸入 -->
            <div id="tabText">
              <div class="mb-3">
                <label class="form-label">報價訊息</label>
                <textarea class="form-control" id="lineMessage" rows="8" placeholder="貼上 Line 訊息...&#10;例:&#10;AMD R5-7600X $4,590&#10;RTX 4060 Ti $12,800"></textarea>
              </div>
              <button class="btn btn-primary" id="parseBtn"><i class="bi bi-magic"></i> 解析報價</button>
            </div>

            <!-- 圖片 OCR -->
            <div id="tabOcr" class="d-none">
              <div class="mb-3">
                <label class="form-label">上傳報價單圖片</label>
                <input type="file" class="form-control" id="ocrFileInput" accept="image/*">
                <div id="ocrPasteZone" class="ocr-paste-zone mt-2" tabindex="0">
                  <i class="bi bi-clipboard"></i> 或直接 <strong>Ctrl+V</strong> 貼上截圖
                </div>
              </div>
              <div id="ocrPreview" class="mb-3 d-none">
                <img id="ocrImage" style="max-width:100%;border-radius:8px;border:1px solid var(--border);">
              </div>
              <div id="ocrStatus" class="mb-3 d-none">
                <div class="d-flex align-items-center gap-2">
                  <div class="spinner-border spinner-border-sm"></div>
                  <span id="ocrStatusText">辨識中...</span>
                </div>
                <div class="progress mt-2" style="height:4px;">
                  <div class="progress-bar" id="ocrProgress" style="width:0%"></div>
                </div>
              </div>
              <div id="ocrRawText" class="d-none mb-3">
                <label class="form-label">OCR 辨識結果 <span class="text-muted small">（可編輯後再解析）</span></label>
                <textarea class="form-control" id="ocrText" rows="6"></textarea>
              </div>
              <button class="btn btn-primary d-none" id="parseOcrBtn"><i class="bi bi-magic"></i> 解析 OCR 結果</button>
            </div>
          </div>

          <!-- 解析結果 -->
          <div class="form-section d-none" id="parseResults">
            <h6><i class="bi bi-check-circle"></i> 解析結果 <span class="badge bg-dark" id="parseCount">0</span></h6>
            <div id="parseList"></div>
          </div>
        </div>

        <!-- 右側: 歷史報價 -->
        <div class="col-md-6">
          <div class="form-section">
            <h6><i class="bi bi-clock-history"></i> 歷史報價紀錄</h6>
            <div class="d-flex gap-2 mb-3 flex-wrap">
              <input type="text" class="form-control form-control-sm" placeholder="搜尋商品..." id="priceSearch" style="width:140px">
              <input type="text" class="form-control form-control-sm" placeholder="盤商..." id="supplierSearch" style="width:110px">
              <select class="form-select form-select-sm" id="priceMonthFilter" style="width:auto">
                <option value="">全部月份</option>
              </select>
            </div>
            <div id="priceHistory" style="max-height:600px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>
    `;

    this.loadSupplierList();
    this.loadHistory();
    this.bindEvents();
  },

  async loadSupplierList() {
    // 合併: 自定義清單 + 歷史紀錄中的盤商名稱
    let custom = [];
    try {
      const res = await API.get('/settings/supplier_list');
      custom = res.value ? res.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    } catch {}

    let fromHistory = [];
    try {
      const prices = await API.get('/suppliers/prices');
      const set = new Set();
      prices.forEach(p => { if (p.supplier_name) set.add(p.supplier_name); });
      fromHistory = [...set];
    } catch {}

    const all = [...new Set([...custom, ...fromHistory])].sort();
    const datalist = document.getElementById('supplierList');
    if (datalist) {
      datalist.innerHTML = all.map(s => `<option value="${s}">`).join('');
    }
  },

  bindEvents() {
    // 管理盤商清單
    document.getElementById('editSuppliersBtn').addEventListener('click', () => this.showSupplierListEditor());

    // Tab 切換
    document.getElementById('parseTab').addEventListener('click', (e) => {
      const link = e.target.closest('[data-tab]');
      if (!link) return;
      e.preventDefault();
      document.querySelectorAll('#parseTab .nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const tab = link.dataset.tab;
      document.getElementById('tabText').classList.toggle('d-none', tab !== 'text');
      document.getElementById('tabOcr').classList.toggle('d-none', tab !== 'ocr');
    });

    // 文字解析
    document.getElementById('parseBtn').addEventListener('click', async () => {
      const text = document.getElementById('lineMessage').value;
      const supplier = document.getElementById('supplierName').value;
      const quoteDate = document.getElementById('quoteDate').value;
      if (!text.trim()) { showToast('請貼上報價訊息', 'warning'); return; }

      try {
        const result = await API.post('/suppliers/parse', { text, supplier_name: supplier, quote_date: quoteDate });
        this.showParseResults(result);
        this.loadHistory();
      } catch (err) { showToast(err.message, 'danger'); }
    });

    // OCR: 檔案上傳
    document.getElementById('ocrFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.runOcr(file);
    });

    // OCR: Ctrl+V 貼上
    const pasteZone = document.getElementById('ocrPasteZone');
    document.addEventListener('paste', (e) => {
      // 只在 OCR tab 可見時處理
      if (document.getElementById('tabOcr').classList.contains('d-none')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) this.runOcr(file);
          return;
        }
      }
    });

    // 點擊貼上區域提示 focus
    pasteZone.addEventListener('click', () => {
      pasteZone.focus();
      showToast('請按 Ctrl+V 貼上截圖', 'info');
    });

    // OCR 結果解析
    document.getElementById('parseOcrBtn').addEventListener('click', async () => {
      const text = document.getElementById('ocrText').value;
      const supplier = document.getElementById('supplierName').value;
      const quoteDate = document.getElementById('quoteDate').value;
      if (!text.trim()) { showToast('無 OCR 文字', 'warning'); return; }

      try {
        const result = await API.post('/suppliers/parse-ocr', { text, supplier_name: supplier, quote_date: quoteDate });
        this.showParseResults(result);
        this.loadHistory();
      } catch (err) { showToast(err.message, 'danger'); }
    });

    // 搜尋/篩選
    let t;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => this.loadHistory(), 300); };
    document.getElementById('priceSearch').addEventListener('input', refresh);
    document.getElementById('supplierSearch').addEventListener('input', refresh);
    document.getElementById('priceMonthFilter').addEventListener('change', refresh);
  },

  showParseResults(result) {
    const resultsDiv = document.getElementById('parseResults');
    resultsDiv.classList.remove('d-none');
    document.getElementById('parseCount').textContent = result.count;

    if (result.parsed.length === 0) {
      document.getElementById('parseList').innerHTML = '<p class="text-muted">未能解析出任何報價，請檢查內容格式</p>';
      return;
    }

    document.getElementById('parseList').innerHTML = result.parsed.map(p => `
      <div class="parse-result-item">
        <div>
          <strong>${p.product}</strong>
          <div class="text-muted small" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.original}</div>
        </div>
        <span class="badge bg-success fs-6">$${Fmt.currency(p.price)}</span>
      </div>
    `).join('');

    showToast(`成功解析 ${result.count} 筆報價`);
  },

  async loadHistory() {
    const search = document.getElementById('priceSearch')?.value || '';
    const supplier = document.getElementById('supplierSearch')?.value || '';
    const month = document.getElementById('priceMonthFilter')?.value || '';
    let url = '/suppliers/prices?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (supplier) url += `supplier=${encodeURIComponent(supplier)}&`;
    if (month) url += `month=${encodeURIComponent(month)}`;

    try {
      const prices = await API.get(url);
      const div = document.getElementById('priceHistory');

      if (!prices.length) {
        div.innerHTML = '<p class="text-muted text-center">尚無報價紀錄</p>';
        return;
      }

      // 更新月份選項
      const monthSet = new Set();
      prices.forEach(p => {
        const d = p.quote_date || p.parsed_at;
        if (d) monthSet.add(d.slice(0, 7));
      });
      const months = [...monthSet].sort().reverse();
      const monthSelect = document.getElementById('priceMonthFilter');
      const currentVal = monthSelect.value;
      const newOpts = ['<option value="">全部月份</option>',
        ...months.map(m => `<option value="${m}" ${m === currentVal ? 'selected' : ''}>${this.formatMonth(m)}</option>`)
      ].join('');
      if (monthSelect.innerHTML !== newOpts) monthSelect.innerHTML = newOpts;

      // 依月份分組
      const groups = {};
      prices.forEach(p => {
        const d = p.quote_date || p.parsed_at || '';
        const m = d.slice(0, 7) || 'unknown';
        if (!groups[m]) groups[m] = [];
        groups[m].push(p);
      });

      const sortedMonths = Object.keys(groups).sort().reverse();

      div.innerHTML = sortedMonths.map(m => `
        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0" style="font-size:0.9rem;">
              <i class="bi bi-calendar3"></i> ${this.formatMonth(m)}
            </h6>
            <span class="badge bg-secondary">${groups[m].length} 筆</span>
          </div>
          <table class="table table-sm table-hover mb-0">
            <thead><tr><th>盤商</th><th>商品</th><th class="text-end">價格</th><th>日期</th><th></th></tr></thead>
            <tbody>
              ${groups[m].map(p => `
                <tr>
                  <td><span class="badge bg-light text-dark">${p.supplier_name || '-'}</span></td>
                  <td>${p.product_name}</td>
                  <td class="text-end fw-bold">$${Fmt.currency(p.price)}</td>
                  <td class="small text-muted">${p.quote_date || Fmt.date(p.parsed_at)}</td>
                  <td><button class="btn btn-sm btn-outline-danger del-price" data-id="${p.id}"><i class="bi bi-x"></i></button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `).join('');

      div.querySelectorAll('.del-price').forEach(btn => {
        btn.addEventListener('click', async () => {
          await API.del(`/suppliers/prices/${btn.dataset.id}`);
          this.loadHistory();
        });
      });
    } catch (err) {
      console.error(err);
    }
  },

  formatMonth(m) {
    if (!m || m === 'unknown') return '未知';
    const [y, mon] = m.split('-');
    return `${y} 年 ${parseInt(mon)} 月`;
  },

  // ===== OCR 辨識 =====
  async runOcr(file) {
    // 預覽
    const preview = document.getElementById('ocrPreview');
    const img = document.getElementById('ocrImage');
    img.src = URL.createObjectURL(file);
    preview.classList.remove('d-none');

    // 貼上區域反饋
    const pasteZone = document.getElementById('ocrPasteZone');
    pasteZone.innerHTML = '<i class="bi bi-check-circle"></i> 圖片已載入';

    // 開始 OCR
    const status = document.getElementById('ocrStatus');
    const statusText = document.getElementById('ocrStatusText');
    const progress = document.getElementById('ocrProgress');
    status.classList.remove('d-none');
    statusText.textContent = '載入 OCR 引擎...';
    progress.style.width = '0%';

    try {
      const worker = await Tesseract.createWorker('chi_tra+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            progress.style.width = Math.round(m.progress * 100) + '%';
            statusText.textContent = `辨識中 ${Math.round(m.progress * 100)}%`;
          }
        }
      });

      const { data } = await worker.recognize(file);
      await worker.terminate();

      status.classList.add('d-none');

      const rawDiv = document.getElementById('ocrRawText');
      const ocrTextarea = document.getElementById('ocrText');
      rawDiv.classList.remove('d-none');
      ocrTextarea.value = data.text;
      document.getElementById('parseOcrBtn').classList.remove('d-none');

      pasteZone.innerHTML = '<i class="bi bi-clipboard"></i> 或直接 <strong>Ctrl+V</strong> 貼上截圖';
      showToast('OCR 辨識完成');
    } catch (err) {
      status.classList.add('d-none');
      pasteZone.innerHTML = '<i class="bi bi-clipboard"></i> 或直接 <strong>Ctrl+V</strong> 貼上截圖';
      showToast('OCR 辨識失敗: ' + err.message, 'danger');
    }
  },

  // ===== 盤商清單管理 =====
  async showSupplierListEditor() {
    let current = '';
    try {
      const res = await API.get('/settings/supplier_list');
      current = res.value || '';
    } catch {}

    App.showModal('管理盤商清單', `
      <p class="text-muted small">每行一個盤商名稱，儲存後會出現在下拉選單中。</p>
      <textarea class="form-control" id="supplierListText" rows="10" placeholder="原價屋&#10;欣亞&#10;立光&#10;聯強&#10;捷元">${current.split(',').join('\n')}</textarea>
    `, `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
        <button class="btn btn-primary" id="saveSupplierList"><i class="bi bi-save"></i> 儲存</button>`);

    document.getElementById('saveSupplierList').addEventListener('click', async () => {
      const text = document.getElementById('supplierListText').value;
      const list = text.split('\n').map(s => s.trim()).filter(Boolean).join(',');
      try {
        await API.put('/settings/supplier_list', { value: list });
        showToast('盤商清單已更新');
        App.closeModal();
        this.loadSupplierList();
      } catch (err) { showToast(err.message, 'danger'); }
    });
  }
};
