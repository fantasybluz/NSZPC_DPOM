export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  icon: string;
  sort_order: number;
  children?: Category[];
}

export interface InventoryItem {
  id: number;
  category_id: number;
  category_name?: string;
  name: string;
  brand: string;
  spec: string;
  price: number;
  quantity: number;
  min_quantity: number;
  avg_cost: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryBatch {
  id: number;
  inventory_id: number;
  unit_cost: number;
  quantity: number;
  remaining: number;
  supplier: string;
  batch_date: string;
  note: string;
  created_at: string;
}

export interface InventoryLog {
  id: number;
  inventory_id: number;
  type: 'in' | 'out';
  change_qty: number;
  unit_cost: number;
  total_cost: number;
  reason: string;
  batch_id: number | null;
  created_at: string;
}

export type CostMethod = 'fifo' | 'average';

export interface InventoryStats {
  byCategory: CategoryStat[];
  summary: InventorySummary;
  lowStock: InventoryItem[];
}

export interface CategoryStat {
  category: string;
  count: number;
  total_qty: number;
  total_cost: number;
  total_value: number;
}

export interface InventorySummary {
  total_items: number;
  total_qty: number;
  total_cost: number;
  total_value: number;
}

export interface CreateInventoryInput {
  category_id: number;
  name: string;
  brand?: string;
  model?: string;
  spec?: string;
  cost?: number;
  price?: number;
  quantity?: number;
  min_quantity?: number;
  note?: string;
}
