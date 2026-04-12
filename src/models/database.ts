import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'nszpc',
  user: process.env.DB_USER || 'nszpc',
  password: process.env.DB_PASSWORD || 'nszpc',
});

// ========== 初始化資料表 ==========

export async function initDatabase(): Promise<void> {
  await pool.query(`
    -- 分類（父子架構）
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(parent_id, name)
    );

    -- 庫存商品
    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      spec TEXT DEFAULT '',
      price INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 0,
      avg_cost REAL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- 進貨批次
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id SERIAL PRIMARY KEY,
      inventory_id INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      remaining INTEGER NOT NULL,
      supplier TEXT DEFAULT '',
      batch_date DATE DEFAULT CURRENT_DATE,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );

    -- 庫存異動紀錄
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id SERIAL PRIMARY KEY,
      inventory_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'in',
      change_qty INTEGER NOT NULL,
      unit_cost INTEGER DEFAULT 0,
      total_cost INTEGER DEFAULT 0,
      reason TEXT DEFAULT '',
      batch_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      source TEXT DEFAULT '',
      city TEXT DEFAULT '',
      district TEXT DEFAULT '',
      address TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS service_records (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      service_type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      service_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      quotation_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS supplier_prices (
      id SERIAL PRIMARY KEY,
      supplier_name TEXT DEFAULT '',
      product_name TEXT NOT NULL,
      price INTEGER DEFAULT 0,
      source_text TEXT DEFAULT '',
      quote_date DATE DEFAULT CURRENT_DATE,
      parsed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      payment_type TEXT DEFAULT 'weekly',
      default_tax_type TEXT DEFAULT 'tax_included',
      contact TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER NOT NULL,
      supplier_name TEXT DEFAULT '',
      tax_type TEXT DEFAULT 'tax_included',
      subtotal INTEGER DEFAULT 0,
      tax_amount INTEGER DEFAULT 0,
      total_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      order_date DATE DEFAULT CURRENT_DATE,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      spec TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      unit_price INTEGER DEFAULT 0,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS warranties (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (quotation_id) REFERENCES quotations(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS repair_orders (
      id SERIAL PRIMARY KEY,
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
      received_date DATE DEFAULT CURRENT_DATE,
      completed_date TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (warranty_id) REFERENCES warranties(id),
      FOREIGN KEY (quotation_id) REFERENCES quotations(id)
    );

    CREATE TABLE IF NOT EXISTS repair_logs (
      id SERIAL PRIMARY KEY,
      repair_id INTEGER NOT NULL,
      status TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (repair_id) REFERENCES repair_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      permissions TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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

  async function seedCategories(nodes: CatDef[], parentId: number | null, parentIcon: string = '') {
    let sort = 1;
    for (const node of nodes) {
      const icon = node.icon || parentIcon;
      const existing = parentId === null
        ? await pool.query('SELECT id FROM categories WHERE name = $1 AND parent_id IS NULL', [node.name])
        : await pool.query('SELECT id FROM categories WHERE name = $1 AND parent_id = $2', [node.name, parentId]);

      let id: number;
      if (existing.rows.length === 0) {
        const r = await pool.query(
          'INSERT INTO categories (parent_id, name, icon, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
          [parentId, node.name, icon, sort]
        );
        id = r.rows[0].id;
      } else {
        id = existing.rows[0].id;
      }
      if (node.children) await seedCategories(node.children, id, icon);
      sort++;
    }
  }
  await seedCategories(defaultCategories, null);

  // 預設成本方法
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('cost_method', 'fifo') ON CONFLICT (key) DO NOTHING"
  );

  // 預設管理員
  const adminExists = await pool.query("SELECT id FROM users WHERE username = 'admin'");
  if (adminExists.rows.length === 0) {
    await pool.query(
      'INSERT INTO users (username, password, display_name, role, permissions) VALUES ($1, $2, $3, $4, $5)',
      ['admin', hashPassword('admin'), '管理員', 'admin',
        JSON.stringify(['dashboard', 'inventory', 'quotations', 'suppliers', 'customers', 'youtube', 'users', 'categories'])]
    );
  }
}

// ========== 密碼雜湊 ==========

export function hashPassword(pwd: string): string {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

// ========== 成本計算工具 ==========

export async function getCostMethod(): Promise<'fifo' | 'average'> {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'cost_method'");
  return rows[0]?.value === 'average' ? 'average' : 'fifo';
}

export async function stockIn(inventoryId: number, quantity: number, unitCost: number, supplier: string = '', note: string = ''): Promise<number> {
  const batch = await pool.query(
    'INSERT INTO inventory_batches (inventory_id, unit_cost, quantity, remaining, supplier, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [inventoryId, unitCost, quantity, quantity, supplier, note]
  );
  const batchId = batch.rows[0].id;

  await pool.query(
    'INSERT INTO inventory_logs (inventory_id, type, change_qty, unit_cost, total_cost, reason, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [inventoryId, 'in', quantity, unitCost, unitCost * quantity, supplier ? `進貨 (${supplier})` : '進貨', batchId]
  );

  await recalcInventory(inventoryId);
  return batchId;
}

export async function stockOut(inventoryId: number, quantity: number, reason: string = '出貨'): Promise<{ totalCost: number; unitCost: number }> {
  const method = await getCostMethod();
  let totalCost = 0;
  let remaining = quantity;

  if (method === 'fifo') {
    const { rows: batches } = await pool.query(
      'SELECT * FROM inventory_batches WHERE inventory_id = $1 AND remaining > 0 ORDER BY batch_date ASC, id ASC',
      [inventoryId]
    );
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.remaining);
      totalCost += take * batch.unit_cost;
      remaining -= take;
      await pool.query('UPDATE inventory_batches SET remaining = remaining - $1 WHERE id = $2', [take, batch.id]);
    }
  } else {
    const { rows } = await pool.query('SELECT avg_cost FROM inventory WHERE id = $1', [inventoryId]);
    totalCost = Math.round(rows[0].avg_cost * quantity);
    const { rows: batches } = await pool.query(
      'SELECT * FROM inventory_batches WHERE inventory_id = $1 AND remaining > 0 ORDER BY id ASC',
      [inventoryId]
    );
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.remaining);
      remaining -= take;
      await pool.query('UPDATE inventory_batches SET remaining = remaining - $1 WHERE id = $2', [take, batch.id]);
    }
  }

  const actualQty = quantity - remaining;
  const unitCost = actualQty > 0 ? Math.round(totalCost / actualQty) : 0;

  await pool.query(
    'INSERT INTO inventory_logs (inventory_id, type, change_qty, unit_cost, total_cost, reason) VALUES ($1,$2,$3,$4,$5,$6)',
    [inventoryId, 'out', -actualQty, unitCost, totalCost, reason]
  );

  await recalcInventory(inventoryId);
  return { totalCost, unitCost };
}

export async function recalcInventory(inventoryId: number): Promise<void> {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(remaining), 0) as qty, COALESCE(SUM(remaining * unit_cost), 0) as total_cost FROM inventory_batches WHERE inventory_id = $1 AND remaining > 0',
    [inventoryId]
  );
  const result = rows[0];
  const avgCost = result.qty > 0 ? result.total_cost / result.qty : 0;

  await pool.query(
    'UPDATE inventory SET quantity = $1, avg_cost = $2, updated_at = NOW() WHERE id = $3',
    [result.qty, avgCost, inventoryId]
  );
}

export default pool;
