# 0004 拿掉盤商報價

- 狀態：採用
- 日期：2026-10-16

## 背景

原本有「盤商報價」頁：把盤商在 LINE 傳來的報價訊息貼進來（圖片用 tesseract.js 在瀏覽器 OCR，為此 CSP 開放了 jsDelivr），
解析成品名和價格存進 `supplier_prices`。

## 決定

使用者要求**直接移除**，不保留資料：

- 前端頁面、側欄選項、API（`src/routes/suppliers.ts`）拿掉，tesseract.js 和 CSP 的 jsDelivr 例外一起拿掉
- `migrations/0003_drop_supplier_prices.sql` 刪掉 `supplier_prices` 表（`DROP TABLE IF EXISTS`）
- 盤商本身（`suppliers`）、叫貨、結款不受影響

## 代價

- 舊的報價紀錄跟著表一起刪掉，救不回來（除非用 D1 Time Travel 還原到 0003 之前）
- 頁面權限的 id `suppliers` 現在指的是「叫貨管理」，名字有點對不上，沒有改（改了已經存在 `users.permissions` 裡的值要跟著搬）
  （後來 [ADR 0010](0010-page-permissions-backend.md) 改成 `purchases`，`migrations/0007_permissions.sql` 搬了舊值）
- 之後要比價得重新做
