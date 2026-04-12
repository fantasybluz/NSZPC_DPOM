import { Router, Request, Response } from 'express';
import pool, { stockIn, stockOut, recalcInventory, getCostMethod } from '../models/database';

const router = Router();

// ========== 分類工具 ==========

async function getCategoryTree(): Promise<any[]> {
  const { rows: all } = await pool.query('SELECT * FROM categories ORDER BY sort_order, id');
  function buildTree(parentId: number | null): any[] {
    return all
      .filter(c => c.parent_id === parentId)
      .map(c => ({ ...c, children: buildTree(c.id) }))
      .map(c => c.children.length === 0 ? (delete c.children, c) : c);
  }
  return buildTree(null);
}

async function getDescendantIds(catId: number): Promise<number[]> {
  const ids = [catId];
  const { rows: children } = await pool.query('SELECT id FROM categories WHERE parent_id=$1', [catId]);
  for (const child of children) {
    ids.push(...await getDescendantIds(child.id));
  }
  return ids;
}

async function getCategoryPath(catId: number): Promise<string> {
  const parts: string[] = [];
  let currentId: number | null = catId;
  while (currentId !== null) {
    const result: { rows: { id: number; name: string; parent_id: number | null }[] } = await pool.query('SELECT id, name, parent_id FROM categories WHERE id=$1', [currentId]);
    if (result.rows.length === 0) break;
    parts.unshift(result.rows[0].name);
    currentId = result.rows[0].parent_id;
  }
  return parts.join(' › ');
}

// ========== 分類 CRUD ==========

router.get('/categories', async (_req: Request, res: Response) => {
  res.json(await getCategoryTree());
});

router.post('/categories', async (req: Request, res: Response) => {
  const { name, parent_id, icon } = req.body;
  if (!name) return res.status(400).json({ error: '名稱必填' });
  const maxSortResult = parent_id
    ? await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM categories WHERE parent_id=$1', [parent_id])
    : await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM categories WHERE parent_id IS NULL');
  const { rows } = await pool.query(
    'INSERT INTO categories (parent_id, name, icon, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
    [parent_id || null, name, icon || '', maxSortResult.rows[0].next]
  );
  res.json({ id: rows[0].id });
});

router.put('/categories/:id', async (req: Request, res: Response) => {
  const { name, icon, sort_order } = req.body;
  const sets: string[] = []; const params: any[] = [];
  let idx = 1;
  if (name !== undefined) { sets.push(`name=$${idx++}`); params.push(name); }
  if (icon !== undefined) { sets.push(`icon=$${idx++}`); params.push(icon); }
  if (sort_order !== undefined) { sets.push(`sort_order=$${idx++}`); params.push(sort_order); }
  if (!sets.length) return res.status(400).json({ error: '無更新欄位' });
  params.push(req.params.id);
  await pool.query(`UPDATE categories SET ${sets.join(',')} WHERE id=$${idx}`, params);
  res.json({ success: true });
});

router.put('/categories/reorder', async (req: Request, res: Response) => {
  const { items } = req.body as { items: { id: number; sort_order: number; parent_id?: number | null }[] };
  if (!items?.length) return res.status(400).json({ error: '無排序資料' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query('UPDATE categories SET sort_order=$1, parent_id=$2 WHERE id=$3', [item.sort_order, item.parent_id ?? null, item.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ success: true });
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  const catId = parseInt(req.params.id as string);
  const allIds = await getDescendantIds(catId);
  const placeholders = allIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows: [used] } = await pool.query(`SELECT COUNT(*) as count FROM inventory WHERE category_id IN (${placeholders})`, allIds);
  if (parseInt(used.count) > 0) return res.status(400).json({ error: `此分類下有 ${used.count} 筆庫存，無法刪除` });
  for (const id of allIds.reverse()) {
    await pool.query('DELETE FROM categories WHERE id=$1', [id]);
  }
  res.json({ success: true });
});

// ========== 成本方法 ==========

router.get('/cost-method', async (_req: Request, res: Response) => {
  res.json({ method: await getCostMethod() });
});

router.put('/cost-method', async (req: Request, res: Response) => {
  const { method } = req.body;
  if (method !== 'fifo' && method !== 'average') return res.status(400).json({ error: '無效的成本方法' });
  await pool.query("INSERT INTO settings (key, value) VALUES ('cost_method', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [method]);
  res.json({ success: true });
});

// ========== 庫存列表 ==========

router.get('/', async (req: Request, res: Response) => {
  const { category_id, search } = req.query;

  let sql = 'SELECT i.*, c.name as category_name, c.parent_id, c.icon as category_icon, c.id as cat_id FROM inventory i JOIN categories c ON i.category_id = c.id';
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (category_id) {
    const allIds = await getDescendantIds(Number(category_id));
    const placeholders = allIds.map((_, i) => `$${idx + i}`).join(',');
    conditions.push(`i.category_id IN (${placeholders})`);
    params.push(...allIds);
    idx += allIds.length;
  }
  if (search) {
    conditions.push(`(i.name LIKE $${idx} OR i.brand LIKE $${idx + 1})`);
    const s = `%${search}%`; params.push(s, s);
    idx += 2;
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY c.sort_order, i.name';

  const { rows: items } = await pool.query(sql, params);

  for (const item of items) {
    item.category_path = await getCategoryPath(item.category_id);
  }

  res.json(items);
});

// ========== 庫存統計 ==========

router.get('/stats', async (_req: Request, res: Response) => {
  const { rows: all } = await pool.query('SELECT * FROM categories ORDER BY sort_order');
  const roots = all.filter(c => c.parent_id === null);

  const byCategory = [];
  for (const root of roots) {
    const allIds = await getDescendantIds(root.id);
    const placeholders = allIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: [stat] } = await pool.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(quantity),0) as total_qty,
             COALESCE(SUM(avg_cost * quantity),0) as total_cost,
             COALESCE(SUM(price * quantity),0) as total_value
      FROM inventory WHERE category_id IN (${placeholders})
    `, allIds);
    if (parseInt(stat.count) > 0) byCategory.push({ category: root.name, ...stat });
  }

  const { rows: [summary] } = await pool.query(`
    SELECT COUNT(*) as total_items, COALESCE(SUM(quantity),0) as total_qty,
           COALESCE(SUM(avg_cost * quantity),0) as total_cost, COALESCE(SUM(price * quantity),0) as total_value FROM inventory
  `);

  const { rows: lowStock } = await pool.query(`
    SELECT i.*, c.name as category_name FROM inventory i JOIN categories c ON i.category_id = c.id
    WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0 ORDER BY i.quantity ASC
  `);
  for (const item of lowStock) item.category_path = await getCategoryPath(item.category_id);

  res.json({ byCategory, summary, lowStock });
});

// ========== 單一商品詳情 ==========

router.get('/:id/detail', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT i.*, c.name as category_name FROM inventory i JOIN categories c ON i.category_id = c.id WHERE i.id = $1', [req.params.id]);
  const inv = rows[0] as any;
  if (!inv) return res.status(404).json({ error: '找不到商品' });

  inv.category_path = await getCategoryPath(inv.category_id);
  const { rows: batches } = await pool.query('SELECT * FROM inventory_batches WHERE inventory_id = $1 ORDER BY batch_date ASC, id ASC', [req.params.id]);
  inv.batches = batches;
  const { rows: logs } = await pool.query('SELECT * FROM inventory_logs WHERE inventory_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]);
  inv.logs = logs;
  inv.cost_method = await getCostMethod();

  const { rows: fifoBatch } = await pool.query('SELECT unit_cost FROM inventory_batches WHERE inventory_id = $1 AND remaining > 0 ORDER BY batch_date ASC, id ASC LIMIT 1', [req.params.id]);
  inv.fifo_cost = fifoBatch[0]?.unit_cost || 0;

  res.json(inv);
});

// ========== CRUD ==========

router.post('/', async (req: Request, res: Response) => {
  const { category_id, name, brand, spec, price, min_quantity, note, initial_cost, initial_qty, supplier } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO inventory (category_id, name, brand, spec, price, quantity, min_quantity, note) VALUES ($1,$2,$3,$4,$5,0,$6,$7) RETURNING id',
    [category_id, name, brand || '', spec || '', price || 0, min_quantity || 0, note || '']
  );
  const invId = rows[0].id;
  if (initial_qty && initial_qty > 0 && initial_cost > 0) {
    await stockIn(invId, initial_qty, initial_cost, supplier || '', '初始庫存');
  }
  res.json({ id: invId });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { category_id, name, brand, spec, price, min_quantity, note } = req.body;
  const { rows } = await pool.query('SELECT id FROM inventory WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: '找不到項目' });
  await pool.query(
    'UPDATE inventory SET category_id=$1, name=$2, brand=$3, spec=$4, price=$5, min_quantity=$6, note=$7, updated_at=NOW() WHERE id=$8',
    [category_id, name, brand || '', spec || '', price || 0, min_quantity || 0, note || '', req.params.id]
  );
  res.json({ success: true });
});

router.post('/:id/stock-in', async (req: Request, res: Response) => {
  const { quantity, unit_cost, supplier, note } = req.body;
  if (!quantity || quantity <= 0) return res.status(400).json({ error: '數量必須大於 0' });
  if (!unit_cost || unit_cost <= 0) return res.status(400).json({ error: '單價必須大於 0' });
  const { rows } = await pool.query('SELECT id FROM inventory WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: '找不到商品' });
  const batchId = await stockIn(parseInt(req.params.id as string), quantity, unit_cost, supplier || '', note || '');
  res.json({ batch_id: batchId });
});

router.post('/:id/stock-out', async (req: Request, res: Response) => {
  const { quantity, reason } = req.body;
  if (!quantity || quantity <= 0) return res.status(400).json({ error: '數量必須大於 0' });
  const { rows } = await pool.query('SELECT quantity FROM inventory WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: '找不到商品' });
  if (rows[0].quantity < quantity) return res.status(400).json({ error: `庫存不足，目前只有 ${rows[0].quantity} 個` });
  const result = await stockOut(parseInt(req.params.id as string), quantity, reason || '出貨');
  res.json(result);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM inventory_logs WHERE inventory_id = $1', [req.params.id]);
  await pool.query('DELETE FROM inventory_batches WHERE inventory_id = $1', [req.params.id]);
  await pool.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

export default router;
