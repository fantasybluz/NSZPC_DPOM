# 0002 登入用 Cloudflare Access（email 驗證碼），系統不存密碼

- 狀態：採用
- 日期：2026-10-16

## 背景

原本自己做帳號密碼：密碼沒加鹽、預設 admin/admin、session 在記憶體。搬到 Worker 之後，正確的密碼雜湊（scrypt、bcrypt）會超過免費方案的 CPU 時間；
自己做忘記密碼、鎖帳號也是一堆工。這是內部系統，用的人就店裡幾個人。

## 決定

- 整個網站（包括 `/api`）放在 Cloudflare Access（Zero Trust）的 Self-hosted 應用後面，只放行允許清單裡的 email
- 登入方式用 **One-time PIN**（輸入 email 收驗證碼）：員工不一定有 Cloudflare 或 Google 帳號，有 email 就能登入
- Worker 不完全相信 Access：`src/lib/access.ts` 用 Cloudflare 公布的公鑰再驗一次 `Cf-Access-Jwt-Assertion`（RS256、iss、aud、效期、要有 email）。
  驗簽只要一次 RSA，CPU 時間很短
- email 對到 `users` 資料表（`email` 欄位，不分大小寫），角色、頁面權限照舊；`users` 拿掉密碼欄位，`/login`、`/change-password` 都拿掉
- `BOOTSTRAP_ADMIN_EMAILS`（`wrangler.jsonc`）裡的人第一次登入自動建成管理員，解決「第一個管理員誰來建」
- 本機開發不經過 Access：網址是 localhost 時用 `.dev.vars` 的 `DEV_USER_EMAIL`
- `workers_dev`、`preview_urls` 關掉，只留 `dpom.bluz.dev`（另外兩個網址前面沒有 Access）

## 代價

- **加人要加兩邊**：Zero Trust 的允許清單、系統的「權限管理」，少一邊都進不來；離職也要兩邊都拿掉（步驟寫在 [setup.md](../setup.md#加使用者)）
- 每次登入要收信拿驗證碼（Access 的 session 期限內不用重來）
- 綁 Cloudflare Zero Trust（免費方案 50 人，夠用）
- Access 換應用（例如換網域時重建）AUD 會變，要改 `ACCESS_AUD` 重新部署，不然 API 全部 401
