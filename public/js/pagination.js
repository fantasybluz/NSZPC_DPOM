// ========== 通用分頁工具 ==========
const Pagination = {
  defaultPageSize: 20,

  /**
   * 對資料做前端分頁
   * @param {Array} data - 完整資料
   * @param {number} page - 當前頁（從 1 開始）
   * @param {number} pageSize - 每頁筆數
   * @returns {{ items, page, pageSize, totalPages, total }}
   */
  paginate(data, page = 1, pageSize) {
    pageSize = pageSize || this.defaultPageSize;
    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(1, Math.min(page, totalPages));
    const start = (page - 1) * pageSize;
    const items = data.slice(start, start + pageSize);
    return { items, page, pageSize, totalPages, total };
  },

  /**
   * 生成分頁控制列 HTML
   * @param {object} pager - paginate() 的回傳值
   * @param {string} pagerId - 分頁容器 ID（用來綁事件）
   * @returns {string} HTML
   */
  renderControls(pager, pagerId = 'pagination') {
    if (pager.totalPages <= 1 && pager.total <= pager.pageSize) return '';

    const { page, totalPages, total, pageSize } = pager;
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    // 頁碼按鈕
    let pages = '';
    const maxShow = 5;
    let from = Math.max(1, page - Math.floor(maxShow / 2));
    let to = Math.min(totalPages, from + maxShow - 1);
    if (to - from < maxShow - 1) from = Math.max(1, to - maxShow + 1);

    if (from > 1) pages += `<li class="page-item"><a class="page-link" href="#" data-pg="1">1</a></li>`;
    if (from > 2) pages += `<li class="page-item disabled"><span class="page-link">...</span></li>`;

    for (let i = from; i <= to; i++) {
      pages += `<li class="page-item ${i === page ? 'active' : ''}"><a class="page-link" href="#" data-pg="${i}">${i}</a></li>`;
    }

    if (to < totalPages - 1) pages += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    if (to < totalPages) pages += `<li class="page-item"><a class="page-link" href="#" data-pg="${totalPages}">${totalPages}</a></li>`;

    return `
      <div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2" id="${pagerId}">
        <div class="small text-muted">
          顯示 ${start}-${end} 筆，共 ${total} 筆
          <select class="form-select form-select-sm d-inline-block ms-2" style="width:auto;" data-page-size>
            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 筆/頁</option>
            <option value="20" ${pageSize === 20 ? 'selected' : ''}>20 筆/頁</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 筆/頁</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100 筆/頁</option>
          </select>
        </div>
        <nav>
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item ${page <= 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-pg="${page - 1}"><i class="bi bi-chevron-left"></i></a></li>
            ${pages}
            <li class="page-item ${page >= totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-pg="${page + 1}"><i class="bi bi-chevron-right"></i></a></li>
          </ul>
        </nav>
      </div>`;
  },

  /**
   * 綁定分頁事件
   * @param {string} pagerId - 分頁容器 ID
   * @param {function} onPageChange - callback(page, pageSize)
   */
  bindEvents(pagerId, onPageChange) {
    const container = document.getElementById(pagerId);
    if (!container) return;

    container.addEventListener('click', (e) => {
      const link = e.target.closest('[data-pg]');
      if (!link) return;
      e.preventDefault();
      const pg = parseInt(link.dataset.pg);
      if (pg > 0) {
        const sizeSelect = container.querySelector('[data-page-size]');
        const size = sizeSelect ? parseInt(sizeSelect.value) : this.defaultPageSize;
        onPageChange(pg, size);
      }
    });

    const sizeSelect = container.querySelector('[data-page-size]');
    if (sizeSelect) {
      sizeSelect.addEventListener('change', () => {
        onPageChange(1, parseInt(sizeSelect.value));
      });
    }
  }
};
