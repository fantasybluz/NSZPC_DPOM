# 文件

這個資料夾放「程式碼看不出來」的東西：要做什麼、為什麼這樣做、怎麼設定。
程式碼本身的細節（某個函式怎麼寫）留在程式碼的註解，不要抄到這裡。

| 文件 | 內容 | 什麼時候要改 |
|---|---|---|
| [requirements.md](requirements.md) | 功能和業務規則：庫存、訂單狀態和扣庫存、客戶關聯、發布到官網、報價單、檢測表、叫貨結款、售後、權限 | 加功能、改規則、需求有變 |
| [architecture.md](architecture.md) | 系統怎麼組成：Worker 和路由、每張資料表、D1 的限制、登入、扣庫存、發布到官網、照片、安全、前端 | 改資料表、改流程、加新的外部服務或綁定 |
| [api.md](api.md) | 每一支 API（路徑、權限、重要欄位、錯誤） | 新增、刪除、改 API 的路徑或行為 |
| [setup.md](setup.md) | 本機開發、測試、部署、Cloudflare 資源、Access 設定、加使用者、備份、換網域 | 部署方式、環境變數、綁定、Cloudflare 設定有變 |
| [decisions/](decisions/) | 重要決定的來龍去脈（ADR） | 做了會影響之後很久的選擇 |
| [GUIDE.md](GUIDE.md) | 給店裡的人看的操作說明 | 畫面、操作流程有變 |
| [../DESIGN.md](../DESIGN.md) | 介面的設計規格（Apple 風格，用 getdesign 裝的） | 改整體風格時（改了要在 decisions/ 寫一份 ADR） |
| [../CHANGELOG.md](../CHANGELOG.md) | 每一版改了什麼（給使用者看，系統的「更新紀錄」顯示的就是它） | 每次改了使用者看得到的東西 |
| [../RELEASING.md](../RELEASING.md) | 怎麼發版 | 發版流程有變 |
| [../CLAUDE.md](../CLAUDE.md) | 給 AI（和新來的人）的入口：指令、慣例、改程式要一起改哪些文件 | 指令、慣例有變 |

ADR：

| 編號 | 決定 |
|---|---|
| [0001](decisions/0001-cloudflare-workers.md) | 從 Express + PostgreSQL + K8s 搬到 Cloudflare Workers + D1 + R2 |
| [0002](decisions/0002-cloudflare-access.md) | 登入用 Cloudflare Access（email 驗證碼），系統不存密碼 |
| [0003](decisions/0003-website-integration.md) | 跟官網整合：DPOM 是主軸，完成的訂單用 Workers RPC 發布到官網 |
| [0004](decisions/0004-remove-supplier-quotes.md) | 拿掉盤商報價 |
| [0005](decisions/0005-quote-and-inspection-docs.md) | 報價單、出機檢測表參考 Bluz Computer Studio，在瀏覽器產生 PDF／圖片 |
| [0006](decisions/0006-apple-style.md) | 介面改成 Apple 風格，用 apple.css 疊在原本的樣式上 |
| [0007](decisions/0007-social-server-side.md) | YouTube 改由 Worker 查；IG 改手動；拿掉 LINE Notify |
| [0008](decisions/0008-security.md) | 資安：CSRF、管理員權限後端也擋、上傳只收點陣圖 |
| [0009](decisions/0009-versioning.md) | 版號：VERSION 單一來源、CHANGELOG.md |
| [0010](decisions/0010-page-permissions-backend.md) | 頁面權限後端也擋：寫入要權限、讀取只要登入；權限 id 統一 |

## 維護規則

1. **文件跟程式碼放在同一個 commit**。改了功能、API、資料表，同一個 commit 裡把對應的文件改好，不要「之後再補」。
2. **改了什麼，對照上表改哪份**。不確定就問自己：下一個接手的人（或 AI）只看文件，會不會被誤導？
3. **CHANGELOG 寫給使用者看**：說「能做什麼了」，不說「改了哪個檔案」。平常寫在「## 未發佈」底下，發版時改成版號（見下面「發版」）。
4. **決定寫成 ADR**：選了 A 不選 B、而且之後有人可能會問「為什麼不用 B」的，在 `decisions/` 加一份，
   編號往下接（`0010-xxx.md`），寫背景、決定、代價。決定改了就新增一份取代舊的，舊的標「已被 00XX 取代」，不要直接刪。
5. **寫具體的事實**：數字、限制、指令、檔名都寫出來（例如「一次最多 10 張、每張 10MB」「一個請求最多 50 個查詢」），
   不要寫「有一些限制」。
6. **寫現在的樣子**：程式跟文件對不上時，以程式為準把文件改對；覺得程式不對，另外修程式，不要把文件寫成「應該要」的樣子。

## 自動檢查

`npm run test:docs`（不用開伺服器）會跑 [`tests/docs.test.ts`](../tests/docs.test.ts) 和 [`tests/version.test.ts`](../tests/version.test.ts)，
文件跟程式碼對不上就失敗：

- [api.md](api.md) 的 `### \`GET /api/...\`` 標題要跟實際註冊的路由一模一樣：讀 [`src/worker.ts`](../src/worker.ts) 的 `mounts`（前綴和 router）
  加上每個 `src/routes/*.ts` 的 `router.get/post/put/delete('路徑'`，再加 `worker.ts` 自己處理的 `/api/version`
- [architecture.md](architecture.md) 要提到 `migrations/` 裡的每一張資料表（寫成 `` `資料表` ``）；後來被 `DROP TABLE` 刪掉的不算
- `README.md`、`CLAUDE.md`、`RELEASING.md`、`docs/` 裡的相對連結都要連得到存在的檔案
- `VERSION` 要是 `x.y.z`、跟 [CHANGELOG.md](../CHANGELOG.md)「未發佈」下面那一版一樣、跟 `package.json` 的 `version` 一樣

`npm run check`（= 型別檢查 + `test:docs` + 前端 build）也會跑，所以 `npm run deploy` 和 GitHub Actions 在文件沒跟上時會失敗。
`npm test` 跑全部的測試，包含要先開 `npm run dev` 的 API 整合測試（`tests/api.test.ts`）。

## 發版

流程寫在 [RELEASING.md](../RELEASING.md)，簡單說：

1. 確認 `npm run check` 過、開著 `npm run dev` 時 `npm test` 過
2. 改 `VERSION` 和 `package.json` 的 `version`（例如 `3.5.0`），把 CHANGELOG 的「## 未發佈」改成 `## 3.5.0`，上面再補一段空的「## 未發佈」
3. `npm run deploy`（本機部署），commit、打標籤 `v3.5.0`、推上去

版號怎麼跳：新功能跳第二碼（`3.5.0`）；只有修正、文字調整跳第三碼（`3.4.1`）；大改版（換架構、換網址）跳第一碼。
