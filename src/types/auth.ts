export type UserRole = 'admin' | 'user';

export type PagePermission = 'dashboard' | 'inventory' | 'quotations' | 'suppliers' | 'customers' | 'youtube' | 'users' | 'categories';

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

export interface UserPublic {
  id: number;
  email: string;
  username: string;
  display_name: string;
  role: UserRole;
  permissions: PagePermission[];
  is_active: number;
  created_at: string;
}

export interface SessionData {
  userId: number;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: PagePermission[];
}

export interface CreateUserInput {
  email: string;
  display_name?: string;
  role?: UserRole;
  permissions?: PagePermission[];
}

export interface UpdateUserInput {
  display_name?: string;
  role?: UserRole;
  permissions?: PagePermission[];
  is_active?: number;
}
