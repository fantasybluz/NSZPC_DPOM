export type UserRole = 'admin' | 'user';

export type PagePermission = 'dashboard' | 'inventory' | 'quotations' | 'suppliers' | 'customers' | 'youtube' | 'users';

export interface User {
  id: number;
  username: string;
  password: string;
  display_name: string;
  role: UserRole;
  permissions: string; // JSON string of PagePermission[]
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  permissions: PagePermission[];
  is_active: number;
  created_at: string;
}

export interface SessionData {
  userId: number;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: PagePermission[];
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    display_name: string;
    role: UserRole;
    permissions: PagePermission[];
  };
}

export interface CreateUserInput {
  username: string;
  password: string;
  display_name?: string;
  role?: UserRole;
  permissions?: PagePermission[];
}

export interface UpdateUserInput {
  display_name?: string;
  role?: UserRole;
  permissions?: PagePermission[];
  is_active?: number;
  password?: string;
}
