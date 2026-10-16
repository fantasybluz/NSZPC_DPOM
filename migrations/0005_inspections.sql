-- 出機檢測表（參考 Bluz Computer Studio 的檢測表）：一張訂單一份，存實測數據，可以匯出給客人。
-- 高壓測試（stress）和逐項檢查（checks）存 JSON 陣列：一起讀寫、不用一列一個查詢（D1 每個請求最多 50 個查詢）。
CREATE TABLE inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL UNIQUE,
  report_no TEXT NOT NULL DEFAULT '',
  test_date TEXT NOT NULL DEFAULT '',
  client_name TEXT DEFAULT '',
  machine_spec TEXT DEFAULT '',
  os_version TEXT DEFAULT '',
  tester TEXT DEFAULT '',
  ambient_temp REAL DEFAULT 0,
  stress TEXT NOT NULL DEFAULT '[]',
  checks TEXT NOT NULL DEFAULT '[]',
  conclusion TEXT NOT NULL DEFAULT 'pass',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);
