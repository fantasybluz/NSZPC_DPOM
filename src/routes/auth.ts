// 登入：整個網站放在 Cloudflare Access 後面（只放行 Access 規則裡的 email），
// 這裡再驗一次 Access 的 JWT，用 email 對到 users 資料表，角色、頁面權限照舊。
// 網站不存密碼：原本的 /login、/change-password、使用者密碼欄位都拿掉了。
import { Router, type NextFunction, type Request, type Response } from '../lib/router';
import { ACCESS_HEADER, verifyAccessJwt } from '../lib/access';
import pool from '../models/database';
import type { PagePermission, SessionData, User } from '../types';

const router = new Router();

const ALL_PERMISSIONS: PagePermission[] = ['dashboard', 'inventory', 'quotations', 'suppliers', 'customers', 'youtube', 'users', 'categories'];

/** Cloudflare Access 的登出網址 */
export const LOGOUT_URL = '/cdn-cgi/access/logout';

const parseEmails = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const isLocal = (url: URL): boolean => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

const toSession = (user: User): SessionData => ({
  userId: user.id,
  email: user.email,
  username: user.username,
  displayName: user.display_name,
  role: user.role,
  permissions: JSON.parse(user.permissions || '[]') as PagePermission[],
});

/** 這個請求是誰（Access 驗過的 email）；本機開發用 DEV_USER_EMAIL */
async function requestEmail(req: Request): Promise<string | null> {
  const url = new URL(req.raw.url);
  const env = req.env as Env & { DEV_USER_EMAIL?: string };
  if (env.DEV_USER_EMAIL && isLocal(url)) return env.DEV_USER_EMAIL.toLowerCase();

  const token = req.headers[ACCESS_HEADER.toLowerCase()];
  if (!token || !env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return null;
  try {
    return await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
  } catch (error) {
    console.warn('Cloudflare Access:', error instanceof Error ? error.message : error);
    return null;
  }
}

// 驗證 middleware
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.env.ACCESS_AUD && !(req.env as { DEV_USER_EMAIL?: string }).DEV_USER_EMAIL) {
    res.status(503).json({ error: '登入還沒設定好（Cloudflare Access）' });
    return;
  }

  const email = await requestEmail(req);
  if (!email) {
    res.status(401).json({ error: '請重新整理頁面，重新登入' });
    return;
  }

  let { rows } = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email]);
  // 第一次登入：BOOTSTRAP_ADMIN_EMAILS 裡的人自動建成管理員，之後由他在「使用者管理」加其他人
  if (!rows.length && parseEmails(req.env.BOOTSTRAP_ADMIN_EMAILS).includes(email)) {
    ({ rows } = await pool.query<User>(
      'INSERT INTO users (email, username, display_name, role, permissions) VALUES ($1, $1, $2, $3, $4) RETURNING *',
      [email, '管理員', 'admin', JSON.stringify(ALL_PERMISSIONS)],
    ));
  }

  const user = rows[0];
  if (!user) {
    res.status(403).json({ error: `${email} 還沒開通，請管理員在「使用者管理」新增這個 email` });
    return;
  }
  if (!user.is_active) {
    res.status(403).json({ error: '這個帳號已停用' });
    return;
  }
  req.user = toSession(user);
  next();
}

// 取得當前使用者
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json(req.user);
});

// 登出：前端導到 Cloudflare Access 的登出網址
router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true, logoutUrl: LOGOUT_URL });
});

// ========== 使用者管理 (僅管理員) ==========

/** 只有管理員可以（前端藏起來不算，後端也要擋） */
export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '權限不足' });
    return;
  }
  next();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/users', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  const { rows: users } = await pool.query('SELECT id, email, username, display_name, role, permissions, is_active, created_at FROM users ORDER BY id');
  users.forEach((u: any) => u.permissions = JSON.parse(u.permissions || '[]'));
  res.json(users);
});

router.post('/users', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { display_name, role, permissions } = req.body;
  const email = String(req.body.email || req.body.username || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: '請輸入 email（要跟 Cloudflare Access 登入用的一樣）' });

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return res.status(400).json({ error: '這個 email 已經有帳號' });

  const { rows } = await pool.query(
    'INSERT INTO users (email, username, display_name, role, permissions) VALUES ($1, $1, $2, $3, $4) RETURNING id',
    [email, display_name || email, role || 'user', JSON.stringify(permissions || [])]
  );
  res.json({ id: rows[0].id });
});

router.put('/users/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { display_name, role, permissions, is_active } = req.body;
  const userId = parseInt(req.params.id as string);
  if (userId === req.user?.userId && (role === 'user' || is_active === 0)) {
    return res.status(400).json({ error: '不能把自己降為一般使用者或停用自己' });
  }

  await pool.query(
    'UPDATE users SET display_name=$1, role=$2, permissions=$3, is_active=$4, updated_at=NOW() WHERE id=$5',
    [display_name || '', role || 'user', JSON.stringify(permissions || []), is_active !== undefined ? is_active : 1, userId]
  );
  res.json({ success: true });
});

router.delete('/users/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id as string);
  if (userId === req.user?.userId) {
    return res.status(400).json({ error: '不能刪除自己' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  res.json({ success: true });
});

export default router;
