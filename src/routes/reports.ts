import { Router, type Request, type Response } from '../lib/router';
import pool, { taipeiDate } from '../models/database';

const router = new Router();

// ========== 利潤報表 ==========

router.get('/profit', async (req: Request, res: Response) => {
  const { period } = req.query;
  const isYearly = period === 'yearly';

  // 台灣時間的年或年月
  const fmt = isYearly ? '%Y' : '%Y-%m';
  const { rows: data } = await pool.query(`
    SELECT strftime($1, created_at, '+8 hours') as period,
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
  await pool.batch([
    // 維修工單留著，只是不再關聯這筆保固（不然外鍵會擋住刪除）
    ['UPDATE repair_orders SET warranty_id = NULL WHERE warranty_id = $1', [req.params.id]],
    ['DELETE FROM warranties WHERE id=$1', [req.params.id]],
  ]);
  res.json({ success: true });
});

// ========== 維修工單 ==========

async function generateRepairNo(): Promise<string> {
  const prefix = `R${taipeiDate().replace(/-/g, '')}`;
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
  await pool.batch([
    ['DELETE FROM repair_logs WHERE repair_id=$1', [req.params.id]],
    ['DELETE FROM repair_orders WHERE id=$1', [req.params.id]],
  ]);
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
  // 進行中 = 還沒完成、還沒取件、沒取消；照優先度（緊急 > 急件 > 一般 > 低），同優先度先收件的在前
  const { rows: activeRepairs } = await pool.query(`
    SELECT * FROM repair_orders WHERE status NOT IN ('completed', 'returned', 'cancelled')
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at ASC, id ASC
  `);

  res.json({ lowStock, expiringWarranties, unpaidSettlements, activeRepairs });
});

// ========== 匯出 CSV ==========

/**
 * 一格 CSV：0 照樣輸出 0（原本 `v || ''` 會變成空白），null／undefined 才是空白。
 * 文字開頭是 = + - @ Tab 換行（CR）的，前面加 ' 讓 Excel 當成文字，不會被當成公式執行
 * （OWASP 的 CSV Injection 建議）；數字（含負數）不加
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

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
      rows = rows.map((r: any) => [r.name, r.phone, r.email, r.source, r.city, r.district, String(r.created_at || '').slice(0, 10)]);
      filename = 'customers';
      break;
    case 'quotations':
      headers = ['訂單號','客戶','狀態','總成本','總售價','服務費','訂金','建立日期'];
      ({ rows } = await pool.query('SELECT * FROM quotations ORDER BY created_at DESC'));
      rows = rows.map((r: any) => [r.quotation_no, r.customer_name, r.status, r.total_cost, r.total_price, r.service_fee, r.deposit, String(r.created_at || '').slice(0, 10)]);
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
  const csv = bom + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}_${date}.csv"`);
  res.send(csv);
});

export default router;
