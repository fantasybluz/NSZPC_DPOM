-- 清掉沒在用的欄位和設定
-- - quotations.qc_data：舊版的出機檢查資料，已經改用 inspections 表（0005）；原本每次存訂單都會被蓋成 '{}'
-- - 店家資訊（shop_*）：只有社群設定頁自己讀寫，報價單用的是 quote_doc，這張卡已經拿掉
-- - line_notify_token：LINE Notify 服務在 2025-03-31 結束，功能已經拿掉
ALTER TABLE quotations DROP COLUMN qc_data;
DELETE FROM settings WHERE key IN ('shop_address', 'shop_phone', 'shop_line', 'line_notify_token');
