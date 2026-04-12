import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../models/database';
import type { Quotation, QuotationItem, QuotationImage } from '../types';

const router = Router();

// 圖片上傳設定
const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

async function generateQuotationNo(): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `Q${y}${m}${d}`;
  const { rows } = await pool.query("SELECT quotation_no FROM quotations WHERE quotation_no LIKE $1 ORDER BY id DESC LIMIT 1", [`${prefix}%`]);
  let seq = 1;
  if (rows.length > 0) seq = parseInt(rows[0].quotation_no.slice(-3)) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// 統計
router.get('/stats/summary', async (_req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT status, COUNT(*) as count, SUM(total_price) as revenue,
           SUM(total_price - total_cost) as profit, SUM(deposit) as deposits
    FROM quotations GROUP BY status
  `);
  res.json(rows);
});

// 當月訂單統計
router.get('/stats/monthly', async (_req: Request, res: Response) => {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { rows: byStatus } = await pool.query(`
    SELECT status, delivery_status, COUNT(*) as count, SUM(total_price) as revenue,
           SUM(total_price - total_cost) as profit, SUM(deposit) as deposits
    FROM quotations WHERE to_char(created_at, 'YYYY-MM') = $1 GROUP BY status, delivery_status
  `, [monthPrefix]);

  const { rows: byDelivery } = await pool.query(`
    SELECT delivery_status, COUNT(*) as count
    FROM quotations WHERE to_char(created_at, 'YYYY-MM') = $1 AND delivery_status != '' GROUP BY delivery_status
  `, [monthPrefix]);

  const { rows: recent } = await pool.query(`
    SELECT id, quotation_no, customer_name, status, delivery_status, total_price, deposit, created_at
    FROM quotations WHERE to_char(created_at, 'YYYY-MM') = $1 ORDER BY created_at DESC LIMIT 10
  `, [monthPrefix]);

  const { rows: [total] } = await pool.query(`
    SELECT COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE to_char(created_at, 'YYYY-MM') = $1
  `, [monthPrefix]);

  res.json({ month: monthPrefix, byStatus, byDelivery, recent, total });
});

// 列表
router.get('/', async (req: Request, res: Response) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM quotations';
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;
  if (status && status !== 'all') { conditions.push(`status = $${idx++}`); params.push(status); }
  if (search) {
    conditions.push(`(quotation_no LIKE $${idx} OR customer_name LIKE $${idx + 1})`);
    params.push(`%${search}%`, `%${search}%`);
    idx += 2;
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// 單筆
router.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
  const q = rows[0] as Quotation | undefined;
  if (!q) return res.status(404).json({ error: '找不到估價單' });
  const { rows: items } = await pool.query('SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id', [q.id]);
  q.items = items as QuotationItem[];
  const { rows: images } = await pool.query('SELECT * FROM quotation_images WHERE quotation_id = $1 ORDER BY id', [q.id]);
  q.images = images as QuotationImage[];
  res.json(q);
});

// 新增
router.post('/', async (req: Request, res: Response) => {
  const { customer_id, customer_name, items, deposit, service_fee, note, item_title, demand_area, ship_date, delivery_status, qc_data } = req.body;
  const quotation_no = await generateQuotationNo();

  let total_cost = 0, total_price = 0;
  if (items) {
    for (const item of items) {
      total_cost += (item.cost || 0) * (item.quantity || 1);
      total_price += (item.price || 0) * (item.quantity || 1);
    }
  }
  total_price += (service_fee || 0);

  const { rows } = await pool.query(`
    INSERT INTO quotations (quotation_no, customer_id, customer_name, status, deposit, service_fee, total_cost, total_price, note, item_title, demand_area, ship_date, delivery_status, qc_data)
    VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id
  `, [quotation_no, customer_id || null, customer_name || '', deposit || 0, service_fee || 0, total_cost, total_price, note || '',
    item_title || '', demand_area || '', ship_date || '', delivery_status || '', JSON.stringify(qc_data || {})]);

  const qId = rows[0].id;
  if (items?.length) {
    for (const item of items) {
      await pool.query('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [qId, item.category || '', item.name, item.spec || '', item.cost || 0, item.price || 0, item.quantity || 1]);
    }
  }
  res.json({ id: qId, quotation_no });
});

// 更新
router.put('/:id', async (req: Request, res: Response) => {
  const { customer_id, customer_name, items, deposit, service_fee, status, note, item_title, demand_area, ship_date, delivery_status, qc_data } = req.body;

  let total_cost = 0, total_price = 0;
  if (items) {
    for (const item of items) {
      total_cost += (item.cost || 0) * (item.quantity || 1);
      total_price += (item.price || 0) * (item.quantity || 1);
    }
  }
  total_price += (service_fee || 0);

  await pool.query(`
    UPDATE quotations SET customer_id=$1, customer_name=$2, status=$3, deposit=$4, service_fee=$5, total_cost=$6, total_price=$7, note=$8,
    item_title=$9, demand_area=$10, ship_date=$11, delivery_status=$12, qc_data=$13,
    updated_at=NOW() WHERE id=$14
  `, [customer_id || null, customer_name || '', status || 'draft', deposit || 0, service_fee || 0, total_cost, total_price, note || '',
    item_title || '', demand_area || '', ship_date || '', delivery_status || '', JSON.stringify(qc_data || {}), req.params.id]);

  await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [req.params.id]);
  if (items?.length) {
    for (const item of items) {
      await pool.query('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, item.category || '', item.name, item.spec || '', item.cost || 0, item.price || 0, item.quantity || 1]);
    }
  }
  res.json({ success: true });
});

// 複製訂單
router.post('/:id/copy', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM quotations WHERE id=$1', [req.params.id]);
  const orig = rows[0] as any;
  if (!orig) return res.status(404).json({ error: '找不到訂單' });
  const { rows: origItems } = await pool.query('SELECT * FROM quotation_items WHERE quotation_id=$1', [orig.id]);
  const newNo = await generateQuotationNo();
  const { rows: newRows } = await pool.query(
    `INSERT INTO quotations (quotation_no, customer_id, customer_name, status, deposit, service_fee, total_cost, total_price, note, item_title, demand_area, ship_date, delivery_status, qc_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [newNo, orig.customer_id, orig.customer_name, 'draft', 0, orig.service_fee, orig.total_cost, orig.total_price, orig.note, orig.item_title, orig.demand_area, '', '', orig.qc_data]
  );
  const newId = newRows[0].id;
  for (const item of origItems) {
    await pool.query('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [newId, item.category, item.name, item.spec, item.cost, item.price, item.quantity]);
  }
  res.json({ id: newId, quotation_no: newNo });
});

// 圖片上傳
router.post('/:id/images', upload.array('images', 10), async (req: Request, res: Response) => {
  const qId = req.params.id;
  const results: any[] = [];
  for (const file of (req.files as Express.Multer.File[])) {
    const { rows } = await pool.query('INSERT INTO quotation_images (quotation_id, filename, original_name) VALUES ($1, $2, $3) RETURNING id', [qId, file.filename, file.originalname]);
    results.push({ id: rows[0].id, filename: file.filename, original_name: file.originalname });
  }
  res.json(results);
});

// 取得圖片
router.get('/:id/images/:filename', (req: Request, res: Response) => {
  const filePath = path.join(uploadDir, req.params.filename as string);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: '圖片不存在' });
  }
});

// 刪除圖片
router.delete('/:id/images/:imageId', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM quotation_images WHERE id = $1 AND quotation_id = $2', [req.params.imageId, req.params.id]);
  const img = rows[0] as QuotationImage | undefined;
  if (img) {
    const filePath = path.join(uploadDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM quotation_images WHERE id = $1', [img.id]);
  }
  res.json({ success: true });
});

// 刪除估價單
router.delete('/:id', async (req: Request, res: Response) => {
  const { rows: images } = await pool.query('SELECT filename FROM quotation_images WHERE quotation_id = $1', [req.params.id]);
  for (const img of images) {
    const filePath = path.join(uploadDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await pool.query('DELETE FROM quotation_images WHERE quotation_id = $1', [req.params.id]);
  await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [req.params.id]);
  await pool.query('DELETE FROM quotations WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

export default router;
