// ========== YouTube / IG / 店家設定頁面 ==========
const SocialPage = {
  async render(container) {
    let apiKey = '', channelId = '', shopAddr = '', shopPhone = '', shopLine = '', igUsername = '';
    let igFollowers = '', igFollowing = '', igPosts = '', igLastFetch = '';
    try {
      const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = await Promise.all([
        API.get('/settings/youtube_api_key'),
        API.get('/settings/youtube_channel_id'),
        API.get('/settings/shop_address'),
        API.get('/settings/shop_phone'),
        API.get('/settings/shop_line'),
        API.get('/settings/ig_username'),
        API.get('/settings/ig_followers'),
        API.get('/settings/ig_following'),
        API.get('/settings/ig_posts'),
        API.get('/settings/ig_last_fetch'),
      ]);
      apiKey = r1.value || ''; channelId = r2.value || '';
      shopAddr = r3.value || ''; shopPhone = r4.value || ''; shopLine = r5.value || '';
      igUsername = r6.value || ''; igFollowers = r7.value || ''; igFollowing = r8.value || '';
      igPosts = r9.value || ''; igLastFetch = r10.value || '';
    } catch {}

    container.innerHTML = `
      <div class="row g-4">
        <!-- YouTube -->
        <div class="col-md-6">
          <div class="form-section">
            <h6><i class="bi bi-youtube"></i> YouTube 設定</h6>
            <div class="mb-3">
              <label class="form-label">YouTube Data API Key</label>
              <input type="text" class="form-control" id="ytApiKey" value="${apiKey}" placeholder="AIza...">
            </div>
            <div class="mb-3">
              <label class="form-label">頻道 ID</label>
              <input type="text" class="form-control" id="ytChannelId" value="${channelId}" placeholder="UC...">
            </div>
            <button class="btn btn-primary btn-sm" id="saveYtSettings"><i class="bi bi-save"></i> 儲存</button>
            <button class="btn btn-outline-secondary btn-sm ms-2" id="fetchYtData"><i class="bi bi-arrow-clockwise"></i> 查詢</button>
          </div>
          <div class="form-section text-center mt-3" id="ytResult">
            <div class="py-3">
              <i class="bi bi-youtube" style="font-size:2.5rem;color:#ff0000;"></i>
              <p class="text-muted mt-2 small">點擊「查詢」取得訂閱數</p>
            </div>
          </div>
        </div>

        <!-- Instagram -->
        <div class="col-md-6">
          <div class="form-section">
            <h6><i class="bi bi-instagram"></i> Instagram 設定</h6>
            <div class="mb-3">
              <label class="form-label">IG 帳號</label>
              <div class="input-group">
                <span class="input-group-text">@</span>
                <input type="text" class="form-control" id="igUsername" value="${igUsername}" placeholder="nightstarzpc">
              </div>
            </div>
            <button class="btn btn-primary btn-sm" id="saveIgSettings"><i class="bi bi-save"></i> 儲存</button>
            <button class="btn btn-outline-secondary btn-sm ms-2" id="fetchIgData"><i class="bi bi-arrow-clockwise"></i> 自動抓取</button>
            <button class="btn btn-outline-secondary btn-sm ms-2" id="manualIgBtn"><i class="bi bi-pencil"></i> 手動輸入</button>
          </div>
          <div class="form-section mt-3" id="igResult">
            ${igFollowers ? `
              <div class="text-center py-3">
                <i class="bi bi-instagram" style="font-size:2.5rem;color:#e4405f;"></i>
                <h6 class="mt-2">@${igUsername}</h6>
                <div class="row g-3 mt-2">
                  <div class="col-4">
                    <div class="fw-bold" style="font-size:1.5rem;color:#e4405f;">${Fmt.currency(igFollowers)}</div>
                    <div class="small text-muted">追蹤者</div>
                  </div>
                  <div class="col-4">
                    <div class="fw-bold" style="font-size:1.5rem;">${Fmt.currency(igFollowing)}</div>
                    <div class="small text-muted">追蹤中</div>
                  </div>
                  <div class="col-4">
                    <div class="fw-bold" style="font-size:1.5rem;">${Fmt.currency(igPosts)}</div>
                    <div class="small text-muted">貼文</div>
                  </div>
                </div>
                <p class="text-muted small mt-2">上次更新: ${igLastFetch ? new Date(igLastFetch).toLocaleString('zh-TW') : '-'}</p>
              </div>` : `
              <div class="text-center py-3">
                <i class="bi bi-instagram" style="font-size:2.5rem;color:#e4405f;"></i>
                <p class="text-muted mt-2 small">設定帳號後點擊「自動抓取」或「手動輸入」</p>
              </div>`}
          </div>
        </div>

        <!-- 店家資訊 -->
        <div class="col-md-6">
          <div class="form-section">
            <h6><i class="bi bi-shop"></i> 店家資訊</h6>
            <div class="mb-3">
              <label class="form-label">店家地址</label>
              <input type="text" class="form-control" id="shopAddr" value="${shopAddr}" placeholder="例: 高雄市前鎮區凱旋三路 217 號">
            </div>
            <div class="mb-3">
              <label class="form-label">店家電話</label>
              <input type="text" class="form-control" id="shopPhone" value="${shopPhone}" placeholder="例: 07-000-0000">
            </div>
            <div class="mb-3">
              <label class="form-label">LINE ID</label>
              <input type="text" class="form-control" id="shopLine" value="${shopLine}" placeholder="例: @nightstarzpc">
            </div>
            <button class="btn btn-primary btn-sm" id="saveShopSettings"><i class="bi bi-save"></i> 儲存店家資訊</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  },

  bindEvents() {
    // YouTube 儲存
    document.getElementById('saveYtSettings').addEventListener('click', async () => {
      await Promise.all([
        API.put('/settings/youtube_api_key', { value: document.getElementById('ytApiKey').value }),
        API.put('/settings/youtube_channel_id', { value: document.getElementById('ytChannelId').value })
      ]);
      showToast('YouTube 設定已儲存');
    });

    // 店家資訊
    document.getElementById('saveShopSettings').addEventListener('click', async () => {
      await Promise.all([
        API.put('/settings/shop_address', { value: document.getElementById('shopAddr').value }),
        API.put('/settings/shop_phone', { value: document.getElementById('shopPhone').value }),
        API.put('/settings/shop_line', { value: document.getElementById('shopLine').value }),
      ]);
      showToast('店家資訊已儲存');
    });

    // YouTube 查詢
    document.getElementById('fetchYtData').addEventListener('click', async () => {
      const key = document.getElementById('ytApiKey').value;
      const id = document.getElementById('ytChannelId').value;
      if (!key || !id) { showToast('請先設定 API Key 和頻道 ID', 'warning'); return; }

      const resultDiv = document.getElementById('ytResult');
      resultDiv.innerHTML = '<div class="py-3 text-center"><div class="spinner-border spinner-border-sm"></div> 查詢中...</div>';

      try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${id}&key=${key}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.items?.length) throw new Error('找不到頻道');

        const ch = data.items[0];
        const stats = ch.statistics;
        resultDiv.innerHTML = `
          <div class="text-center py-3">
            <img src="${ch.snippet.thumbnails?.medium?.url || ''}" class="rounded-circle mb-2" width="60" height="60" onerror="this.style.display='none'">
            <h6>${ch.snippet.title}</h6>
            <div class="row g-3 mt-2">
              <div class="col-4">
                <div class="fw-bold" style="font-size:1.5rem;color:#ff0000;">${Fmt.currency(stats.subscriberCount)}</div>
                <div class="small text-muted">訂閱</div>
              </div>
              <div class="col-4">
                <div class="fw-bold" style="font-size:1.5rem;">${Fmt.currency(stats.viewCount)}</div>
                <div class="small text-muted">觀看</div>
              </div>
              <div class="col-4">
                <div class="fw-bold" style="font-size:1.5rem;">${Fmt.currency(stats.videoCount)}</div>
                <div class="small text-muted">影片</div>
              </div>
            </div>
            <p class="text-muted small mt-2">${new Date().toLocaleString('zh-TW')}</p>
          </div>`;
      } catch (err) {
        resultDiv.innerHTML = `<div class="text-center py-3"><i class="bi bi-exclamation-triangle text-warning" style="font-size:2rem;"></i><p class="text-danger mt-2 small">${err.message}</p></div>`;
      }
    });

    // IG 儲存
    document.getElementById('saveIgSettings').addEventListener('click', async () => {
      await API.put('/settings/ig_username', { value: document.getElementById('igUsername').value });
      showToast('IG 帳號已儲存');
    });

    // IG 自動抓取
    document.getElementById('fetchIgData').addEventListener('click', async () => {
      const username = document.getElementById('igUsername').value;
      if (!username) { showToast('請先設定 IG 帳號', 'warning'); return; }

      // 先儲存
      await API.put('/settings/ig_username', { value: username });

      const resultDiv = document.getElementById('igResult');
      resultDiv.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> 抓取中...</div>';

      try {
        const data = await API.get('/settings/instagram/fetch');
        if (data.followers !== null && data.fetched) {
          resultDiv.innerHTML = `
            <div class="text-center py-3">
              <i class="bi bi-instagram" style="font-size:2.5rem;color:#e4405f;"></i>
              <h6 class="mt-2">@${username}</h6>
              <div class="row g-3 mt-2">
                <div class="col-4">
                  <div class="fw-bold" style="font-size:1.5rem;color:#e4405f;">${Fmt.currency(data.followers)}</div>
                  <div class="small text-muted">追蹤者</div>
                </div>
                <div class="col-4">
                  <div class="fw-bold" style="font-size:1.5rem;">${Fmt.currency(data.following || 0)}</div>
                  <div class="small text-muted">追蹤中</div>
                </div>
                <div class="col-4">
                  <div class="fw-bold" style="font-size:1.5rem;">${Fmt.currency(data.posts || 0)}</div>
                  <div class="small text-muted">貼文</div>
                </div>
              </div>
              <p class="text-muted small mt-2">剛剛更新</p>
            </div>`;
          showToast('IG 數據已更新');
        } else {
          resultDiv.innerHTML = `
            <div class="text-center py-3">
              <i class="bi bi-exclamation-triangle text-warning" style="font-size:2rem;"></i>
              <p class="text-muted mt-2 small">Instagram 擋住了自動抓取，請使用「手動輸入」</p>
              ${data.error ? `<p class="text-muted small">${data.error}</p>` : ''}
            </div>`;
          showToast('自動抓取失敗，請手動輸入', 'warning');
        }
      } catch (err) {
        resultDiv.innerHTML = `<div class="text-center py-3"><i class="bi bi-exclamation-triangle text-warning" style="font-size:2rem;"></i><p class="text-danger mt-2 small">${err.message}</p></div>`;
      }
    });

    // IG 手動輸入
    document.getElementById('manualIgBtn').addEventListener('click', () => {
      App.showModal('手動輸入 IG 數據', `
        <form id="igManualForm">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">追蹤者</label>
              <input type="number" class="form-control" name="followers" min="0" required>
            </div>
            <div class="col-md-4">
              <label class="form-label">追蹤中</label>
              <input type="number" class="form-control" name="following" min="0" value="0">
            </div>
            <div class="col-md-4">
              <label class="form-label">貼文數</label>
              <input type="number" class="form-control" name="posts" min="0" value="0">
            </div>
          </div>
        </form>
      `, `<button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
          <button class="btn btn-primary" id="saveIgManual"><i class="bi bi-save"></i> 儲存</button>`);

      document.getElementById('saveIgManual').addEventListener('click', async () => {
        const form = document.getElementById('igManualForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const d = Object.fromEntries(new FormData(form));
        try {
          await API.put('/settings/instagram/manual', {
            followers: parseInt(d.followers) || 0,
            following: parseInt(d.following) || 0,
            posts: parseInt(d.posts) || 0,
          });
          showToast('IG 數據已更新');
          App.closeModal();
          // 重新載入頁面
          App.navigate('youtube');
        } catch (err) { showToast(err.message, 'danger'); }
      });
    });
  }
};
