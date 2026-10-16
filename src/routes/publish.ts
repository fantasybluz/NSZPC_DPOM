// 訂單「發布到官網」：把完成的訂單變成官網（NSZ_PC）的「出機紀錄」。
//
// 透過 Worker 之間的 RPC（wrangler.jsonc 的 services → nszpc 的 WebsiteAPI），不經過公開網址。
// 官網上只放規格、照片、售價（不含服務費），不會帶客戶姓名、電話、成本。
// quotations.website_order_id 記住對到哪一筆，再發布一次就是更新。
import { Router, type Request, type Response } from '../lib/router';
import pool, { taipeiDate } from '../models/database';
import { specsFromItems } from '../lib/specs';

const router = new Router();

// 跟官網 nszpc_web/backend/src/rpc.ts 的型別一樣
interface PublishOrderInput {
  date: string;
  item: string;
  requirementIntro: string;
  youtubeEmbedUrl: string;
  tags: string[];
  location: string;
  salePrice: number;
  status: 'pending' | 'shipping' | 'delivered' | 'cancelled';
  cpu: string;
  motherboard: string;
  ram: string;
  storage: string;
  gpu: string;
  psu: string;
  cooler: string;
  pcCase: string;
}

interface WebsiteAPI {
  replaceOrderImages(ref: string, images: { name: string; type: string; data: ArrayBuffer }[]): Promise<string[]>;
  publishOrder(orderId: string | null, input: PublishOrderInput, images: string[]): Promise<
    { ok: true; id: string; path: string } | { ok: false; errors: string[] }
  >;
  unpublishOrder(orderId: string, ref: string): Promise<void>;
  orderTags(): Promise<string[]>;
}

const website = (req: Request) => req.env.WEBSITE as unknown as WebsiteAPI;
const refOf = (quotationId: number) => `dpom-${quotationId}`;

const STATUS_BY_DELIVERY: Record<string, PublishOrderInput['status']> = {
  shipped: 'shipping',
  delivered: 'delivered',
};

// 官網的檢查：每個欄位都要有值、總共最多 10 張照片
const MAX_TOTAL_IMAGE_BYTES = 25 * 1024 * 1024;

const toSlashDate = (d: string) => (d || taipeiDate()).slice(0, 10).replace(/-/g, '/');

/** 依訂單內容組一份草稿（前端再讓人改） */
router.get('/:id/publish-draft', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  const [{ rows: [q] }, { rows: items }, { rows: images }] = await pool.batch([
    ['SELECT * FROM quotations WHERE id = $1', [qId]],
    ['SELECT category, name, spec, quantity FROM quotation_items WHERE quotation_id = $1 ORDER BY id', [qId]],
    ['SELECT id, filename, original_name FROM quotation_images WHERE quotation_id = $1 ORDER BY id', [qId]],
  ]);
  if (!q) return res.status(404).json({ error: '找不到訂單' });

  const specs = await specsFromItems(items as { category: string; name: string; spec: string; quantity: number }[]);

  let tags: string[] = [];
  try { tags = await website(req).orderTags(); } catch { /* 官網暫時連不到就不給建議 */ }

  const draft: PublishOrderInput = {
    date: toSlashDate(q.ship_date),
    item: q.item_title || '客製化主機',
    requirementIntro: '',
    youtubeEmbedUrl: '',
    tags: [],
    location: q.demand_area || '',
    salePrice: Math.max(0, (q.total_price || 0) - (q.service_fee || 0)),
    status: STATUS_BY_DELIVERY[q.delivery_status] || 'delivered',
    ...specs,
  };

  res.json({
    draft,
    images,
    tagOptions: tags,
    websiteOrderId: q.website_order_id || '',
    websiteUrl: q.website_order_id ? `${req.env.WEBSITE_URL}/orders/item/${q.website_order_id}` : '',
  });
});

/** 發布（或更新）到官網 */
router.post('/:id/publish', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  const { draft, imageIds } = req.body as { draft: PublishOrderInput; imageIds?: number[] };
  if (!draft) return res.status(400).json({ error: '沒有要發布的內容' });

  const { rows: [q] } = await pool.query('SELECT id, website_order_id FROM quotations WHERE id = $1', [qId]);
  if (!q) return res.status(404).json({ error: '找不到訂單' });

  // 挑的照片從 R2 讀出來，交給官網存
  const ids = (imageIds ?? []).map(Number).filter(Number.isFinite);
  const { rows: imgRows } = ids.length
    ? await pool.query(
      'SELECT id, filename, original_name FROM quotation_images WHERE quotation_id = $1 AND id IN (SELECT value FROM json_each($2)) ORDER BY id',
      [qId, JSON.stringify(ids)],
    )
    : { rows: [] as any[] };
  const files: { name: string; type: string; data: ArrayBuffer }[] = [];
  let total = 0;
  for (const img of imgRows) {
    const object = await req.env.UPLOADS.get(`uploads/${img.filename}`);
    if (!object) continue;
    const data = await object.arrayBuffer();
    total += data.byteLength;
    if (total > MAX_TOTAL_IMAGE_BYTES) return res.status(400).json({ error: '照片加起來超過 25MB，請少選幾張' });
    files.push({ name: img.original_name || img.filename, type: object.httpMetadata?.contentType || 'image/jpeg', data });
  }

  const input: PublishOrderInput = {
    ...draft,
    date: toSlashDate(String(draft.date || '').replace(/\//g, '-')),
    tags: (draft.tags || []).map((t) => String(t).trim()).filter(Boolean),
    salePrice: Number(draft.salePrice) || 0,
  };

  const api = website(req);
  let urls: string[];
  try {
    urls = await api.replaceOrderImages(refOf(qId), files);
  } catch (err) {
    return res.status(400).json({ error: `照片上傳失敗：${err instanceof Error ? err.message : err}` });
  }
  const result = await api.publishOrder(q.website_order_id || null, input, urls);
  if (!result.ok) {
    return res.status(422).json({ error: '官網的欄位檢查沒過', details: result.errors });
  }
  await pool.query('UPDATE quotations SET website_order_id = $1, updated_at = NOW() WHERE id = $2', [result.id, qId]);
  res.json({ id: result.id, url: `${req.env.WEBSITE_URL}${result.path}` });
});

/** 從官網拿掉 */
router.delete('/:id/publish', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  const { rows: [q] } = await pool.query('SELECT website_order_id FROM quotations WHERE id = $1', [qId]);
  if (!q) return res.status(404).json({ error: '找不到訂單' });
  if (q.website_order_id) {
    await website(req).unpublishOrder(q.website_order_id, refOf(qId));
    await pool.query("UPDATE quotations SET website_order_id = '' WHERE id = $1", [qId]);
  }
  res.json({ success: true });
});

export default router;
