import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const dbPath = path.join(__dirname, '..', '..', 'data', 'shop.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== 初始化資料表 ==========

db.exec(`
  -- 分類（父子架構）
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE(parent_id, name)
  );

  -- 庫存商品（cost 改為計算值，不直接手動輸入）
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    price INTEGER DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 0,
    avg_cost REAL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  -- 進貨批次
  CREATE TABLE IF NOT EXISTS inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL,
    unit_cost INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    remaining INTEGER NOT NULL,
    supplier TEXT DEFAULT '',
    batch_date TEXT DEFAULT (date('now','localtime')),
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
  );

  -- 庫存異動紀錄（進貨/出貨/調整）
  CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'in',
    change_qty INTEGER NOT NULL,
    unit_cost INTEGER DEFAULT 0,
    total_cost INTEGER DEFAULT 0,
    reason TEXT DEFAULT '',
    batch_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (inventory_id) REFERENCES inventory(id),
    FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    source TEXT DEFAULT '',
    city TEXT DEFAULT '',
    district TEXT DEFAULT '',
    address TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS service_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    service_type TEXT DEFAULT '',
    description TEXT DEFAULT '',
    service_date TEXT DEFAULT (date('now','localtime')),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    customer_name TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    deposit INTEGER DEFAULT 0,
    service_fee INTEGER DEFAULT 0,
    total_cost INTEGER DEFAULT 0,
    total_price INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    item_title TEXT DEFAULT '',
    demand_area TEXT DEFAULT '',
    ship_date TEXT DEFAULT '',
    delivery_status TEXT DEFAULT '',
    qc_data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    category TEXT DEFAULT '',
    name TEXT NOT NULL,
    spec TEXT DEFAULT '',
    cost INTEGER DEFAULT 0,
    price INTEGER DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quotation_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS supplier_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT DEFAULT '',
    product_name TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    source_text TEXT DEFAULT '',
    quote_date TEXT DEFAULT (date('now','localtime')),
    parsed_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 盤商設定（結款方式 + 預設含稅）
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    payment_type TEXT DEFAULT 'weekly',
    default_tax_type TEXT DEFAULT 'tax_included',
    contact TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 進貨訂單
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT DEFAULT '',
    tax_type TEXT DEFAULT 'tax_included',
    subtotal INTEGER DEFAULT 0,
    tax_amount INTEGER DEFAULT 0,
    total_amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    order_date TEXT DEFAULT (date('now','localtime')),
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  -- 進貨明細
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    quantity INTEGER DEFAULT 1,
    unit_price INTEGER DEFAULT 0,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
  );

  -- 結款紀錄
  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT DEFAULT '',
    tax_type TEXT DEFAULT 'tax_included',
    subtotal INTEGER DEFAULT 0,
    tax_amount INTEGER DEFAULT 0,
    amount INTEGER DEFAULT 0,
    period_start TEXT DEFAULT '',
    period_end TEXT DEFAULT '',
    status TEXT DEFAULT 'unpaid',
    paid_date TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  -- 保固管理
  CREATE TABLE IF NOT EXISTS warranties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER,
    customer_id INTEGER,
    customer_name TEXT DEFAULT '',
    product_name TEXT NOT NULL,
    serial_number TEXT DEFAULT '',
    ship_date TEXT DEFAULT '',
    warranty_months INTEGER DEFAULT 12,
    warranty_end TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (quotation_id) REFERENCES quotations(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  -- 維修工單
  CREATE TABLE IF NOT EXISTS repair_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    customer_name TEXT DEFAULT '',
    warranty_id INTEGER,
    quotation_id INTEGER,
    device_name TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    issue TEXT DEFAULT '',
    diagnosis TEXT DEFAULT '',
    solution TEXT DEFAULT '',
    status TEXT DEFAULT 'received',
    priority TEXT DEFAULT 'normal',
    cost INTEGER DEFAULT 0,
    received_date TEXT DEFAULT (date('now','localtime')),
    completed_date TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (warranty_id) REFERENCES warranties(id),
    FOREIGN KEY (quotation_id) REFERENCES quotations(id)
  );

  -- 維修進度紀錄
  CREATE TABLE IF NOT EXISTS repair_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER NOT NULL,
    status TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (repair_id) REFERENCES repair_orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    permissions TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ========== 預設分類 ==========
interface CatDef { name: string; icon?: string; children?: CatDef[] }

const defaultCategories: CatDef[] = [
  { name: 'CPU', icon: 'cpu', children: [
    { name: 'AMD', children: [{ name: 'AM4' }, { name: 'AM5' }] },
    { name: 'Intel', children: [{ name: 'LGA1700' }, { name: 'LGA1851' }] },
  ]},
  { name: '顯示卡', icon: 'gpu-card', children: [
    { name: '華碩' }, { name: '技嘉' }, { name: '微星' },
  ]},
  { name: '主機板', icon: 'motherboard' },
  { name: '記憶體', icon: 'memory' },
  { name: '硬碟', icon: 'device-hdd' },
  { name: '散熱', icon: 'fan', children: [
    { name: '水冷', icon: 'droplet-half' }, { name: '風冷', icon: 'fan' },
  ]},
  { name: '電源供應器', icon: 'lightning-charge' },
  { name: '機殼', icon: 'pc-display', children: [
    { name: 'ATX' }, { name: 'mATX' }, { name: 'ITX' },
  ]},
  { name: '周邊', icon: 'mouse2' },
];

const findCatByParent = db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS ?');
const insertCatStmt = db.prepare('INSERT INTO categories (parent_id, name, icon, sort_order) VALUES (?, ?, ?, ?)');

function seedCategories(nodes: CatDef[], parentId: number | null, parentIcon: string = '') {
  let sort = 1;
  for (const node of nodes) {
    const icon = node.icon || parentIcon;
    const existing = findCatByParent.get(node.name, parentId) as { id: number } | undefined;
    let id: number;
    if (!existing) {
      const r = insertCatStmt.run(parentId, node.name, icon, sort);
      id = r.lastInsertRowid as number;
    } else {
      id = existing.id;
    }
    if (node.children) seedCategories(node.children, id, icon);
    sort++;
  }
}
seedCategories(defaultCategories, null);

// 預設成本方法
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cost_method', 'fifo')").run();

// 密碼雜湊
export function hashPassword(pwd: string): string {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

// 預設管理員
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  db.prepare('INSERT INTO users (username, password, display_name, role, permissions) VALUES (?, ?, ?, ?, ?)').run(
    'admin', hashPassword('admin'), '管理員', 'admin',
    JSON.stringify(['dashboard', 'inventory', 'quotations', 'suppliers', 'customers', 'youtube', 'users', 'categories'])
  );
}

// ========== 成本計算工具 ==========

/** 取得成本方法 */
export function getCostMethod(): 'fifo' | 'average' {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'cost_method'").get() as { value: string } | undefined;
  return (row?.value === 'average' ? 'average' : 'fifo');
}

/** 進貨：新增批次並更新庫存 */
export function stockIn(inventoryId: number, quantity: number, unitCost: number, supplier: string = '', note: string = ''): number {
  const batch = db.prepare(
    'INSERT INTO inventory_batches (inventory_id, unit_cost, quantity, remaining, supplier, note) VALUES (?,?,?,?,?,?)'
  ).run(inventoryId, unitCost, quantity, quantity, supplier, note);

  db.prepare(
    'INSERT INTO inventory_logs (inventory_id, type, change_qty, unit_cost, total_cost, reason, batch_id) VALUES (?,?,?,?,?,?,?)'
  ).run(inventoryId, 'in', quantity, unitCost, unitCost * quantity, supplier ? `進貨 (${supplier})` : '進貨', batch.lastInsertRowid);

  recalcInventory(inventoryId);
  return batch.lastInsertRowid as number;
}

/** 出貨：依成本方法扣庫存，回傳實際出貨成本 */
export function stockOut(inventoryId: number, quantity: number, reason: string = '出貨'): { totalCost: number; unitCost: number } {
  const method = getCostMethod();
  let totalCost = 0;
  let remaining = quantity;

  if (method === 'fifo') {
    // FIFO：從最早的批次開始扣
    const batches = db.prepare(
      'SELECT * FROM inventory_batches WHERE inventory_id = ? AND remaining > 0 ORDER BY batch_date ASC, id ASC'
    ).all(inventoryId) as any[];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.remaining);
      totalCost += take * batch.unit_cost;
      remaining -= take;
      db.prepare('UPDATE inventory_batches SET remaining = remaining - ? WHERE id = ?').run(take, batch.id);
    }
  } else {
    // 加權平均
    const inv = db.prepare('SELECT avg_cost FROM inventory WHERE id = ?').get(inventoryId) as { avg_cost: number };
    totalCost = Math.round(inv.avg_cost * quantity);
    // 依比例從各批次扣
    const batches = db.prepare(
      'SELECT * FROM inventory_batches WHERE inventory_id = ? AND remaining > 0 ORDER BY id ASC'
    ).all(inventoryId) as any[];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.remaining);
      remaining -= take;
      db.prepare('UPDATE inventory_batches SET remaining = remaining - ? WHERE id = ?').run(take, batch.id);
    }
  }

  const actualQty = quantity - remaining;
  const unitCost = actualQty > 0 ? Math.round(totalCost / actualQty) : 0;

  db.prepare(
    'INSERT INTO inventory_logs (inventory_id, type, change_qty, unit_cost, total_cost, reason) VALUES (?,?,?,?,?,?)'
  ).run(inventoryId, 'out', -actualQty, unitCost, totalCost, reason);

  recalcInventory(inventoryId);
  return { totalCost, unitCost };
}

/** 重新計算庫存數量和平均成本 */
export function recalcInventory(inventoryId: number): void {
  const result = db.prepare(
    'SELECT COALESCE(SUM(remaining), 0) as qty, COALESCE(SUM(remaining * unit_cost), 0) as total_cost FROM inventory_batches WHERE inventory_id = ? AND remaining > 0'
  ).get(inventoryId) as { qty: number; total_cost: number };

  const avgCost = result.qty > 0 ? result.total_cost / result.qty : 0;

  db.prepare(
    "UPDATE inventory SET quantity = ?, avg_cost = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(result.qty, avgCost, inventoryId);
}

export default db;
