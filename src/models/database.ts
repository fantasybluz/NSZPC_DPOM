// 資料庫：Cloudflare D1（SQLite），資料表見 migrations/。
//
// pool.query(sql, params) 保留原本 pg 的寫法：$1、$2 會換成 SQLite 的 ?1、?2，NOW() 換成 ISO 時間字串，
// 回傳 { rows, rowCount }。routes 裡大部分 SQL 不用改。
//
// D1 免費方案每個請求最多 50 個查詢（batch 裡每一句都算），一句最多 100 個參數。所以：
//   - 多筆寫入用 json_each(?) 一句寫完，不要一筆一個查詢
//   - 扣庫存、還原庫存先把要動的資料一次讀出來，在 JS 算好，再用一個 batch（同一個交易）寫回去

let database: D1Database | null = null;

/** 每個請求開始時叫一次（Worker 的 env.DB） */
export function useDatabase(db: D1Database): void {
  database = db;
}

const db = (): D1Database => {
  if (!database) throw new Error('database: useDatabase() was not called');
  return database;
};

/** 跟原本 PostgreSQL 的 TIMESTAMP 轉成 JSON 一樣的格式（UTC ISO 8601） */
export const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const translate = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1').replace(/NOW\(\)/g, NOW_SQL);

const normalizeParam = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
};

const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement =>
  db().prepare(translate(sql)).bind(...params.map(normalizeParam));

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

const pool = {
  async query<T = any>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await prepare(sql, params).all<T>();
    return { rows: result.results, rowCount: result.meta.changes ?? 0 };
  },

  /** 多句一起送（同一個交易，有一句失敗全部回滾） */
  async batch(statements: [string, unknown[]?][]): Promise<QueryResult[]> {
    if (statements.length === 0) return [];
    const results = await db().batch(statements.map(([sql, params]) => prepare(sql, params ?? [])));
    return results.map((r) => ({ rows: r.results as any[], rowCount: r.meta.changes ?? 0 }));
  },
};

export default pool;

// ========== 時間工具（台灣時間） ==========

/** 台灣時間的 YYYY-MM-DD（Worker 是 UTC） */
export function taipeiDate(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 原本 to_char(created_at, 'YYYY-MM')：ISO 時間轉成台灣時間再取年月 */
export const taipeiMonthSql = (column: string): string => `strftime('%Y-%m', ${column}, '+8 hours')`;

/** ISO 週（週一到週日）的起訖日，取代原本 to_char(x, 'IYYY-IW') */
export function isoWeekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`無效的日期：${dateStr}`);
  const day = (d.getUTCDay() + 6) % 7; // 週一 = 0
  const start = new Date(d.getTime() - day * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// ========== 分類工具（一次讀全部，在記憶體算，避免一層一層查） ==========

export interface CategoryRow {
  id: number;
  parent_id: number | null;
  name: string;
  icon: string;
  sort_order: number;
}

export async function loadCategories(): Promise<CategoryRow[]> {
  const { rows } = await pool.query<CategoryRow>('SELECT * FROM categories ORDER BY sort_order, id');
  return rows;
}

export function descendantIds(all: CategoryRow[], catId: number): number[] {
  const ids = [catId];
  for (const child of all.filter((c) => c.parent_id === catId)) {
    ids.push(...descendantIds(all, child.id));
  }
  return ids;
}

export function categoryPath(all: CategoryRow[], catId: number): string {
  const byId = new Map(all.map((c) => [c.id, c]));
  const parts: string[] = [];
  let current = byId.get(catId);
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return parts.join(' › ');
}

// ========== 成本計算工具 ==========

export async function getCostMethod(): Promise<'fifo' | 'average'> {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'cost_method'");
  return rows[0]?.value === 'average' ? 'average' : 'fifo';
}

/** 依批次剩餘量重算庫存數量和平均成本（一句處理多個商品） */
const recalcStatement = (inventoryIds: number[]): [string, unknown[]] => [
  `UPDATE inventory SET
     quantity = COALESCE((SELECT SUM(remaining) FROM inventory_batches b WHERE b.inventory_id = inventory.id AND b.remaining > 0), 0),
     avg_cost = COALESCE((SELECT CAST(SUM(remaining * unit_cost) AS REAL) / SUM(remaining) FROM inventory_batches b
                          WHERE b.inventory_id = inventory.id AND b.remaining > 0), 0),
     updated_at = NOW()
   WHERE id IN (SELECT value FROM json_each($1))`,
  [JSON.stringify([...new Set(inventoryIds)])],
];

export async function recalcInventory(inventoryId: number): Promise<void> {
  await pool.batch([recalcStatement([inventoryId])]);
}

interface BatchTake {
  id: number;
  take: number;
}

/** 從多個批次扣量（一句）；同一個批次出現多次（訂單裡兩項扣同一批）要先加總，UPDATE 每列只會套用一次 */
const takeFromBatchesStatement = (takes: BatchTake[]): [string, unknown[]] => {
  const merged = new Map<number, number>();
  for (const t of takes) merged.set(t.id, (merged.get(t.id) ?? 0) + t.take);
  return [
    `UPDATE inventory_batches
     SET remaining = remaining - (SELECT json_extract(j.value, '$.take') FROM json_each($1) j WHERE json_extract(j.value, '$.id') = inventory_batches.id)
     WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each($1))`,
    [JSON.stringify([...merged].map(([id, take]) => ({ id, take })))],
  ];
};

interface LogEntry {
  inventory_id: number;
  type: 'in' | 'out';
  change_qty: number;
  unit_cost: number;
  total_cost: number;
  reason: string;
  batch_id: number | null;
}

/** 寫多筆庫存異動紀錄（一句） */
const insertLogsStatement = (logs: LogEntry[]): [string, unknown[]] => [
  `INSERT INTO inventory_logs (inventory_id, type, change_qty, unit_cost, total_cost, reason, batch_id)
   SELECT json_extract(value, '$.inventory_id'), json_extract(value, '$.type'), json_extract(value, '$.change_qty'),
          json_extract(value, '$.unit_cost'), json_extract(value, '$.total_cost'), json_extract(value, '$.reason'),
          json_extract(value, '$.batch_id')
   FROM json_each($1)`,
  [JSON.stringify(logs)],
];

export interface StockInEntry {
  inventory_id: number;
  quantity: number;
  unit_cost: number;
}

/**
 * 進貨：每個商品建一個批次、記一筆異動、重算庫存。不管幾個商品都是 3 個查詢。
 * 回傳每個新批次的 id（順序跟 entries 一樣）
 */
export async function stockInMany(entries: StockInEntry[], supplier = '', note = ''): Promise<number[]> {
  if (entries.length === 0) return [];
  const indexed = entries.map((e, i) => ({ ...e, i }));
  const { rows: batches } = await pool.query<{ id: number; inventory_id: number; unit_cost: number; quantity: number; i: number }>(
    `INSERT INTO inventory_batches (inventory_id, unit_cost, quantity, remaining, supplier, note)
     SELECT json_extract(value, '$.inventory_id'), json_extract(value, '$.unit_cost'), json_extract(value, '$.quantity'),
            json_extract(value, '$.quantity'), $2, $3
     FROM json_each($1) ORDER BY json_extract(value, '$.i')
     RETURNING id, inventory_id, unit_cost, quantity`,
    [JSON.stringify(indexed), supplier, note],
  );

  const reason = supplier ? `進貨 (${supplier})` : '進貨';
  await pool.batch([
    insertLogsStatement(
      batches.map((b) => ({
        inventory_id: b.inventory_id,
        type: 'in',
        change_qty: b.quantity,
        unit_cost: b.unit_cost,
        total_cost: b.unit_cost * b.quantity,
        reason,
        batch_id: b.id,
      })),
    ),
    recalcStatement(batches.map((b) => b.inventory_id)),
  ]);
  return batches.map((b) => b.id);
}

export async function stockIn(inventoryId: number, quantity: number, unitCost: number, supplier = '', note = ''): Promise<number> {
  const [batchId] = await stockInMany([{ inventory_id: inventoryId, quantity, unit_cost: unitCost }], supplier, note);
  return batchId;
}

interface BatchRow {
  id: number;
  inventory_id: number;
  unit_cost: number;
  remaining: number;
}

/** 依序從批次扣 quantity，回傳每個批次扣了多少（會改到 batches 裡的 remaining，讓同一個商品的下一筆接著算） */
function allocate(batches: BatchRow[], quantity: number): { take: BatchTake & { unit_cost: number }; }[] {
  const takes: { take: BatchTake & { unit_cost: number } }[] = [];
  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    if (batch.remaining <= 0) continue;
    const take = Math.min(remaining, batch.remaining);
    batch.remaining -= take;
    remaining -= take;
    takes.push({ take: { id: batch.id, take, unit_cost: batch.unit_cost } });
  }
  return takes;
}

export async function stockOut(inventoryId: number, quantity: number, reason = '出貨'): Promise<{ totalCost: number; unitCost: number }> {
  const method = await getCostMethod();
  const { rows: batches } = await pool.query<BatchRow>(
    method === 'fifo'
      ? 'SELECT id, inventory_id, unit_cost, remaining FROM inventory_batches WHERE inventory_id = $1 AND remaining > 0 ORDER BY batch_date ASC, id ASC'
      : 'SELECT id, inventory_id, unit_cost, remaining FROM inventory_batches WHERE inventory_id = $1 AND remaining > 0 ORDER BY id ASC',
    [inventoryId],
  );

  const takes = allocate(batches, quantity).map((t) => t.take);
  const actualQty = takes.reduce((sum, t) => sum + t.take, 0);

  let totalCost: number;
  if (method === 'fifo') {
    totalCost = takes.reduce((sum, t) => sum + t.take * t.unit_cost, 0);
  } else {
    const { rows } = await pool.query('SELECT avg_cost FROM inventory WHERE id = $1', [inventoryId]);
    totalCost = Math.round((rows[0]?.avg_cost ?? 0) * quantity);
  }
  const unitCost = actualQty > 0 ? Math.round(totalCost / actualQty) : 0;

  await pool.batch([
    takeFromBatchesStatement(takes),
    insertLogsStatement([
      { inventory_id: inventoryId, type: 'out', change_qty: -actualQty, unit_cost: unitCost, total_cost: totalCost, reason, batch_id: null },
    ]),
    recalcStatement([inventoryId]),
  ]);
  return { totalCost, unitCost };
}

// ========== 訂單扣帳 / 還原 ==========
//
// 「訂單成立」(deposit/pending/completed) 時對 quotation_items.inventory_id 不為 null 的項目
// 依 FIFO 從庫存批次扣量；逐批次紀錄到 quotation_stock_deductions，
// 之後狀態回退（draft/cancelled）或刪單時，依紀錄把量加回原批次，
// 若批次已被刪除（庫存品被刪掉），則改建新批次補回。
// 跟原本不同的是：寫入都在同一個 batch（交易）裡，中途失敗不會只扣一半。

export const DEDUCTING_QUOTATION_STATUSES = new Set(['deposit', 'pending', 'completed']);
export function isDeductingStatus(status: string): boolean {
  return DEDUCTING_QUOTATION_STATUSES.has(status);
}

export async function deductQuotationStock(quotationId: number): Promise<void> {
  const { rows: items } = await pool.query<{ id: number; inventory_id: number; name: string; quantity: number }>(
    `SELECT id, inventory_id, name, quantity FROM quotation_items
     WHERE quotation_id = $1 AND inventory_id IS NOT NULL AND quantity > 0 ORDER BY id`,
    [quotationId],
  );
  if (!items.length) {
    await pool.query('UPDATE quotations SET stock_deducted = 1 WHERE id = $1', [quotationId]);
    return;
  }

  const inventoryIds = [...new Set(items.map((it) => it.inventory_id))];
  const idsJson = JSON.stringify(inventoryIds);
  const [{ rows: inventories }, { rows: batches }] = await pool.batch([
    ['SELECT id, name, quantity FROM inventory WHERE id IN (SELECT value FROM json_each($1))', [idsJson]],
    [
      `SELECT id, inventory_id, unit_cost, remaining FROM inventory_batches
       WHERE inventory_id IN (SELECT value FROM json_each($1)) AND remaining > 0 ORDER BY batch_date ASC, id ASC`,
      [idsJson],
    ],
  ]);

  // 預檢查：合計同一個 inventory_id 的需求量，避免單筆夠但合計不夠
  const needByInv = new Map<number, number>();
  for (const it of items) needByInv.set(it.inventory_id, (needByInv.get(it.inventory_id) || 0) + it.quantity);
  const invById = new Map(inventories.map((inv: any) => [inv.id as number, inv]));
  for (const [invId, need] of needByInv) {
    const inv = invById.get(invId);
    if (!inv) continue; // 商品被刪了，跳過（不扣也不報錯）
    if (inv.quantity < need) {
      throw new Error(`庫存不足：${inv.name}（需要 ${need}，目前 ${inv.quantity}）`);
    }
  }

  const batchesByInv = new Map<number, BatchRow[]>();
  for (const b of batches as BatchRow[]) {
    const list = batchesByInv.get(b.inventory_id) ?? [];
    list.push(b);
    batchesByInv.set(b.inventory_id, list);
  }

  const takes: BatchTake[] = [];
  const deductions: { inventory_id: number; batch_id: number; take: number; unit_cost: number }[] = [];
  const logs: LogEntry[] = [];
  for (const item of items) {
    const invBatches = batchesByInv.get(item.inventory_id);
    if (!invBatches?.length) continue; // 沒有批次紀錄就跳過
    for (const { take } of allocate(invBatches, item.quantity)) {
      takes.push({ id: take.id, take: take.take });
      deductions.push({ inventory_id: item.inventory_id, batch_id: take.id, take: take.take, unit_cost: take.unit_cost });
      logs.push({
        inventory_id: item.inventory_id,
        type: 'out',
        change_qty: -take.take,
        unit_cost: take.unit_cost,
        total_cost: take.take * take.unit_cost,
        reason: `訂單扣帳 #${quotationId}`,
        batch_id: take.id,
      });
    }
  }

  await pool.batch([
    takeFromBatchesStatement(takes),
    [
      `INSERT INTO quotation_stock_deductions (quotation_id, inventory_id, batch_id, quantity, unit_cost)
       SELECT $1, json_extract(value, '$.inventory_id'), json_extract(value, '$.batch_id'), json_extract(value, '$.take'), json_extract(value, '$.unit_cost')
       FROM json_each($2)`,
      [quotationId, JSON.stringify(deductions)],
    ],
    insertLogsStatement(logs),
    recalcStatement(inventoryIds),
    ['UPDATE quotations SET stock_deducted = 1 WHERE id = $1', [quotationId]],
  ]);
}

export async function restoreQuotationStock(quotationId: number): Promise<void> {
  const { rows: deductions } = await pool.query<{ inventory_id: number; batch_id: number; quantity: number; unit_cost: number }>(
    'SELECT inventory_id, batch_id, quantity, unit_cost FROM quotation_stock_deductions WHERE quotation_id = $1',
    [quotationId],
  );
  if (!deductions.length) {
    await pool.query('UPDATE quotations SET stock_deducted = 0 WHERE id = $1', [quotationId]);
    return;
  }

  const [{ rows: existingBatches }, { rows: existingInventory }] = await pool.batch([
    ['SELECT id FROM inventory_batches WHERE id IN (SELECT value FROM json_each($1))', [JSON.stringify(deductions.map((d) => d.batch_id))]],
    ['SELECT id FROM inventory WHERE id IN (SELECT value FROM json_each($1))', [JSON.stringify(deductions.map((d) => d.inventory_id))]],
  ]);
  const batchExists = new Set(existingBatches.map((b: any) => b.id as number));
  const inventoryExists = new Set(existingInventory.map((i: any) => i.id as number));

  const putBack: BatchTake[] = [];
  const logs: LogEntry[] = [];
  const rebuild: StockInEntry[] = [];
  for (const d of deductions) {
    if (batchExists.has(d.batch_id)) {
      putBack.push({ id: d.batch_id, take: -d.quantity }); // 扣負數 = 加回去
      logs.push({
        inventory_id: d.inventory_id,
        type: 'in',
        change_qty: d.quantity,
        unit_cost: d.unit_cost,
        total_cost: d.quantity * d.unit_cost,
        reason: `訂單還原 #${quotationId}`,
        batch_id: d.batch_id,
      });
    } else if (inventoryExists.has(d.inventory_id)) {
      // 原批次已不存在，改建新批次補回
      rebuild.push({ inventory_id: d.inventory_id, quantity: d.quantity, unit_cost: d.unit_cost });
    }
  }

  await pool.batch([
    takeFromBatchesStatement(putBack),
    insertLogsStatement(logs),
    recalcStatement(deductions.map((d) => d.inventory_id)),
    ['DELETE FROM quotation_stock_deductions WHERE quotation_id = $1', [quotationId]],
    ['UPDATE quotations SET stock_deducted = 0 WHERE id = $1', [quotationId]],
  ]);
  if (rebuild.length) {
    await stockInMany(rebuild, '', `訂單還原 #${quotationId}`);
  }
}

// ========== 報價單明細（一句寫完） ==========

export async function insertQuotationItems(quotationId: number, items: any[] | undefined): Promise<void> {
  if (!items?.length) return;
  const rows = items.map((item) => ({
    category: item.category || '',
    name: item.name,
    spec: item.spec || '',
    cost: item.cost || 0,
    price: item.price || 0,
    quantity: item.quantity || 1,
    inventory_id: item.inventory_id || null,
  }));
  await pool.query(
    `INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity, inventory_id)
     SELECT $1, json_extract(value, '$.category'), json_extract(value, '$.name'), json_extract(value, '$.spec'),
            json_extract(value, '$.cost'), json_extract(value, '$.price'), json_extract(value, '$.quantity'),
            json_extract(value, '$.inventory_id')
     FROM json_each($2)`,
    [quotationId, JSON.stringify(rows)],
  );
}
