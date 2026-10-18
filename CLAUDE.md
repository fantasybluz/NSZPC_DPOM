# 星辰電腦 NSZPC 管理系統（DPOM）

星辰電腦（客製化電腦組裝店）的內部管理系統：庫存、訂單（報價）、客戶、叫貨結款、售後、社群數字。
一個 Cloudflare Worker：API 在 `src/`（D1 + R2），前端是 `frontend/`（Next.js 靜態輸出），整個網站在 Cloudflare Access 後面。
網址 https://dpom.bluz.dev，部署用 `cloudflare` 分支。官網是另一個 repo `nszpc_web`（Worker `nszpc`），完成的訂單用 Workers RPC 發布過去。

先讀 [docs/README.md](docs/README.md)，需求在 [docs/requirements.md](docs/requirements.md)，架構在 [docs/architecture.md](docs/architecture.md)，API 在 [docs/api.md](docs/api.md)。

## 指令

- `npm run dev`：本機 Worker（http://localhost:8787，先套用本機 D1 migration）；前端要先 `npm run build`。`.dev.vars` 的 `DEV_USER_EMAIL` 是本機登入的人
- `npm run dev:web`：前端開發模式（http://localhost:3000，`/api` 轉到 8787）
- 測發布到官網：`npx wrangler dev -c wrangler.jsonc -c ../nszpc_web/wrangler.jsonc`
- `npm run test:docs`：文件一致性和版號（不用開伺服器）；`npm test`：全部，API 整合測試要先開 `npm run dev`
- `npm run check`：型別檢查 + `test:docs` + 前端 build；**commit 前要過**
- `npm run deploy`：`check` → 正式 D1 migration → `wrangler deploy`（只在使用者要求時才部署）

## 改程式時，同一個 commit 要一起改的文件

| 改了什麼 | 要改 |
|---|---|
| 新增、刪除、改 API（`src/routes/*.ts`、`src/worker.ts` 的 `mounts`） | `docs/api.md` 對應的 `### \`METHOD /api/...\`` 段落（測試會比對） |
| 資料表 | 新增 `migrations/000X_*.sql`（不要改已部署的），更新 `docs/architecture.md` 的資料表段落（測試會檢查） |
| 功能、業務規則（狀態、扣庫存、限制、權限） | `docs/requirements.md` |
| 使用者看得到的改動 | `CHANGELOG.md` 的「## 未發佈」；操作方式變了也改 `docs/GUIDE.md` |
| 環境變數、綁定、部署方式、Cloudflare 設定 | `docs/setup.md`，並跑 `npm run cf-typegen` |
| 跟官網的 RPC 介面（`src/routes/publish.ts`） | `nszpc_web/backend/src/rpc.ts` 也要改，`docs/architecture.md` 的「發布到官網」 |
| 重要的技術選擇 | `docs/decisions/` 新增一份 ADR（背景、決定、代價） |

## 慣例

- 註解、文件、commit 訊息用繁體中文；錯誤訊息（`{ error }`）會直接顯示給使用者，要寫成看得懂的話
- **D1 免費方案一個請求最多 50 個查詢（batch 裡每句都算）、一句最多 100 個參數**：
  多筆寫入用 `json_each(?)` 一句寫完，一串 id 用 `IN (SELECT value FROM json_each(?))`，不要在迴圈裡 `pool.query`；
  分類用 `loadCategories()` 一次讀完在記憶體算；要一起成功或失敗的寫入放進同一個 `pool.batch`
- SQL 可以用 pg 的寫法（`$1`、`NOW()`），但不能用 PostgreSQL 專用語法；「今天」「這個月」用台灣時間（`taipeiDate()`、`taipeiMonthSql()`），不要用 `new Date().toISOString()`
- 路由照註冊順序比對：固定路徑（`/stats/xxx`、`/reorder`）寫在 `/:id` 前面
- 只有管理員能做的事，後端掛 `adminOnly`（`src/routes/auth.ts`），不要只在前端藏按鈕
- 頁面權限：寫入要權限、讀取只要登入（[ADR 0010](docs/decisions/0010-page-permissions-backend.md)）。新的 API 前綴在 `worker.ts` 的 `mounts` 掛 `writeRequires('權限')`；
  新的設定 key 要加進 `settings.ts` 的 `WRITABLE_KEYS`；權限 id 前後端同一組（`src/types/auth.ts`、`frontend/src/lib/constants.ts`），改了要寫 migration 換掉 `users.permissions` 裡的舊 id
- 庫存數量、平均成本只能透過批次改（`stockIn`、`stockOut`、`deductQuotationStock`、`restoreQuotationStock`），不要直接 `UPDATE inventory SET quantity`
- 會改資料的請求只接受同網站送出的（`worker.ts` 的 `isCrossSiteWrite`）；上傳只收點陣圖，不收 SVG
- 送到官網的資料不能有客人資料（姓名、電話、地址）、成本、服務費
- **介面照 [DESIGN.md](DESIGN.md)**（Apple 風格）：寫 UI 前先看。新樣式寫在 `frontend/src/styles/apple.css`（疊在 Bootstrap 和 `globals.css` 上），不要改 `globals.css`；
  強調色只有 `#0066cc`，不要加新的介面顏色
- **手機版、電腦版都要好用**：新的頁面、表格、Modal 要在 393px 和 1440px 寬都看過；表格外面包可以左右滑的容器
- 前端打 API 一律用 `frontend/src/lib/api.ts`；報價單、檢測表的匯出在瀏覽器做（`lib/docExport.ts`），不要搬到 Worker
- 不要 commit `.dev.vars`、`backup.sql`、`data/`、`dist/`、`frontend/out/`
