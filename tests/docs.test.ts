// 文件跟程式碼要一致：改了 API、資料表卻忘了改文件，這裡會失敗。
// 不用開伺服器（直接讀原始碼），npm run test:docs、npm run check 都會跑。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** 從 src/worker.ts 的 mounts 和 src/routes/*.ts 的 router.get/post/put/delete 拼出所有 API */
function registeredRoutes(): string[] {
  const worker = read('src/worker.ts');

  // import inventoryRouter from './routes/inventory'; import authRouter, { authMiddleware } from './routes/auth';
  const fileOf = new Map<string, string>();
  for (const m of worker.matchAll(/^import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s+from\s+'\.\/routes\/([\w-]+)';/gm)) {
    fileOf.set(m[1], `src/routes/${m[2]}.ts`);
  }

  // ['/api/quotations', [authMiddleware], [quotationsRouter, publishRouter, inspectionsRouter]],
  const block = /const mounts[^=]*=\s*\[([\s\S]*?)\n\];/.exec(worker)?.[1];
  assert.ok(block, 'src/worker.ts 找不到 mounts');
  const routes: string[] = [];
  const mounts = [...block.matchAll(/\[\s*'(\/api[^']*)'\s*,\s*\[[^\]]*\]\s*,\s*\[([^\]]+)\]\s*\]/g)];
  assert.ok(mounts.length > 0, 'src/worker.ts 的 mounts 解析不出來');
  for (const [, prefix, routerList] of mounts) {
    for (const name of routerList.split(',').map((s) => s.trim()).filter(Boolean)) {
      const file = fileOf.get(name);
      assert.ok(file, `src/worker.ts 的 ${name} 找不到是哪個 routes 檔`);
      for (const r of read(file).matchAll(/\brouter\.(get|post|put|delete)\(\s*'([^']*)'/g)) {
        const path = r[2] === '/' ? '' : r[2];
        routes.push(`${r[1].toUpperCase()} ${prefix}${path}`);
      }
    }
  }

  // worker.ts 自己處理的（例如 /api/version）
  for (const m of worker.matchAll(/url\.pathname === '(\/api\/[^']+)'/g)) routes.push(`GET ${m[1]}`);
  return routes;
}

describe('docs/api.md', () => {
  it('列出的 API 跟實際註冊的路由一模一樣', () => {
    const documented = [...read('docs/api.md').matchAll(/^### `(GET|POST|PUT|PATCH|DELETE) (\/api\S*)`$/gm)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    const routes = registeredRoutes();
    assert.equal(new Set(documented).size, documented.length, 'api.md 有重複的標題');
    const missing = routes.filter((r) => !documented.includes(r));
    const extra = documented.filter((r) => !routes.includes(r));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] },
      'missing：程式有、api.md 沒寫；extra：api.md 有、程式沒有');
  });
});

describe('docs/architecture.md', () => {
  it('每張資料表都有說明（被 DROP TABLE 刪掉的不算）', () => {
    const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    const tables = new Set<string>();
    for (const f of files) {
      const sql = read(`migrations/${f}`).replace(/--.*$/gm, '');
      // 照檔案順序：先建、後刪
      for (const m of sql.matchAll(/\b(CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["`]?(\w+)/gi)) {
        if (m[1].toUpperCase() === 'CREATE') tables.add(m[2]);
        else tables.delete(m[2]);
      }
    }
    assert.ok(tables.size > 0, 'migrations/ 解析不到資料表');
    const doc = read('docs/architecture.md');
    const missing = [...tables].filter((t) => !doc.includes(`\`${t}\``));
    assert.deepEqual(missing, [], 'architecture.md 沒有提到這些資料表');
  });
});

describe('文件裡的相對連結', () => {
  it('都連得到存在的檔案', () => {
    const docs = ['README.md', 'CLAUDE.md', 'RELEASING.md', ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
      ...readdirSync(join(root, 'docs/decisions')).filter((f) => f.endsWith('.md')).map((f) => `docs/decisions/${f}`)];
    const broken: string[] = [];
    for (const doc of docs) {
      const text = read(doc).replace(/```[\s\S]*?```/g, '');
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target)) continue; // 網址、#錨點
        if (!existsSync(join(root, dirname(doc), decodeURI(target)))) broken.push(`${doc} → ${m[1]}`);
      }
    }
    assert.deepEqual(broken, []);
  });
});
