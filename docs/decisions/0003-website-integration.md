# 0003 跟星辰電腦官網整合：DPOM 是主軸，完成的訂單用 Workers RPC 發布到官網

- 狀態：採用
- 日期：2026-10-16

## 背景

星辰電腦有兩個系統：官網（`nszpc_web`，Worker `nszpc`，公開的網站，有出機紀錄、推薦配單、文章）和這個內部管理系統（DPOM）。
兩邊都有「訂單／出機紀錄」，原本出機紀錄要在官網後台手動再打一次（規格、照片、價格）。要決定哪邊是主軸、資料怎麼流。

## 決定

- **DPOM 是主軸**：庫存、進貨、訂單、報價、客戶只在 DPOM；官網只放公開的內容（出機紀錄、推薦配單、文章）
- 完成的訂單從 DPOM 按「發布到官網」，變成官網的一筆出機紀錄：
  - 用 **Workers RPC**：DPOM 的 `wrangler.jsonc` 綁 service binding `WEBSITE` → Worker `nszpc` 的 `WebsiteAPI`（`backend/src/rpc.ts`，`WorkerEntrypoint`）。
    官網**不開公開的 API**，也不用另外做 API 金鑰：只有綁了它的 Worker 叫得到，而 DPOM 已經過 Access 登入
  - 官網的寫入照樣走它自己的欄位檢查（跟後台手動新增一樣），檢查沒過 DPOM 顯示官網的錯誤
  - **帶售價（總價 − 服務費），不帶服務費**（官網存 0）、**不帶客人資料**（姓名、電話、地址）和成本
  - 照片從 DPOM 的 R2 讀出來交給官網存在官網的 R2（`orders/dpom-<訂單 id>/`），每次發布整組換掉；最多 10 張、DPOM 先擋總共 25MB
  - `quotations.website_order_id`（migration 0004）記住對到哪一筆，再發布是更新
- 兩邊是**同一批使用者**（店裡的人）；DPOM 側欄有「官網後台」的連結

## 代價

- 兩個 Worker 要在同一個 Cloudflare 帳號；`WebsiteAPI` 的型別在 DPOM 的 `src/routes/publish.ts` 抄了一份，**官網改介面要兩邊一起改、先部署官網**
- 本機要測發布得兩個 Worker 一起跑（`npx wrangler dev -c wrangler.jsonc -c ../nszpc_web/wrangler.jsonc`）
- 官網上改了出機紀錄、DPOM 再發布一次會被蓋掉（DPOM 是主軸）
- 刪 DPOM 的訂單不會自動刪官網那筆，要先「從官網拿掉」
