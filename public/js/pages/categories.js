// ========== 分類管理頁面（支援任意深度）==========
const CategoriesPage = {
  tree: [],

  async render(container) {
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>';
    try {
      this.tree = await API.get('/inventory/categories');
      container.innerHTML = `
        <div class="row g-4">
          <div class="col-lg-8">
            <div class="form-section">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0"><i class="bi bi-diagram-3"></i> 商品分類管理</h6>
                <button class="btn btn-primary btn-sm" id="addRootCatBtn"><i class="bi bi-plus-lg"></i> 新增主分類</button>
              </div>
              <p class="text-muted small mb-3">拖曳 <i class="bi bi-grip-vertical"></i> 可排序，每個分類都可以新增子分類（無深度限制）。</p>
              <div id="catTree"></div>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="form-section">
              <h6><i class="bi bi-info-circle"></i> 說明</h6>
              <ul class="small text-muted" style="line-height:1.8;">
                <li>例: <strong>CPU › AMD › AM5</strong>（三層）</li>
                <li>例: <strong>顯示卡 › 華碩</strong>（兩層）</li>
                <li>例: <strong>電源供應器</strong>（單層）</li>
                <li>庫存只能歸在<strong>最末端分類</strong>（沒有子分類的節點）</li>
                <li>有庫存的分類無法刪除</li>
              </ul>
              <h6 class="mt-3"><i class="bi bi-bootstrap-icons"></i> 可用圖示</h6>
              <div class="d-flex flex-wrap gap-2 small">
                ${['cpu','gpu-card','motherboard','memory','device-hdd','fan','droplet-half','lightning-charge','pc-display','mouse2','keyboard','display','headset'].map(i =>
                  `<span class="badge bg-light text-dark" title="${i}"><i class="bi bi-${i}"></i> ${i}</span>`
                ).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      this.renderTree();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  renderTree() {
    const div = document.getElementById('catTree');
    if (!this.tree.length) {
      div.innerHTML = '<p class="text-muted text-center">尚無分類，點右上角新增</p>';
      return;
    }
    div.innerHTML = this.renderNodes(this.tree, 0);
  },

  renderNodes(nodes, depth) {
    return nodes.map(node => {
      const hasChildren = node.children?.length > 0;
      const indent = depth * 24;
      const depthColors = ['var(--primary)', '#6b7280', '#9ca3af', '#d1d5db'];
      const iconColor = depthColors[Math.min(depth, depthColors.length - 1)];

      return `
        <div class="cat-node" data-cat-id="${node.id}" data-depth="${depth}" draggable="true">
          <div class="cat-node-header" style="padding-left:${12 + indent}px;">
            <div class="d-flex align-items-center gap-2">
              <span class="cat-drag-handle"><i class="bi bi-grip-vertical"></i></span>
              ${hasChildren ? `<i class="bi bi-chevron-down cat-toggle" data-id="${node.id}" style="cursor:pointer;font-size:0.7rem;"></i>` : '<span style="width:12px;"></span>'}
              <i class="bi bi-${node.icon || 'folder'}" style="color:${iconColor};"></i>
              <strong style="font-size:${depth === 0 ? '0.95rem' : '0.88rem'};">${node.name}</strong>
              ${hasChildren ? `<span class="badge bg-light text-dark small">${node.children.length}</span>` : ''}
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary add-sub-cat" data-id="${node.id}" title="新增子分類"><i class="bi bi-plus"></i></button>
              <button class="btn btn-sm btn-outline-secondary edit-cat" data-id="${node.id}" data-name="${node.name}" data-icon="${node.icon || ''}" title="編輯"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger del-cat" data-id="${node.id}" title="刪除"><i class="bi bi-trash"></i></button>
            </div>
          </div>
          ${hasChildren ? `<div class="cat-node-children" id="catChildren_${node.id}">${this.renderNodes(node.children, depth + 1)}</div>` : ''}
        </div>`;
    }).join('');
  },

  bindEvents() {
    document.getElementById('addRootCatBtn').addEventListener('click', () => this.showCatForm(null));

    document.getElementById('catTree').addEventListener('click', async (e) => {
      // 展開/收合
      const toggle = e.target.closest('.cat-toggle');
      if (toggle) {
        const children = document.getElementById(`catChildren_${toggle.dataset.id}`);
        if (children) {
          children.classList.toggle('d-none');
          toggle.classList.toggle('bi-chevron-down');
          toggle.classList.toggle('bi-chevron-right');
        }
        return;
      }

      const addBtn = e.target.closest('.add-sub-cat');
      const editBtn = e.target.closest('.edit-cat');
      const delBtn = e.target.closest('.del-cat');

      if (addBtn) this.showCatForm(parseInt(addBtn.dataset.id));
      if (editBtn) this.showCatForm(null, { id: parseInt(editBtn.dataset.id), name: editBtn.dataset.name, icon: editBtn.dataset.icon });
      if (delBtn) {
        if (!confirm('確定刪除此分類（含所有子分類）？')) return;
        try {
          await API.del(`/inventory/categories/${delBtn.dataset.id}`);
          showToast('已刪除');
          await this.reload();
        } catch (err) { showToast(err.message, 'danger'); }
      }
    });

    this.bindDrag();
  },

  bindDrag() {
    const catTree = document.getElementById('catTree');
    let dragEl = null;

    catTree.querySelectorAll('.cat-node').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragEl = el;
        el.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        if (dragEl) dragEl.style.opacity = '1';
        dragEl = null;
        catTree.querySelectorAll('.drag-over-top,.drag-over-bottom').forEach(d => d.classList.remove('drag-over-top', 'drag-over-bottom'));
      });
      el.addEventListener('dragover', (e) => {
        if (!dragEl || dragEl === el) return;
        // 只允許同層拖曳
        if (dragEl.dataset.depth !== el.dataset.depth) return;
        if (dragEl.parentElement !== el.parentElement) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = el.querySelector('.cat-node-header').getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        catTree.querySelectorAll('.drag-over-top,.drag-over-bottom').forEach(d => d.classList.remove('drag-over-top', 'drag-over-bottom'));
        el.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
      });
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragEl || dragEl === el) return;
        if (dragEl.dataset.depth !== el.dataset.depth) return;
        if (dragEl.parentElement !== el.parentElement) return;
        const rect = el.querySelector('.cat-node-header').getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) el.before(dragEl);
        else el.after(dragEl);
        el.classList.remove('drag-over-top', 'drag-over-bottom');
        await this.saveOrder();
      });
    });
  },

  async saveOrder() {
    const items = [];
    const collect = (container, parentId) => {
      const nodes = container.querySelectorAll(':scope > .cat-node');
      nodes.forEach((el, idx) => {
        const id = parseInt(el.dataset.catId);
        items.push({ id, sort_order: idx + 1, parent_id: parentId });
        const children = el.querySelector('.cat-node-children');
        if (children) collect(children, id);
      });
    };
    collect(document.getElementById('catTree'), null);
    try {
      await API.put('/inventory/categories/reorder', { items });
      await this.reload();
      showToast('排序已更新');
    } catch (err) { showToast(err.message, 'danger'); }
  },

  async reload() {
    this.tree = await API.get('/inventory/categories');
    this.renderTree();
    this.bindDrag();
  },

  showCatForm(parentId, editData) {
    const isEdit = !!editData;
    const title = isEdit ? `編輯: ${editData.name}` : (parentId ? '新增子分類' : '新增主分類');

    App.showModal(title, `
      <form id="catForm">
        <div class="mb-3">
          <label class="form-label">名稱 *</label>
          <input type="text" class="form-control" name="name" value="${editData?.name || ''}" required placeholder="例: AMD、AM5、水冷">
        </div>
        <div class="mb-3">
          <label class="form-label">圖示</label>
          <div class="input-group">
            <span class="input-group-text" id="catIconPreview"><i class="bi bi-${editData?.icon || 'folder'}"></i></span>
            <input type="text" class="form-control" name="icon" value="${editData?.icon || ''}" placeholder="例: cpu, fan" id="catIconInput">
          </div>
        </div>
      </form>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
       <button class="btn btn-primary" id="saveCatBtn">${isEdit ? '更新' : '新增'}</button>`);

    document.getElementById('catIconInput').addEventListener('input', (e) => {
      document.getElementById('catIconPreview').innerHTML = `<i class="bi bi-${e.target.value || 'folder'}"></i>`;
    });

    document.getElementById('saveCatBtn').addEventListener('click', async () => {
      const form = document.getElementById('catForm');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = Object.fromEntries(new FormData(form));
      try {
        if (isEdit) {
          await API.put(`/inventory/categories/${editData.id}`, data);
          showToast('已更新');
        } else {
          if (parentId) data.parent_id = parentId;
          await API.post('/inventory/categories', data);
          showToast('已新增');
        }
        App.closeModal();
        await this.reload();
      } catch (err) { showToast(err.message, 'danger'); }
    });
  }
};
