'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';
import * as Fmt from '@/lib/format';

export default function SocialPage() {
  const { showToast } = useToast();
  const [ytApiKey, setYtApiKey] = useState('');
  const [ytChannelId, setYtChannelId] = useState('');
  const [ytResult, setYtResult] = useState<any>(null);
  const [ytLoading, setYtLoading] = useState(false);

  const [igUsername, setIgUsername] = useState('');
  const [igData, setIgData] = useState<any>(null);
  const [igLoading, setIgLoading] = useState(false);
  const [igModalOpen, setIgModalOpen] = useState(false);
  const [igManual, setIgManual] = useState({ followers: 0, following: 0, posts: 0 });

  const [shopAddr, setShopAddr] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopLine, setShopLine] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/settings/youtube_api_key').catch(() => ({ value: '' })),
      api.get('/settings/youtube_channel_id').catch(() => ({ value: '' })),
      api.get('/settings/shop_address').catch(() => ({ value: '' })),
      api.get('/settings/shop_phone').catch(() => ({ value: '' })),
      api.get('/settings/shop_line').catch(() => ({ value: '' })),
      api.get('/settings/ig_username').catch(() => ({ value: '' })),
      api.get('/settings/ig_followers').catch(() => ({ value: '' })),
      api.get('/settings/ig_following').catch(() => ({ value: '' })),
      api.get('/settings/ig_posts').catch(() => ({ value: '' })),
      api.get('/settings/ig_last_fetch').catch(() => ({ value: '' })),
    ]).then(([r1, r2, r3, r4, r5, r6, r7, r8, r9, r10]) => {
      setYtApiKey(r1.value || '');
      setYtChannelId(r2.value || '');
      setShopAddr(r3.value || '');
      setShopPhone(r4.value || '');
      setShopLine(r5.value || '');
      setIgUsername(r6.value || '');
      if (r7.value) {
        setIgData({ followers: r7.value, following: r8.value, posts: r9.value, lastFetch: r10.value, username: r6.value });
      }
    });
  }, []);

  const saveYt = async () => {
    await Promise.all([
      api.put('/settings/youtube_api_key', { value: ytApiKey }),
      api.put('/settings/youtube_channel_id', { value: ytChannelId }),
    ]);
    showToast('YouTube 設定已儲存');
  };

  const fetchYt = async () => {
    if (!ytApiKey || !ytChannelId) { showToast('請先設定 API Key 和頻道 ID', 'warning'); return; }
    setYtLoading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${ytChannelId}&key=${ytApiKey}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      if (!data.items?.length) throw new Error('找不到頻道');
      const ch = data.items[0];
      setYtResult({ title: ch.snippet.title, thumb: ch.snippet.thumbnails?.medium?.url, stats: ch.statistics });
    } catch (err: any) {
      showToast(err.message, 'danger');
      setYtResult(null);
    } finally {
      setYtLoading(false);
    }
  };

  const saveIg = async () => {
    await api.put('/settings/ig_username', { value: igUsername });
    showToast('IG 帳號已儲存');
  };

  const fetchIg = async () => {
    if (!igUsername) { showToast('請先設定 IG 帳號', 'warning'); return; }
    await api.put('/settings/ig_username', { value: igUsername });
    setIgLoading(true);
    try {
      const data = await api.get('/settings/instagram/fetch');
      if (data.followers !== null && data.fetched) {
        setIgData({ followers: data.followers, following: data.following || 0, posts: data.posts || 0, lastFetch: new Date().toISOString(), username: igUsername });
        showToast('IG 數據已更新');
      } else {
        showToast('自動抓取失敗，請手動輸入', 'warning');
      }
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setIgLoading(false);
    }
  };

  const saveIgManual = async () => {
    try {
      await api.put('/settings/instagram/manual', igManual);
      setIgData({ ...igManual, lastFetch: new Date().toISOString(), username: igUsername });
      showToast('IG 數據已更新');
      setIgModalOpen(false);
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const saveShop = async () => {
    await Promise.all([
      api.put('/settings/shop_address', { value: shopAddr }),
      api.put('/settings/shop_phone', { value: shopPhone }),
      api.put('/settings/shop_line', { value: shopLine }),
    ]);
    showToast('店家資訊已儲存');
  };

  return (
    <>
      <div className="row g-4">
        {/* YouTube */}
        <div className="col-md-6">
          <div className="form-section">
            <h6><i className="bi bi-youtube" /> YouTube 設定</h6>
            <div className="mb-3">
              <label className="form-label">YouTube Data API Key</label>
              <input type="text" className="form-control" value={ytApiKey} onChange={e => setYtApiKey(e.target.value)} placeholder="AIza..." />
            </div>
            <div className="mb-3">
              <label className="form-label">頻道 ID</label>
              <input type="text" className="form-control" value={ytChannelId} onChange={e => setYtChannelId(e.target.value)} placeholder="UC..." />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveYt}><i className="bi bi-save" /> 儲存</button>
            <button className="btn btn-outline-secondary btn-sm ms-2" onClick={fetchYt} disabled={ytLoading}>
              <i className="bi bi-arrow-clockwise" /> {ytLoading ? '查詢中...' : '查詢'}
            </button>
          </div>
          <div className="form-section text-center mt-3">
            {ytResult ? (
              <div className="py-3">
                {ytResult.thumb && <img src={ytResult.thumb} className="rounded-circle mb-2" width={60} height={60} alt="" />}
                <h6>{ytResult.title}</h6>
                <div className="row g-3 mt-2">
                  <div className="col-4">
                    <div className="fw-bold" style={{ fontSize: '1.5rem', color: '#ff0000' }}>{Fmt.currency(parseInt(ytResult.stats.subscriberCount))}</div>
                    <div className="small text-muted">訂閱</div>
                  </div>
                  <div className="col-4">
                    <div className="fw-bold" style={{ fontSize: '1.5rem' }}>{Fmt.currency(parseInt(ytResult.stats.viewCount))}</div>
                    <div className="small text-muted">觀看</div>
                  </div>
                  <div className="col-4">
                    <div className="fw-bold" style={{ fontSize: '1.5rem' }}>{Fmt.currency(parseInt(ytResult.stats.videoCount))}</div>
                    <div className="small text-muted">影片</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-3">
                <i className="bi bi-youtube" style={{ fontSize: '2.5rem', color: '#ff0000' }} />
                <p className="text-muted mt-2 small">點擊「查詢」取得訂閱數</p>
              </div>
            )}
          </div>
        </div>

        {/* Instagram */}
        <div className="col-md-6">
          <div className="form-section">
            <h6><i className="bi bi-instagram" /> Instagram 設定</h6>
            <div className="mb-3">
              <label className="form-label">IG 帳號</label>
              <div className="input-group">
                <span className="input-group-text">@</span>
                <input type="text" className="form-control" value={igUsername} onChange={e => setIgUsername(e.target.value)} placeholder="nightstarzpc" />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveIg}><i className="bi bi-save" /> 儲存</button>
            <button className="btn btn-outline-secondary btn-sm ms-2" onClick={fetchIg} disabled={igLoading}>
              <i className="bi bi-arrow-clockwise" /> {igLoading ? '抓取中...' : '自動抓取'}
            </button>
            <button className="btn btn-outline-secondary btn-sm ms-2" onClick={() => setIgModalOpen(true)}>
              <i className="bi bi-pencil" /> 手動輸入
            </button>
          </div>
          <div className="form-section text-center mt-3">
            {igData ? (
              <div className="py-3">
                <i className="bi bi-instagram" style={{ fontSize: '2.5rem', color: '#e4405f' }} />
                <h6 className="mt-2">@{igData.username}</h6>
                <div className="row g-3 mt-2">
                  <div className="col-4">
                    <div className="fw-bold" style={{ fontSize: '1.5rem', color: '#e4405f' }}>{Fmt.currency(parseInt(igData.followers))}</div>
                    <div className="small text-muted">追蹤者</div>
                  </div>
                  <div className="col-4">
                    <div className="fw-bold" style={{ fontSize: '1.5rem' }}>{Fmt.currency(parseInt(igData.following))}</div>
                    <div className="small text-muted">追蹤中</div>
                  </div>
                  <div className="col-4">
                    <div className="fw-bold" style={{ fontSize: '1.5rem' }}>{Fmt.currency(parseInt(igData.posts))}</div>
                    <div className="small text-muted">貼文</div>
                  </div>
                </div>
                <p className="text-muted small mt-2">上次更新: {igData.lastFetch ? new Date(igData.lastFetch).toLocaleString('zh-TW') : '-'}</p>
              </div>
            ) : (
              <div className="py-3">
                <i className="bi bi-instagram" style={{ fontSize: '2.5rem', color: '#e4405f' }} />
                <p className="text-muted mt-2 small">設定帳號後點擊「自動抓取」或「手動輸入」</p>
              </div>
            )}
          </div>
        </div>

        {/* 店家資訊 */}
        <div className="col-md-6">
          <div className="form-section">
            <h6><i className="bi bi-shop" /> 店家資訊</h6>
            <div className="mb-3">
              <label className="form-label">店家地址</label>
              <input type="text" className="form-control" value={shopAddr} onChange={e => setShopAddr(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">店家電話</label>
              <input type="text" className="form-control" value={shopPhone} onChange={e => setShopPhone(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">LINE ID</label>
              <input type="text" className="form-control" value={shopLine} onChange={e => setShopLine(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveShop}><i className="bi bi-save" /> 儲存店家資訊</button>
          </div>
        </div>
      </div>

      <Modal show={igModalOpen} onClose={() => setIgModalOpen(false)} title="手動輸入 IG 數據"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setIgModalOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={saveIgManual}><i className="bi bi-save" /> 儲存</button>
        </>}>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">追蹤者</label>
            <input type="number" className="form-control" min={0} value={igManual.followers} onChange={e => setIgManual(m => ({ ...m, followers: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="col-md-4">
            <label className="form-label">追蹤中</label>
            <input type="number" className="form-control" min={0} value={igManual.following} onChange={e => setIgManual(m => ({ ...m, following: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="col-md-4">
            <label className="form-label">貼文數</label>
            <input type="number" className="form-control" min={0} value={igManual.posts} onChange={e => setIgManual(m => ({ ...m, posts: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>
      </Modal>
    </>
  );
}
