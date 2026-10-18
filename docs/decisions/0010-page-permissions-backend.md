# 0010 頁面權限後端也擋：寫入要權限、讀取只要登入

- 狀態：採用
- 日期：2026-10-18

## 背景

[ADR 0008](0008-security.md) 只補了管理員那幾件，頁面權限（`users.permissions`）還是只控制側欄：
一般使用者直接打 API（或用網址打開沒勾的頁面）就能新增、修改、刪除任何資料，也能用 `PUT /api/settings/:key` 寫任何設定。

另外權限 id 前後不一致：側欄的叫貨管理看 `suppliers`、報表/售後看 `dashboard`、社群看 `youtube`，
權限管理頁卻提供 `purchases`（結款管理）、`reports`（報表/保固/維修）兩個沒有任何地方在用的選項。

## 決定

- **權限 id 統一成一組**：`dashboard`、`inventory`、`quotations`、`customers`、`purchases`、`reports`、`social`，加上只有管理員的 `categories`、`users`。
  後端 `src/types/auth.ts`、前端 `frontend/src/lib/constants.ts` 用同一組，權限管理頁的選項直接從側欄的 `NAV_ITEMS` 產生
- `migrations/0007_permissions.sql` 把舊的換過來：`suppliers` → `purchases`、`youtube` → `social`、有 `dashboard` 的多給 `reports`（原本報表/售後跟著儀表板），
  所以沒有人少了原本看得到的頁面
- **寫入（POST、PUT、PATCH、DELETE）要有頁面權限**：`worker.ts` 的 `mounts` 每個前綴掛 `writeRequires('權限')`，管理員都可以，沒有回 403 和看得懂的訊息
- **讀取（GET）只要登入**：訂單畫面要讀客戶、庫存、分類，儀表板要讀庫存、訂單、社群的統計；讀取也擋的話，只勾「訂單管理」的人就沒辦法開單
- 跨頁的寫入照「畫面上誰會做」給：存訂單時順便建客戶（`POST /api/customers`）有 `quotations` 也可以；報價單設定 `quote_doc` 跟著 `quotations`
- **設定只能寫白名單裡的 key**（`settings.ts` 的 `WRITABLE_KEYS`），每個 key 要寫它那一頁的權限；`cost_method` 只有管理員
- 本機 API 測試要測一般使用者，加了只在 localhost + `DEV_USER_EMAIL` 時有效的 `X-Dev-User-Email` 標頭（跟原本的本機登入同一個條件）

## 代價

- 一般使用者還是**讀得到**所有頁面的資料（包含成本、客戶電話），只是改不了。店裡人少、大家本來就看得到；之後要分得更細（例如員工不能看成本）再另外做
- 新的 API 前綴要記得在 `mounts` 掛 `writeRequires`，新的設定 key 要加進 `WRITABLE_KEYS`，不然寫不進去
- 前端沒有把沒權限的按鈕藏起來：按了會跳 403 的訊息（側欄本來就不顯示沒勾的頁面）
