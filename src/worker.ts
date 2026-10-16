// Cloudflare Worker 入口：/api/* 走這裡，其他網址是前端（frontend/out，Next.js 靜態輸出）。
// 整個網站在 Cloudflare Access 後面；/api 再由 routes/auth.ts 的 authMiddleware 驗 JWT、對到使用者。
import { Router, Response, runHandlers, type Handler, type Request } from './lib/router';
import { useDatabase } from './models/database';
import authRouter, { authMiddleware } from './routes/auth';
import inventoryRouter from './routes/inventory';
import quotationsRouter from './routes/quotations';
import customersRouter from './routes/customers';
import settingsRouter from './routes/settings';
import purchasesRouter from './routes/purchases';
import reportsRouter from './routes/reports';
import publishRouter from './routes/publish';
import inspectionsRouter from './routes/inspections';

const APP_VERSION = '2.0.0';

// 跟原本 server.ts 的 app.use 一樣：前綴 → middleware + router（同一個前綴可以有好幾個 router，依序比對）
const mounts: [string, Handler[], Router[]][] = [
  ['/api/auth', [], [authRouter]],
  ['/api/inventory', [authMiddleware], [inventoryRouter]],
  // 訂單、發布到官網（:id/publish…）、出機檢測表（:id/inspection）
  ['/api/quotations', [authMiddleware], [quotationsRouter, publishRouter, inspectionsRouter]],
  ['/api/customers', [authMiddleware], [customersRouter]],
  ['/api/purchases', [authMiddleware], [purchasesRouter]],
  ['/api/reports', [authMiddleware], [reportsRouter]],
  ['/api/settings', [authMiddleware], [settingsRouter]],
];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const json = (status: number, payload: unknown): globalThis.Response =>
  new globalThis.Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/** 會改資料的請求（POST/PUT/PATCH/DELETE），而且來源不是自己網站 */
function isCrossSiteWrite(request: globalThis.Request, url: URL): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return true;
  const origin = request.headers.get('Origin');
  if (!origin || origin === url.origin) return false;
  // 本機開發：前端開發伺服器（另一個 port）把 /api 代理過來，Origin 是 localhost:5173 之類的，不算跨站
  return !(isLocalhost(url.hostname) && isLocalhost(new URL(origin).hostname));
}

const isLocalhost = (host: string): boolean => host === 'localhost' || host === '127.0.0.1';

async function readBody(request: globalThis.Request): Promise<any> {
  const type = request.headers.get('Content-Type') || '';
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  if (type.includes('application/json')) {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  return {}; // multipart 由路由自己讀 req.raw.formData()
}

async function route(request: globalThis.Request, env: Env): Promise<globalThis.Response> {
  const url = new URL(request.url);

  // 版本資訊（不需認證）
  if (url.pathname === '/api/version') {
    return json(200, { version: APP_VERSION });
  }

  // 擋跨站請求（CSRF）：會改資料的請求只接受從自己網站送出的
  if (isCrossSiteWrite(request, url)) {
    return json(403, { error: '不接受從其他網站送出的請求' });
  }

  let body: any;
  try {
    body = await readBody(request);
  } catch {
    return json(400, { error: 'JSON 格式不對' });
  }

  const req: Request = {
    method: request.method,
    path: url.pathname,
    params: {},
    query: Object.fromEntries(url.searchParams),
    body,
    headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])),
    raw: request,
    env,
  };
  const res = new Response();

  for (const [prefix, middlewares, routers] of mounts) {
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) continue;
    // 先跑 middleware（登入檢查），沒通過就回它的錯誤
    if (middlewares.length && (await runHandlers(middlewares, req, res))) return res.toResponse();
    for (const router of routers) {
      if (await router.handle(req, res, url.pathname.slice(prefix.length))) return res.toResponse();
    }
    break;
  }
  return json(404, { error: '找不到這個 API' });
}

export default {
  async fetch(request, env): Promise<globalThis.Response> {
    useDatabase(env.DB);
    let response: globalThis.Response;
    try {
      response = await route(request, env);
    } catch (error) {
      console.error(error);
      response = json(500, { error: error instanceof Error ? error.message : '伺服器錯誤' });
    }
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
    return new globalThis.Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
