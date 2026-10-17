# 0008 資安：CSRF 擋跨站請求、管理員權限後端也擋、上傳只收點陣圖

- 狀態：採用
- 日期：2026-10-17

## 背景

搬到 Cloudflare 後檢查了一次安全性，發現：

- 會改資料的 API 沒有擋跨站請求：登入靠 Access 的 cookie，別的網站可以用表單送 POST 過來（CSRF）
- 分類管理只是前端把頁面藏起來，一般使用者直接打 API 還是能改分類
- 上傳只檢查 type 是 `image/` 開頭、副檔名照使用者的檔名，所以 SVG 也收；SVG 可以藏 `<script>`，直接打開圖片網址會在自己網站的網域執行
- YouTube 金鑰會送到瀏覽器（另見 [ADR 0007](0007-social-server-side.md)）

## 決定

- **CSRF**：`src/worker.ts` 的 `isCrossSiteWrite`，POST、PUT、PATCH、DELETE：
  - `Sec-Fetch-Site: cross-site` → 擋
  - 有 `Origin` 而且不是自己網站 → 擋
  - 例外：網站和 `Origin` 都是 `localhost`／`127.0.0.1`（本機 Next.js 開發伺服器 3000 port 把 `/api` 代理到 8787，Origin 不一樣但不是跨站）
  - 擋了回 403「不接受從其他網站送出的請求」。沒用 CSRF token：同網域的前端不用改，現代瀏覽器都會送 `Origin` 或 `Sec-Fetch-Site`
- **管理員權限後端也擋**：`adminOnly` middleware（`src/routes/auth.ts`）掛在使用者管理、分類的寫入、YouTube 金鑰設定上
- **上傳只收點陣圖**：JPEG、PNG、WebP、GIF、HEIC、HEIF（看 `File.type`），副檔名照格式給、不用使用者的檔名；
  讀圖片時回應加 `Content-Security-Policy: default-src 'none'; sandbox` 和 `nosniff`
- 前端靜態檔加安全性標頭（`frontend/public/_headers`：CSP、`X-Frame-Options: DENY`、`noindex`），API 的在 `worker.ts`

## 代價

- 不能從別的網站（或別的網域的工具）直接呼叫會改資料的 API
- 不收 SVG、PDF 附件
- 判斷格式是相信瀏覽器給的 `File.type`，沒有讀檔頭；但檔案只會被當圖片回（sandbox CSP），就算格式造假也不會執行
- **頁面權限（`users.permissions`）還是只在前端**：一般使用者打 API 拿得到所有頁面的資料。這次只補了管理員那幾件，之後人變多要再補
