# 0007 YouTube 改由 Worker 查；IG 改手動；拿掉 LINE Notify

- 狀態：採用
- 日期：2026-10-17

## 背景

- **YouTube**：原本瀏覽器直接打 `googleapis.com` 查訂閱數。搬到 Cloudflare 後，自己加的 CSP `connect-src 'self'` 把它擋掉了，YouTube 數字一直出不來。
  而且 API 金鑰要先從 `/api/settings/youtube_api_key` 讀到瀏覽器，等於任何登入的人都看得到金鑰
- **Instagram**：原本有「自動抓取」，IG 沒有開放公開的查詢 API（Graph API 要商業帳號和 App 審核），抓不到
- **LINE Notify**：LINE Notify 在 2025-03-31 結束服務，通知功能已經不能用

## 決定

- YouTube：`GET /api/settings/youtube/stats` 由 Worker 拿 D1 裡的金鑰去查 YouTube Data API v3，結果快取在 `settings.youtube_stats` **1 小時**（省配額），`?refresh=1` 強制重查。
  `youtube_api_key` 不能從 `GET /api/settings/:key` 讀出來，只能用 `PUT /api/settings/youtube` 寫（管理員）。CSP 維持 `connect-src 'self'`
- Instagram：追蹤數、追蹤中、貼文數改手動填，記更新時間
- LINE Notify：功能、設定、`settings.line_notify_token` 都拿掉（migration 0006 刪設定）。之後要通知改用 LINE Messaging API

## 代價

- YouTube 數字最多晚 1 小時
- 查 YouTube 算在 Worker 的對外連線和 CPU 時間（一小時一次，很少）
- IG 數字要有人記得去更新
- 現在沒有任何推播通知，只有「報表/售後」的通知分頁
