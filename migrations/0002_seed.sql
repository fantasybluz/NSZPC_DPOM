-- 預設分類（原本 initDatabase() 的 defaultCategories）和成本方法
-- 子分類沒寫 icon 的沿用上一層的 icon（跟原本 seedCategories 一樣）

INSERT INTO categories (parent_id, name, icon, sort_order) VALUES
  (NULL, 'CPU', 'cpu', 1),
  (NULL, '顯示卡', 'gpu-card', 2),
  (NULL, '主機板', 'motherboard', 3),
  (NULL, '記憶體', 'memory', 4),
  (NULL, '硬碟', 'device-hdd', 5),
  (NULL, '散熱', 'fan', 6),
  (NULL, '電源供應器', 'lightning-charge', 7),
  (NULL, '機殼', 'pc-display', 8),
  (NULL, '周邊', 'mouse2', 9);

INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, 'AMD', icon, 1 FROM categories WHERE name = 'CPU' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, 'Intel', icon, 2 FROM categories WHERE name = 'CPU' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, '華碩', icon, 1 FROM categories WHERE name = '顯示卡' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, '技嘉', icon, 2 FROM categories WHERE name = '顯示卡' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, '微星', icon, 3 FROM categories WHERE name = '顯示卡' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, '水冷', 'droplet-half', 1 FROM categories WHERE name = '散熱' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, '風冷', 'fan', 2 FROM categories WHERE name = '散熱' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, 'ATX', icon, 1 FROM categories WHERE name = '機殼' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, 'mATX', icon, 2 FROM categories WHERE name = '機殼' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT id, 'ITX', icon, 3 FROM categories WHERE name = '機殼' AND parent_id IS NULL;
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT c.id, 'AM4', c.icon, 1 FROM categories c JOIN categories root ON root.id = c.parent_id AND root.name = 'CPU' AND root.parent_id IS NULL WHERE c.name = 'AMD';
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT c.id, 'AM5', c.icon, 2 FROM categories c JOIN categories root ON root.id = c.parent_id AND root.name = 'CPU' AND root.parent_id IS NULL WHERE c.name = 'AMD';
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT c.id, 'LGA1700', c.icon, 1 FROM categories c JOIN categories root ON root.id = c.parent_id AND root.name = 'CPU' AND root.parent_id IS NULL WHERE c.name = 'Intel';
INSERT INTO categories (parent_id, name, icon, sort_order) SELECT c.id, 'LGA1851', c.icon, 2 FROM categories c JOIN categories root ON root.id = c.parent_id AND root.name = 'CPU' AND root.parent_id IS NULL WHERE c.name = 'Intel';

INSERT INTO settings (key, value) VALUES ('cost_method', 'fifo');
