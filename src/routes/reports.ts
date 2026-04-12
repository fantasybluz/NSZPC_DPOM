import { Router, Request, Response } from 'express';
import pool from '../models/database';
import path from 'path';
import fs from 'fs';

const router = Router();

// ========== 利潤報表 ==========

router.get('/profit', async (req: Request, res: Response) => {
  const { period } = req.query;
  const isYearly = period === 'yearly';

  const fmt = isYearly ? 'YYYY' : 'YYYY-MM';
  const { rows: data } = await pool.query(`
    SELECT to_char(created_at, $1) as period,
      COUNT(*) as order_count,
      SUM(total_price) as revenue,
      SUM(total_cost) as cost,
      SUM(total_price - total_cost) as profit,
      SUM(deposit) as deposits
    FROM quotations WHERE status = 'completed'
    GROUP BY period ORDER BY period DESC LIMIT 24
  `, [fmt]);

  const { rows: byCustomer } = await pool.query(`
    SELECT customer_name, COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE status = 'completed' AND customer_name != '' GROUP BY customer_name ORDER BY profit DESC LIMIT 20
  `);

  const { rows: byArea } = await pool.query(`
    SELECT demand_area as area, COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE status = 'completed' AND demand_area != '' GROUP BY demand_area ORDER BY profit DESC LIMIT 20
  `);

  const { rows: [total] } = await pool.query(`
    SELECT COUNT(*) as count, SUM(total_price) as revenue, SUM(total_cost) as cost, SUM(total_price - total_cost) as profit
    FROM quotations WHERE status = 'completed'
  `);

  res.json({ data: data.reverse(), byCustomer, byArea, total });
});

// ========== 保固管理 ==========

router.get('/warranties', async (req: Request, res: Response) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM warranties';
  const params: any[] = []; const conds: string[] = [];
  let idx = 1;
  if (status) { conds.push(`status=$${idx++}`); params.push(status); }
  if (search) {
    conds.push(`(product_name LIKE $${idx} OR serial_number LIKE $${idx + 1} OR customer_name LIKE $${idx + 2})`);
    const s = `%${search}%`; params.push(s, s, s); idx += 3;
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY warranty_end ASC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.post('/warranties', async (req: Request, res: Response) => {
  const { quotation_id, customer_id, customer_name, product_name, serial_number, ship_date, warranty_months, note } = req.body;
  const months = warranty_months || 12;
  let endDate = '';
  if (ship_date) {
    const d = new Date(ship_date);
    d.setMonth(d.getMonth() + months);
    endDate = d.toISOString().slice(0, 10);
  }
  const { rows } = await pool.query(
    'INSERT INTO warranties (quotation_id, customer_id, customer_name, product_name, serial_number, ship_date, warranty_months, warranty_end, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [quotation_id || null, customer_id || null, customer_name || '', product_name, serial_number || '', ship_date || '', months, endDate, note || '']
  );
  res.json({ id: rows[0].id });
});

router.put('/warranties/:id', async (req: Request, res: Response) => {
  const { status, note } = req.body;
  const sets: string[] = []; const params: any[] = [];
  let idx = 1;
  if (status) { sets.push(`status=$${idx++}`); params.push(status); }
  if (note !== undefined) { sets.push(`note=$${idx++}`); params.push(note); }
  if (!sets.length) return res.status(400).json({ error: '無更新欄位' });
  params.push(req.params.id);
  await pool.query(`UPDATE warranties SET ${sets.join(',')} WHERE id=$${idx}`, params);
  res.json({ success: true });
});

router.delete('/warranties/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM warranties WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// 即將到期
router.get('/warranties/expiring', async (_req: Request, res: Response) => {
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const end = in30.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    "SELECT * FROM warranties WHERE status='active' AND warranty_end != '' AND warranty_end <= $1 AND warranty_end >= $2 ORDER BY warranty_end ASC",
    [end, today]
  );
  res.json(rows);
});

// ========== 維修工單 ==========

async function generateRepairNo(): Promise<string> {
  const now = new Date();
  const prefix = `R${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const { rows } = await pool.query("SELECT repair_no FROM repair_orders WHERE repair_no LIKE $1 ORDER BY id DESC LIMIT 1", [`${prefix}%`]);
  let seq = 1;
  if (rows.length > 0) seq = parseInt(rows[0].repair_no.slice(-3)) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

router.get('/repairs', async (req: Request, res: Response) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM repair_orders';
  const params: any[] = []; const conds: string[] = [];
  let idx = 1;
  if (status) { conds.push(`status=$${idx++}`); params.push(status); }
  if (search) {
    conds.push(`(repair_no LIKE $${idx} OR customer_name LIKE $${idx + 1} OR device_name LIKE $${idx + 2})`);
    const s = `%${search}%`; params.push(s, s, s); idx += 3;
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/repairs/:id', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM repair_orders WHERE id=$1', [req.params.id]);
  const r = rows[0] as any;
  if (!r) return res.status(404).json({ error: '找不到工單' });
  const { rows: logs } = await pool.query('SELECT * FROM repair_logs WHERE repair_id=$1 ORDER BY created_at DESC', [r.id]);
  r.logs = logs;
  res.json(r);
});

router.post('/repairs', async (req: Request, res: Response) => {
  const { customer_id, customer_name, warranty_id, quotation_id, device_name, serial_number, issue, priority, note } = req.body;
  const repair_no = await generateRepairNo();
  const { rows } = await pool.query(
    'INSERT INTO repair_orders (repair_no, customer_id, customer_name, warranty_id, quotation_id, device_name, serial_number, issue, priority, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [repair_no, customer_id || null, customer_name || '', warranty_id || null, quotation_id || null, device_name || '', serial_number || '', issue || '', priority || 'normal', note || '']
  );
  await pool.query('INSERT INTO repair_logs (repair_id, status, description) VALUES ($1,$2,$3)', [rows[0].id, 'received', '工單建立']);
  res.json({ id: rows[0].id, repair_no });
});

router.put('/repairs/:id', async (req: Request, res: Response) => {
  const { status, diagnosis, solution, cost, completed_date, note } = req.body;
  const sets: string[] = []; const params: any[] = [];
  let idx = 1;
  if (status) { sets.push(`status=$${idx++}`); params.push(status); }
  if (diagnosis !== undefined) { sets.push(`diagnosis=$${idx++}`); params.push(diagnosis); }
  if (solution !== undefined) { sets.push(`solution=$${idx++}`); params.push(solution); }
  if (cost !== undefined) { sets.push(`cost=$${idx++}`); params.push(cost); }
  if (completed_date) { sets.push(`completed_date=$${idx++}`); params.push(completed_date); }
  if (note !== undefined) { sets.push(`note=$${idx++}`); params.push(note); }
  sets.push('updated_at=NOW()');
  params.push(req.params.id);
  await pool.query(`UPDATE repair_orders SET ${sets.join(',')} WHERE id=$${idx}`, params);

  if (status) {
    await pool.query('INSERT INTO repair_logs (repair_id, status, description) VALUES ($1,$2,$3)',
      [req.params.id, status, req.body.log_msg || `狀態更新為 ${status}`]);
  }
  res.json({ success: true });
});

router.delete('/repairs/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM repair_logs WHERE repair_id=$1', [req.params.id]);
  await pool.query('DELETE FROM repair_orders WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ========== 通知提醒 ==========

router.get('/notifications', async (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);

  const { rows: lowStock } = await pool.query('SELECT name, quantity, min_quantity FROM inventory WHERE quantity <= min_quantity AND min_quantity > 0');
  const { rows: expiringWarranties } = await pool.query(
    "SELECT * FROM warranties WHERE status='active' AND warranty_end != '' AND warranty_end <= $1 AND warranty_end >= $2",
    [in30.toISOString().slice(0,10), today]
  );
  const { rows: unpaidSettlements } = await pool.query("SELECT * FROM settlements WHERE status='unpaid'");
  const { rows: activeRepairs } = await pool.query("SELECT * FROM repair_orders WHERE status NOT IN ('completed','cancelled') ORDER BY priority DESC");

  res.json({ lowStock, expiringWarranties, unpaidSettlements, activeRepairs });
});

// Line Notify
router.post('/line-notify', async (req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='line_notify_token'");
  if (!rows[0]?.value) return res.status(400).json({ error: '未設定 Line Notify Token' });

  const { message } = req.body;
  try {
    const r = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${rows[0].value}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `message=${encodeURIComponent(message)}`
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ========== 匯出 CSV ==========

router.get('/export/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  let rows: any[] = [];
  let headers: string[] = [];
  let filename = '';

  switch (type) {
    case 'inventory':
      headers = ['品名','品牌','規格','售價','數量','均價成本','分類'];
      ({ rows } = await pool.query('SELECT i.name,i.brand,i.spec,i.price,i.quantity,i.avg_cost,c.name as cat FROM inventory i JOIN categories c ON i.category_id=c.id ORDER BY i.name'));
      rows = rows.map(r => [r.name, r.brand, r.spec, r.price, r.quantity, Math.round(r.avg_cost), r.cat]);
      filename = 'inventory';
      break;
    case 'customers':
      headers = ['姓名','電話','Email','來源','縣市','區域','建立日期'];
      ({ rows } = await pool.query('SELECT * FROM customers ORDER BY name'));
      rows = rows.map((r: any) => [r.name, r.phone, r.email, r.source, r.city, r.district, r.created_at?.toISOString?.()?.slice(0,10) || '']);
      filename = 'customers';
      break;
    case 'quotations':
      headers = ['訂單號','客戶','狀態','總成本','總售價','服務費','訂金','建立日期'];
      ({ rows } = await pool.query('SELECT * FROM quotations ORDER BY created_at DESC'));
      rows = rows.map((r: any) => [r.quotation_no, r.customer_name, r.status, r.total_cost, r.total_price, r.service_fee, r.deposit, r.created_at?.toISOString?.()?.slice(0,10) || '']);
      filename = 'quotations';
      break;
    case 'repairs':
      headers = ['工單號','客戶','設備','問題','狀態','優先','費用','收件日'];
      ({ rows } = await pool.query('SELECT * FROM repair_orders ORDER BY created_at DESC'));
      rows = rows.map((r: any) => [r.repair_no, r.customer_name, r.device_name, r.issue, r.status, r.priority, r.cost, r.received_date]);
      filename = 'repairs';
      break;
    default:
      return res.status(400).json({ error: '不支援的匯出類型' });
  }

  const bom = '\uFEFF';
  const csv = bom + headers.join(',') + '\n' + rows.map(r => r.map((v: any) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}_${date}.csv"`);
  res.send(csv);
});

// ========== 資料備份/還原 ==========

router.get('/backup', async (_req: Request, res: Response) => {
  res.json({ message: 'PostgreSQL 備份請使用 pg_dump 指令' });
});

router.post('/restore', (req: Request, res: Response) => {
  res.json({ message: 'PostgreSQL 還原請使用 pg_restore 或 psql 指令' });
});

export default router;
