import { Router, Request, Response } from 'express';
import db, { stockIn, stockOut, recalcInventory, getCostMethod } from '../models/database';

const router = Router();

// ========== 分類工具 ==========

/** 取得所有分類並建成遞迴樹 */
function getCategoryTree(): any[] {
  const all = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all() as any[];
  function buildTree(parentId: number | null): any[] {
    return all
      .filter(c => c.parent_id === parentId)
      .map(c => ({ ...c, children: buildTree(c.id) }))
      .map(c => c.children.length === 0 ? (delete c.children, c) : c);
  }
  return buildTree(null);
}

/** 遞迴取得某分類及所有子孫 ID */
function getDescendantIds(catId: number): number[] {
  const ids = [catId];
  const children = db.prepare('SELECT id FROM categories WHERE parent_id=?').all(catId) as { id: number }[];
  for (const child of children) {
    ids.push(...getDescendantIds(child.id));
  }
  return ids;
}

/** 從分類 ID 往上取得完整路徑名稱 (例: "CPU › AMD › AM5") */
function getCategoryPath(catId: number): string {
  const parts: string[] = [];
  let current = db.prepare('SELECT id, name, parent_id FROM categories WHERE id=?').get(catId) as any;
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? db.prepare('SELECT id, name, parent_id FROM categories WHERE id=?').get(current.parent_id) as any : null;
  }
  return parts.join(' › ');
}

// ========== 分類 CRUD ==========

router.get('/categories', (_req: Request, res: Response) => {
  res.json(getCategoryTree());
});

router.post('/categories', (req: Request, res: Response) => {
  const { name, parent_id, icon } = req.body;
  if (!name) return res.status(400).json({ error: '名稱必填' });
  const maxSort = db.prepare(
    parent_id
      ? 'SELECT COALESCE(MAX(sort_order),0)+1 as next FROM categories WHERE parent_id=?'
      : 'SELECT COALESCE(MAX(sort_order),0)+1 as next FROM categories WHERE parent_id IS NULL'
  ).get(parent_id || undefined) as { next: number };
  const result = db.prepare('INSERT INTO categories (parent_id, name, icon, sort_order) VALUES (?, ?, ?, ?)').run(parent_id || null, name, icon || '', maxSort.next);
  res.json({ id: result.lastInsertRowid });
});

router.put('/categories/:id', (req: Request, res: Response) => {
  const { name, icon, sort_order } = req.body;
  const sets: string[] = []; const params: any[] = [];
  if (name !== undefined) { sets.push('name=?'); params.push(name); }
  if (icon !== undefined) { sets.push('icon=?'); params.push(icon); }
  if (sort_order !== undefined) { sets.push('sort_order=?'); params.push(sort_order); }
  if (!sets.length) return res.status(400).json({ error: '無更新欄位' });
  params.push(req.params.id);
  db.prepare(`UPDATE categories SET ${sets.join(',')} WHERE id=?`).run(...params);
  res.json({ success: true });
});

router.put('/categories/reorder', (req: Request, res: Response) => {
  const { items } = req.body as { items: { id: number; sort_order: number; parent_id?: number | null }[] };
  if (!items?.length) return res.status(400).json({ error: '無排序資料' });
  const stmt = db.prepare('UPDATE categories SET sort_order=?, parent_id=? WHERE id=?');
  const tx = db.transaction(() => {
    for (const item of items) stmt.run(item.sort_order, item.parent_id ?? null, item.id);
  });
  tx();
  res.json({ success: true });
});

router.delete('/categories/:id', (req: Request, res: Response) => {
  const catId = parseInt(req.params.id);
  const allIds = getDescendantIds(catId);
  const ph = allIds.map(() => '?').join(',');
  const used = db.prepare(`SELECT COUNT(*) as count FROM inventory WHERE category_id IN (${ph})`).get(...allIds) as { count: number };
  if (used.count > 0) return res.status(400).json({ error: `此分類下有 ${used.count} 筆庫存，無法刪除` });
  // 遞迴刪除所有子孫
  for (const id of allIds.reverse()) {
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
  }
  res.json({ success: true });
});

// ========== 成本方法 ==========

router.get('/cost-method', (_req: Request, res: Response) => {
  res.json({ method: getCostMethod() });
});

router.put('/cost-method', (req: Request, res: Response) => {
  const { method } = req.body;
  if (method !== 'fifo' && method !== 'average') return res.status(400).json({ error: '無效的成本方法' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cost_method', ?)").run(method);
  res.json({ success: true });
});

// ========== 庫存列表 ==========

router.get('/', (req: Request, res: Response) => {
  const { category_id, search } = req.query;

  let sql = 'SELECT i.*, c.name as category_name, c.parent_id, c.icon as category_icon, c.id as cat_id FROM inventory i JOIN categories c ON i.category_id = c.id';
  const params: any[] = [];
  const conditions: string[] = [];

  if (category_id) {
    // 包含所有子孫分類
    const allIds = getDescendantIds(Number(category_id));
    conditions.push(`i.category_id IN (${allIds.map(() => '?').join(',')})`);
    params.push(...allIds);
  }
  if (search) {
    conditions.push('(i.name LIKE ? OR i.brand LIKE ?)');
    const s = `%${search}%`; params.push(s, s);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY c.sort_order, i.name';

  const items = db.prepare(sql).all(...params) as any[];

  // 附加分類完整路徑
  for (const item of items) {
    item.category_path = getCategoryPath(item.category_id);
  }

  res.json(items);
});

// ========== 庫存統計 ==========

router.get('/stats', (_req: Request, res: Response) => {
  // 按頂層分類彙總
  const all = db.prepare('SELECT * FROM categories ORDER BY sort_order').all() as any[];
  const roots = all.filter(c => c.parent_id === null);

  const byCategory = roots.map(root => {
    const allIds = getDescendantIds(root.id);
    const ph = allIds.map(() => '?').join(',');
    const stat = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(quantity),0) as total_qty,
             COALESCE(SUM(avg_cost * quantity),0) as total_cost,
             COALESCE(SUM(price * quantity),0) as total_value
      FROM inventory WHERE category_id IN (${ph})
    `).get(...allIds) as any;
    return { category: root.name, ...stat };
  }).filter(s => s.count > 0);

  const summary = db.prepare(`
    SELECT COUNT(*) as total_items, SUM(quantity) as total_qty,
           SUM(avg_cost * quantity) as total_cost, SUM(price * quantity) as total_value FROM inventory
  `).get();

  const lowStock = db.prepare(`
    SELECT i.*, c.name as category_name FROM inventory i JOIN categories c ON i.category_id = c.id
    WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0 ORDER BY i.quantity ASC
  `).all() as any[];
  for (const item of lowStock) item.category_path = getCategoryPath(item.category_id);

  res.json({ byCategory, summary, lowStock });
});

// ========== 單一商品詳情 ==========

router.get('/:id/detail', (req: Request, res: Response) => {
  const inv = db.prepare('SELECT i.*, c.name as category_name FROM inventory i JOIN categories c ON i.category_id = c.id WHERE i.id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: '找不到商品' });

  inv.category_path = getCategoryPath(inv.category_id);
  inv.batches = db.prepare('SELECT * FROM inventory_batches WHERE inventory_id = ? ORDER BY batch_date ASC, id ASC').all(req.params.id);
  inv.logs = db.prepare('SELECT * FROM inventory_logs WHERE inventory_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  inv.cost_method = getCostMethod();

  const fifoBatch = db.prepare('SELECT unit_cost FROM inventory_batches WHERE inventory_id = ? AND remaining > 0 ORDER BY batch_date ASC, id ASC LIMIT 1').get(req.params.id) as { unit_cost: number } | undefined;
  inv.fifo_cost = fifoBatch?.unit_cost || 0;

  res.json(inv);
});

// ========== CRUD ==========

router.post('/', (req: Request, res: Response) => {
  const { category_id, name, brand, spec, price, min_quantity, note, initial_cost, initial_qty, supplier } = req.body;
  const result = db.prepare(
    'INSERT INTO inventory (category_id, name, brand, spec, price, quantity, min_quantity, note) VALUES (?,?,?,?,?,0,?,?)'
  ).run(category_id, name, brand || '', spec || '', price || 0, min_quantity || 0, note || '');

  const invId = result.lastInsertRowid as number;
  if (initial_qty && initial_qty > 0 && initial_cost > 0) {
    stockIn(invId, initial_qty, initial_cost, supplier || '', '初始庫存');
  }
  res.json({ id: invId });
});

router.put('/:id', (req: Request, res: Response) => {
  const { category_id, name, brand, spec, price, min_quantity, note } = req.body;
  const old = db.prepare('SELECT id FROM inventory WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '找不到項目' });
  db.prepare(
    "UPDATE inventory SET category_id=?, name=?, brand=?, spec=?, price=?, min_quantity=?, note=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(category_id, name, brand || '', spec || '', price || 0, min_quantity || 0, note || '', req.params.id);
  res.json({ success: true });
});

router.post('/:id/stock-in', (req: Request, res: Response) => {
  const { quantity, unit_cost, supplier, note } = req.body;
  if (!quantity || quantity <= 0) return res.status(400).json({ error: '數量必須大於 0' });
  if (!unit_cost || unit_cost <= 0) return res.status(400).json({ error: '單價必須大於 0' });
  const inv = db.prepare('SELECT id FROM inventory WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: '找不到商品' });
  const batchId = stockIn(parseInt(req.params.id), quantity, unit_cost, supplier || '', note || '');
  res.json({ batch_id: batchId });
});

router.post('/:id/stock-out', (req: Request, res: Response) => {
  const { quantity, reason } = req.body;
  if (!quantity || quantity <= 0) return res.status(400).json({ error: '數量必須大於 0' });
  const inv = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(req.params.id) as { quantity: number } | undefined;
  if (!inv) return res.status(404).json({ error: '找不到商品' });
  if (inv.quantity < quantity) return res.status(400).json({ error: `庫存不足，目前只有 ${inv.quantity} 個` });
  const result = stockOut(parseInt(req.params.id), quantity, reason || '出貨');
  res.json(result);
});

router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM inventory_logs WHERE inventory_id = ?').run(req.params.id);
  db.prepare('DELETE FROM inventory_batches WHERE inventory_id = ?').run(req.params.id);
  db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
