// 登入：整個網站放在 Cloudflare Access 後面（只放行 Access 規則裡的 email），
// 這裡再驗一次 Access 的 JWT，用 email 對到 users 資料表，角色、頁面權限照舊。
// 網站不存密碼：原本的 /login、/change-password、使用者密碼欄位都拿掉了。
import { Router, type Handler, type NextFunction, type Request, type Response } from '../lib/router';
import { ACCESS_HEADER, verifyAccessJwt } from '../lib/access';
import pool from '../models/database';
import type { PagePermission, SessionData, User } from '../types';

const router = new Router();

const ALL_PERMISSIONS: PagePermission[] = ['dashboard', 'inventory', 'quotations', 'customers', 'purchases', 'reports', 'social', 'categories', 'users'];

/** 權限不足時的錯誤訊息用（跟前端側欄的名稱一樣） */
const PERMISSION_LABELS: Record<PagePermission, string> = {
  dashboard: '儀表板',
  inventory: '庫存管理',
  quotations: '訂單管理',
  customers: '客戶管理',
  purchases: '叫貨管理',
  reports: '報表/售後',
  social: '社群設定',
  categories: '分類管理',
  users: '權限管理',
};

/** Cloudflare Access 的登出網址 */

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

/** 只在本機開發有效：測試用這個標頭換成別的使用者（測一般使用者的權限） */
export const DEV_USER_HEADER = 'x-dev-user-email';

/** 這個請求是誰（Access 驗過的 email）；本機開發用 DEV_USER_EMAIL */
async function requestEmail(req: Request): Promise<string | null> {
  const url = new URL(req.raw.url);
  const env = req.env as Env & { DEV_USER_EMAIL?: string };
  if (env.DEV_USER_EMAIL && isLocal(url)) {
    // 網址是 localhost 而且有設 DEV_USER_EMAIL 才看這個標頭；正式網址兩個條件都不成立，送了也沒用
    const asUser = req.headers[DEV_USER_HEADER]?.trim().toLowerCase();
    return asUser || env.DEV_USER_EMAIL.toLowerCase();
  }

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

// ========== 使用者管理 (僅管理員) ==========

/** 只有管理員可以（前端藏起來不算，後端也要擋） */
export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '權限不足：只有管理員可以做這件事' });
    return;
  }
  next();
}

const forbidden = (res: Response, perms: PagePermission[]): void => {
  const names = perms.map((p) => `「${PERMISSION_LABELS[p] ?? p}」`).join('或');
  res.status(403).json({ error: `你沒有${names}的權限，不能修改資料。需要的話請管理員在「權限管理」幫你打開` });
};

/** 有其中一個頁面權限才可以（管理員都可以） */
export function requirePermission(...perms: PagePermission[]): Handler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (user?.role === 'admin' || perms.some((p) => user?.permissions.includes(p))) {
      next();
      return;
    }
    forbidden(res, perms);
  };
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 會改資料的請求（POST、PUT、PATCH、DELETE）要有頁面權限，讀取只要登入就可以
 * （訂單畫面要讀客戶、庫存、分類，儀表板要讀統計）。掛在 worker.ts 的 mounts。
 * rule 可以是函式，依路徑給不同的權限（例如訂單畫面也能新增客戶）
 */
export function writeRequires(rule: PagePermission | ((req: Request) => PagePermission[])): Handler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (READ_METHODS.has(req.method)) {
      next();
      return;
    }
    const perms = typeof rule === 'function' ? rule(req) : [rule];
    requirePermission(...perms)(req, res, next);
  };
}

// 舊的頁面 id（0007 之前）：舊版前端還開著時送來的也換成新的
const LEGACY_PERMISSIONS: Record<string, PagePermission> = { suppliers: 'purchases', youtube: 'social' };

/** 存進資料庫前整理：舊 id 換新的、拿掉不認得的、去掉重複 */
function normalizePermissions(value: unknown): PagePermission[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(ALL_PERMISSIONS);
  const out = value.map((p) => LEGACY_PERMISSIONS[String(p)] ?? String(p)).filter((p): p is PagePermission => known.has(p));
  return [...new Set(out)];
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
    [email, display_name || email, role || 'user', JSON.stringify(normalizePermissions(permissions))]
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
    [display_name || '', role || 'user', JSON.stringify(normalizePermissions(permissions)), is_active !== undefined ? is_active : 1, userId]
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
