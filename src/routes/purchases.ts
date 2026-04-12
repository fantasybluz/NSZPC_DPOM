import { Router, Request, Response } from 'express';
import pool, { stockIn } from '../models/database';

const router = Router();

// ========== 盤商管理 ==========

router.get('/suppliers', async (_req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY name');
  res.json(rows);
});

router.post('/suppliers', async (req: Request, res: Response) => {
  const { name, payment_type, default_tax_type, contact, note } = req.body;
  if (!name) return res.status(400).json({ error: '盤商名稱必填' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO suppliers (name, payment_type, default_tax_type, contact, note) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, payment_type || 'weekly', default_tax_type || 'tax_included', contact || '', note || '']
    );
    res.json({ id: rows[0].id });
  } catch { return res.status(400).json({ error: '盤商名稱已存在' }); }
});

router.put('/suppliers/:id', async (req: Request, res: Response) => {
  const { name, payment_type, default_tax_type, contact, note } = req.body;
  await pool.query('UPDATE suppliers SET name=$1, payment_type=$2, default_tax_type=$3, contact=$4, note=$5 WHERE id=$6',
    [name, payment_type || 'weekly', default_tax_type || 'tax_included', contact || '', note || '', req.params.id]);
  res.json({ success: true });
});

router.delete('/suppliers/:id', async (req: Request, res: Response) => {
  const { rows: [used] } = await pool.query('SELECT COUNT(*) as c FROM purchase_orders WHERE supplier_id=$1', [req.params.id]);
  if (parseInt(used.c) > 0) return res.status(400).json({ error: '此盤商有叫貨紀錄，無法刪除' });
  await pool.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ========== 叫貨訂單 ==========

router.get('/orders', async (req: Request, res: Response) => {
  const { supplier_id, status, week, month } = req.query;
  let sql = 'SELECT po.*, s.payment_type FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id';
  const params: any[] = [];
  const conds: string[] = [];
  let idx = 1;
  if (supplier_id) { conds.push(`po.supplier_id=$${idx++}`); params.push(supplier_id); }
  if (status) { conds.push(`po.status=$${idx++}`); params.push(status); }
  if (week) {
    conds.push(`to_char(po.order_date, 'IYYY-IW') = to_char($${idx++}::date, 'IYYY-IW')`);
    params.push(week);
  }
  if (month) { conds.push(`to_char(po.order_date, 'YYYY-MM') = $${idx++}`); params.push(month); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY po.order_date DESC, po.id DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/orders/:id', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT po.*, s.payment_type FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=$1', [req.params.id]);
  const order = rows[0] as any;
  if (!order) return res.status(404).json({ error: '找不到訂單' });
  const { rows: items } = await pool.query('SELECT * FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY id', [order.id]);
  order.items = items;
  res.json(order);
});

router.post('/orders', async (req: Request, res: Response) => {
  const { supplier_id, items, note, order_date, tax_type } = req.body;
  if (!supplier_id) return res.status(400).json({ error: '請選擇盤商' });
  const { rows: supRows } = await pool.query('SELECT name, default_tax_type FROM suppliers WHERE id=$1', [supplier_id]);
  const supplier = supRows[0] as any;
  if (!supplier) return res.status(400).json({ error: '盤商不存在' });

  const tt = tax_type || supplier.default_tax_type || 'tax_included';
  let subtotal = 0;
  if (items) for (const i of items) subtotal += (i.unit_price || 0) * (i.quantity || 1);

  let taxAmount = 0, total = subtotal;
  if (tt === 'tax_included') { taxAmount = Math.round(subtotal - subtotal / 1.05); }

  const { rows } = await pool.query(
    'INSERT INTO purchase_orders (supplier_id, supplier_name, tax_type, subtotal, tax_amount, total_amount, status, order_date, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [supplier_id, supplier.name, tt, subtotal, taxAmount, total, 'pending', order_date || new Date().toISOString().slice(0, 10), note || '']
  );
  const orderId = rows[0].id;
  if (items?.length) {
    for (const i of items) {
      await pool.query('INSERT INTO purchase_order_items (purchase_order_id, product_name, brand, spec, quantity, unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [orderId, i.product_name, i.brand || '', i.spec || '', i.quantity || 1, i.unit_price || 0]);
    }
  }
  res.json({ id: orderId });
});

// 更新狀態
router.put('/orders/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  await pool.query('UPDATE purchase_orders SET status=$1 WHERE id=$2', [status, req.params.id]);
  res.json({ success: true });
});

// 確認叫貨到貨
router.post('/orders/:id/receive', async (req: Request, res: Response) => {
  const { stock_items } = req.body;
  const { rows } = await pool.query('SELECT * FROM purchase_orders WHERE id=$1', [req.params.id]);
  const order = rows[0] as any;
  if (!order) return res.status(404).json({ error: '找不到訂單' });

  if (stock_items?.length) {
    for (const item of stock_items) {
      if (item.inventory_id && item.quantity > 0) {
        await stockIn(item.inventory_id, item.quantity, item.unit_cost || 0, order.supplier_name, `叫貨單 #${order.id}`);
      }
    }
  }

  await pool.query("UPDATE purchase_orders SET status='received' WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

router.delete('/orders/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM purchase_order_items WHERE purchase_order_id=$1', [req.params.id]);
  await pool.query('DELETE FROM purchase_orders WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ========== 統計 ==========

router.get('/stats', async (req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const { rows: [weekTotal] } = await pool.query(
    "SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE to_char(order_date, 'IYYY-IW')=to_char($1::date, 'IYYY-IW')", [today]);

  const { rows: [monthTotal] } = await pool.query(
    "SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE to_char(order_date, 'YYYY-MM')=$1", [monthPrefix]);

  const { rows: bySupplier } = await pool.query(`
    SELECT supplier_name, COUNT(*) as order_count, SUM(total_amount) as total
    FROM purchase_orders WHERE to_char(order_date, 'YYYY-MM')=$1 GROUP BY supplier_name ORDER BY total DESC
  `, [monthPrefix]);

  const { rows: [unpaid] } = await pool.query(
    "SELECT COALESCE(SUM(amount),0) as total FROM settlements WHERE status='unpaid' AND period_end LIKE $1", [`${monthPrefix}%`]);

  const { rows: [paid] } = await pool.query(
    "SELECT COALESCE(SUM(amount),0) as total FROM settlements WHERE status='paid' AND period_end LIKE $1", [`${monthPrefix}%`]);

  res.json({ weekTotal: weekTotal.total, monthTotal: monthTotal.total, bySupplier, unpaid: unpaid.total, paid: paid.total });
});

// ========== 結款管理 ==========

router.get('/settlements', async (req: Request, res: Response) => {
  const { supplier_id, status, month } = req.query;
  let sql = 'SELECT st.*, s.payment_type FROM settlements st LEFT JOIN suppliers s ON st.supplier_id=s.id';
  const params: any[] = [];
  const conds: string[] = [];
  let idx = 1;
  if (supplier_id) { conds.push(`st.supplier_id=$${idx++}`); params.push(supplier_id); }
  if (status) { conds.push(`st.status=$${idx++}`); params.push(status); }
  if (month) { conds.push(`st.period_end LIKE $${idx++}`); params.push(`${month}%`); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY st.period_end DESC, st.id DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.post('/settlements', async (req: Request, res: Response) => {
  const { supplier_id, amount, tax_type, period_start, period_end, note } = req.body;
  if (!supplier_id) return res.status(400).json({ error: '請選擇盤商' });
  const { rows: supRows } = await pool.query('SELECT name, default_tax_type FROM suppliers WHERE id=$1', [supplier_id]);
  const supplier = supRows[0] as any;
  if (!supplier) return res.status(400).json({ error: '盤商不存在' });

  const tt = tax_type || supplier.default_tax_type || 'tax_included';
  const amt = amount || 0;
  let subtotal = amt, taxAmount = 0;
  if (tt === 'tax_included') { taxAmount = Math.round(amt - amt / 1.05); subtotal = amt - taxAmount; }

  const { rows } = await pool.query(
    'INSERT INTO settlements (supplier_id, supplier_name, tax_type, subtotal, tax_amount, amount, period_start, period_end, status, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [supplier_id, supplier.name, tt, subtotal, taxAmount, amt, period_start || '', period_end || '', 'unpaid', note || '']
  );
  res.json({ id: rows[0].id });
});

router.put('/settlements/:id', async (req: Request, res: Response) => {
  const { status, paid_date, note } = req.body;
  const sets: string[] = []; const params: any[] = [];
  let idx = 1;
  if (status) { sets.push(`status=$${idx++}`); params.push(status); }
  if (paid_date) { sets.push(`paid_date=$${idx++}`); params.push(paid_date); }
  if (note !== undefined) { sets.push(`note=$${idx++}`); params.push(note); }
  if (!sets.length) return res.status(400).json({ error: '無更新欄位' });
  params.push(req.params.id);
  await pool.query(`UPDATE settlements SET ${sets.join(',')} WHERE id=$${idx}`, params);
  res.json({ success: true });
});

router.delete('/settlements/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM settlements WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

export default router;
