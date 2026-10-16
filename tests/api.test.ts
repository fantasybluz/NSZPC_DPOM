// API 整合測試：打本機的 Worker（npm run dev，預設 http://localhost:8787）。
// 本機開發不經過 Cloudflare Access，以 .dev.vars 的 DEV_USER_EMAIL 登入（要在 BOOTSTRAP_ADMIN_EMAILS 裡，會自動建成管理員）。
//
//   npm run dev          # 另一個終端機
//   npm test             # 或 BASE_URL=http://localhost:8788 npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';

interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

async function request(method: string, path: string, body?: unknown): Promise<ApiResponse> {
  const res = await fetch(new URL(path, BASE_URL), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* CSV 之類的 */ }
  return { status: res.status, body: parsed, headers: res.headers };
}

const unique = `${Date.now()}`;

// ========== 登入 ==========
describe('Auth API', () => {
  it('取得當前使用者（Access 的 email，第一次自動建成管理員）', async () => {
    const res = await request('GET', '/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
    assert.ok(res.body.email.includes('@'));
  });

  it('原本的帳密登入已經拿掉', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
    assert.equal(res.status, 404);
  });

  it('不需認證的版本資訊', async () => {
    const res = await request('GET', '/api/version');
    assert.equal(res.status, 200);
    assert.ok(res.body.version);
  });
});

// ========== 使用者管理 ==========
describe('User Management', () => {
  let testUserId: number;

  it('新增使用者要 email', async () => {
    const bad = await request('POST', '/api/auth/users', { email: 'not-an-email' });
    assert.equal(bad.status, 400);
    const res = await request('POST', '/api/auth/users', {
      email: `staff-${unique}@example.com`, display_name: '測試員工', role: 'user', permissions: ['dashboard', 'inventory'],
    });
    assert.equal(res.status, 200);
    testUserId = res.body.id;
  });

  it('同一個 email 不能新增兩次', async () => {
    const res = await request('POST', '/api/auth/users', { email: `STAFF-${unique}@example.com` });
    assert.equal(res.status, 400);
  });

  it('取得所有使用者', async () => {
    const res = await request('GET', '/api/auth/users');
    assert.equal(res.status, 200);
    assert.ok(res.body.some((u: any) => u.id === testUserId && u.permissions.includes('inventory')));
  });

  it('更新使用者權限', async () => {
    const res = await request('PUT', `/api/auth/users/${testUserId}`, {
      display_name: '測試員工更新', role: 'user', permissions: ['dashboard', 'quotations'], is_active: 1,
    });
    assert.equal(res.status, 200);
  });

  it('不能刪除自己', async () => {
    const me = await request('GET', '/api/auth/me');
    const res = await request('DELETE', `/api/auth/users/${me.body.userId}`);
    assert.equal(res.status, 400);
  });

  it('刪除使用者', async () => {
    const res = await request('DELETE', `/api/auth/users/${testUserId}`);
    assert.equal(res.status, 200);
  });
});

// ========== 分類 ==========
describe('Categories API', () => {
  it('預設分類（含子分類）', async () => {
    const res = await request('GET', '/api/inventory/categories');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 9);
    const cpu = res.body.find((c: any) => c.name === 'CPU');
    const amd = cpu.children.find((c: any) => c.name === 'AMD');
    assert.deepEqual(amd.children.map((c: any) => c.name), ['AM4', 'AM5']);
  });

  it('拖拉只在同一層排序（原本會被 /categories/:id 攔走）', async () => {
    const a = await request('POST', '/api/inventory/categories', { name: `排序A-${unique}` });
    const b = await request('POST', '/api/inventory/categories', { name: `排序B-${unique}` });
    const res = await request('PUT', '/api/inventory/categories/reorder', {
      items: [{ id: b.body.id, sort_order: 1 }, { id: a.body.id, sort_order: 2 }],
    });
    assert.equal(res.status, 200);
    const tree = await request('GET', '/api/inventory/categories');
    assert.equal(tree.body.find((c: any) => c.id === b.body.id).sort_order, 1);
    assert.equal(tree.body.find((c: any) => c.id === a.body.id).sort_order, 2);

    // 不同層的不能一起排（也不會被改成子分類）
    const cpu = tree.body.find((c: any) => c.name === 'CPU');
    const mixed = await request('PUT', '/api/inventory/categories/reorder', {
      items: [{ id: a.body.id, sort_order: 1 }, { id: cpu.children[0].id, sort_order: 2 }],
    });
    assert.equal(mixed.status, 400);
    for (const id of [a.body.id, b.body.id]) await request('DELETE', `/api/inventory/categories/${id}`);
  });

  it('用編輯換上層分類（有檢查）', async () => {
    const parent = await request('POST', '/api/inventory/categories', { name: `上層-${unique}` });
    const child = await request('POST', '/api/inventory/categories', { name: `下層-${unique}` });
    assert.equal((await request('PUT', `/api/inventory/categories/${child.body.id}`, { parent_id: parent.body.id })).status, 200);
    let tree = await request('GET', '/api/inventory/categories');
    assert.equal(tree.body.find((c: any) => c.id === parent.body.id).children[0].id, child.body.id);

    // 不能移到自己底下
    const cycle = await request('PUT', `/api/inventory/categories/${parent.body.id}`, { parent_id: child.body.id });
    assert.equal(cycle.status, 400);

    // 有庫存的分類不能當上層
    const inv = await request('POST', '/api/inventory', { category_id: child.body.id, name: `放在下層-${unique}` });
    const other = await request('POST', '/api/inventory/categories', { name: `別的-${unique}` });
    const intoStocked = await request('PUT', `/api/inventory/categories/${other.body.id}`, { parent_id: child.body.id });
    assert.equal(intoStocked.status, 400);
    assert.match(intoStocked.body.error, /庫存/);

    // 移回第一層
    assert.equal((await request('PUT', `/api/inventory/categories/${other.body.id}`, { parent_id: null })).status, 200);
    await request('DELETE', `/api/inventory/${inv.body.id}`);
    for (const id of [other.body.id, parent.body.id]) await request('DELETE', `/api/inventory/categories/${id}`);
    tree = await request('GET', '/api/inventory/categories');
    assert.ok(!JSON.stringify(tree.body).includes(unique));
  });
});

// ========== 庫存與訂單扣帳 ==========
describe('Inventory + quotation stock', () => {
  let itemId: number;
  let quotId: number;

  it('新增商品（含初始庫存）', async () => {
    const res = await request('POST', '/api/inventory', {
      category_id: 1, name: `AMD Ryzen 5 7600X ${unique}`, brand: 'AMD', spec: '6C/12T', price: 5990, min_quantity: 3,
      initial_qty: 5, initial_cost: 4000, supplier: '原價屋',
    });
    assert.equal(res.status, 200);
    itemId = res.body.id;
  });

  it('再進貨一批（不同成本）', async () => {
    const res = await request('POST', `/api/inventory/${itemId}/stock-in`, { quantity: 5, unit_cost: 5000, supplier: '欣亞' });
    assert.equal(res.status, 200);
    const detail = await request('GET', `/api/inventory/${itemId}/detail`);
    assert.equal(detail.body.quantity, 10);
    assert.equal(detail.body.avg_cost, 4500);
    assert.equal(detail.body.batches.length, 2);
    assert.equal(detail.body.category_path, 'CPU');
  });

  it('庫存列表、搜尋、分類篩選、統計', async () => {
    const list = await request('GET', `/api/inventory?search=${encodeURIComponent(unique)}`);
    assert.equal(list.body.length, 1);
    const byCat = await request('GET', '/api/inventory?category_id=1');
    assert.ok(byCat.body.some((i: any) => i.id === itemId));
    const stats = await request('GET', '/api/inventory/stats');
    assert.ok(stats.body.byCategory.some((c: any) => c.category === 'CPU' && c.total_qty >= 10));
  });

  it('成立的訂單依 FIFO 扣庫存', async () => {
    const res = await request('POST', '/api/quotations', {
      customer_name: '王大明', status: 'deposit', deposit: 5000, service_fee: 1500,
      items: [
        { category: 'CPU', name: 'R5-7600X', cost: 4500, price: 5990, quantity: 4, inventory_id: itemId },
        { category: 'CPU', name: 'R5-7600X（第二台）', cost: 4500, price: 5990, quantity: 3, inventory_id: itemId },
        { category: '其他', name: '線材', cost: 100, price: 200, quantity: 1 },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.quotation_no.startsWith('Q'));
    quotId = res.body.id;

    const detail = await request('GET', `/api/inventory/${itemId}/detail`);
    assert.equal(detail.body.quantity, 3);
    const [first, second] = detail.body.batches;
    assert.equal(first.remaining, 0); // 先扣完 4000 的那批
    assert.equal(second.remaining, 3);
    const q = await request('GET', `/api/quotations/${quotId}`);
    assert.equal(q.body.stock_deducted, 1);
    assert.equal(q.body.items.length, 3);
  });

  it('庫存不夠時不能成立，整張單不會留下來', async () => {
    const res = await request('POST', '/api/quotations', {
      customer_name: `庫存不足${unique}`, status: 'pending',
      items: [{ name: 'R5', cost: 1, price: 1, quantity: 99, inventory_id: itemId }],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /庫存不足/);
    const list = await request('GET', `/api/quotations?search=${encodeURIComponent(`庫存不足${unique}`)}`);
    assert.equal(list.body.length, 0);
  });

  it('改回草稿會把庫存加回去', async () => {
    const res = await request('PUT', `/api/quotations/${quotId}`, {
      customer_name: '王大明', status: 'draft', items: [{ name: 'R5', cost: 4500, price: 5990, quantity: 7, inventory_id: itemId }],
    });
    assert.equal(res.status, 200);
    const detail = await request('GET', `/api/inventory/${itemId}/detail`);
    assert.equal(detail.body.quantity, 10);
  });

  it('改成完成再扣一次，刪單時還原', async () => {
    const res = await request('PUT', `/api/quotations/${quotId}`, {
      customer_name: '王大明', status: 'completed', items: [{ name: 'R5', cost: 4500, price: 5990, quantity: 2, inventory_id: itemId }],
    });
    assert.equal(res.status, 200);
    assert.equal((await request('GET', `/api/inventory/${itemId}/detail`)).body.quantity, 8);

    const profit = await request('GET', '/api/reports/profit');
    assert.equal(profit.status, 200);
    assert.ok(profit.body.total.count >= 1);

    assert.equal((await request('DELETE', `/api/quotations/${quotId}`)).status, 200);
    assert.equal((await request('GET', `/api/inventory/${itemId}/detail`)).body.quantity, 10);
  });

  it('手動出貨', async () => {
    const res = await request('POST', `/api/inventory/${itemId}/stock-out`, { quantity: 6 });
    assert.equal(res.status, 200);
    assert.equal(res.body.totalCost, 5 * 4000 + 1 * 5000);
    assert.equal((await request('GET', `/api/inventory/${itemId}/detail`)).body.quantity, 4);
  });

  it('估價單統計', async () => {
    const summary = await request('GET', '/api/quotations/stats/summary');
    assert.ok(Array.isArray(summary.body));
    const monthly = await request('GET', '/api/quotations/stats/monthly');
    assert.match(monthly.body.month, /^\d{4}-\d{2}$/);
  });

  it('刪除商品', async () => {
    assert.equal((await request('DELETE', `/api/inventory/${itemId}`)).status, 200);
    assert.equal((await request('GET', `/api/inventory/${itemId}/detail`)).status, 404);
  });
});

// ========== 出機檢測表 ==========
describe('Inspection API', () => {
  it('沒存過給草稿（規格從品項帶入），存了之後讀回來一樣', async () => {
    const q = await request('POST', '/api/quotations', {
      customer_name: `檢測測試${unique}`,
      items: [
        { category: 'AM5', name: 'Ryzen 5 9600X', cost: 1, price: 1, quantity: 1 },
        { category: '記憶體', name: 'DDR5 16GB', cost: 1, price: 1, quantity: 2 },
      ],
    });
    const draft = await request('GET', `/api/quotations/${q.body.id}/inspection`);
    assert.equal(draft.status, 200);
    assert.equal(draft.body.saved, false);
    assert.match(draft.body.report.machineSpec, /CPU：Ryzen 5 9600X/); // 子分類 AM5 對到 CPU
    assert.match(draft.body.report.machineSpec, /記憶體：DDR5 16GB x2/);
    assert.ok(draft.body.report.stress.length > 5);
    assert.ok(draft.body.report.checks.some((c: any) => c.section === 'system'));

    const report = { ...draft.body.report, conclusion: 'conditional', ambientTemp: 27.5 };
    report.stress[0] = { ...report.stress[0], tempMax: 88, powerMax: 230, status: 'warn', note: '<b>偏高</b>' };
    report.checks[0] = { ...report.checks[0], status: 'bogus' };
    assert.equal((await request('PUT', `/api/quotations/${q.body.id}/inspection`, report)).status, 200);

    const again = await request('GET', `/api/quotations/${q.body.id}/inspection`);
    assert.equal(again.body.saved, true);
    assert.equal(again.body.report.conclusion, 'conditional');
    assert.equal(again.body.report.ambientTemp, 27.5);
    assert.equal(again.body.report.stress[0].tempMax, 88);
    assert.equal(again.body.report.stress[0].note, '<b>偏高</b>'); // 原樣存，畫面用 React 顯示不會變成 HTML
    assert.equal(again.body.report.checks[0].status, 'pass'); // 不合法的狀態改回預設

    // 刪訂單會一起刪檢測表
    assert.equal((await request('DELETE', `/api/quotations/${q.body.id}`)).status, 200);
    assert.equal((await request('GET', `/api/quotations/${q.body.id}/inspection`)).status, 404);
  });
});

// ========== 報價單圖片（R2） ==========
describe('Quotation images', () => {
  it('上傳、讀取、刪除', async () => {
    const q = await request('POST', '/api/quotations', { customer_name: '圖片測試', items: [] });
    const form = new FormData();
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    form.append('images', new Blob([png], { type: 'image/png' }), 'dot.png');
    const up = await fetch(new URL(`/api/quotations/${q.body.id}/images`, BASE_URL), { method: 'POST', body: form });
    assert.equal(up.status, 200);
    const [img] = await up.json();

    const get = await fetch(new URL(`/api/quotations/${q.body.id}/images/${img.filename}`, BASE_URL));
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'image/png');
    assert.equal((await get.arrayBuffer()).byteLength, png.byteLength);

    const notImage = new FormData();
    notImage.append('images', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
    const bad = await fetch(new URL(`/api/quotations/${q.body.id}/images`, BASE_URL), { method: 'POST', body: notImage });
    assert.equal(bad.status, 400);

    assert.equal((await request('DELETE', `/api/quotations/${q.body.id}/images/${img.id}`)).status, 200);
    assert.equal((await request('GET', `/api/quotations/${q.body.id}/images/${img.filename}`)).status, 404);
    assert.equal((await request('DELETE', `/api/quotations/${q.body.id}`)).status, 200);
  });
});

// ========== 客戶 ==========
describe('Customers API', () => {
  let custId: number;

  it('新增、搜尋、篩選、統計', async () => {
    const res = await request('POST', '/api/customers', {
      name: `陳小明${unique}`, phone: '0912345678', email: 'test@example.com', source: 'YouTube', city: '台北市', district: '中山區',
    });
    assert.equal(res.status, 200);
    custId = res.body.id;
    assert.equal((await request('GET', `/api/customers?search=${encodeURIComponent(unique)}`)).body.length, 1);
    assert.ok((await request('GET', '/api/customers?source=YouTube')).body.every((c: any) => c.source === 'YouTube'));
    const dist = await request('GET', '/api/customers/stats/distribution');
    assert.ok(dist.body.byCity && dist.body.bySource && dist.body.total >= 1);
  });

  it('服務紀錄', async () => {
    assert.equal((await request('POST', `/api/customers/${custId}/services`, { service_type: '組裝', description: '全新主機組裝', service_date: '2026-03-23' })).status, 200);
    const res = await request('GET', `/api/customers/${custId}`);
    assert.equal(res.body.services.length, 1);
  });

  it('更新、刪除', async () => {
    assert.equal((await request('PUT', `/api/customers/${custId}`, { name: '陳小明', source: 'Instagram', city: '新北市' })).status, 200);
    assert.equal((await request('DELETE', `/api/customers/${custId}`)).status, 200);
  });
});

// ========== 叫貨、結款 ==========
describe('訂單關聯客戶', () => {
  let customerId: number;
  let quotationId: number;

  it('訂單選了客戶：名字以客戶管理為準，列表帶電話、單筆帶客戶資料', async () => {
    const c = await request('POST', '/api/customers', { name: `關聯客戶${unique}`, phone: '0912000111', city: '高雄市', district: '前鎮區' });
    customerId = c.body.id;
    const q = await request('POST', '/api/quotations', { customer_id: customerId, customer_name: '亂打的名字', status: 'draft', items: [] });
    assert.equal(q.status, 200);
    quotationId = q.body.id;

    const list = await request('GET', `/api/quotations?customer_id=${customerId}`);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].customer_name, `關聯客戶${unique}`);
    assert.equal(list.body[0].customer_phone, '0912000111');

    const byPhone = await request('GET', '/api/quotations?search=0912000111');
    assert.ok(byPhone.body.some((x: any) => x.id === quotationId));

    const one = await request('GET', `/api/quotations/${quotationId}`);
    assert.equal(one.body.customer.phone, '0912000111');
    assert.equal(one.body.customer.order_count, 1);
  });

  it('客戶列表有訂單數，客戶詳細的訂單有品項和出貨狀態', async () => {
    const list = await request('GET', `/api/customers?search=${encodeURIComponent(`關聯客戶${unique}`)}`);
    assert.equal(list.body[0].order_count, 1);
    assert.equal(list.body[0].total_spent, 0); // 尚未成交不算
    const detail = await request('GET', `/api/customers/${customerId}`);
    assert.ok('item_title' in detail.body.quotations[0]);
    assert.ok('delivery_status' in detail.body.quotations[0]);
  });

  it('客戶改名，訂單上的名字跟著改', async () => {
    await request('PUT', `/api/customers/${customerId}`, { name: `改名客戶${unique}`, phone: '0912000111' });
    const one = await request('GET', `/api/quotations/${quotationId}`);
    assert.equal(one.body.customer_name, `改名客戶${unique}`);
  });

  it('刪掉有訂單的客戶：訂單留著、不再關聯', async () => {
    const del = await request('DELETE', `/api/customers/${customerId}`);
    assert.equal(del.status, 200);
    const one = await request('GET', `/api/quotations/${quotationId}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.customer_id, null);
    assert.equal(one.body.customer_name, `改名客戶${unique}`);
    await request('DELETE', `/api/quotations/${quotationId}`);
  });
});

describe('資安', () => {
  it('從其他網站送來會改資料的請求會被擋（CSRF）', async () => {
    const res = await fetch(new URL('/api/customers', BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ name: '不該被建立' }),
    });
    assert.equal(res.status, 403);
    const crossSite = await fetch(new URL('/api/customers', BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site' },
      body: 'name=不該被建立',
    });
    assert.equal(crossSite.status, 403);
    // 讀取不受影響
    const read = await fetch(new URL('/api/customers', BASE_URL), { headers: { Origin: 'https://evil.example' } });
    assert.equal(read.status, 200);
  });

  it('不收 SVG（可以藏程式碼）', async () => {
    const q = await request('POST', '/api/quotations', { customer_name: '資安測試', status: 'draft', items: [] });
    const form = new FormData();
    form.append('images', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'x.svg');
    const res = await fetch(new URL(`/api/quotations/${q.body.id}/images`, BASE_URL), { method: 'POST', body: form });
    assert.equal(res.status, 400);
    await request('DELETE', `/api/quotations/${q.body.id}`);
  });
});

describe('Purchases API', () => {
  it('盤商、叫貨、到貨入庫、週／月篩選', async () => {
    const sup = await request('POST', '/api/purchases/suppliers', { name: `測試盤商${unique}`, default_tax_type: 'tax_included' });
    assert.equal(sup.status, 200);
    const inv = await request('POST', '/api/inventory', { category_id: 1, name: `叫貨測試${unique}`, price: 100 });
    const order = await request('POST', '/api/purchases/orders', {
      supplier_id: sup.body.id, order_date: '2026-10-14',
      items: [{ product_name: 'A', quantity: 2, unit_price: 1050 }, { product_name: 'B', quantity: 1, unit_price: 2100 }],
    });
    assert.equal(order.status, 200);
    const detail = await request('GET', `/api/purchases/orders/${order.body.id}`);
    assert.equal(detail.body.items.length, 2);
    assert.equal(detail.body.total_amount, 4200);
    assert.equal(detail.body.tax_amount, 200);

    // 2026-10-14 是週三，同一週是 10/12（一）～10/18（日）
    const sameWeek = await request('GET', '/api/purchases/orders?week=2026-10-18');
    assert.ok(sameWeek.body.some((o: any) => o.id === order.body.id));
    const nextWeek = await request('GET', '/api/purchases/orders?week=2026-10-19');
    assert.ok(!nextWeek.body.some((o: any) => o.id === order.body.id));
    const month = await request('GET', '/api/purchases/orders?month=2026-10');
    assert.ok(month.body.some((o: any) => o.id === order.body.id));

    const receive = await request('POST', `/api/purchases/orders/${order.body.id}/receive`, {
      stock_items: [{ inventory_id: inv.body.id, quantity: 3, unit_cost: 1000 }],
    });
    assert.equal(receive.status, 200);
    const stocked = await request('GET', `/api/inventory/${inv.body.id}/detail`);
    assert.equal(stocked.body.quantity, 3);
    assert.match(stocked.body.batches[0].note, /叫貨單/);

    assert.equal((await request('GET', '/api/purchases/stats')).status, 200);

    assert.equal((await request('DELETE', `/api/purchases/orders/${order.body.id}`)).status, 200);

    // 取消叫貨：紀錄留著、狀態改成已取消；到貨只能走 /receive
    const toCancel = await request('POST', '/api/purchases/orders', { supplier_id: sup.body.id, order_date: '2026-10-14', items: [{ product_name: 'C', quantity: 1, unit_price: 500 }] });
    assert.equal((await request('PUT', `/api/purchases/orders/${toCancel.body.id}/status`, { status: 'received' })).status, 400);
    assert.equal((await request('PUT', `/api/purchases/orders/${toCancel.body.id}/status`, { status: 'cancelled' })).status, 200);
    assert.equal((await request('GET', `/api/purchases/orders/${toCancel.body.id}`)).body.status, 'cancelled');
    assert.equal((await request('DELETE', `/api/purchases/orders/${toCancel.body.id}`)).status, 200);

    assert.equal((await request('DELETE', `/api/purchases/suppliers/${sup.body.id}`)).status, 200);
    assert.equal((await request('DELETE', `/api/inventory/${inv.body.id}`)).status, 200);
  });
});

// ========== 報表 ==========
describe('Reports API', () => {
  it('維修工單編號、通知、CSV 匯出', async () => {
    const repair = await request('POST', '/api/reports/repairs', { customer_name: `維修測試${unique}`, device_name: '主機' });
    assert.match(repair.body.repair_no, /^R\d{11}$/);
    assert.equal((await request('GET', '/api/reports/notifications')).status, 200);
    const csv = await request('GET', '/api/reports/export/repairs');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') || '', /text\/csv/);
    assert.ok(String(csv.body).includes(`維修測試${unique}`));
    assert.equal((await request('DELETE', `/api/reports/repairs/${repair.body.id}`)).status, 200);
  });

  it('保固可以標記報修、改回有效', async () => {
    const w = await request('POST', '/api/reports/warranties', { product_name: `保固測試${unique}`, ship_date: '2026-01-01', warranty_months: 12 });
    assert.equal((await request('PUT', `/api/reports/warranties/${w.body.id}`, { status: 'claimed' })).status, 200);
    const list = await request('GET', '/api/reports/warranties');
    assert.equal(list.body.find((x: any) => x.id === w.body.id).status, 'claimed');
    await request('DELETE', `/api/reports/warranties/${w.body.id}`);
  });

  it('拿掉的功能回 404（LINE Notify、備份、還原、即將到期的保固）', async () => {
    assert.equal((await request('POST', '/api/reports/line-notify', { message: 'x' })).status, 404);
    assert.equal((await request('GET', '/api/reports/backup')).status, 404);
    assert.equal((await request('POST', '/api/reports/restore')).status, 404);
    assert.equal((await request('GET', '/api/reports/warranties/expiring')).status, 404);
  });
});

// ========== 設定 ==========
describe('Settings API', () => {
  it('設定值', async () => {
    assert.equal((await request('PUT', '/api/settings/test_key', { value: 'test_value' })).status, 200);
    assert.equal((await request('GET', '/api/settings/test_key')).body.value, 'test_value');
    assert.equal((await request('GET', '/api/settings/nonexistent')).body.value, '');
  });

  it('成本方法', async () => {
    assert.equal((await request('GET', '/api/inventory/cost-method')).body.method, 'fifo');
  });

  it('YouTube 金鑰只能寫、讀不到；沒設定時查詢回 configured: false', async () => {
    assert.equal((await request('GET', '/api/settings/youtube_api_key')).status, 403);
    assert.equal((await request('PUT', '/api/settings/youtube_api_key', { value: 'x' })).status, 403);
    const yt = await request('GET', '/api/settings/youtube');
    assert.equal(typeof yt.body.hasKey, 'boolean');
    assert.ok(!('apiKey' in yt.body));
    if (!yt.body.hasKey) assert.equal((await request('GET', '/api/settings/youtube/stats')).body.configured, false);
  });
});
