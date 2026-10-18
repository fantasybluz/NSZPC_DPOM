# API

Worker 提供的 API，全部在 `/api` 底下。前綴掛在 [`src/worker.ts`](../src/worker.ts) 的 `mounts`，
每支路由寫在 [`src/routes/`](../src/routes/) 的 `router.get/post/put/delete`。

> **這份文件跟程式要一致**：[`tests/docs.test.ts`](../tests/docs.test.ts) 會讀 `mounts` 和 `src/routes/*.ts`，
> 跟這裡的 `### \`METHOD /api/...\`` 標題比對。新增、刪除、改路徑時標題要一起改，不然 `npm run test:docs`、`npm run check`（部署前會跑）會失敗。

## 共通規則

- 資料都是 JSON（上傳圖片是 multipart、匯出是 CSV）。欄位名稱跟資料表一樣是 snake_case（`customer_name`），
  少數新寫的（發布到官網、檢測表、YouTube）是 camelCase
- 錯誤一律回 `{ "error": "給使用者看的訊息" }`，前端直接顯示。HTTP 狀態碼：
  - `400` 資料不對、`401` 沒登入或 Access 的 JWT 驗不過（前端會整頁重新整理，讓 Cloudflare 重新要求登入，一分鐘最多一次）
  - `403` email 還沒開通、帳號停用、不是管理員、跨站請求
  - `404` 找不到（也包括不存在的 API：`{ "error": "找不到這個 API" }`）
  - `422` 發布到官網時官網的欄位檢查沒過（多一個 `details` 陣列）
  - `500` 程式出錯（訊息是例外的 message）、`502` 連不到 YouTube、`503` `ACCESS_AUD` 沒設定
- **登入**：除了 `GET /api/version`，每一支都先跑 [`authMiddleware`](../src/routes/auth.ts)（驗 Cloudflare Access 的 JWT、
  用 email 對到 `users`）。前綴底下的路徑對不到任何路由時，也是先驗登入再回 404
- **權限**：標「管理員」的有 `adminOnly`，一般使用者回 403。**其他 API 只要登入就能用**，頁面權限（`users.permissions`）
  只決定側欄顯示哪些頁，後端不檢查（見 [architecture.md](architecture.md#登入cloudflare-access)）
- **CSRF**：POST、PUT、PATCH、DELETE 的 `Sec-Fetch-Site` 是 `cross-site`，或 `Origin` 不是自己網站（localhost 對 localhost 除外），回 403
- 每個回應都有 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`、HSTS，沒指定的話 `Cache-Control: no-store`
- 金額都是新台幣整數。時間欄位（`created_at` 等）是 UTC 的 ISO 字串；日期欄位（`batch_date`、`order_date`…）是 `YYYY-MM-DD`
- 沒有分頁：列表 API 一次回全部，前端自己分頁

## 系統

### `GET /api/version`

不用登入。`{ version }`，內容是根目錄 `VERSION`（打包進 Worker）。

## 登入、使用者

### `GET /api/auth/me`

目前登入的人：`{ userId, email, username, displayName, role, permissions }`。`role` 是 `admin` 或 `user`，
`permissions` 是頁面 id 的陣列。第一次登入、email 在 `BOOTSTRAP_ADMIN_EMAILS` 裡的會在這時自動建成管理員。
email 不在 `users` 回 403「xxx 還沒開通…」，停用回 403「這個帳號已停用」。

### `GET /api/auth/users`

管理員。所有使用者：`id, email, username, display_name, role, permissions（陣列）, is_active, created_at`。

### `POST /api/auth/users`

管理員。`{ email, display_name, role, permissions }` → `{ id }`。email 要像 email（舊前端送 `username` 也收），
已經有了回 400。`role` 預設 `user`。**這裡只開通系統帳號**，同一個 email 還要加進 Cloudflare Access 的允許清單（見 [setup.md](setup.md#加使用者)）。

### `PUT /api/auth/users/:id`

管理員。`{ display_name, role, permissions, is_active }`，整筆覆蓋（沒給的 `role` 變 `user`、`permissions` 變 `[]`）。
不能把自己降成 `user` 或停用自己（400）。email 不能改。

### `DELETE /api/auth/users/:id`

管理員。刪使用者，不能刪自己（400）。

## 分類

分類是一棵樹（`parent_id`），層數不限，預設資料有三層（CPU › AMD › AM5）。

### `GET /api/inventory/categories`

整棵樹：每個節點 `{ id, parent_id, name, icon, sort_order, children? }`，沒有子分類就沒有 `children`。照 `sort_order`、`id` 排。

### `POST /api/inventory/categories`

管理員。`{ name, parent_id?, icon? }` → `{ id }`，放在同一層最後面。`name` 必填。
同一層同名會撞 `UNIQUE (parent_id, name)`（回 500）。

### `PUT /api/inventory/categories/reorder`

管理員。拖拉排序：`{ items: [{ id, sort_order }] }`，**全部要在同一層**，不然 400「只能在同一層排序」；有 id 不存在回 400。
一句 SQL（`json_each`）寫完。路由要註冊在 `/categories/:id` 前面，不然 `reorder` 會被當成 id。

### `PUT /api/inventory/categories/:id`

管理員。`{ name?, icon?, sort_order?, parent_id? }`，沒給的不動。`parent_id` 給 `null` 或 `''` 是移到第一層；換上層時放到新那一層最後面，並檢查：
上層存在、不是自己或自己底下的、上層分類**沒有庫存**（庫存只能放在最末端分類）。同一層同名回 400。

### `DELETE /api/inventory/categories/:id`

管理員。連子分類一起刪；這些分類底下有庫存就 400「此分類下有 N 筆庫存，無法刪除」。

## 庫存

### `GET /api/inventory/cost-method`

`{ method: 'fifo' | 'average' }`，來自 `settings.cost_method`（預設 `fifo`）。

### `GET /api/inventory`

庫存列表。參數 `category_id`（含所有子分類）、`search`（品名、品牌 LIKE）。
每筆是 `inventory` 的欄位加 `category_name`、`category_icon`、`category_path`（「CPU › AMD › AM5」）。照分類順序、品名排。

### `GET /api/inventory/stats`

`{ byCategory, summary, lowStock }`：依第一層分類加總的品項數、數量、成本（`avg_cost × quantity`）、售價總值；
全部的合計；低庫存（`min_quantity > 0` 而且 `quantity <= min_quantity`）。儀表板用。

### `GET /api/inventory/:id/detail`

一個商品：欄位加 `category_path`、`batches`（所有批次，舊到新）、`logs`（最新 50 筆異動）、`cost_method`、
`fifo_cost`（最舊一個還有剩的批次的單價）。找不到 404。

### `POST /api/inventory`

`{ category_id, name, brand?, spec?, price?, min_quantity?, note?, initial_qty?, initial_cost?, supplier? }` → `{ id }`。
數量一律從 0 開始；`initial_qty`、`initial_cost` 都大於 0 時建一個「初始庫存」批次。

### `PUT /api/inventory/:id`

改基本資料：`{ category_id, name, brand, spec, price, min_quantity, note }`。**不能直接改數量、成本**，要用進貨、出貨。找不到 404。

### `POST /api/inventory/:id/stock-in`

進貨：`{ quantity, unit_cost, supplier?, note? }` → `{ batch_id }`。數量、單價都要大於 0。建一個批次、記一筆異動、重算數量和平均成本。

### `POST /api/inventory/:id/stock-out`

手動出貨：`{ quantity, reason? }` → `{ totalCost, unitCost }`。數量大於現有的回 400「庫存不足，目前只有 N 個」。
`fifo` 從最舊的批次扣、成本照批次算；`average` 照建立順序扣批次、成本用 `avg_cost × quantity`。

### `DELETE /api/inventory/:id`

刪商品和它的批次、異動紀錄（一個 batch）。訂單上用到它的品項不受影響（`quotation_items.inventory_id` 沒有外鍵）。

## 訂單

訂單（程式裡叫 quotation）狀態：`draft` 尚未成交、`deposit` 已付訂金、`pending` 尚未結單、`completed` 已完成、`cancelled` 已取消。
出貨進度（`delivery_status`）：`preparing`、`assembling`、`testing`、`ready`、`shipped`、`delivered` 或空字串。

### `GET /api/quotations/stats/summary`

每個狀態的張數、營收（`total_price`）、毛利、訂金合計。

### `GET /api/quotations/stats/monthly`

這個月（台灣時間）：`{ month, byStatus, byDelivery, recent（最新 10 張）, total }`。儀表板用。

### `GET /api/quotations`

訂單列表，新到舊。參數 `status`（`all` 等於不篩）、`customer_id`、`search`（單號、客戶名稱、客戶電話）。
每筆多一個 `customer_phone`（從關聯的客戶即時帶）。

### `GET /api/quotations/:id`

一張訂單：欄位加 `items`、`images`，有關聯客戶的話加 `customer`（`id, name, phone, email, source, city, district, address, note, order_count`）。找不到 404。

### `POST /api/quotations`

`{ customer_id?, customer_name, status?, items: [{ category, name, spec, cost, price, quantity, inventory_id? }], deposit, service_fee, note, item_title, demand_area, ship_date, delivery_status }`
→ `{ id, quotation_no }`。

- 單號 `Q` + 台灣日期 + 當天三位流水號（`Q20261017001`）
- `total_cost` = Σ 成本 × 數量；`total_price` = Σ 售價 × 數量 + 服務費（伺服器算，不收前端的）
- `customer_id` 對得到客戶就用客戶管理裡的名字；對不到當作沒選，用 `customer_name`。**這支 API 不會建客戶**（前端先呼叫 `POST /api/customers`）
- 狀態是 `deposit`、`pending`、`completed` 時馬上扣庫存（見 [architecture.md](architecture.md#扣庫存fifo)）；庫存不足回 400「庫存不足：品名（需要 N，目前 M）」，整張單不建

### `PUT /api/quotations/:id`

欄位同新增，整張覆蓋（**沒給 `status` 會變成 `draft`**）。順序：已扣過庫存的先全部還原 → 換掉品項 → 更新主表 → 新狀態要扣的話照新品項重扣。
重扣時庫存不足：狀態改回 `draft`、回 400（品項和其他欄位已經存了）。找不到 404。

### `POST /api/quotations/:id/copy`

複製成新的一張 → `{ id, quotation_no }`：狀態 `draft`、訂金 0、出貨日和出貨進度清空，品項、客戶、服務費照抄，圖片不抄。

### `POST /api/quotations/:id/images`

multipart，欄位 `images`，一次最多 10 張、每張 10MB，只收 `image/jpeg`、`png`、`webp`、`gif`、`heic`、`heif`（看瀏覽器給的 type，SVG 不收）。
存到 R2 的 `uploads/<時間>-<亂數>.<副檔名>`，回 `[{ id, filename, original_name }]`。訂單不存在 404。

### `GET /api/quotations/:id/images/:filename`

圖片本身。要是這張訂單的圖才給（不然 404）。回應帶 `Cache-Control: private, max-age=86400`、`nosniff`、
`Content-Security-Policy: default-src 'none'; sandbox`。

### `DELETE /api/quotations/:id/images/:imageId`

刪一張圖（R2 和資料庫）。不存在也回 `{ success: true }`。

### `DELETE /api/quotations/:id`

刪訂單，**一個 batch 一起成功或失敗**：先把保固、維修工單的 `quotation_id` 改成 null（它們留著，只是不再關聯），
扣過庫存的還原，再刪圖片紀錄、品項、訂單；檢測表、扣庫存紀錄跟著刪（外鍵 CASCADE）。資料庫刪成功後才刪 R2 的圖。訂單不存在也回 `{ success: true }`。
已經發布到官網的，官網那筆不會跟著刪（要先「從官網拿掉」）。

## 發布到官網

透過 service binding `WEBSITE` 呼叫官網 Worker（`nszpc`）的 `WebsiteAPI`（見 [ADR 0003](decisions/0003-website-integration.md)）。

### `GET /api/quotations/:id/publish-draft`

用訂單帶一份草稿：`{ draft, images, tagOptions, websiteOrderId, websiteUrl }`。

- `draft`：`date`（出貨日，沒有就今天，`YYYY/MM/DD`）、`item`（品項標題，空的是「客製化主機」）、`location`（需求地區）、
  `salePrice`（總價 − 服務費）、`status`（出貨進度 `shipped` → `shipping`，其他都是 `delivered`）、
  八個規格欄位 `cpu, motherboard, ram, storage, gpu, psu, cooler, pcCase`（品項分類往上找第一層，見 `src/lib/specs.ts`），
  `requirementIntro`、`youtubeEmbedUrl`、`tags` 是空的
- `tagOptions`：官網出機紀錄用過的標籤（官網連不到就是空的）
- `websiteOrderId`、`websiteUrl`：發布過的話是官網那筆的 id 和網址

### `POST /api/quotations/:id/publish`

`{ draft, imageIds }` → `{ id, url }`。選的圖從 R2 讀出來交給官網（`replaceOrderImages`，先刪掉這張單在官網的舊照片），
再 `publishOrder`：發布過就更新同一筆，不會多一筆。

- 照片加起來超過 25MB 回 400；官網那邊再擋每張 10MB、最多 10 張、格式（jpeg、png、webp、gif、heic），不過回 400「照片上傳失敗：…」
- 官網的欄位檢查沒過回 422，`details` 是官網的錯誤訊息
- 成功後把官網的 id 存到 `quotations.website_order_id`

### `DELETE /api/quotations/:id/publish`

從官網拿掉（出機紀錄和照片都刪），清掉 `website_order_id`。沒發布過也回 `{ success: true }`。

## 出機檢測表

### `GET /api/quotations/:id/inspection`

存過就回 `{ saved: true, updatedAt, report }`；還沒存過回 `{ saved: false, report }`，`report` 是用訂單帶的草稿：
報告編號 `QC-<出貨日>-<訂單 id 補到 6 位>`、測試日期今天、客戶名稱、機器規格（同發布的規格對應）、`Windows 11`、
測試人員是登入者的顯示名稱、室溫 26、預設 12 項高壓測試和 17 項檢查（`src/lib/inspection.ts`）、結論 `pass`。

### `PUT /api/quotations/:id/inspection`

存檢測表（一張訂單一份，有就覆蓋）。`report` 的欄位：`reportNo, testDate, clientName, machineSpec, osVersion, tester, ambientTemp, stress[], checks[], conclusion, notes`。
伺服器用 `normalizeInspection` 整理：文字截長度、數字非負取一位小數、高壓測試最多 40 列、檢查最多 80 項，狀態不合法改成預設值。

## 客戶

### `GET /api/customers`

客戶列表，新到舊。參數 `source`、`city`、`search`（姓名、電話、email）。每筆多 `order_count`、
`total_spent`（只算 `deposit`、`pending`、`completed` 的訂單總價）、`last_order_at`。

### `GET /api/customers/stats/distribution`

`{ byCity, bySource, total }`：各縣市、各來源的客戶數。

### `GET /api/customers/:id`

一位客戶：欄位加 `services`（服務紀錄，新到舊）、`quotations`（他的訂單：`id, quotation_no, status, delivery_status, item_title, total_price, created_at`）。找不到 404。

### `POST /api/customers`

`{ name, phone?, email?, source?, city?, district?, address?, note? }` → `{ id }`。不檢查重複（重複電話的提醒在前端）。

### `PUT /api/customers/:id`

整筆覆蓋。同一個 batch 把這位客戶所有訂單的 `customer_name` 改成新名字。

### `DELETE /api/customers/:id`

刪客戶和他的服務紀錄（一個 batch）。他的訂單、保固、維修工單留著（名字還在），只是 `customer_id` 改成 null（不然外鍵會擋住）。

### `POST /api/customers/:id/services`

新增服務紀錄：`{ service_type, description, service_date? }` → `{ id }`。

### `DELETE /api/customers/:id/services/:sid`

刪一筆服務紀錄（要是這位客戶的）。

## 叫貨、盤商、結款

### `GET /api/purchases/suppliers`

所有盤商，照名稱排。

### `POST /api/purchases/suppliers`

`{ name, payment_type?, default_tax_type?, contact?, note? }` → `{ id }`。`payment_type`：`weekly`（預設）、`monthly`、`cod`；
`default_tax_type`：`tax_included`（預設）、`tax_excluded`。名稱必填、不能重複（400）。

### `PUT /api/purchases/suppliers/:id`

整筆覆蓋。

### `DELETE /api/purchases/suppliers/:id`

有叫貨紀錄就 400「此盤商有叫貨紀錄，無法刪除」。

### `GET /api/purchases/orders`

叫貨單列表，訂購日新到舊。參數 `supplier_id`、`status`、`week`（任一天，篩同一個 ISO 週，週一到週日）、`month`（`YYYY-MM`）。每筆多盤商的 `payment_type`。

### `GET /api/purchases/orders/:id`

一張叫貨單加 `items`。找不到 404。

### `POST /api/purchases/orders`

`{ supplier_id, items: [{ product_name, brand?, spec?, quantity, unit_price }], order_date?, tax_type?, note? }` → `{ id }`。
狀態 `pending`。小計 = Σ 單價 × 數量；含稅時稅額 = 小計 − 小計 / 1.05（四捨五入），未稅稅額 0；總額都等於小計。盤商不存在 400。

### `PUT /api/purchases/orders/:id/status`

`{ status }`，只能是 `pending` 或 `cancelled`（到貨要走 receive），也就是「待到貨 ↔ 已取消」。
已經到貨（`received`）的回 400「這張叫貨單已經到貨入庫，不能再改狀態」；找不到 404。前端只在待到貨時給「取消叫貨」。

### `POST /api/purchases/orders/:id/receive`

確認到貨：`{ stock_items: [{ inventory_id, quantity, unit_cost }] }`，有對到庫存商品的項目一次全部進貨（每項一個批次，來源是盤商名稱、備註「叫貨單 #id」），
狀態改成 `received`。沒對到商品的項目不入庫。
**只有 `pending` 的可以**：已經到貨的回 400「這張叫貨單已經確認到貨過了」，已取消的回 400「這張叫貨單已經取消，不能確認到貨」。
先用 `WHERE status = 'pending'` 改狀態再入庫，同時按兩次也只會入庫一次；入庫失敗時狀態改回 `pending`。

### `DELETE /api/purchases/orders/:id`

刪叫貨單和明細。已經入庫的庫存不會扣回來。

### `GET /api/purchases/stats`

`{ weekTotal, monthTotal, bySupplier, unpaid, paid }`：這週、這個月（台灣時間）的叫貨總額、這個月各盤商、結款期間在這個月的未結／已結金額。

### `GET /api/purchases/settlements`

結款紀錄，期間結束日新到舊。參數 `supplier_id`、`status`（`unpaid`／`paid`）、`month`（篩 `period_end`）。

### `POST /api/purchases/settlements`

`{ supplier_id, amount, tax_type?, period_start?, period_end?, note? }` → `{ id }`，狀態 `unpaid`。含稅時拆出稅額（`amount − amount / 1.05`）和小計。

### `PUT /api/purchases/settlements/:id`

`{ status?, paid_date?, note? }`，只改有給的；一個都沒給 400。前端「標記已結款」送 `status: 'paid'` 和今天的日期。

### `DELETE /api/purchases/settlements/:id`

刪一筆結款紀錄。

## 報表、保固、維修

### `GET /api/reports/profit`

只算 `completed` 的訂單。參數 `period=yearly` 是每年，否則每月（台灣時間，最近 24 期，舊到新）。
回 `{ data, byCustomer（毛利前 20）, byArea（需求地區毛利前 20）, total }`。

### `GET /api/reports/warranties`

保固列表，到期日近的在前。參數 `status`、`search`（品名、序號、客戶）。`status` 是資料庫存的（`active`／`claimed`），「已過期」是前端照到期日算的。

### `POST /api/reports/warranties`

`{ quotation_id?, customer_id?, customer_name?, product_name, serial_number?, ship_date?, warranty_months?, note? }` → `{ id }`。
保固預設 12 個月；有出貨日就算出 `warranty_end`。

### `PUT /api/reports/warranties/:id`

`{ status?, note? }`。前端只送 `active` 或 `claimed`（標記已報修／改回）。

### `DELETE /api/reports/warranties/:id`

刪一筆保固。關聯這筆保固的維修工單留著，`warranty_id` 改成 null（同一個 batch）。

### `GET /api/reports/repairs`

維修工單列表，新到舊。參數 `status`、`search`（工單號、客戶、設備）。

### `GET /api/reports/repairs/:id`

一張工單加 `logs`（進度紀錄，新到舊）。找不到 404。

### `POST /api/reports/repairs`

`{ customer_id?, customer_name?, warranty_id?, quotation_id?, device_name?, serial_number?, issue?, priority?, note? }` → `{ id, repair_no }`。
單號 `R` + 台灣日期 + 三位流水號，狀態 `received`，同時記一筆「工單建立」。`priority`：`low`、`normal`（預設）、`high`、`urgent`。

### `PUT /api/reports/repairs/:id`

`{ status?, diagnosis?, solution?, cost?, completed_date?, note?, log_msg? }`，只改有給的。有給 `status` 就記一筆進度（說明用 `log_msg`，沒有就「狀態更新為 xxx」）。
狀態：`received`、`diagnosing`、`repairing`、`waiting_parts`、`completed`、`returned`、`cancelled`。

### `DELETE /api/reports/repairs/:id`

刪工單和進度紀錄。

### `GET /api/reports/notifications`

`{ lowStock, expiringWarranties（30 天內到期、狀態 active）, unpaidSettlements, activeRepairs（不是 completed、cancelled 的工單）}`。

### `GET /api/reports/export/:type`

下載 CSV（UTF-8 加 BOM，Excel 打得開），檔名 `<type>_<日期>.csv`。`type`：`inventory`、`customers`、`quotations`、`repairs`，其他回 400。

## 設定、社群

設定存在 `settings`（key-value）。

### `GET /api/settings/youtube`

`{ channelId, hasKey }`。金鑰本身不回。

### `PUT /api/settings/youtube`

管理員。`{ apiKey?, channelId? }`，`apiKey` 空白是不改。存完清掉快取。

### `GET /api/settings/youtube/stats`

Worker 去查 YouTube Data API（`channels?part=statistics,snippet`）：`{ configured, title, thumb, subscribers, views, videos, fetchedAt }`。
沒設定金鑰或頻道回 `{ configured: false }`。結果快取 1 小時（`settings.youtube_stats`），`?refresh=1` 強制重查。
連不到 502、YouTube 回錯誤 400、頻道不存在 404。

### `PUT /api/settings/instagram/manual`

手動填 IG：`{ followers?, following?, posts? }`，同時把 `ig_last_fetch` 設成現在。

### `GET /api/settings/:key`

`{ key, value }`，沒有的話 `value` 是空字串。`youtube_api_key` 回 403。用到的 key：`quote_doc`（報價單的店家資訊、備註、匯款帳號，JSON）、
`ig_username`、`ig_followers`、`ig_following`、`ig_posts`、`ig_last_fetch`、`cost_method`。

### `PUT /api/settings/:key`

`{ value }`，沒有就新增。`youtube_api_key` 回 403（要用 `PUT /api/settings/youtube`）。任何登入的人都能改任何 key。
