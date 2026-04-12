import { Router, Request, Response } from 'express';
import pool from '../models/database';
import type { Setting } from '../types';

const router = Router();

// IG 爬蟲 — 放在 /:key 前面
router.get('/instagram/fetch', async (_req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'ig_username'");
  const username = rows[0]?.value;
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

    let followers: number | null = null;
    let following: number | null = null;
    let posts: number | null = null;

    const ogMatch = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+(?:property|name)="og:description"/i);

    if (ogMatch) {
      const desc = ogMatch[1];
      const enMatch = desc.match(/([\d,.]+[KkMm]?)\s*Followers/i);
      const enFollowing = desc.match(/([\d,.]+[KkMm]?)\s*Following/i);
      const enPosts = desc.match(/([\d,.]+[KkMm]?)\s*Posts/i);
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

    if (followers === null) {
      const jsonMatch = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      if (jsonMatch) followers = parseInt(jsonMatch[1]);
      const jsonFollowing = html.match(/"edge_follow"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      if (jsonFollowing) following = parseInt(jsonFollowing[1]);
    }

    if (followers !== null) {
      await pool.query("INSERT INTO settings (key, value) VALUES ('ig_followers', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(followers)]);
      await pool.query("INSERT INTO settings (key, value) VALUES ('ig_following', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(following || 0)]);
      await pool.query("INSERT INTO settings (key, value) VALUES ('ig_posts', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(posts || 0)]);
      await pool.query("INSERT INTO settings (key, value) VALUES ('ig_last_fetch', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [new Date().toISOString()]);
    }

    res.json({ username, followers, following, posts, fetched: followers !== null });
  } catch (err: any) {
    res.json({ error: err.message, followers: null });
  }
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
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [req.params.key]);
  res.json({ key: req.params.key, value: rows[0] ? rows[0].value : '' });
});

router.put('/:key', async (req: Request, res: Response) => {
  const { value } = req.body as { value?: string };
  await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [req.params.key, value || '']);
  res.json({ success: true });
});

export default router;
