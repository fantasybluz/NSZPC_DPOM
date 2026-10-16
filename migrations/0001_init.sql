-- 星辰電腦 NSZPC 管理系統：Cloudflare D1（SQLite）資料表
-- 從原本 PostgreSQL 的 initDatabase() 轉過來：
--   SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT
--   TIMESTAMP DEFAULT NOW() → TEXT，ISO 8601（UTC），跟原本 API 回傳的 JSON 格式一樣
--   DATE DEFAULT CURRENT_DATE → TEXT 'YYYY-MM-DD'
-- users 改成用 email 對應 Cloudflare Access 登入的人，不再存密碼。

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE (parent_id, name)
);

CREATE TABLE inventory (
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
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  supplier TEXT DEFAULT '',
  batch_date TEXT DEFAULT (date('now')),
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);
CREATE INDEX idx_batches_inventory ON inventory_batches(inventory_id);

CREATE TABLE inventory_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'in',
  change_qty INTEGER NOT NULL,
  unit_cost INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,
  reason TEXT DEFAULT '',
  batch_id INTEGER,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);
CREATE INDEX idx_logs_inventory ON inventory_logs(inventory_id);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  source TEXT DEFAULT '',
  city TEXT DEFAULT '',
  district TEXT DEFAULT '',
  address TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE service_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  service_type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  service_date TEXT DEFAULT (date('now')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE quotations (
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
  stock_deducted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  category TEXT DEFAULT '',
  name TEXT NOT NULL,
  spec TEXT DEFAULT '',
  cost INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  inventory_id INTEGER,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);
CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);

CREATE TABLE quotation_stock_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  inventory_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);
CREATE INDEX idx_qsd_quotation ON quotation_stock_deductions(quotation_id);

-- filename 是 R2（UPLOADS）裡的 key：uploads/<filename>
CREATE TABLE quotation_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

CREATE TABLE supplier_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT DEFAULT '',
  product_name TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  source_text TEXT DEFAULT '',
  quote_date TEXT DEFAULT (date('now')),
  parsed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  payment_type TEXT DEFAULT 'weekly',
  default_tax_type TEXT DEFAULT 'tax_included',
  contact TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  supplier_name TEXT DEFAULT '',
  tax_type TEXT DEFAULT 'tax_included',
  subtotal INTEGER DEFAULT 0,
  tax_amount INTEGER DEFAULT 0,
  total_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  order_date TEXT DEFAULT (date('now')),
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  unit_price INTEGER DEFAULT 0,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE TABLE settlements (
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
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE warranties (
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
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE repair_orders (
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
  received_date TEXT DEFAULT (date('now')),
  completed_date TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (warranty_id) REFERENCES warranties(id),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id)
);

CREATE TABLE repair_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repair_id INTEGER NOT NULL,
  status TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (repair_id) REFERENCES repair_orders(id) ON DELETE CASCADE
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

-- 登入的人：Cloudflare Access 驗過的 email 對到這裡，角色、頁面權限照舊。username 跟 email 一樣（前端顯示用）
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  permissions TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
