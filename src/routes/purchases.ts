import { Router, Request, Response } from 'express';
import db, { stockIn } from '../models/database';

const router = Router();

// ========== 盤商管理 ==========

router.get('/suppliers', (_req: Request, res: Response) => {
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY name').all());
});

router.post('/suppliers', (req: Request, res: Response) => {
  const { name, payment_type, default_tax_type, contact, note } = req.body;
  if (!name) return res.status(400).json({ error: '盤商名稱必填' });
  try {
    const r = db.prepare('INSERT INTO suppliers (name, payment_type, default_tax_type, contact, note) VALUES (?,?,?,?,?)').run(name, payment_type || 'weekly', default_tax_type || 'tax_included', contact || '', note || '');
    res.json({ id: r.lastInsertRowid });
  } catch { return res.status(400).json({ error: '盤商名稱已存在' }); }
});

router.put('/suppliers/:id', (req: Request, res: Response) => {
  const { name, payment_type, default_tax_type, contact, note } = req.body;
  db.prepare('UPDATE suppliers SET name=?, payment_type=?, default_tax_type=?, contact=?, note=? WHERE id=?').run(name, payment_type || 'weekly', default_tax_type || 'tax_included', contact || '', note || '', req.params.id);
  res.json({ success: true });
});

router.delete('/suppliers/:id', (req: Request, res: Response) => {
  const used = db.prepare('SELECT COUNT(*) as c FROM purchase_orders WHERE supplier_id=?').get(req.params.id) as { c: number };
  if (used.c > 0) return res.status(400).json({ error: '此盤商有叫貨紀錄，無法刪除' });
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ========== 叫貨訂單 ==========

router.get('/orders', (req: Request, res: Response) => {
  const { supplier_id, status, week, month } = req.query;
  let sql = 'SELECT po.*, s.payment_type FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id';
  const params: any[] = [];
  const conds: string[] = [];
  if (supplier_id) { conds.push('po.supplier_id=?'); params.push(supplier_id); }
  if (status) { conds.push('po.status=?'); params.push(status); }
  if (week) {
    // 本週: 用 strftime 計算
    conds.push("strftime('%Y-%W', po.order_date) = strftime('%Y-%W', ?)");
    params.push(week);
  }
  if (month) { conds.push("po.order_date LIKE ?"); params.push(`${month}%`); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY po.order_date DESC, po.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/orders/:id', (req: Request, res: Response) => {
  const order = db.prepare('SELECT po.*, s.payment_type FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=?').get(req.params.id) as any;
  if (!order) return res.status(404).json({ error: '找不到訂單' });
  order.items = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').all(order.id);
  res.json(order);
});

router.post('/orders', (req: Request, res: Response) => {
  const { supplier_id, items, note, order_date, tax_type } = req.body;
  if (!supplier_id) return res.status(400).json({ error: '請選擇盤商' });
  const supplier = db.prepare('SELECT name, default_tax_type FROM suppliers WHERE id=?').get(supplier_id) as any;
  if (!supplier) return res.status(400).json({ error: '盤商不存在' });

  const tt = tax_type || supplier.default_tax_type || 'tax_included';
  let subtotal = 0;
  if (items) for (const i of items) subtotal += (i.unit_price || 0) * (i.quantity || 1);

  let taxAmount = 0, total = subtotal;
  // 含稅：反算稅金；未稅：不加稅，稅金為 0
  if (tt === 'tax_included') { taxAmount = Math.round(subtotal - subtotal / 1.05); }

  const r = db.prepare('INSERT INTO purchase_orders (supplier_id, supplier_name, tax_type, subtotal, tax_amount, total_amount, status, order_date, note) VALUES (?,?,?,?,?,?,?,?,?)').run(
    supplier_id, supplier.name, tt, subtotal, taxAmount, total, 'pending', order_date || new Date().toISOString().slice(0, 10), note || ''
  );
  const orderId = r.lastInsertRowid;
  if (items?.length) {
    const ins = db.prepare('INSERT INTO purchase_order_items (purchase_order_id, product_name, brand, spec, quantity, unit_price) VALUES (?,?,?,?,?,?)');
    for (const i of items) ins.run(orderId, i.product_name, i.brand || '', i.spec || '', i.quantity || 1, i.unit_price || 0);
  }
  res.json({ id: orderId });
});

// 更新狀態 + 確認收貨入庫
router.put('/orders/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ success: true });
});

// 確認叫貨到貨，可選擇入庫
router.post('/orders/:id/receive', (req: Request, res: Response) => {
  const { stock_items } = req.body;
  // stock_items: [{ inventory_id, quantity, unit_cost }]
  // 如果有 inventory_id 就入庫，沒有就只標記到貨
  const order = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id) as any;
  if (!order) return res.status(404).json({ error: '找不到訂單' });

  if (stock_items?.length) {
    for (const item of stock_items) {
      if (item.inventory_id && item.quantity > 0) {
        stockIn(item.inventory_id, item.quantity, item.unit_cost || 0, order.supplier_name, `叫貨單 #${order.id}`);
      }
    }
  }

  db.prepare("UPDATE purchase_orders SET status='received' WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

router.delete('/orders/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id=?').run(req.params.id);
  db.prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ========== 統計 ==========

router.get('/stats', (req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  // 本週叫貨金額
  const weekTotal = db.prepare("SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE strftime('%Y-%W',order_date)=strftime('%Y-%W',?)").get(today) as { total: number };

  // 本月叫貨金額
  const monthTotal = db.prepare("SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE order_date LIKE ?").get(`${monthPrefix}%`) as { total: number };

  // 各盤商本月叫貨
  const bySupplier = db.prepare(`
    SELECT supplier_name, COUNT(*) as order_count, SUM(total_amount) as total
    FROM purchase_orders WHERE order_date LIKE ? GROUP BY supplier_id ORDER BY total DESC
  `).all(`${monthPrefix}%`);

  // 本月待結款
  const unpaid = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM settlements WHERE status='unpaid' AND period_end LIKE ?").get(`${monthPrefix}%`) as { total: number };

  // 本月已結款
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM settlements WHERE status='paid' AND period_end LIKE ?").get(`${monthPrefix}%`) as { total: number };

  res.json({ weekTotal: weekTotal.total, monthTotal: monthTotal.total, bySupplier, unpaid: unpaid.total, paid: paid.total });
});

// ========== 結款管理 ==========

router.get('/settlements', (req: Request, res: Response) => {
  const { supplier_id, status, month } = req.query;
  let sql = 'SELECT st.*, s.payment_type FROM settlements st LEFT JOIN suppliers s ON st.supplier_id=s.id';
  const params: any[] = [];
  const conds: string[] = [];
  if (supplier_id) { conds.push('st.supplier_id=?'); params.push(supplier_id); }
  if (status) { conds.push('st.status=?'); params.push(status); }
  if (month) { conds.push("st.period_end LIKE ?"); params.push(`${month}%`); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY st.period_end DESC, st.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/settlements', (req: Request, res: Response) => {
  const { supplier_id, amount, tax_type, period_start, period_end, note } = req.body;
  if (!supplier_id) return res.status(400).json({ error: '請選擇盤商' });
  const supplier = db.prepare('SELECT name, default_tax_type FROM suppliers WHERE id=?').get(supplier_id) as any;
  if (!supplier) return res.status(400).json({ error: '盤商不存在' });

  const tt = tax_type || supplier.default_tax_type || 'tax_included';
  const amt = amount || 0;
  let subtotal = amt, taxAmount = 0;
  // 含稅：反算稅金；未稅：不加稅
  if (tt === 'tax_included') { taxAmount = Math.round(amt - amt / 1.05); subtotal = amt - taxAmount; }

  const r = db.prepare('INSERT INTO settlements (supplier_id, supplier_name, tax_type, subtotal, tax_amount, amount, period_start, period_end, status, note) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    supplier_id, supplier.name, tt, subtotal, taxAmount, amt, period_start || '', period_end || '', 'unpaid', note || ''
  );
  res.json({ id: r.lastInsertRowid });
});

router.put('/settlements/:id', (req: Request, res: Response) => {
  const { status, paid_date, note } = req.body;
  const sets: string[] = []; const params: any[] = [];
  if (status) { sets.push('status=?'); params.push(status); }
  if (paid_date) { sets.push('paid_date=?'); params.push(paid_date); }
  if (note !== undefined) { sets.push('note=?'); params.push(note); }
  if (!sets.length) return res.status(400).json({ error: '無更新欄位' });
  params.push(req.params.id);
  db.prepare(`UPDATE settlements SET ${sets.join(',')} WHERE id=?`).run(...params);
  res.json({ success: true });
});

router.delete('/settlements/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM settlements WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

export default router;
