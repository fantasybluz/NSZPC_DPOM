// 很小的 Express 相容層：讓原本 routes/*.ts 的寫法（router.get(path, (req, res) => ...)、req.params、
// res.status().json()）幾乎不用改就能跑在 Cloudflare Worker 上。只做了這個專案用到的部分。

import type { SessionData } from '../types';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  data: ArrayBuffer;
}

export interface Request {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string>;
  user?: SessionData;
  /** multipart/form-data 上傳的檔案（欄位名稱 → 檔案） */
  files?: UploadedFile[];
  /** 原本的 Fetch Request（讀 formData 等） */
  raw: globalThis.Request;
  env: Env;
}

export class Response {
  statusCode = 200;
  readonly headers = new Headers();
  body: BodyInit | null = null;
  finished = false;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  json(payload: unknown): this {
    this.headers.set('Content-Type', 'application/json; charset=utf-8');
    this.body = JSON.stringify(payload ?? null);
    this.finished = true;
    return this;
  }

  send(body: BodyInit): this {
    if (!this.headers.has('Content-Type')) {
      this.headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
    this.body = body;
    this.finished = true;
    return this;
  }

  toResponse(): globalThis.Response {
    return new globalThis.Response(this.body, { status: this.statusCode, headers: this.headers });
  }
}

export type NextFunction = () => void;
export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

interface Route {
  method: string;
  segments: string[];
  handlers: Handler[];
}

const splitPath = (path: string): string[] => path.split('/').filter(Boolean);

const matchSegments = (pattern: string[], actual: string[]): Record<string, string> | null => {
  if (pattern.length !== actual.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const segment = pattern[i];
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(actual[i]);
    } else if (segment !== actual[i]) {
      return null;
    }
  }
  return params;
};

/** 依序跑 handler（middleware 叫 next() 才往下），回傳是不是有人回應了 */
export const runHandlers = async (handlers: Handler[], req: Request, res: Response): Promise<boolean> => {
  for (const handler of handlers) {
    let calledNext = false;
    await handler(req, res, () => {
      calledNext = true;
    });
    if (res.finished) {
      return true;
    }
    if (!calledNext) {
      return res.finished;
    }
  }
  return res.finished;
};

export class Router {
  private readonly routes: Route[] = [];

  private add(method: string, path: string, handlers: Handler[]): this {
    this.routes.push({ method, segments: splitPath(path), handlers });
    return this;
  }

  get(path: string, ...handlers: Handler[]): this {
    return this.add('GET', path, handlers);
  }

  post(path: string, ...handlers: Handler[]): this {
    return this.add('POST', path, handlers);
  }

  put(path: string, ...handlers: Handler[]): this {
    return this.add('PUT', path, handlers);
  }

  delete(path: string, ...handlers: Handler[]): this {
    return this.add('DELETE', path, handlers);
  }

  /** 跟 Express 一樣照註冊順序比對；比對到就跑，回傳是不是有人回應了 */
  async handle(req: Request, res: Response, subPath: string): Promise<boolean> {
    const actual = splitPath(subPath);
    for (const route of this.routes) {
      if (route.method !== req.method) {
        continue;
      }
      const params = matchSegments(route.segments, actual);
      if (!params) {
        continue;
      }
      req.params = params;
      if (await runHandlers(route.handlers, req, res)) {
        return true;
      }
    }
    return false;
  }
}
