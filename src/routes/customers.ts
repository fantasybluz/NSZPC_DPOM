import { Router, Request, Response } from 'express';
import pool from '../models/database';
import type { Customer, ServiceRecord } from '../types';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { source, city, search } = req.query;
  let sql = 'SELECT * FROM customers';
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;
  if (source) { conditions.push(`source = $${idx++}`); params.push(source); }
  if (city) { conditions.push(`city = $${idx++}`); params.push(city); }
  if (search) {
    conditions.push(`(name LIKE $${idx} OR phone LIKE $${idx + 1} OR email LIKE $${idx + 2})`);
    const s = `%${search}%`;
    params.push(s, s, s);
    idx += 3;
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
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
  const { rows: quotations } = await pool.query('SELECT id, quotation_no, status, total_price, created_at FROM quotations WHERE customer_id = $1 ORDER BY created_at DESC', [c.id]);
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
  await pool.query(
    'UPDATE customers SET name=$1, phone=$2, email=$3, source=$4, city=$5, district=$6, address=$7, note=$8, updated_at=NOW() WHERE id=$9',
    [name, phone || '', email || '', source || '', city || '', district || '', address || '', note || '', req.params.id]
  );
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM service_records WHERE customer_id = $1', [req.params.id]);
  await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
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
