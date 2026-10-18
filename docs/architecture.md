# 架構

## 整體

```
瀏覽器
   │  https://dpom.bluz.dev
   ▼
Cloudflare Access（Zero Trust）── 沒登入、email 不在允許清單 → 擋在這裡，連頁面都看不到
   │  帶著 Cf-Access-Jwt-Assertion（Access 簽的 JWT）
   ▼
Cloudflare Worker「nszpc-dpom」
   ├─ /api/*  → src/worker.ts（REST API）── D1「nszpc-dpom」（資料）
   │                                     ├─ R2「nszpc-dpom-uploads」（訂單照片）
   │                                     ├─ service binding WEBSITE → 官網 Worker「nszpc」的 WebsiteAPI（發布出機紀錄）
   │                                     └─ 對外：YouTube Data API、Access 的公鑰（/cdn-cgi/access/certs）
   └─ 其他網址 → frontend/out（Next.js 靜態輸出）
```

- **一個 Worker 同時回前端和 API**：`wrangler.jsonc` 的 `assets.directory: "frontend/out"`、`run_worker_first: ["/api/*"]`。
  同網域，不用 CORS，Access 的 cookie 也是第一方的
- **整個網站都在 Cloudflare Access 後面**（內部系統），`workers_dev`、`preview_urls` 關掉（那兩個網址前面沒有 Access）
- 原本是 Express + PostgreSQL + K8s，2026-10-16 搬到 Cloudflare（[ADR 0001](decisions/0001-cloudflare-workers.md)）。
  搬的時候盡量不改 routes 的寫法，所以有 Express 相容層和 pg 寫法的 SQL 轉換

| 資料夾 | 內容 |
|---|---|
| `src/worker.ts` | Worker 入口：`/api/version`、擋跨站請求、讀 body、照 `mounts` 分給各 router、加安全性標頭 |
| `src/lib/` | `router.ts` Express 相容層、`access.ts` 驗 Access 的 JWT、`specs.ts` 品項 → 主機規格、`inspection.ts` 檢測表的型別和預設項目 |
| `src/routes/` | 各功能的 API：`auth`、`inventory`、`quotations`、`publish`、`inspections`、`customers`、`purchases`、`reports`、`settings` |
| `src/models/database.ts` | D1 存取（`pool.query`、`pool.batch`）、台灣時間工具、分類工具、進出貨和扣庫存 |
| `src/types/` | 後端的型別（使用者、客戶、訂單） |
| `migrations/` | D1 資料表（`wrangler d1 migrations`） |
| `frontend/` | Next.js 前端（`src/app/(main)/` 各頁、`components/`、`lib/api.ts`、`styles/`），`npm run build` 輸出到 `frontend/out` |
| `tests/` | `api.test.ts` 打本機 Worker 的整合測試、`docs.test.ts` 文件一致性、`version.test.ts` 版號 |

## Worker 和路由

[`src/worker.ts`](../src/worker.ts) 的 `mounts` 是「前綴 → middleware → router」，跟原本 `app.use('/api/xxx', authMiddleware, router)` 一樣：

| 前綴 | middleware | router |
|---|---|---|
| `/api/auth` | 無（每支路由自己掛 `authMiddleware`） | `routes/auth.ts` |
| `/api/inventory` | `authMiddleware` | `routes/inventory.ts`（庫存、分類） |
| `/api/quotations` | `authMiddleware` | `routes/quotations.ts`、`publish.ts`、`inspections.ts`（同一個前綴，依序比對） |
| `/api/customers`、`/api/purchases`、`/api/reports`、`/api/settings` | `authMiddleware` | 同名的檔案 |

[`src/lib/router.ts`](../src/lib/router.ts) 是很小的 Express 相容層：`router.get/post/put/delete(path, ...handlers)`、`req.params`、`req.query`、`req.body`、
`res.status().json()`、`res.send()`、`next()`。路徑比對是一段一段比（`:id` 是參數），**照註冊順序**，所以固定路徑要寫在 `/:id` 前面
（例如 `/categories/reorder`、`/stats/summary`、`/youtube`）。body 由 `worker.ts` 先讀好（JSON、urlencoded），multipart 由路由自己讀 `req.raw.formData()`。
程式丟出的錯誤由 `worker.ts` 接住，回 500 `{ error: 訊息 }`。

## 資料表

定義在 [`migrations/`](../migrations/)，改資料表要**新增**一個 migration（`0007_xxx.sql`），不要改已經部署過的。
`npm run dev` 會套用本機的，`npm run deploy` 會套用正式的。

時間欄位存 UTC 的 ISO 字串（`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`，跟原本 PostgreSQL 轉成 JSON 的格式一樣）；日期欄位存 `YYYY-MM-DD`。
「今天」「這個月」用台灣時間（`taipeiDate()`、`taipeiMonthSql()`）。金額都是整數（新台幣），只有 `inventory.avg_cost` 是小數。

| 資料表 | 內容 |
|---|---|
| `categories` | 商品分類樹：`parent_id`（null 是第一層，外鍵 CASCADE）、`name`（同一層不能重複）、`icon`（Bootstrap Icons 的名稱）、`sort_order`。層數不限，`0002_seed.sql` 建了 9 個第一層和子分類（CPU › AMD › AM5 等） |
| `inventory` | 商品：分類（只能放在最末端分類）、品名、品牌、規格、售價 `price`、`quantity`、`min_quantity`（低庫存警示）、`avg_cost`。`quantity`、`avg_cost` 由批次重算，不直接改 |
| `inventory_batches` | 進貨批次：單價 `unit_cost`、進貨量 `quantity`、剩下 `remaining`、來源、日期 `batch_date`。扣庫存從這裡扣 |
| `inventory_logs` | 庫存異動紀錄：`type`（`in`／`out`）、`change_qty`（出貨是負數）、單價、總成本、原因（「進貨 (盤商)」「訂單扣帳 #12」「訂單還原 #12」…）、哪個批次 |
| `customers` | 客戶：姓名、電話、email、來源（YouTube、Instagram、Line、門市、朋友介紹、其他）、縣市、區域、地址、備註 |
| `service_records` | 客戶的服務紀錄：類型、說明、日期 |
| `quotations` | 訂單（原本叫估價單）：單號 `quotation_no`（`Q` + 日期 + 流水號）、`customer_id`（可以是 null）、`customer_name`（訂單上存一份，客戶改名時跟著改）、`status`、訂金、服務費、`total_cost`、`total_price`（含服務費）、品項標題、需求地區、出貨日、出貨進度、`stock_deducted`（現在有沒有扣著庫存）、`website_order_id`（發布到官網的那筆 id，0004 加的）。`qc_data` 在 0006 刪掉了 |
| `quotation_items` | 訂單品項：分類名稱（存文字，不是 id）、品名、規格、成本、售價、數量、`inventory_id`（從庫存選的才有，扣庫存用；沒有外鍵） |
| `quotation_stock_deductions` | 每張訂單從哪個批次扣了多少、當時單價。還原時照這裡加回去 |
| `quotation_images` | 訂單照片：`filename` 是 R2 的 key `uploads/<filename>`、原始檔名 |
| `inspections` | 出機檢測表（0005）：一張訂單一份（`quotation_id` UNIQUE），報告編號、測試日期、客戶、機器規格、OS、測試人員、室溫、`stress`（高壓測試，JSON 陣列）、`checks`（逐項檢查，JSON 陣列）、結論（`pass`／`conditional`／`fail`）、備註 |
| `suppliers` | 盤商：名稱（不能重複）、結款方式 `payment_type`（`weekly`／`monthly`／`cod`）、預設稅別 `default_tax_type`、聯絡方式 |
| `purchase_orders` | 叫貨單：盤商、稅別、小計、稅額、總額、`status`（`pending` 待到貨／`received` 已到貨／`cancelled` 已取消）、訂購日 |
| `purchase_order_items` | 叫貨明細：品名、品牌、規格、數量、單價（跟庫存商品沒有關聯，到貨時才選要入哪個商品） |
| `settlements` | 跟盤商的結款：稅別、小計、稅額、金額、期間、`status`（`unpaid`／`paid`）、付款日 |
| `warranties` | 保固：關聯訂單、客戶（都可以是 null）、品名、序號、出貨日、月數（預設 12）、到期日、`status`（`active`／`claimed`，「已過期」不存，前端算） |
| `repair_orders` | 維修工單：單號（`R` + 日期 + 流水號）、客戶、保固、訂單、設備、序號、問題、診斷、處理方式、狀態、優先度、費用、收件日、完成日 |
| `repair_logs` | 維修進度：每次改狀態記一筆 |
| `settings` | key-value 設定：`cost_method`（`fifo`／`average`）、`quote_doc`（報價單的店家資訊，JSON）、`youtube_api_key`、`youtube_channel_id`、`youtube_stats`（快取）、`ig_*` |
| `users` | 登入的人：`email`（UNIQUE、不分大小寫，對 Cloudflare Access 的 email）、`username`（跟 email 一樣）、顯示名稱、`role`（`admin`／`user`）、`permissions`（頁面 id 的 JSON 陣列）、`is_active`。**不存密碼** |

拿掉的：`supplier_prices`（盤商報價，0001 建、0003 刪，[ADR 0004](decisions/0004-remove-supplier-quotes.md)）。

## D1 的限制（改程式時一定要注意）

[`src/models/database.ts`](../src/models/database.ts) 開頭有寫。Workers 免費方案：

- **一個請求最多 50 個查詢**，`pool.batch` 裡每一句都算。所以不能「一筆資料一個查詢」：
  - 多筆寫入用 `json_each(?)` 一句寫完：訂單品項（`insertQuotationItems`）、叫貨明細、進貨（`stockInMany` 不管幾項都是 3 個查詢）、分類排序
  - 分類一次讀全部、在記憶體算路徑和子分類（`loadCategories`、`categoryPath`、`descendantIds`），不要一層一層查
  - 扣庫存、還原庫存：先一次讀出要動的資料，在 JS 算好，再用一個 `pool.batch` 寫回去
  - 檢測表的高壓測試和檢查項目存成 JSON 欄位，不是一列一個
- **一句 SQL 最多 100 個綁定參數**：一串 id 不要展開成 `IN (?, ?, ...)`，用 `IN (SELECT value FROM json_each(?))` 傳一個 JSON 字串
- `pool.batch` 是同一個交易，有一句失敗全部回滾；兩次 `pool.query` 之間**不是**交易
- SQL 可以照 pg 的寫法：`pool.query` 會把 `$1` 換成 `?1`、`NOW()` 換成 ISO 時間；布林存 1/0、物件自動 `JSON.stringify`。
  PostgreSQL 專用的語法（`to_char`、`::date`、`ILIKE`、`RETURNING` 以外的擴充）不能用：年月用 `taipeiMonthSql()`、ISO 週用 `isoWeekRange()`
- D1 會檢查外鍵：刪資料要照順序先刪（或先把參照設成 null）

## 登入（Cloudflare Access）

網站不存密碼（[ADR 0002](decisions/0002-cloudflare-access.md)）：

1. 瀏覽器打開 `dpom.bluz.dev`，Cloudflare Access 先要求登入：輸入 email、收驗證碼（One-time PIN）。只有 Access 允許清單裡的 email 進得來
2. 通過後，每個請求都帶 `Cf-Access-Jwt-Assertion`（Access 用私鑰簽的 JWT）
3. [`src/lib/access.ts`](../src/lib/access.ts) 的 `verifyAccessJwt` 自己再驗一次：只收 RS256、`kid` 對得到 `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` 的公鑰、
   `iss` 是自己的 team domain、`aud` 有 `ACCESS_AUD`、沒過期（容許 30 秒誤差）、要有 email（service token 不收）。
   公鑰快取在 isolate 裡，遇到不認得的 `kid` 才重抓，最多一分鐘一次
4. [`src/routes/auth.ts`](../src/routes/auth.ts) 的 `authMiddleware` 用 email（轉小寫）找 `users`：
   - 找不到、但在 `BOOTSTRAP_ADMIN_EMAILS`（`wrangler.jsonc`，逗號分隔）裡：自動建成管理員，有全部頁面權限
   - 找不到：403「xxx 還沒開通」；`is_active = 0`：403「這個帳號已停用」
   - 找到：`req.user` = `{ userId, email, username, displayName, role, permissions }`
5. 前端 [`AuthContext`](../frontend/src/contexts/AuthContext.tsx) 只打 `GET /api/auth/me`，不存 token。登出是轉到 `/cdn-cgi/access/logout`。
   API 回 401 或 fetch 失敗（Access 過期時會被轉去跨網域的登入頁）時整頁重新整理，一分鐘最多一次

所以就算 Access 的設定哪天被改錯或拿掉，沒有正確 JWT 的請求在 Worker 這裡還是進不來。`ACCESS_AUD` 沒設定時 API 一律回 503。

**本機開發**：網址是 `localhost`／`127.0.0.1`，而且 `.dev.vars` 有 `DEV_USER_EMAIL` 時，直接當這個 email 登入（不驗 JWT）。正式網址不是 localhost，設了也沒用。

**權限**：

- `role = admin`：全部頁面。後端用 `adminOnly` 擋的：使用者管理（`/api/auth/users*`）、分類的新增修改刪除排序、YouTube 金鑰設定（`PUT /api/settings/youtube`）
- `role = user`：側欄只顯示 `permissions` 勾選的頁面（`frontend/src/lib/constants.ts` 的 `NAV_ITEMS`：儀表板和報表/售後都看 `dashboard`、叫貨管理看 `suppliers`、社群設定看 `youtube`）；
  分類管理、權限管理只有管理員看得到
- **頁面權限只在前端**：後端不檢查 `permissions`，登入的人打 API 都拿得到資料（只有上面 `adminOnly` 的會擋）

## 扣庫存（FIFO）

[`src/models/database.ts`](../src/models/database.ts)：

- **庫存數量和平均成本**由批次算：`quantity` = 所有批次 `remaining` 的和，`avg_cost` = Σ(`remaining × unit_cost`) / Σ`remaining`（`recalcStatement`，一句處理多個商品）
- **進貨**（手動進貨、新增商品的初始庫存、叫貨到貨）：每個商品建一個批次、記一筆 `in`、重算
- **手動出貨**（`stockOut`）：`settings.cost_method` 是 `fifo` 時照 `batch_date`、`id` 從最舊的批次扣，成本是各批次單價 × 扣的量；
  `average` 照 `id` 扣批次，成本是 `avg_cost × 數量`
- **訂單扣帳**（`deductQuotationStock`）：訂單狀態變成 `deposit`、`pending`、`completed` 時，品項有 `inventory_id` 的從批次扣，
  **跟手動出貨一樣看 `cost_method`**：`fifo` 照 `batch_date`、`id` 扣，每個批次記一筆異動（成本 = 批次單價）；`average` 照 `id` 扣，每個品項記一筆異動（成本 = `avg_cost × 數量`，`batch_id` 是 null）。
  `quotation_stock_deductions` 兩種都記每個批次扣了多少、批次自己的單價（還原用）：
  1. 一個 batch 讀出相關商品和它們還有剩的批次
  2. 先檢查：同一個商品的需求量加總（兩列扣同一個商品也算得對），大於現有數量就丟「庫存不足：品名（需要 N，目前 M）」，什麼都不寫
  3. 在 JS 分配每個批次扣多少（同一個批次被兩列扣到會先加總，因為 `UPDATE` 每列只套用一次）
  4. 一個 batch 寫：扣批次、`quotation_stock_deductions`、異動紀錄、重算、`stock_deducted = 1`
  - 商品已經被刪掉、或沒有批次的品項跳過，不擋
- **還原**（`restoreQuotationStock`）：照 `quotation_stock_deductions` 把量加回原批次；原批次被刪了（商品還在）就用當時的單價建一個新批次補回
- **什麼時候扣、什麼時候還**：`PUT /api/quotations/:id` 一律「有扣過就先全部還原 → 換品項 → 新狀態要扣就重扣」，所以改品項、改數量、改狀態都對得起來；
  改成 `draft`、`cancelled` 就是還原後不再扣。刪訂單時有扣著的先還原：`restoreQuotationStockStatements` 只組 SQL，
  跟「拿掉保固、維修工單的關聯」「刪品項、照片紀錄、訂單」放進同一個 batch，中途失敗整個回滾（原批次不在時補回的新批次也在同一個 batch 裡建）

## 發布到官網（Workers RPC）

[`src/routes/publish.ts`](../src/routes/publish.ts)，[ADR 0003](decisions/0003-website-integration.md)：

- `wrangler.jsonc` 的 `services: [{ binding: "WEBSITE", service: "nszpc", entrypoint: "WebsiteAPI" }]`，
  呼叫官網 Worker（repo `nszpc_web` 的 `backend/src/rpc.ts`）的 `replaceOrderImages`、`publishOrder`、`unpublishOrder`、`orderTags`。
  Worker 對 Worker 直接呼叫，官網不用開公開的 API，也不用另外驗身分（只有綁了它的 Worker 叫得到）
- 型別在 `publish.ts` 裡抄了一份（`PublishOrderInput`、`WebsiteAPI`），**官網改了介面要兩邊一起改**
- 照片的 ref 是 `dpom-<訂單 id>`，官網存在 `orders/dpom-<id>/` 底下；每次發布先刪掉舊的再存新的
- 官網上的出機紀錄只有：日期、標題、需求介紹、YouTube、標籤、地區、售價（總價 − 服務費，官網的服務費存 0）、狀態、8 個規格、照片。
  **不帶**客戶姓名、電話、成本、服務費
- `quotations.website_order_id` 記住官網那筆的 id，再發布就是更新；`WEBSITE_URL`（`https://nszpc.bluz.dev`）用來組連結

## 照片（R2）

- binding `UPLOADS`，bucket `nszpc-dpom-uploads`，key `uploads/<時間戳>-<8 碼亂數>.<副檔名>`（副檔名照格式給，不用使用者的檔名）
- 上傳：一次最多 10 張、每張 10MB，只收 JPEG、PNG、WebP、GIF、HEIC、HEIF（看 `File.type`，**SVG 不收**，[ADR 0008](decisions/0008-security.md)）
- 讀取：`GET /api/quotations/:id/images/:filename`，要是那張訂單的圖；回應 `Content-Security-Policy: default-src 'none'; sandbox`、`nosniff`，瀏覽器只當圖片顯示
- 刪圖片、刪訂單時 R2 的檔案一起刪

## 報價單、檢測表（在瀏覽器產生）

[ADR 0005](decisions/0005-quote-and-inspection-docs.md)：

- 報價單（[`frontend/src/components/QuoteDocModal.tsx`](../frontend/src/components/QuoteDocModal.tsx)）、出機檢測表（[`InspectionModal.tsx`](../frontend/src/components/InspectionModal.tsx)）
  在瀏覽器排好 A4 版面，用 html2canvas 截圖（2 倍解析度），jsPDF 轉 PDF，或直接下載 JPG、產生圖片複製貼到 LINE（[`lib/docExport.ts`](../frontend/src/lib/docExport.ts)）
- 報價單另外有三段可以複製的文字：採購清單、文字版報價、匯款資訊（有訂金就帶尚需付款）
- 店家資訊、注意事項、匯款帳號存在 `settings.quote_doc`（JSON），所有報價單共用；沒設定時用程式裡的預設值（星辰電腦 NSZPC、高雄地址）
- Worker 不產 PDF

## YouTube、Instagram

[`src/routes/settings.ts`](../src/routes/settings.ts)，[ADR 0007](decisions/0007-social-server-side.md)：

- YouTube：Worker 拿 `settings` 裡的金鑰和頻道 ID 去查 `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet`，
  結果存在 `settings.youtube_stats`，**1 小時內**直接回快取（`?refresh=1` 強制重查）。金鑰不能從 `GET /api/settings/:key` 讀出來
- Instagram 沒有開放查詢，追蹤數、追蹤中、貼文數手動填（`PUT /api/settings/instagram/manual`）

## 安全

[ADR 0008](decisions/0008-security.md)：

- **登入**：Access + Worker 自己驗 JWT（見上面）
- **CSRF**：`worker.ts` 的 `isCrossSiteWrite`：POST、PUT、PATCH、DELETE 的 `Sec-Fetch-Site` 是 `cross-site` 就擋；
  `Origin` 有給而且不是自己網站也擋，**例外**是網站和 Origin 都是 `localhost`／`127.0.0.1`（本機的 Next.js 開發伺服器 3000 port 代理到 8787）。擋了回 403
- **管理員才能做的**後端也擋（`adminOnly`），不是只有前端藏按鈕
- **上傳**只收點陣圖（見上面），讀圖片時加 sandbox CSP
- **API 的安全性標頭**（`worker.ts` 的 `SECURITY_HEADERS`）：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、
  `Referrer-Policy: strict-origin-when-cross-origin`、`Strict-Transport-Security: max-age=31536000; includeSubDomains`，沒指定的話 `Cache-Control: no-store`
- **前端靜態檔的標頭**在 [`frontend/public/_headers`](../frontend/public/_headers)（build 時複製到 `frontend/out`，Cloudflare 自動套用）：
  CSP `default-src 'self'`、`connect-src 'self'`（瀏覽器只能打自己的 API）、`img-src 'self' data: blob: https:`、`frame-ancestors 'none'`；
  `script-src`、`style-src` 有 `'unsafe-inline'`（Next.js 靜態輸出的頁面有內嵌 script）；另外 `X-Robots-Tag: noindex, nofollow`、Permissions-Policy 關掉相機、麥克風、定位。
  `/_next/static/*` 快取一年
- JWT 驗不過的原因只寫進 log（`console.warn`），回給使用者的是「請重新整理頁面，重新登入」；程式出錯的 500 會把例外的訊息回給前端

## 前端

- **Next.js 靜態輸出**（`next.config.ts` 的 `output: "export"`），`npm run build` 輸出到 `frontend/out`，由 Worker 當靜態檔回。
  檔名是 `dashboard.html` 這種，`wrangler.jsonc` 的 `html_handling: "auto-trailing-slash"` 讓 `/dashboard` 對得到；找不到回 `404.html`
- 頁面在 `frontend/src/app/(main)/`：`dashboard`、`inventory`、`quotations`、`customers`、`purchases`、`reports`、`social`、`categories`、`users`、`changelog`；
  外框（側欄、頂列）在 `(main)/layout.tsx`。沒登入成功顯示 `NotSignedIn`（例如 email 還沒開通）
- API 呼叫都走 [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts)（`/api` 開頭、同網域 cookie）
- Bootstrap 5 + Bootstrap Icons；圖表用 Chart.js
- **樣式**：Apple 風格（[DESIGN.md](../DESIGN.md)，[ADR 0006](decisions/0006-apple-style.md)）。`styles/globals.css` 是原本的樣式，
  `styles/apple.css` 疊在 Bootstrap 和 globals.css 上面改顏色、字型、圓角和手機版，不改每個元件的 class。強調色只有 Action Blue `#0066cc`
- **版號**：`next.config.ts` 建置時讀根目錄的 `VERSION`、`CHANGELOG.md` 和 git commit，放進 `NEXT_PUBLIC_*`；側欄最下面顯示版號，點進去是更新紀錄（[ADR 0009](decisions/0009-versioning.md)）
- 側欄有「官網後台」連結（`Sidebar.tsx` 的 `WEBSITE_ADMIN_URL`，`https://nszpc.bluz.dev/admin`，換網域要改）
- `next dev`（`npm run dev:web`，3000 port）時 `/api/*` 轉到 `http://localhost:8787`（`next.config.ts` 的 `rewrites`，只在開發時有效）
