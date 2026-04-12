import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

// 清除舊測試資料庫
const testDbPath = path.join(__dirname, '..', 'data', 'test.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

process.env.NODE_ENV = 'test';

let server: http.Server;
let baseUrl: string;
let adminToken: string;

interface ApiResponse {
  status: number;
  body: any;
}

function request(method: string, urlPath: string, body?: any, token?: string): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['x-token'] = token;
    const opts: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

before(async () => {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const authModule = await import('../src/routes/auth');
  const { authMiddleware } = authModule;
  app.use('/api/auth', authModule.default);
  app.use('/api/inventory', authMiddleware, (await import('../src/routes/inventory')).default);
  app.use('/api/quotations', authMiddleware, (await import('../src/routes/quotations')).default);
  app.use('/api/customers', authMiddleware, (await import('../src/routes/customers')).default);
  app.use('/api/suppliers', authMiddleware, (await import('../src/routes/suppliers')).default);
  app.use('/api/settings', authMiddleware, (await import('../src/routes/settings')).default);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const res = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
  adminToken = res.body.token;
});

after(async () => {
  if (server) server.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});

// ========== 認證測試 ==========
describe('Auth API', () => {
  it('應該拒絕錯誤的登入', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
    assert.equal(res.status, 401);
  });

  it('應該成功登入', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'admin');
  });

  it('應該拒絕未認證的請求', async () => {
    const res = await request('GET', '/api/inventory');
    assert.equal(res.status, 401);
  });

  it('取得當前使用者資料', async () => {
    const res = await request('GET', '/api/auth/me', null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'admin');
  });
});

// ========== 使用者管理測試 ==========
describe('User Management', () => {
  let testUserId: number;

  it('新增使用者', async () => {
    const res = await request('POST', '/api/auth/users', {
      username: 'testuser', password: 'test123', display_name: '測試用戶',
      role: 'user', permissions: ['dashboard', 'inventory']
    }, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
    testUserId = res.body.id;
  });

  it('取得所有使用者', async () => {
    const res = await request('GET', '/api/auth/users', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 2);
  });

  it('更新使用者權限', async () => {
    const res = await request('PUT', `/api/auth/users/${testUserId}`, {
      display_name: '測試用戶更新', role: 'user',
      permissions: ['dashboard', 'inventory', 'quotations'], is_active: 1
    }, adminToken);
    assert.equal(res.status, 200);
  });

  it('不能刪除自己', async () => {
    const users = await request('GET', '/api/auth/users', null, adminToken);
    const admin = users.body.find((u: any) => u.username === 'admin');
    const res = await request('DELETE', `/api/auth/users/${admin.id}`, null, adminToken);
    assert.equal(res.status, 400);
  });

  it('刪除使用者', async () => {
    const res = await request('DELETE', `/api/auth/users/${testUserId}`, null, adminToken);
    assert.equal(res.status, 200);
  });
});

// ========== 庫存測試 ==========
describe('Inventory API', () => {
  let itemId: number;

  it('取得分類列表', async () => {
    const res = await request('GET', '/api/inventory/categories', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 9);
  });

  it('新增庫存商品', async () => {
    const res = await request('POST', '/api/inventory', {
      category_id: 1, name: 'AMD Ryzen 5 7600X', brand: 'AMD', model: '7600X',
      spec: '6C/12T 4.7GHz', cost: 4500, price: 5990, quantity: 10, min_quantity: 3
    }, adminToken);
    assert.equal(res.status, 200);
    itemId = res.body.id;
  });

  it('取得庫存列表', async () => {
    const res = await request('GET', '/api/inventory', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
  });

  it('搜尋庫存', async () => {
    const res = await request('GET', '/api/inventory?search=AMD', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.some((i: any) => i.name.includes('AMD')));
  });

  it('取得庫存統計', async () => {
    const res = await request('GET', '/api/inventory/stats', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.summary);
  });

  it('更新庫存商品', async () => {
    const res = await request('PUT', `/api/inventory/${itemId}`, {
      category_id: 1, name: 'AMD Ryzen 5 7600X', brand: 'AMD', model: '7600X',
      spec: '6C/12T 4.7GHz', cost: 4300, price: 5790, quantity: 8, min_quantity: 3
    }, adminToken);
    assert.equal(res.status, 200);
  });

  it('刪除庫存商品', async () => {
    const res = await request('DELETE', `/api/inventory/${itemId}`, null, adminToken);
    assert.equal(res.status, 200);
  });
});

// ========== 估價單測試 ==========
describe('Quotations API', () => {
  let quotId: number;

  it('新增估價單', async () => {
    const res = await request('POST', '/api/quotations', {
      customer_name: '王大明', deposit: 5000, service_fee: 1500, note: '整機組裝',
      items: [
        { category: 'CPU', name: 'AMD R5-7600X', spec: '6C/12T', cost: 4500, price: 5990, quantity: 1 },
        { category: '顯示卡', name: 'RTX 4060 Ti', spec: '8GB', cost: 10000, price: 12800, quantity: 1 },
        { category: '記憶體', name: 'DDR5 16GB', spec: '5600MHz', cost: 1200, price: 1590, quantity: 2 },
        { category: '硬碟', name: 'NVMe 1TB', spec: 'Gen4', cost: 2000, price: 2690, quantity: 1 },
        { category: '硬碟', name: 'HDD 2TB', spec: '7200RPM', cost: 1500, price: 1990, quantity: 1 },
      ]
    }, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.quotation_no.startsWith('Q'));
    quotId = res.body.id;
  });

  it('取得所有估價單', async () => {
    const res = await request('GET', '/api/quotations', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
  });

  it('取得單一估價單含明細', async () => {
    const res = await request('GET', `/api/quotations/${quotId}`, null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.customer_name, '王大明');
    assert.equal(res.body.service_fee, 1500);
    assert.equal(res.body.items.length, 5);
  });

  it('更新估價單狀態', async () => {
    const res = await request('PUT', `/api/quotations/${quotId}`, {
      customer_name: '王大明', status: 'deposit', deposit: 10000, service_fee: 1500,
      items: [{ category: 'CPU', name: 'AMD R5-7600X', cost: 4500, price: 5990, quantity: 1 }]
    }, adminToken);
    assert.equal(res.status, 200);
  });

  it('取得估價單統計', async () => {
    const res = await request('GET', '/api/quotations/stats/summary', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('依狀態篩選', async () => {
    const res = await request('GET', '/api/quotations?status=deposit', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.every((q: any) => q.status === 'deposit'));
  });

  it('刪除估價單', async () => {
    const res = await request('DELETE', `/api/quotations/${quotId}`, null, adminToken);
    assert.equal(res.status, 200);
  });
});

// ========== 客戶管理測試 ==========
describe('Customers API', () => {
  let custId: number;

  it('新增客戶', async () => {
    const res = await request('POST', '/api/customers', {
      name: '陳小明', phone: '0912345678', email: 'test@example.com',
      source: 'YouTube', city: '台北市', district: '中山區'
    }, adminToken);
    assert.equal(res.status, 200);
    custId = res.body.id;
  });

  it('取得客戶列表', async () => {
    const res = await request('GET', '/api/customers', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
  });

  it('搜尋客戶', async () => {
    const res = await request('GET', '/api/customers?search=陳', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.some((c: any) => c.name.includes('陳')));
  });

  it('依來源篩選', async () => {
    const res = await request('GET', '/api/customers?source=YouTube', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.every((c: any) => c.source === 'YouTube'));
  });

  it('取得客戶地區分佈統計', async () => {
    const res = await request('GET', '/api/customers/stats/distribution', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.byCity);
    assert.ok(res.body.bySource);
  });

  it('新增服務紀錄', async () => {
    const res = await request('POST', `/api/customers/${custId}/services`, {
      service_type: '組裝', description: '全新主機組裝', service_date: '2026-03-23'
    }, adminToken);
    assert.equal(res.status, 200);
  });

  it('取得客戶含服務紀錄', async () => {
    const res = await request('GET', `/api/customers/${custId}`, null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.name, '陳小明');
    assert.ok(res.body.services.length >= 1);
  });

  it('更新客戶', async () => {
    const res = await request('PUT', `/api/customers/${custId}`, {
      name: '陳小明', phone: '0912345678', source: 'Instagram', city: '新北市'
    }, adminToken);
    assert.equal(res.status, 200);
  });

  it('刪除客戶', async () => {
    const res = await request('DELETE', `/api/customers/${custId}`, null, adminToken);
    assert.equal(res.status, 200);
  });
});

// ========== 盤商報價測試 ==========
describe('Suppliers API', () => {
  it('解析 Line 報價訊息', async () => {
    const res = await request('POST', '/api/suppliers/parse', {
      supplier_name: '原價屋',
      text: `AMD R5-7600X $4,590\nRTX 4060 Ti $12,800\nB760M AORUS ELITE AX $3,990\nDDR5 16GB 5600MHz $1,290\nWD SN770 1TB $2,090`
    }, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 5);
    assert.equal(res.body.parsed[0].price, 4590);
  });

  it('解析多種格式報價', async () => {
    const res = await request('POST', '/api/suppliers/parse', {
      text: `i5-13400F NT$5,490\nB660M：3290\n海韻 650W 2890元`
    }, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 2);
  });

  it('取得歷史報價', async () => {
    const res = await request('GET', '/api/suppliers/prices', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 5);
  });

  it('搜尋報價', async () => {
    const res = await request('GET', '/api/suppliers/prices?search=RTX', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.some((p: any) => p.product_name.includes('RTX')));
  });
});

// ========== 設定測試 ==========
describe('Settings API', () => {
  it('設定值', async () => {
    const res = await request('PUT', '/api/settings/test_key', { value: 'test_value' }, adminToken);
    assert.equal(res.status, 200);
  });

  it('取得設定', async () => {
    const res = await request('GET', '/api/settings/test_key', null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.value, 'test_value');
  });

  it('取得不存在的設定', async () => {
    const res = await request('GET', '/api/settings/nonexistent', null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.value, '');
  });
});
