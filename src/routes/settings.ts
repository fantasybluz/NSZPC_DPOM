import { Router, Request, Response } from 'express';
import db from '../models/database';
import type { Setting } from '../types';

const router = Router();

// IG 爬蟲 — 放在 /:key 前面
router.get('/instagram/fetch', async (_req: Request, res: Response) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ig_username'").get() as Pick<Setting, 'value'> | undefined;
  const username = row?.value;
  if (!username) return res.json({ error: '未設定 IG 帳號', followers: null });

  try {
    const url = `https://www.instagram.com/${username}/`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    });
    const html = await response.text();

    // 嘗試從 og:description 解析
    // 格式: "XXX Followers, XXX Following, XXX Posts - ..."
    // 或中文: "XXX 位追蹤者、XXX 追蹤中、XXX 則貼文 - ..."
    let followers: number | null = null;
    let following: number | null = null;
    let posts: number | null = null;

    const ogMatch = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:property|name)="og:description"/i);

    if (ogMatch) {
      const desc = ogMatch[1];
      // English: "1,234 Followers, 567 Following, 89 Posts"
      const enMatch = desc.match(/([\d,.]+[KkMm]?)\s*Followers/i);
      const enFollowing = desc.match(/([\d,.]+[KkMm]?)\s*Following/i);
      const enPosts = desc.match(/([\d,.]+[KkMm]?)\s*Posts/i);
      // Chinese: "1,234 位追蹤者"
      const zhMatch = desc.match(/([\d,.]+[KkMm]?)\s*位追蹤者/);
      const zhFollowing = desc.match(/([\d,.]+[KkMm]?)\s*追蹤中/);
      const zhPosts = desc.match(/([\d,.]+[KkMm]?)\s*則貼文/);

      const parseNum = (s: string): number => {
        s = s.replace(/,/g, '');
        if (/[Kk]$/.test(s)) return Math.round(parseFloat(s) * 1000);
        if (/[Mm]$/.test(s)) return Math.round(parseFloat(s) * 1000000);
        return parseInt(s) || 0;
      };

      const fMatch = enMatch || zhMatch;
      const flMatch = enFollowing || zhFollowing;
      const pMatch = enPosts || zhPosts;

      if (fMatch) followers = parseNum(fMatch[1]);
      if (flMatch) following = parseNum(flMatch[1]);
      if (pMatch) posts = parseNum(pMatch[1]);
    }

    // 也嘗試從 JSON-LD 或 script 中解析
    if (followers === null) {
      const jsonMatch = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      if (jsonMatch) followers = parseInt(jsonMatch[1]);
      const jsonFollowing = html.match(/"edge_follow"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      if (jsonFollowing) following = parseInt(jsonFollowing[1]);
    }

    if (followers !== null) {
      // 儲存最新數據
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_followers', ?)").run(String(followers));
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_following', ?)").run(String(following || 0));
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_posts', ?)").run(String(posts || 0));
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_last_fetch', ?)").run(new Date().toISOString());
    }

    res.json({ username, followers, following, posts, fetched: followers !== null });
  } catch (err: any) {
    res.json({ error: err.message, followers: null });
  }
});

// 手動更新 IG 追蹤數
router.put('/instagram/manual', (req: Request, res: Response) => {
  const { followers, following, posts } = req.body;
  if (followers !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_followers', ?)").run(String(followers));
  if (following !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_following', ?)").run(String(following));
  if (posts !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_posts', ?)").run(String(posts));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ig_last_fetch', ?)").run(new Date().toISOString());
  res.json({ success: true });
});

// 通用 key-value
router.get('/:key', (req: Request, res: Response) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(req.params.key) as Pick<Setting, 'value'> | undefined;
  res.json({ key: req.params.key, value: row ? row.value : '' });
});

router.put('/:key', (req: Request, res: Response) => {
  const { value } = req.body as { value?: string };
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(req.params.key, value || '');
  res.json({ success: true });
});

export default router;
