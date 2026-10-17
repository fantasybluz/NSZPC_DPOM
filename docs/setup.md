# 設定與部署

## 本機開發

需要 Node.js 22 以上（CI 用 22）。

```bash
npm install
npm --prefix frontend install
cp .dev.vars.example .dev.vars   # DEV_USER_EMAIL：本機不經過 Access，直接當這個 email 登入
npm run build                    # 先 build 前端，Worker 才有 frontend/out 可以回
npm run dev                      # 先套用本機 D1 的 migration，再開 http://localhost:8787
```

- `DEV_USER_EMAIL` 要在 `wrangler.jsonc` 的 `BOOTSTRAP_ADMIN_EMAILS` 裡，第一次打 API 時會自動建成管理員；只有網址是 localhost 才有效
- 本機的 D1、R2 存在 `.wrangler/state/`，刪掉就是清空。`npm run dev` 用 `wrangler d1 migrations apply nszpc-dpom --local`，
  如果自己用 `--persist-to` 換了存放位置，migration 也要加一樣的 `--persist-to`，不然套到另一份資料庫
- 改前端時另外開 `npm run dev:web`（Next.js 開發模式，http://localhost:3000，`/api` 轉到 8787），改了會自動重新整理
- 改了 `wrangler.jsonc` 的綁定要跑 `npm run cf-typegen`，更新 `worker-configuration.d.ts`

### 跟官網一起跑（測「發布到官網」）

`WEBSITE` 是 service binding，綁的是官網的 Worker `nszpc`（repo `nszpc_web`，放在旁邊的資料夾）。只開 DPOM 的話發布會失敗。
用 wrangler 的多 Worker 模式一次開兩個：

```bash
npx wrangler d1 migrations apply nszpc-dpom --local
npx wrangler dev -c wrangler.jsonc -c ../nszpc_web/wrangler.jsonc
```

第一個 `-c` 是主要的（開在 8787），第二個只給 RPC 叫。官網本機的資料庫要先在 `nszpc_web` 那邊套好 migration。

## 測試

```bash
npm run test:docs     # 文件和版號：不用開伺服器（tests/docs.test.ts、tests/version.test.ts）
npm test              # 全部，包含 API 整合測試（tests/api.test.ts）：要先在另一個終端機 npm run dev
BASE_URL=http://localhost:8788 npm test   # Worker 不在 8787 的話
```

- `tests/api.test.ts` 直接打本機 Worker，會在本機資料庫建測試資料（名稱帶時間戳），用 `DEV_USER_EMAIL` 登入
- 發布到官網的測試要用上面的多 Worker 模式開

## 部署

```bash
npx wrangler login   # 第一次
npm run deploy       # = npm run check（型別檢查 + 文件測試 + 前端 build）→ 正式 D1 migration → wrangler deploy
```

- 在本機部署，GitHub Actions（`.github/workflows/ci-cd.yml`）只在推到 `main`、`cloudflare` 和 PR 時跑 `npm run check`，不部署
- 部署前確認：`npm run check` 過、`npm test`（開著 `npm run dev`）過、CHANGELOG 寫了（見 [RELEASING.md](../RELEASING.md)）
- 官網那邊的 `WebsiteAPI` 介面改了的話，**先部署官網**，再部署 DPOM

## Cloudflare 的資源

都已經建好，id 在 `wrangler.jsonc`：

| 資源 | 名稱 | 用途 |
|---|---|---|
| Worker | `nszpc-dpom` | 前端 + API |
| D1 | `nszpc-dpom`（binding `DB`） | 資料 |
| R2 | `nszpc-dpom-uploads`（binding `UPLOADS`） | 訂單照片 |
| Service binding | `WEBSITE` → Worker `nszpc` 的 `WebsiteAPI` | 發布到官網 |
| 自訂網域 | `dpom.bluz.dev`（`routes` 的 `custom_domain: true`） | 正式網址 |

- `workers_dev: false`、`preview_urls: false`：`*.workers.dev` 和預覽網址前面沒有 Access，所以關掉，只留正式網址
- `vars`（不是秘密，直接寫在 `wrangler.jsonc`）：

  | 變數 | 內容 |
  |---|---|
  | `ACCESS_TEAM_DOMAIN` | Zero Trust 的 team domain（`old-fog-9482.cloudflareaccess.com`） |
  | `ACCESS_AUD` | Access 應用的 Application Audience (AUD) Tag；沒設的話 API 一律 503 |
  | `BOOTSTRAP_ADMIN_EMAILS` | 第一次登入自動建成管理員的 email，逗號分隔 |
  | `WEBSITE_URL` | 官網網址（`https://nszpc.bluz.dev`），發布後的連結用 |

- 沒有 secret。YouTube API 金鑰由管理員在「社群設定」填，存在 D1 的 `settings`
- `.dev.vars` 只給本機用（`DEV_USER_EMAIL`），不會部署上去

## Cloudflare Access（登入）

Cloudflare 後台 › Zero Trust › Access › Applications：

1. Add an application › **Self-hosted**，名稱 `nszpc-dpom`
2. Public hostname：`dpom.bluz.dev`，**path 留空**（整個網站都要登入，包括 `/api`）
3. Policy：Action **Allow**，Include › **Emails** 填所有要用系統的人
4. 登入方式：Zero Trust › Settings › Authentication 打開 **One-time PIN**（輸入 email 收驗證碼）。
   客人、員工不一定有 Cloudflare 或 Google 帳號，用 One-time PIN 誰都能登入
5. 拿 AUD：應用的 Overview 頁有 **Application Audience (AUD) Tag**（或打開網站被轉去登入頁時，網址裡 `kid=` 後面那串），
   填進 `wrangler.jsonc` 的 `ACCESS_AUD`，再 `npm run deploy`

`ACCESS_TEAM_DOMAIN` 是 Zero Trust › Settings › Custom Pages 上面的 team domain（`<名稱>.cloudflareaccess.com`）。

## 加使用者

兩邊都要加，**少一邊都進不來**（[ADR 0002](decisions/0002-cloudflare-access.md)）：

1. Cloudflare Zero Trust：Access 應用 `nszpc-dpom` 的 Policy › Include › Emails 加上他的 email
2. DPOM：管理員在「權限管理」按新增，填**同一個 email**、顯示名稱、角色，勾他能看的頁面

只做了 1：看得到網站，但畫面顯示「xxx 還沒開通」。只做了 2：Cloudflare 不讓他登入。

離職：「權限管理」把帳號停用或刪掉，**並且**從 Access 的允許清單拿掉。

## 備份與還原

- D1 自動保留 **30 天**內任一時間點（Time Travel），不用另外設定：

  ```bash
  npx wrangler d1 time-travel info nszpc-dpom                                         # 看現在的書籤
  npx wrangler d1 time-travel restore nszpc-dpom --timestamp=2026-10-16T10:00:00+08:00 # 整個資料庫還原到那個時間
  ```

  還原會蓋掉那個時間之後的所有資料，先確認時間
- 要留一份檔案：`npm run db:backup`（匯出成 `backup.sql`，已在 `.gitignore`，不要 commit，裡面有客戶資料）
- R2 的照片沒有自動備份；刪訂單、刪照片會真的刪掉

## 換網域

客人有自己的網域時：

1. 網域要在同一個 Cloudflare 帳號
2. `wrangler.jsonc` 的 `routes` 改成新網域，`npm run deploy`
3. Access 應用的 Public hostname 改成新網域（AUD 不變；新建一個應用的話 AUD 會變，要改 `ACCESS_AUD`）
4. 官網也換網域的話：`WEBSITE_URL` 和 `frontend/src/components/layout/Sidebar.tsx` 的 `WEBSITE_ADMIN_URL`
