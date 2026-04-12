// ========== 通用拖曳工具 ==========

const Draggable = {
  // ===== 1. 面板分割線拖曳 =====
  // containerSelector: 包含左右面板的容器
  // leftSelector / rightSelector: 左右面板
  // options: { minLeft, minRight, storageKey }
  splitPanel(containerSelector, leftSelector, rightSelector, options = {}) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const left = container.querySelector(leftSelector);
    const right = container.querySelector(rightSelector);
    if (!left || !right) return;

    const { minLeft = 250, minRight = 250, storageKey } = options;

    // 建立分割線
    const divider = document.createElement('div');
    divider.className = 'split-divider';
    divider.innerHTML = '<div class="split-divider-line"></div>';
    left.after(divider);

    // 設定 flex
    container.style.display = 'flex';
    container.style.flexWrap = 'nowrap';
    left.style.flex = '0 0 auto';
    right.style.flex = '1 1 auto';
    right.style.minWidth = '0';

    // 讀取儲存的寬度
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) left.style.width = saved;
    }

    let isDragging = false;

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      let newWidth = e.clientX - rect.left;
      newWidth = Math.max(minLeft, Math.min(newWidth, rect.width - minRight));
      left.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (storageKey) localStorage.setItem(storageKey, left.style.width);
    });

    // 觸控
    divider.addEventListener('touchstart', (e) => {
      isDragging = true;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      let newWidth = touch.clientX - rect.left;
      newWidth = Math.max(minLeft, Math.min(newWidth, rect.width - minRight));
      left.style.width = newWidth + 'px';
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      if (storageKey) localStorage.setItem(storageKey, left.style.width);
    });
  },

  // ===== 2. 表格欄位寬度拖曳 =====
  resizableColumns(tableSelector) {
    const table = document.querySelector(tableSelector);
    if (!table) return;

    table.style.tableLayout = 'fixed';
    const headers = table.querySelectorAll('thead th');

    headers.forEach((th, idx) => {
      if (idx === headers.length - 1) return; // 最後一欄不用

      const grip = document.createElement('div');
      grip.className = 'col-resize-grip';
      th.style.position = 'relative';
      th.appendChild(grip);

      let startX, startWidth, nextStartWidth;
      const nextTh = headers[idx + 1];

      grip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.pageX;
        startWidth = th.offsetWidth;
        nextStartWidth = nextTh?.offsetWidth || 0;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (e) => {
          const diff = e.pageX - startX;
          const newWidth = Math.max(40, startWidth + diff);
          th.style.width = newWidth + 'px';
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  },

  // ===== 3. 表格列拖曳排序 =====
  // tbodySelector: tbody 選擇器
  // onReorder: callback(orderedIds) 排序後回呼
  sortableRows(tbodySelector, onReorder) {
    const tbody = document.querySelector(tbodySelector);
    if (!tbody) return;

    let dragRow = null;

    tbody.querySelectorAll('tr').forEach(row => {
      // 加入拖曳手把
      const firstTd = row.querySelector('td');
      if (!firstTd) return;

      const handle = document.createElement('span');
      handle.className = 'row-drag-handle';
      handle.innerHTML = '<i class="bi bi-grip-vertical"></i>';
      firstTd.insertBefore(handle, firstTd.firstChild);

      row.draggable = true;

      row.addEventListener('dragstart', (e) => {
        // 只從 handle 開始
        dragRow = row;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        tbody.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        dragRow = null;
      });

      row.addEventListener('dragover', (e) => {
        if (!dragRow || dragRow === row) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        tbody.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        row.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragRow || dragRow === row) return;
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) row.before(dragRow);
        else row.after(dragRow);
        row.classList.remove('drag-over-top', 'drag-over-bottom');

        if (onReorder) {
          const ids = [...tbody.querySelectorAll('tr')].map(r => r.dataset.id).filter(Boolean);
          onReorder(ids);
        }
      });
    });
  }
};
