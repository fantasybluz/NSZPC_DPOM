import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool, { hashPassword } from '../models/database';
import type { SessionData, User, PagePermission } from '../types';

const router = Router();

// Session 管理
const sessions = new Map<string, SessionData>();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// 登入
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) return res.status(400).json({ error: '請輸入帳號密碼' });

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);
  const user = rows[0] as User | undefined;
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  const token = generateToken();
  const permissions = JSON.parse(user.permissions || '[]') as PagePermission[];
  sessions.set(token, {
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role as 'admin' | 'user',
    permissions,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      permissions,
    },
  });
});

// 登出
router.post('/logout', (req: Request, res: Response) => {
  const token = req.headers['x-token'] as string | undefined;
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// 擴展 Request
declare global {
  namespace Express {
    interface Request {
      user?: SessionData;
    }
  }
}

// 驗證 middleware
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-token'] as string | undefined;
  if (!token || !sessions.has(token)) {
    res.status(401).json({ error: '請先登入' });
    return;
  }
  req.user = sessions.get(token)!;
  next();
}

// 取得當前使用者
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json(req.user);
});

// ========== 使用者管理 (僅管理員) ==========

function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '權限不足' });
    return;
  }
  next();
}

router.get('/users', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  const { rows: users } = await pool.query('SELECT id, username, display_name, role, permissions, is_active, created_at FROM users ORDER BY id');
  users.forEach((u: any) => u.permissions = JSON.parse(u.permissions || '[]'));
  res.json(users);
});

router.post('/users', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { username, password, display_name, role, permissions } = req.body;
  if (!username || !password) return res.status(400).json({ error: '帳號密碼必填' });

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) return res.status(400).json({ error: '帳號已存在' });

  const { rows } = await pool.query(
    'INSERT INTO users (username, password, display_name, role, permissions) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [username, hashPassword(password), display_name || username, role || 'user', JSON.stringify(permissions || [])]
  );
  res.json({ id: rows[0].id });
});

router.put('/users/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { display_name, role, permissions, is_active, password } = req.body;
  const userId = parseInt(req.params.id as string);

  if (password) {
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashPassword(password), userId]);
  }

  await pool.query(
    'UPDATE users SET display_name=$1, role=$2, permissions=$3, is_active=$4, updated_at=NOW() WHERE id=$5',
    [display_name || '', role || 'user', JSON.stringify(permissions || []), is_active !== undefined ? is_active : 1, userId]
  );

  for (const [, session] of sessions) {
    if (session.userId === userId) {
      session.role = role || 'user';
      session.permissions = permissions || [];
      session.displayName = display_name || '';
    }
  }

  res.json({ success: true });
});

router.delete('/users/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id as string);
  if (userId === req.user?.userId) {
    return res.status(400).json({ error: '不能刪除自己' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  for (const [token, session] of sessions) {
    if (session.userId === userId) sessions.delete(token);
  }
  res.json({ success: true });
});

export default router;
export { sessions };
