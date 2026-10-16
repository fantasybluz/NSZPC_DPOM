import { Router, Response, type Request } from '../lib/router';
import pool, {
  deductQuotationStock,
  insertQuotationItems,
  isDeductingStatus,
  restoreQuotationStock,
  taipeiDate,
  taipeiMonthSql,
} from '../models/database';
import type { Quotation, QuotationItem, QuotationImage } from '../types';

const router = new Router();

// 圖片存在 R2（env.UPLOADS），key 是 uploads/<filename>；資料庫 quotation_images.filename 只存 filename
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 10;
const FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const uploadKey = (filename: string): string => `uploads/${filename}`;

/** 讀一張上傳的圖片（routes 和 worker.ts 的 /api/uploads 共用） */
export async function serveUpload(env: Env, filename: string): Promise<globalThis.Response> {
  if (!FILENAME_PATTERN.test(filename)) {
    return new Response().status(404).json({ error: '圖片不存在' }).toResponse();
  }
  const object = await env.UPLOADS.get(uploadKey(filename));
  if (!object) {
    return new Response().status(404).json({ error: '圖片不存在' }).toResponse();
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  // 只當圖片顯示，不要被瀏覽器當網頁執行
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new globalThis.Response(object.body, { headers });
}

async function generateQuotationNo(): Promise<string> {
  const prefix = `Q${taipeiDate().replace(/-/g, '')}`;
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
  const monthPrefix = taipeiDate().slice(0, 7);

  const { rows: byStatus } = await pool.query(`
    SELECT status, delivery_status, COUNT(*) as count, SUM(total_price) as revenue,
           SUM(total_price - total_cost) as profit, SUM(deposit) as deposits
    FROM quotations WHERE ${taipeiMonthSql('created_at')} = $1 GROUP BY status, delivery_status
  `, [monthPrefix]);

  const { rows: byDelivery } = await pool.query(`
    SELECT delivery_status, COUNT(*) as count
    FROM quotations WHERE ${taipeiMonthSql('created_at')} = $1 AND delivery_status != '' GROUP BY delivery_status
  `, [monthPrefix]);

  const { rows: recent } = await pool.query(`
    SELECT id, quotation_no, customer_name, status, delivery_status, total_price, deposit, created_at
    FROM quotations WHERE ${taipeiMonthSql('created_at')} = $1 ORDER BY created_at DESC LIMIT 10
  `, [monthPrefix]);

  const { rows: [total] } = await pool.query(`
    SELECT COUNT(*) as count, SUM(total_price) as revenue, SUM(total_price - total_cost) as profit
    FROM quotations WHERE ${taipeiMonthSql('created_at')} = $1
  `, [monthPrefix]);

  res.json({ month: monthPrefix, byStatus, byDelivery, recent, total });
});

// 列表
router.get('/', async (req: Request, res: Response) => {
  const { status, search, customer_id } = req.query;
  // 帶上關聯客戶的電話（客戶管理那邊改了，這裡就跟著變）
  let sql = 'SELECT q.*, c.phone AS customer_phone FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id';
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;
  if (status && status !== 'all') { conditions.push(`q.status = $${idx++}`); params.push(status); }
  if (customer_id) { conditions.push(`q.customer_id = $${idx++}`); params.push(parseInt(customer_id as string)); }
  if (search) {
    conditions.push(`(q.quotation_no LIKE $${idx} OR q.customer_name LIKE $${idx + 1} OR c.phone LIKE $${idx + 2})`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    idx += 3;
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY q.created_at DESC';
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
  // 關聯的客戶（電話、地址、來源，以及他總共下過幾張單）
  if (q.customer_id) {
    const { rows: [customer] } = await pool.query(
      `SELECT c.id, c.name, c.phone, c.email, c.source, c.city, c.district, c.address, c.note,
              (SELECT COUNT(*) FROM quotations WHERE customer_id = c.id) AS order_count
       FROM customers c WHERE c.id = $1`,
      [q.customer_id],
    );
    (q as any).customer = customer || null;
  }
  res.json(q);
});

/** 有選客戶就用客戶管理裡的名字（避免兩邊不一致）；客戶已經不在就當作沒選 */
async function resolveCustomer(customerId: unknown, customerName: unknown): Promise<{ id: number | null; name: string }> {
  const id = parseInt(String(customerId ?? ''));
  const typed = typeof customerName === 'string' ? customerName.trim() : '';
  if (!Number.isFinite(id)) return { id: null, name: typed };
  const { rows: [c] } = await pool.query('SELECT id, name FROM customers WHERE id = $1', [id]);
  return c ? { id: c.id, name: c.name } : { id: null, name: typed };
}

// 新增
router.post('/', async (req: Request, res: Response) => {
  const { customer_id: rawCustomerId, customer_name: rawCustomerName, items, status, deposit, service_fee, note, item_title, demand_area, ship_date, delivery_status, qc_data } = req.body;
  const { id: customer_id, name: customer_name } = await resolveCustomer(rawCustomerId, rawCustomerName);
  const quotation_no = await generateQuotationNo();
  const initStatus = status && typeof status === 'string' ? status : 'draft';

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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
  `, [quotation_no, customer_id || null, customer_name || '', initStatus, deposit || 0, service_fee || 0, total_cost, total_price, note || '',
    item_title || '', demand_area || '', ship_date || '', delivery_status || '', JSON.stringify(qc_data || {})]);

  const qId = rows[0].id;
  await insertQuotationItems(qId, items);

  // 若初始狀態就是「成立」，立即扣帳
  if (isDeductingStatus(initStatus)) {
    try {
      await deductQuotationStock(qId);
    } catch (err: any) {
      // 回滾整張單，避免半成品狀態
      await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [qId]);
      await pool.query('DELETE FROM quotations WHERE id = $1', [qId]);
      return res.status(400).json({ error: err.message || '庫存扣帳失敗' });
    }
  }

  res.json({ id: qId, quotation_no });
});

// 更新
router.put('/:id', async (req: Request, res: Response) => {
  const { customer_id: rawCustomerId, customer_name: rawCustomerName, items, deposit, service_fee, status, note, item_title, demand_area, ship_date, delivery_status, qc_data } = req.body;
  const qId = parseInt(req.params.id as string);
  const newStatus = status || 'draft';
  const { id: customer_id, name: customer_name } = await resolveCustomer(rawCustomerId, rawCustomerName);

  // 讀目前狀態與扣帳旗標
  const { rows: curRows } = await pool.query('SELECT status, stock_deducted FROM quotations WHERE id = $1', [qId]);
  if (!curRows.length) return res.status(404).json({ error: '找不到訂單' });
  const wasDeducted = curRows[0].stock_deducted === 1;

  let total_cost = 0, total_price = 0;
  if (items) {
    for (const item of items) {
      total_cost += (item.cost || 0) * (item.quantity || 1);
      total_price += (item.price || 0) * (item.quantity || 1);
    }
  }
  total_price += (service_fee || 0);

  // 1) 若先前已扣帳，先還原（此步永遠安全）
  if (wasDeducted) {
    await restoreQuotationStock(qId);
  }

  // 2) 替換 items
  await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [qId]);
  await insertQuotationItems(qId, items);

  // 3) 更新主表
  await pool.query(`
    UPDATE quotations SET customer_id=$1, customer_name=$2, status=$3, deposit=$4, service_fee=$5, total_cost=$6, total_price=$7, note=$8,
    item_title=$9, demand_area=$10, ship_date=$11, delivery_status=$12, qc_data=$13,
    updated_at=NOW() WHERE id=$14
  `, [customer_id || null, customer_name || '', newStatus, deposit || 0, service_fee || 0, total_cost, total_price, note || '',
    item_title || '', demand_area || '', ship_date || '', delivery_status || '', JSON.stringify(qc_data || {}), qId]);

  // 4) 若新狀態為「成立」，依新 items 扣帳；若庫存不足，把狀態回退並回原扣帳狀態
  if (isDeductingStatus(newStatus)) {
    try {
      await deductQuotationStock(qId);
    } catch (err: any) {
      // 回退狀態為 draft，回應錯誤
      await pool.query("UPDATE quotations SET status = 'draft', updated_at = NOW() WHERE id = $1", [qId]);
      return res.status(400).json({ error: err.message || '庫存扣帳失敗，狀態已回退為草稿' });
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
  await insertQuotationItems(newId, origItems);
  res.json({ id: newId, quotation_no: newNo });
});

// 圖片上傳（multipart，欄位 images，最多 10 張、每張 10MB）
router.post('/:id/images', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  const { rows: found } = await pool.query('SELECT id FROM quotations WHERE id = $1', [qId]);
  if (!found.length) return res.status(404).json({ error: '找不到估價單' });

  let form: FormData;
  try {
    form = await req.raw.formData();
  } catch {
    return res.status(400).json({ error: '上傳格式不對' });
  }
  const files = form.getAll('images').filter((f): f is File => typeof f !== 'string');
  if (files.length > MAX_IMAGES) return res.status(400).json({ error: `一次最多 ${MAX_IMAGES} 張` });
  if (files.some((f) => f.size > MAX_IMAGE_BYTES)) return res.status(400).json({ error: '每張圖片最大 10MB' });
  if (files.some((f) => !f.type.startsWith('image/'))) return res.status(400).json({ error: '只能上傳圖片' });

  const results: any[] = [];
  for (const file of files) {
    const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').toLowerCase();
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
    await req.env.UPLOADS.put(uploadKey(filename), file.stream(), { httpMetadata: { contentType: file.type } });
    const { rows } = await pool.query('INSERT INTO quotation_images (quotation_id, filename, original_name) VALUES ($1, $2, $3) RETURNING id', [qId, filename, file.name]);
    results.push({ id: rows[0].id, filename, original_name: file.name });
  }
  res.json(results);
});

// 取得圖片
router.get('/:id/images/:filename', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT id FROM quotation_images WHERE quotation_id = $1 AND filename = $2', [req.params.id, req.params.filename]);
  if (!rows.length) return res.status(404).json({ error: '圖片不存在' });
  const object = await serveUpload(req.env, req.params.filename as string);
  res.status(object.status);
  object.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(object.body as ReadableStream);
});

// 刪除圖片
router.delete('/:id/images/:imageId', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM quotation_images WHERE id = $1 AND quotation_id = $2', [req.params.imageId, req.params.id]);
  const img = rows[0] as QuotationImage | undefined;
  if (img) {
    await req.env.UPLOADS.delete(uploadKey(img.filename));
    await pool.query('DELETE FROM quotation_images WHERE id = $1', [img.id]);
  }
  res.json({ success: true });
});

// 刪除估價單
router.delete('/:id', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  // 若已扣帳，先還原庫存
  const { rows: cur } = await pool.query('SELECT stock_deducted FROM quotations WHERE id = $1', [qId]);
  if (cur[0]?.stock_deducted === 1) {
    await restoreQuotationStock(qId);
  }

  const { rows: images } = await pool.query('SELECT filename FROM quotation_images WHERE quotation_id = $1', [qId]);
  if (images.length) await req.env.UPLOADS.delete(images.map((img: any) => uploadKey(img.filename)));
  await pool.batch([
    ['DELETE FROM quotation_images WHERE quotation_id = $1', [qId]],
    ['DELETE FROM quotation_items WHERE quotation_id = $1', [qId]],
    ['DELETE FROM quotations WHERE id = $1', [qId]],
  ]);
  res.json({ success: true });
});

export default router;
