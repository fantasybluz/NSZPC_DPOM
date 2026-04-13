export type PagePermission = 'dashboard' | 'inventory' | 'quotations' | 'suppliers' | 'customers' | 'youtube' | 'users' | 'categories';

export interface NavItem {
  id: PagePermission;
  label: string;
  icon: string;
  href: string;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '儀表板', icon: 'bi-speedometer2', href: '/dashboard' },
  { id: 'inventory', label: '庫存管理', icon: 'bi-box-seam', href: '/inventory' },
  { id: 'quotations', label: '訂單管理', icon: 'bi-receipt', href: '/quotations' },
  { id: 'suppliers', label: '盤商報價', icon: 'bi-chat-left-text', href: '/suppliers' },
  { id: 'customers', label: '客戶管理', icon: 'bi-people', href: '/customers' },
  { id: 'suppliers', label: '叫貨管理', icon: 'bi-truck', href: '/purchases' },
  { id: 'dashboard', label: '報表/售後', icon: 'bi-graph-up', href: '/reports' },
  { id: 'youtube', label: '社群設定', icon: 'bi-youtube', href: '/social' },
  { id: 'categories', label: '分類管理', icon: 'bi-diagram-3', href: '/categories', adminOnly: true },
  { id: 'users', label: '權限管理', icon: 'bi-shield-lock', href: '/users', adminOnly: true },
];

export const STATUS_MAP: Record<string, { label: string; class: string }> = {
  draft: { label: '尚未成交', class: 'badge-draft' },
  deposit: { label: '已付訂金', class: 'badge-deposit' },
  pending: { label: '尚未結單', class: 'badge-pending' },
  completed: { label: '已完成', class: 'badge-completed' },
  cancelled: { label: '已取消', class: 'badge-cancelled' },
};

export const DELIVERY_MAP: Record<string, string> = {
  preparing: '備料中',
  assembling: '組裝中',
  testing: '測試中',
  ready: '待出貨',
  shipped: '已出貨',
  delivered: '已送達',
};
