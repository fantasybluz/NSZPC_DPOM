import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../models/database';
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

function generateQuotationNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `Q${y}${m}${d}`;
  const last = db.prepare("SELECT quotation_no FROM quotations WHERE quotation_no LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`) as { quotation_no: string } | undefined;
  let seq = 1;
  if (last) seq = parseInt(last.quotation_no.slice(-3)) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// 統計
router.get('/stats/summary', (_req: Request, res: Response) => {
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count, SUM(total_price) as revenue,
           SUM(total_price - total_cost) as profit, SUM(deposit) as deposits
    FROM quotations GROUP BY status
  `).all();
  res.json(stats);
});

// 當月訂單統計
router.get('/stats/monthly', (_req: Request, res: Response) => {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const byStatus = db.prepare(`
    SELECT status, delivery_status, COUNT(*) as count, SUM(total_price) as revenue,
           SUM(total_price - total_cost) as profit, SUM(deposit) as deposits
    FROM quotations WHERE created_at LIKE ? GROUP BY status
  `).all(`${monthPrefix}%`);

  const byDelivery = db.prepare(`
    SELECT delivery_status, COUNT(*) as count
    FROM quotations WHERE created_at LIKE ? AND delivery_status != '' GROUP BY delivery_status
  `).all(`${monthPrefix}%`);

  const recent = db.prepare(`
    SELECT id, quotation_no, customer_name, status, delivery_status, total_price, deposit, created_at
    FROM quotations WHERE created_at LIKE ? ORDER BY created_at DESC LIMIT 10
  `).all(`${monthPrefix}%`);

  const total = db.prepare(`
    SELECT COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE created_at LIKE ?
  `).get(`${monthPrefix}%`);

  res.json({ month: monthPrefix, byStatus, byDelivery, recent, total });
});

// 列表
router.get('/', (req: Request, res: Response) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM quotations';
  const params: any[] = [];
  const conditions: string[] = [];
  if (status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
  if (search) {
    conditions.push('(quotation_no LIKE ? OR customer_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// 單筆
router.get('/:id', (req: Request, res: Response) => {
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id) as Quotation | undefined;
  if (!q) return res.status(404).json({ error: '找不到估價單' });
  q.items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(q.id) as QuotationItem[];
  q.images = db.prepare('SELECT * FROM quotation_images WHERE quotation_id = ? ORDER BY id').all(q.id) as QuotationImage[];
  res.json(q);
});

// 新增
router.post('/', (req: Request, res: Response) => {
  const { customer_id, customer_name, items, deposit, service_fee, note, item_title, demand_area, ship_date, delivery_status, qc_data } = req.body;
  const quotation_no = generateQuotationNo();

  let total_cost = 0, total_price = 0;
  if (items) {
    for (const item of items) {
      total_cost += (item.cost || 0) * (item.quantity || 1);
      total_price += (item.price || 0) * (item.quantity || 1);
    }
  }
  total_price += (service_fee || 0);

  const result = db.prepare(`
    INSERT INTO quotations (quotation_no, customer_id, customer_name, status, deposit, service_fee, total_cost, total_price, note, item_title, demand_area, ship_date, delivery_status, qc_data)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(quotation_no, customer_id || null, customer_name || '', deposit || 0, service_fee || 0, total_cost, total_price, note || '',
    item_title || '', demand_area || '', ship_date || '', delivery_status || '', JSON.stringify(qc_data || {}));

  const qId = result.lastInsertRowid;
  if (items?.length) {
    const insertItem = db.prepare('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES (?,?,?,?,?,?,?)');
    for (const item of items) {
      insertItem.run(qId, item.category || '', item.name, item.spec || '', item.cost || 0, item.price || 0, item.quantity || 1);
    }
  }
  res.json({ id: qId, quotation_no });
});

// 更新
router.put('/:id', (req: Request, res: Response) => {
  const { customer_id, customer_name, items, deposit, service_fee, status, note, item_title, demand_area, ship_date, delivery_status, qc_data } = req.body;

  let total_cost = 0, total_price = 0;
  if (items) {
    for (const item of items) {
      total_cost += (item.cost || 0) * (item.quantity || 1);
      total_price += (item.price || 0) * (item.quantity || 1);
    }
  }
  total_price += (service_fee || 0);

  db.prepare(`
    UPDATE quotations SET customer_id=?, customer_name=?, status=?, deposit=?, service_fee=?, total_cost=?, total_price=?, note=?,
    item_title=?, demand_area=?, ship_date=?, delivery_status=?, qc_data=?,
    updated_at=datetime('now','localtime') WHERE id=?
  `).run(customer_id || null, customer_name || '', status || 'draft', deposit || 0, service_fee || 0, total_cost, total_price, note || '',
    item_title || '', demand_area || '', ship_date || '', delivery_status || '', JSON.stringify(qc_data || {}), req.params.id);

  db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(req.params.id);
  if (items?.length) {
    const insertItem = db.prepare('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES (?,?,?,?,?,?,?)');
    for (const item of items) {
      insertItem.run(req.params.id, item.category || '', item.name, item.spec || '', item.cost || 0, item.price || 0, item.quantity || 1);
    }
  }
  res.json({ success: true });
});

// 複製訂單
router.post('/:id/copy', (req: Request, res: Response) => {
  const orig = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id) as any;
  if (!orig) return res.status(404).json({ error: '找不到訂單' });
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(orig.id) as any[];
  const newNo = generateQuotationNo();
  const r = db.prepare(`INSERT INTO quotations (quotation_no, customer_id, customer_name, status, deposit, service_fee, total_cost, total_price, note, item_title, demand_area, ship_date, delivery_status, qc_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    newNo, orig.customer_id, orig.customer_name, 'draft', 0, orig.service_fee, orig.total_cost, orig.total_price, orig.note, orig.item_title, orig.demand_area, '', '', orig.qc_data
  );
  const newId = r.lastInsertRowid;
  const ins = db.prepare('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES (?,?,?,?,?,?,?)');
  for (const item of items) ins.run(newId, item.category, item.name, item.spec, item.cost, item.price, item.quantity);
  res.json({ id: newId, quotation_no: newNo });
});

// 圖片上傳
router.post('/:id/images', upload.array('images', 10), (req: Request, res: Response) => {
  const qId = req.params.id;
  const insert = db.prepare('INSERT INTO quotation_images (quotation_id, filename, original_name) VALUES (?, ?, ?)');
  const results: any[] = [];
  for (const file of (req.files as Express.Multer.File[])) {
    const result = insert.run(qId, file.filename, file.originalname);
    results.push({ id: result.lastInsertRowid, filename: file.filename, original_name: file.originalname });
  }
  res.json(results);
});

// 取得圖片
router.get('/:id/images/:filename', (req: Request, res: Response) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: '圖片不存在' });
  }
});

// 刪除圖片
router.delete('/:id/images/:imageId', (req: Request, res: Response) => {
  const img = db.prepare('SELECT * FROM quotation_images WHERE id = ? AND quotation_id = ?').get(req.params.imageId, req.params.id) as QuotationImage | undefined;
  if (img) {
    const filePath = path.join(uploadDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM quotation_images WHERE id = ?').run(img.id);
  }
  res.json({ success: true });
});

// 刪除估價單
router.delete('/:id', (req: Request, res: Response) => {
  const images = db.prepare('SELECT filename FROM quotation_images WHERE quotation_id = ?').all(req.params.id) as { filename: string }[];
  for (const img of images) {
    const filePath = path.join(uploadDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM quotation_images WHERE quotation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quotations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
