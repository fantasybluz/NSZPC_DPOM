# 0001 從 Express + PostgreSQL + K8s 搬到 Cloudflare Workers + D1 + R2

- 狀態：採用
- 日期：2026-10-16

## 背景

原本的架構是 Express（Node.js）+ PostgreSQL，用 Docker 包好、部署在 K8s（`deploy/k8s/`：PostgreSQL、PV、nginx）。
登入是自己做的帳號密碼（沒加鹽的 SHA-256，預設 admin/admin，session 存在記憶體，重開就要重新登入）。

使用者要「全部搬到 Cloudflare」：先用免費方案給客戶 demo，客戶確認要用、下單之後再付費升級。
官網（`nszpc_web`）也在同一個 Cloudflare 帳號，放在一起之後可以直接串（[ADR 0003](0003-website-integration.md)）。

## 決定

- 一個 Worker（`nszpc-dpom`）同時回前端靜態檔（Next.js 靜態輸出 `frontend/out`）和 `/api`
- 資料庫改 D1（SQLite），`migrations/0001_init.sql` 從原本 `initDatabase()` 的建表轉過來：`SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`、
  `TIMESTAMP` → ISO 字串、`DATE` → `YYYY-MM-DD` 字串
- 訂單照片從本機磁碟（multer 存到 `data/uploads/`）改放 R2（`nszpc-dpom-uploads`）
- 登入改用 Cloudflare Access（[ADR 0002](0002-cloudflare-access.md)）
- **盡量不改 routes 的寫法**：寫一個很小的 Express 相容層（`src/lib/router.ts`），`pool.query` 保留 pg 的寫法（`$1` 換成 `?1`、`NOW()` 換成 ISO 時間），
  PostgreSQL 專用的語法（`to_char`、`::date`）改寫成 `taipeiMonthSql()`、`isoWeekRange()`
- 拿掉 Dockerfile、K8s、nginx 設定；CI 只跑型別檢查和前端 build，部署在本機 `npm run deploy`

## 代價

- **D1 是 SQLite**：沒有 PostgreSQL 的型別和函式，日期要自己處理時區（Worker 是 UTC，台灣時間要 +8 小時）
- **免費方案一個請求最多 50 個查詢**（batch 裡每一句都算）、**一句最多 100 個綁定參數**：原本「一筆一個查詢」「一層分類查一次」的寫法庫存一多就會爆。
  所以多筆寫入改用 `json_each(?)` 一句寫完、一串 id 用 `IN (SELECT value FROM json_each(?))`、分類一次讀全部在記憶體算、
  扣庫存先讀再一個 `batch` 寫回（見 [architecture.md](../architecture.md#d1-的限制改程式時一定要注意)）
- **Worker 不是 Node**：不能用 `fs`、`multer`、`pg` 這些套件；上傳用 `Request.formData()`，加密用 WebCrypto
- 免費方案 CPU 時間很短：原本的密碼雜湊（scrypt）會超過，這也是改用 Access 的原因之一
- 綁 Cloudflare：要搬走的話資料庫、照片、登入都要換
