import { Router, Request, Response } from 'express';
import db from '../models/database';
import type { Customer, ServiceRecord } from '../types';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { source, city, search } = req.query;
  let sql = 'SELECT * FROM customers';
  const params: any[] = [];
  const conditions: string[] = [];
  if (source) { conditions.push('source = ?'); params.push(source); }
  if (city) { conditions.push('city = ?'); params.push(city); }
  if (search) {
    conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// 統計 (必須在 /:id 前面)
router.get('/stats/distribution', (_req: Request, res: Response) => {
  const byCity = db.prepare("SELECT city, COUNT(*) as count FROM customers WHERE city != '' GROUP BY city ORDER BY count DESC").all();
  const bySource = db.prepare("SELECT source, COUNT(*) as count FROM customers WHERE source != '' GROUP BY source ORDER BY count DESC").all();
  const total = db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number };
  res.json({ byCity, bySource, total: total.count });
});

router.get('/:id', (req: Request, res: Response) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer | undefined;
  if (!c) return res.status(404).json({ error: '找不到客戶' });
  c.services = db.prepare('SELECT * FROM service_records WHERE customer_id = ? ORDER BY service_date DESC').all(c.id) as ServiceRecord[];
  c.quotations = db.prepare('SELECT id, quotation_no, status, total_price, created_at FROM quotations WHERE customer_id = ? ORDER BY created_at DESC').all(c.id) as any[];
  res.json(c);
});

router.post('/', (req: Request, res: Response) => {
  const { name, phone, email, source, city, district, address, note } = req.body;
  const result = db.prepare(
    'INSERT INTO customers (name, phone, email, source, city, district, address, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, phone || '', email || '', source || '', city || '', district || '', address || '', note || '');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req: Request, res: Response) => {
  const { name, phone, email, source, city, district, address, note } = req.body;
  db.prepare(
    "UPDATE customers SET name=?, phone=?, email=?, source=?, city=?, district=?, address=?, note=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(name, phone || '', email || '', source || '', city || '', district || '', address || '', note || '', req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM service_records WHERE customer_id = ?').run(req.params.id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/:id/services', (req: Request, res: Response) => {
  const { service_type, description, service_date } = req.body;
  const result = db.prepare('INSERT INTO service_records (customer_id, service_type, description, service_date) VALUES (?, ?, ?, ?)')
    .run(req.params.id, service_type || '', description || '', service_date || new Date().toISOString().slice(0, 10));
  res.json({ id: result.lastInsertRowid });
});

router.delete('/:id/services/:sid', (req: Request, res: Response) => {
  db.prepare('DELETE FROM service_records WHERE id = ? AND customer_id = ?').run(req.params.sid, req.params.id);
  res.json({ success: true });
});

export default router;
