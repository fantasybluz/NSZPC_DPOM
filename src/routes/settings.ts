import { Router, type Request, type Response } from '../lib/router';
import pool from '../models/database';
import { adminOnly } from './auth';

const router = new Router();

// 有些設定是金鑰：只能寫、不能從一般的 /:key 讀出來（以前 YouTube 金鑰會整個送到瀏覽器）
const SECRET_KEYS = new Set(['youtube_api_key']);

const getSetting = async (key: string): Promise<string> => {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value || '';
};
const setSetting = (key: string, value: string) =>
  pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);

// ===== YouTube（放在 /:key 前面）=====
// 由 Worker 去查 YouTube Data API：金鑰不會出現在瀏覽器，也不會被網站的 CSP 擋住。
// 結果快取一小時（youtube_stats），省 API 額度。

router.get('/youtube', async (_req: Request, res: Response) => {
  res.json({ channelId: await getSetting('youtube_channel_id'), hasKey: !!(await getSetting('youtube_api_key')) });
});

router.put('/youtube', adminOnly, async (req: Request, res: Response) => {
  const { apiKey, channelId } = req.body as { apiKey?: string; channelId?: string };
  // 金鑰欄位留空就是不改
  if (apiKey && apiKey.trim()) await setSetting('youtube_api_key', apiKey.trim());
  if (channelId !== undefined) await setSetting('youtube_channel_id', String(channelId).trim());
  await setSetting('youtube_stats', '');
  res.json({ success: true });
});

const STATS_TTL_MS = 60 * 60 * 1000;

router.get('/youtube/stats', async (req: Request, res: Response) => {
  const [apiKey, channelId] = await Promise.all([getSetting('youtube_api_key'), getSetting('youtube_channel_id')]);
  if (!apiKey || !channelId) return res.json({ configured: false });

  const cached = await getSetting('youtube_stats');
  if (cached && req.query.refresh !== '1') {
    try {
      const data = JSON.parse(cached);
      if (Date.now() - Date.parse(data.fetchedAt) < STATS_TTL_MS) return res.json({ configured: true, ...data });
    } catch { /* 快取壞了就重查 */ }
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
  const yt = await fetch(url).then((r) => r.json() as Promise<any>).catch(() => null);
  if (!yt) return res.status(502).json({ error: '連不到 YouTube' });
  if (yt.error) return res.status(400).json({ error: `YouTube：${yt.error.message}` });
  const ch = yt.items?.[0];
  if (!ch) return res.status(404).json({ error: '找不到這個頻道，請確認頻道 ID' });

  const data = {
    title: ch.snippet?.title || '',
    thumb: ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url || '',
    subscribers: Number(ch.statistics?.subscriberCount) || 0,
    views: Number(ch.statistics?.viewCount) || 0,
    videos: Number(ch.statistics?.videoCount) || 0,
    fetchedAt: new Date().toISOString(),
  };
  await setSetting('youtube_stats', JSON.stringify(data));
  res.json({ configured: true, ...data });
});

// 手動更新 IG 追蹤數
router.put('/instagram/manual', async (req: Request, res: Response) => {
  const { followers, following, posts } = req.body;
  if (followers !== undefined) await pool.query("INSERT INTO settings (key, value) VALUES ('ig_followers', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(followers)]);
  if (following !== undefined) await pool.query("INSERT INTO settings (key, value) VALUES ('ig_following', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(following)]);
  if (posts !== undefined) await pool.query("INSERT INTO settings (key, value) VALUES ('ig_posts', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(posts)]);
  await pool.query("INSERT INTO settings (key, value) VALUES ('ig_last_fetch', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [new Date().toISOString()]);
  res.json({ success: true });
});

// 通用 key-value
router.get('/:key', async (req: Request, res: Response) => {
  if (SECRET_KEYS.has(req.params.key as string)) return res.status(403).json({ error: '這個設定不能讀取' });
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [req.params.key]);
  res.json({ key: req.params.key, value: rows[0] ? rows[0].value : '' });
});

router.put('/:key', async (req: Request, res: Response) => {
  if (SECRET_KEYS.has(req.params.key as string)) return res.status(403).json({ error: '請用 YouTube 設定儲存金鑰' });
  const { value } = req.body as { value?: string };
  await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [req.params.key, value || '']);
  res.json({ success: true });
});

export default router;
