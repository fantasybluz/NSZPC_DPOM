export type UserRole = 'admin' | 'user';

/**
 * 頁面權限（users.permissions 存這些 id）。前端側欄 NAV_ITEMS（frontend/src/lib/constants.ts）用同一組。
 * 一般使用者能勾的是前 7 個；categories、users 只有管理員能用（管理員不看 permissions，全部都可以）。
 * 舊的 id（suppliers、youtube）在 migrations/0007 換成 purchases、social。
 */
export type PagePermission = 'dashboard' | 'inventory' | 'quotations' | 'customers' | 'purchases' | 'reports' | 'social' | 'categories' | 'users';

/** 登入改用 Cloudflare Access：一個 email 一個使用者，不存密碼 */
export interface User {
  id: number;
  email: string;
  /** 跟 email 一樣（前端顯示用） */
  username: string;
  display_name: string;
  role: UserRole;
  permissions: string; // JSON string of PagePermission[]
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SessionData {
  userId: number;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: PagePermission[];
}

