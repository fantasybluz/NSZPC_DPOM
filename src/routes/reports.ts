import { Router, Request, Response } from 'express';
import db from '../models/database';
import path from 'path';
import fs from 'fs';

const router = Router();

// ========== 利潤報表 ==========

router.get('/profit', (req: Request, res: Response) => {
  const { period } = req.query; // monthly | yearly
  const isYearly = period === 'yearly';

  const fmt = isYearly ? "'%Y'" : "'%Y-%m'";
  const data = db.prepare(`
    SELECT strftime(${fmt}, created_at) as period,
      COUNT(*) as order_count,
      SUM(total_price) as revenue,
      SUM(total_cost) as cost,
      SUM(total_price - total_cost) as profit,
      SUM(deposit) as deposits
    FROM quotations WHERE status = 'completed'
    GROUP BY period ORDER BY period DESC LIMIT 24
  `).all();

  // 按客戶
  const byCustomer = db.prepare(`
    SELECT customer_name, COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE status = 'completed' AND customer_name != '' GROUP BY customer_name ORDER BY profit DESC LIMIT 20
  `).all();

  // 按地區
  const byArea = db.prepare(`
    SELECT demand_area as area, COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE status = 'completed' AND demand_area != '' GROUP BY demand_area ORDER BY profit DESC LIMIT 20
  `).all();

  // 總計
  const total = db.prepare(`
    SELECT COUNT(*) as count, SUM(total_price) as revenue, SUM(total_cost) as cost, SUM(total_price - total_cost) as profit
    FROM quotations WHERE status = 'completed'
  `).get();

  res.json({ data: data.reverse(), byCustomer, byArea, total });
});

// ========== 保固管理 ==========

router.get('/warranties', (req: Request, res: Response) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM warranties';
  const params: any[] = []; const conds: string[] = [];
  if (status) { conds.push('status=?'); params.push(status); }
  if (search) { conds.push('(product_name LIKE ? OR serial_number LIKE ? OR customer_name LIKE ?)'); const s = `%${search}%`; params.push(s, s, s); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY warranty_end ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/warranties', (req: Request, res: Response) => {
  const { quotation_id, customer_id, customer_name, product_name, serial_number, ship_date, warranty_months, note } = req.body;
  const months = warranty_months || 12;
  let endDate = '';
  if (ship_date) {
    const d = new Date(ship_date);
    d.setMonth(d.getMonth() + months);
    endDate = d.toISOString().slice(0, 10);
  }
  const r = db.prepare('INSERT INTO warranties (quotation_id, customer_id, customer_name, product_name, serial_number, ship_date, warranty_months, warranty_end, note) VALUES (?,?,?,?,?,?,?,?,?)').run(
    quotation_id || null, customer_id || null, customer_name || '', product_name, serial_number || '', ship_date || '', months, endDate, note || ''
  );
  res.json({ id: r.lastInsertRowid });
});

router.put('/warranties/:id', (req: Request, res: Response) => {
  const { status, note } = req.body;
  const sets: string[] = []; const params: any[] = [];
  if (status) { sets.push('status=?'); params.push(status); }
  if (note !== undefined) { sets.push('note=?'); params.push(note); }
  if (!sets.length) return res.status(400).json({ error: '無更新欄位' });
  params.push(req.params.id);
  db.prepare(`UPDATE warranties SET ${sets.join(',')} WHERE id=?`).run(...params);
  res.json({ success: true });
});

router.delete('/warranties/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM warranties WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// 即將到期
router.get('/warranties/expiring', (_req: Request, res: Response) => {
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const end = in30.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  res.json(db.prepare("SELECT * FROM warranties WHERE status='active' AND warranty_end != '' AND warranty_end <= ? AND warranty_end >= ? ORDER BY warranty_end ASC").all(end, today));
});

// ========== 維修工單 ==========

function generateRepairNo(): string {
  const now = new Date();
  const prefix = `R${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const last = db.prepare("SELECT repair_no FROM repair_orders WHERE repair_no LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`) as any;
  let seq = 1;
  if (last) seq = parseInt(last.repair_no.slice(-3)) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

router.get('/repairs', (req: Request, res: Response) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM repair_orders';
  const params: any[] = []; const conds: string[] = [];
  if (status) { conds.push('status=?'); params.push(status); }
  if (search) { conds.push('(repair_no LIKE ? OR customer_name LIKE ? OR device_name LIKE ?)'); const s = `%${search}%`; params.push(s, s, s); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/repairs/:id', (req: Request, res: Response) => {
  const r = db.prepare('SELECT * FROM repair_orders WHERE id=?').get(req.params.id) as any;
  if (!r) return res.status(404).json({ error: '找不到工單' });
  r.logs = db.prepare('SELECT * FROM repair_logs WHERE repair_id=? ORDER BY created_at DESC').all(r.id);
  res.json(r);
});

router.post('/repairs', (req: Request, res: Response) => {
  const { customer_id, customer_name, warranty_id, quotation_id, device_name, serial_number, issue, priority, note } = req.body;
  const repair_no = generateRepairNo();
  const r = db.prepare('INSERT INTO repair_orders (repair_no, customer_id, customer_name, warranty_id, quotation_id, device_name, serial_number, issue, priority, note) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    repair_no, customer_id || null, customer_name || '', warranty_id || null, quotation_id || null, device_name || '', serial_number || '', issue || '', priority || 'normal', note || ''
  );
  // 初始進度
  db.prepare('INSERT INTO repair_logs (repair_id, status, description) VALUES (?,?,?)').run(r.lastInsertRowid, 'received', '工單建立');
  res.json({ id: r.lastInsertRowid, repair_no });
});

router.put('/repairs/:id', (req: Request, res: Response) => {
  const { status, diagnosis, solution, cost, completed_date, note } = req.body;
  const sets: string[] = []; const params: any[] = [];
  if (status) { sets.push('status=?'); params.push(status); }
  if (diagnosis !== undefined) { sets.push('diagnosis=?'); params.push(diagnosis); }
  if (solution !== undefined) { sets.push('solution=?'); params.push(solution); }
  if (cost !== undefined) { sets.push('cost=?'); params.push(cost); }
  if (completed_date) { sets.push('completed_date=?'); params.push(completed_date); }
  if (note !== undefined) { sets.push('note=?'); params.push(note); }
  sets.push("updated_at=datetime('now','localtime')");
  params.push(req.params.id);
  db.prepare(`UPDATE repair_orders SET ${sets.join(',')} WHERE id=?`).run(...params);

  if (status) {
    db.prepare('INSERT INTO repair_logs (repair_id, status, description) VALUES (?,?,?)').run(req.params.id, status, req.body.log_msg || `狀態更新為 ${status}`);
  }
  res.json({ success: true });
});

router.delete('/repairs/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM repair_logs WHERE repair_id=?').run(req.params.id);
  db.prepare('DELETE FROM repair_orders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ========== 通知提醒 ==========

router.get('/notifications', (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);

  // 低庫存
  const lowStock = db.prepare('SELECT name, quantity, min_quantity FROM inventory WHERE quantity <= min_quantity AND min_quantity > 0').all();

  // 保固即將到期 (30天內)
  const expiringWarranties = db.prepare("SELECT * FROM warranties WHERE status='active' AND warranty_end != '' AND warranty_end <= ? AND warranty_end >= ?").all(in30.toISOString().slice(0,10), today);

  // 未結款
  const unpaidSettlements = db.prepare("SELECT * FROM settlements WHERE status='unpaid'").all();

  // 進行中的維修工單
  const activeRepairs = db.prepare("SELECT * FROM repair_orders WHERE status NOT IN ('completed','cancelled') ORDER BY priority DESC").all();

  res.json({ lowStock, expiringWarranties, unpaidSettlements, activeRepairs });
});

// Line Notify
router.post('/line-notify', async (req: Request, res: Response) => {
  const tokenRow = db.prepare("SELECT value FROM settings WHERE key='line_notify_token'").get() as any;
  if (!tokenRow?.value) return res.status(400).json({ error: '未設定 Line Notify Token' });

  const { message } = req.body;
  try {
    const r = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenRow.value}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `message=${encodeURIComponent(message)}`
    });
    const data = await r.json();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ========== 匯出 CSV ==========

router.get('/export/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  let rows: any[] = [];
  let headers: string[] = [];
  let filename = '';

  switch (type) {
    case 'inventory':
      headers = ['品名','品牌','規格','售價','數量','均價成本','分類'];
      rows = db.prepare('SELECT i.name,i.brand,i.spec,i.price,i.quantity,i.avg_cost,c.name as cat FROM inventory i JOIN categories c ON i.category_id=c.id ORDER BY i.name').all();
      rows = rows.map(r => [r.name, r.brand, r.spec, r.price, r.quantity, Math.round(r.avg_cost), r.cat]);
      filename = 'inventory';
      break;
    case 'customers':
      headers = ['姓名','電話','Email','來源','縣市','區域','建立日期'];
      rows = db.prepare('SELECT * FROM customers ORDER BY name').all();
      rows = rows.map((r: any) => [r.name, r.phone, r.email, r.source, r.city, r.district, r.created_at?.slice(0,10)]);
      filename = 'customers';
      break;
    case 'quotations':
      headers = ['訂單號','客戶','狀態','總成本','總售價','服務費','訂金','建立日期'];
      rows = db.prepare('SELECT * FROM quotations ORDER BY created_at DESC').all();
      rows = rows.map((r: any) => [r.quotation_no, r.customer_name, r.status, r.total_cost, r.total_price, r.service_fee, r.deposit, r.created_at?.slice(0,10)]);
      filename = 'quotations';
      break;
    case 'repairs':
      headers = ['工單號','客戶','設備','問題','狀態','優先','費用','收件日'];
      rows = db.prepare('SELECT * FROM repair_orders ORDER BY created_at DESC').all();
      rows = rows.map((r: any) => [r.repair_no, r.customer_name, r.device_name, r.issue, r.status, r.priority, r.cost, r.received_date]);
      filename = 'repairs';
      break;
    default:
      return res.status(400).json({ error: '不支援的匯出類型' });
  }

  // BOM for Excel
  const bom = '\uFEFF';
  const csv = bom + headers.join(',') + '\n' + rows.map(r => r.map((v: any) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}_${date}.csv"`);
  res.send(csv);
});

// ========== 資料備份/還原 ==========

router.get('/backup', (_req: Request, res: Response) => {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'shop.db');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'DB 不存在' });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.download(dbPath, `nszpc_backup_${date}.db`);
});

router.post('/restore', (req: Request, res: Response) => {
  // 這個需要 multer，簡化為提示
  res.json({ message: '請手動將備份檔案覆蓋 data/shop.db 後重啟伺服器' });
});

export default router;
