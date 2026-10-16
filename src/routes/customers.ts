import { Router, type Request, type Response } from '../lib/router';
import pool from '../models/database';
import type { Customer, ServiceRecord } from '../types';

const router = new Router();

// 成交金額只算已經成立的單（不算尚未成交、已取消）
const DEAL_STATUSES = "('deposit', 'pending', 'completed')";

router.get('/', async (req: Request, res: Response) => {
  const { source, city, search } = req.query;
  // 每個客戶的訂單數、成交金額、最近一次下單
  let sql = `SELECT c.*, COALESCE(s.order_count, 0) AS order_count, COALESCE(s.total_spent, 0) AS total_spent, s.last_order_at
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS order_count,
             SUM(CASE WHEN status IN ${DEAL_STATUSES} THEN total_price ELSE 0 END) AS total_spent,
             MAX(created_at) AS last_order_at
      FROM quotations WHERE customer_id IS NOT NULL GROUP BY customer_id
    ) s ON s.customer_id = c.id`;
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;
  if (source) { conditions.push(`c.source = $${idx++}`); params.push(source); }
  if (city) { conditions.push(`c.city = $${idx++}`); params.push(city); }
  if (search) {
    conditions.push(`(c.name LIKE $${idx} OR c.phone LIKE $${idx + 1} OR c.email LIKE $${idx + 2})`);
    const s = `%${search}%`;
    params.push(s, s, s);
    idx += 3;
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY c.created_at DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// 統計 (必須在 /:id 前面)
router.get('/stats/distribution', async (_req: Request, res: Response) => {
  const { rows: byCity } = await pool.query("SELECT city, COUNT(*) as count FROM customers WHERE city != '' GROUP BY city ORDER BY count DESC");
  const { rows: bySource } = await pool.query("SELECT source, COUNT(*) as count FROM customers WHERE source != '' GROUP BY source ORDER BY count DESC");
  const { rows: totalRows } = await pool.query('SELECT COUNT(*) as count FROM customers');
  res.json({ byCity, bySource, total: parseInt(totalRows[0].count) });
});

router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  const c = rows[0] as Customer | undefined;
  if (!c) return res.status(404).json({ error: '找不到客戶' });
  const { rows: services } = await pool.query('SELECT * FROM service_records WHERE customer_id = $1 ORDER BY service_date DESC', [c.id]);
  c.services = services as ServiceRecord[];
  const { rows: quotations } = await pool.query(
    'SELECT id, quotation_no, status, delivery_status, item_title, total_price, created_at FROM quotations WHERE customer_id = $1 ORDER BY created_at DESC',
    [c.id],
  );
  c.quotations = quotations as any[];
  res.json(c);
});

router.post('/', async (req: Request, res: Response) => {
  const { name, phone, email, source, city, district, address, note } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO customers (name, phone, email, source, city, district, address, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [name, phone || '', email || '', source || '', city || '', district || '', address || '', note || '']
  );
  res.json({ id: rows[0].id });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { name, phone, email, source, city, district, address, note } = req.body;
  await pool.batch([
    ['UPDATE customers SET name=$1, phone=$2, email=$3, source=$4, city=$5, district=$6, address=$7, note=$8, updated_at=NOW() WHERE id=$9',
      [name, phone || '', email || '', source || '', city || '', district || '', address || '', note || '', req.params.id]],
    // 訂單上存的客戶名稱跟著改
    ['UPDATE quotations SET customer_name = $1 WHERE customer_id = $2', [name, req.params.id]],
  ]);
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.batch([
    // 訂單留著（名字還在），只是不再關聯；不先拿掉的話外鍵會擋住刪除
    ['UPDATE quotations SET customer_id = NULL WHERE customer_id = $1', [req.params.id]],
    ['DELETE FROM service_records WHERE customer_id = $1', [req.params.id]],
    ['DELETE FROM customers WHERE id = $1', [req.params.id]],
  ]);
  res.json({ success: true });
});

router.post('/:id/services', async (req: Request, res: Response) => {
  const { service_type, description, service_date } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO service_records (customer_id, service_type, description, service_date) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.params.id, service_type || '', description || '', service_date || new Date().toISOString().slice(0, 10)]
  );
  res.json({ id: rows[0].id });
});

router.delete('/:id/services/:sid', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM service_records WHERE id = $1 AND customer_id = $2', [req.params.sid, req.params.id]);
  res.json({ success: true });
});

export default router;
