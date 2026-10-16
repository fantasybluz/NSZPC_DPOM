import { Router, type Request, type Response } from '../lib/router';
import { adminOnly } from './auth';
import pool, { stockIn, stockOut, getCostMethod, loadCategories, descendantIds, categoryPath, type CategoryRow } from '../models/database';

const router = new Router();

// ========== 分類工具 ==========
// 分類一次全部讀出來在記憶體算（原本一層一層查，庫存一多就會超過 D1 每個請求 50 個查詢的上限）

function buildTree(all: CategoryRow[], parentId: number | null): any[] {
  return all
    .filter(c => c.parent_id === parentId)
    .map(c => ({ ...c, children: buildTree(all, c.id) }))
    .map(c => c.children.length === 0 ? (delete (c as any).children, c) : c);
}

// ========== 分類 CRUD ==========

router.get('/categories', async (_req: Request, res: Response) => {
  res.json(buildTree(await loadCategories(), null));
});

router.post('/categories', adminOnly, async (req: Request, res: Response) => {
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

// 拖拉排序：要放在 /categories/:id 前面（原本放在後面，PUT /categories/reorder 會被當成 id = reorder，排序一直存不進去）
// 只改同一層的順序；要換上層分類用 PUT /categories/:id 的 parent_id（有檢查）
router.put('/categories/reorder', adminOnly, async (req: Request, res: Response) => {
  const { items } = req.body as { items: { id: number; sort_order: number }[] };
  if (!items?.length) return res.status(400).json({ error: '無排序資料' });
  const ids = JSON.stringify(items.map((item) => Number(item.id)));
  const { rows: parents } = await pool.query(
    'SELECT COUNT(*) AS found, COUNT(DISTINCT COALESCE(parent_id, 0)) AS levels FROM categories WHERE id IN (SELECT value FROM json_each($1))',
    [ids]
  );
  if (parents[0].found !== items.length) return res.status(400).json({ error: '有分類不存在，請重新整理' });
  if (parents[0].levels !== 1) return res.status(400).json({ error: '只能在同一層排序' });
  await pool.query(
    `UPDATE categories
     SET sort_order = (SELECT json_extract(j.value, '$.sort_order') FROM json_each($1) j WHERE json_extract(j.value, '$.id') = categories.id)
     WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each($1))`,
    [JSON.stringify(items.map((item) => ({ id: Number(item.id), sort_order: Number(item.sort_order) })))]
  );
  res.json({ success: true });
});

router.put('/categories/:id', adminOnly, async (req: Request, res: Response) => {
  const catId = parseInt(req.params.id as string);
  const { name, icon, sort_order } = req.body;
  const sets: string[] = []; const params: any[] = [];
  let idx = 1;
  if (name !== undefined) { sets.push(`name=$${idx++}`); params.push(name); }
  if (icon !== undefined) { sets.push(`icon=$${idx++}`); params.push(icon); }
  if (sort_order !== undefined) { sets.push(`sort_order=$${idx++}`); params.push(sort_order); }

  // 換上層分類（null = 第一層）
  if (req.body.parent_id !== undefined) {
    const all = await loadCategories();
    const current = all.find((c) => c.id === catId);
    if (!current) return res.status(404).json({ error: '找不到分類' });
    const newParent = req.body.parent_id === null || req.body.parent_id === '' ? null : Number(req.body.parent_id);
    if (newParent !== current.parent_id) {
      if (newParent !== null) {
        if (!all.some((c) => c.id === newParent)) return res.status(400).json({ error: '上層分類不存在' });
        if (descendantIds(all, catId).includes(newParent)) return res.status(400).json({ error: '不能移到自己或自己底下的分類' });
        const { rows: [used] } = await pool.query('SELECT COUNT(*) AS count FROM inventory WHERE category_id = $1', [newParent]);
        if (used.count > 0) return res.status(400).json({ error: '這個分類已經有庫存，不能再放子分類（庫存只能歸在最末端分類）' });
      }
      // 放到新那一層的最後面
      const siblings = all.filter((c) => c.parent_id === newParent);
      sets.push(`parent_id=$${idx++}`, `sort_order=$${idx++}`);
      params.push(newParent, siblings.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1);
    }
  }

  if (!sets.length) return res.json({ success: true });
  params.push(catId);
  try {
    await pool.query(`UPDATE categories SET ${sets.join(',')} WHERE id=$${idx}`, params);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return res.status(400).json({ error: '同一層已經有同名的分類' });
    throw err;
  }
  res.json({ success: true });
});

router.delete('/categories/:id', adminOnly, async (req: Request, res: Response) => {
  const catId = parseInt(req.params.id as string);
  const allIds = JSON.stringify(descendantIds(await loadCategories(), catId));
  const { rows: [used] } = await pool.query('SELECT COUNT(*) as count FROM inventory WHERE category_id IN (SELECT value FROM json_each($1))', [allIds]);
  if (parseInt(used.count) > 0) return res.status(400).json({ error: `此分類下有 ${used.count} 筆庫存，無法刪除` });
  await pool.query('DELETE FROM categories WHERE id IN (SELECT value FROM json_each($1))', [allIds]);
  res.json({ success: true });
});

// ========== 成本方法 ==========

router.get('/cost-method', async (_req: Request, res: Response) => {
  res.json({ method: await getCostMethod() });
});

router.put('/cost-method', adminOnly, async (req: Request, res: Response) => {
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

  const categories = await loadCategories();
  if (category_id) {
    conditions.push(`i.category_id IN (SELECT value FROM json_each($${idx++}))`);
    params.push(JSON.stringify(descendantIds(categories, Number(category_id))));
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
    item.category_path = categoryPath(categories, item.category_id);
  }

  res.json(items);
});

// ========== 庫存統計 ==========

router.get('/stats', async (_req: Request, res: Response) => {
  const all = await loadCategories();
  const roots = all.filter(c => c.parent_id === null);

  // 每個分類一列，再在記憶體加總到第一層分類
  const { rows: perCategory } = await pool.query(`
    SELECT category_id, COUNT(*) as count, COALESCE(SUM(quantity),0) as total_qty,
           COALESCE(SUM(avg_cost * quantity),0) as total_cost,
           COALESCE(SUM(price * quantity),0) as total_value
    FROM inventory GROUP BY category_id
  `);
  const statByCategory = new Map(perCategory.map((r: any) => [r.category_id as number, r]));
  const byCategory = [];
  for (const root of roots) {
    const stat = { count: 0, total_qty: 0, total_cost: 0, total_value: 0 };
    for (const id of descendantIds(all, root.id)) {
      const s = statByCategory.get(id);
      if (!s) continue;
      stat.count += s.count; stat.total_qty += s.total_qty; stat.total_cost += s.total_cost; stat.total_value += s.total_value;
    }
    if (stat.count > 0) byCategory.push({ category: root.name, ...stat });
  }

  const { rows: [summary] } = await pool.query(`
    SELECT COUNT(*) as total_items, COALESCE(SUM(quantity),0) as total_qty,
           COALESCE(SUM(avg_cost * quantity),0) as total_cost, COALESCE(SUM(price * quantity),0) as total_value FROM inventory
  `);

  const { rows: lowStock } = await pool.query(`
    SELECT i.*, c.name as category_name FROM inventory i JOIN categories c ON i.category_id = c.id
    WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0 ORDER BY i.quantity ASC
  `);
  for (const item of lowStock) item.category_path = categoryPath(all, item.category_id);

  res.json({ byCategory, summary, lowStock });
});

// ========== 單一商品詳情 ==========

router.get('/:id/detail', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT i.*, c.name as category_name FROM inventory i JOIN categories c ON i.category_id = c.id WHERE i.id = $1', [req.params.id]);
  const inv = rows[0] as any;
  if (!inv) return res.status(404).json({ error: '找不到商品' });

  inv.category_path = categoryPath(await loadCategories(), inv.category_id);
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
  await pool.batch([
    ['DELETE FROM inventory_logs WHERE inventory_id = $1', [req.params.id]],
    ['DELETE FROM inventory_batches WHERE inventory_id = $1', [req.params.id]],
    ['DELETE FROM inventory WHERE id = $1', [req.params.id]],
  ]);
  res.json({ success: true });
});

export default router;
