-- 頁面權限統一成一組 id（後端開始檢查權限，前端側欄、權限管理也用同一組）：
--   dashboard 儀表板、inventory 庫存、quotations 訂單、customers 客戶、purchases 叫貨（含盤商、結款）、
--   reports 報表/售後（保固、維修）、social 社群設定、categories／users（只有管理員能用）
-- 原本對不起來：側欄的叫貨看 suppliers、報表/售後看 dashboard、社群看 youtube，
-- 權限管理頁卻另外給 purchases（結款）、reports（報表/保固/維修）兩個沒人用的選項。
-- 舊 → 新（不讓任何人少了原本看得到的頁面）：
--   suppliers → purchases、youtube → social、dashboard → dashboard + reports（原本報表/售後跟著儀表板）
--   purchases、reports 原本就勾了的照留（現在真的有用了）；不認得的 id 拿掉、重複的合併
UPDATE users SET permissions = COALESCE((
  SELECT json_group_array(p) FROM (
    SELECT CASE value WHEN 'suppliers' THEN 'purchases' WHEN 'youtube' THEN 'social' ELSE value END AS p
    FROM json_each(users.permissions)
    UNION
    SELECT 'reports' FROM json_each(users.permissions) WHERE value = 'dashboard'
  )
  WHERE p IN ('dashboard', 'inventory', 'quotations', 'customers', 'purchases', 'reports', 'social', 'categories', 'users')
), '[]')
WHERE json_valid(permissions);
