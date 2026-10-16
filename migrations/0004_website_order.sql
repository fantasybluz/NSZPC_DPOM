-- 訂單「發布到官網」：記住對到官網（NSZ_PC）的哪一筆出機紀錄，再發布一次就是更新，不會多一筆
ALTER TABLE quotations ADD COLUMN website_order_id TEXT DEFAULT '';
