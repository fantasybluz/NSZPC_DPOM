import db, { hashPassword } from './models/database';

console.log('🌱 開始建立測試資料...');

// ========== 查詢分類 ID（支援任意深度路徑）==========
function catId(...path: string[]): number {
  let parentId: number | null = null;
  for (const name of path) {
    const row = db.prepare('SELECT id FROM categories WHERE name=? AND parent_id IS ?').get(name, parentId) as any;
    if (!row) throw new Error(`找不到分類: ${path.join(' > ')} (在 "${name}" 失敗)`);
    parentId = row.id;
  }
  return parentId!;
}

// ========== 庫存資料 ==========
const inventoryData = [
  // CPU > AM5
  { cat: () => catId('CPU', 'AMD', 'AM5'), name: 'AMD Ryzen 7 9800X3D', brand: 'AMD', spec: '8C/16T 4.7GHz', cost: 14500, price: 16990, qty: 5, min: 2 },
  { cat: () => catId('CPU', 'AMD', 'AM5'), name: 'AMD Ryzen 5 7600X', brand: 'AMD', spec: '6C/12T 4.7GHz', cost: 4200, price: 5490, qty: 8, min: 3 },
  { cat: () => catId('CPU', 'AMD', 'AM5'), name: 'AMD Ryzen 9 9950X', brand: 'AMD', spec: '16C/32T 5.7GHz', cost: 18500, price: 21990, qty: 2, min: 1 },
  // CPU > LGA1700
  { cat: () => catId('CPU', 'Intel', 'LGA1700'), name: 'Intel Core i7-14700K', brand: 'Intel', spec: '20C/28T 5.6GHz', cost: 10500, price: 12990, qty: 3, min: 2 },
  { cat: () => catId('CPU', 'Intel', 'LGA1700'), name: 'Intel Core i5-14400F', brand: 'Intel', spec: '10C/16T 4.7GHz', cost: 4800, price: 6290, qty: 6, min: 3 },
  // CPU > LGA1851
  { cat: () => catId('CPU', 'Intel', 'LGA1851'), name: 'Intel Core Ultra 9 285K', brand: 'Intel', spec: '24C/24T 5.7GHz', cost: 19000, price: 22490, qty: 1, min: 1 },
  { cat: () => catId('CPU', 'Intel', 'LGA1851'), name: 'Intel Core Ultra 5 245K', brand: 'Intel', spec: '14C/14T 5.2GHz', cost: 8500, price: 10990, qty: 3, min: 1 },
  // 顯示卡 > 華碩
  { cat: () => catId('顯示卡', '華碩'), name: 'ROG STRIX RTX 4070 Super OC', brand: 'ASUS', spec: '12GB GDDR6X', cost: 18000, price: 21990, qty: 2, min: 1 },
  { cat: () => catId('顯示卡', '華碩'), name: 'DUAL RTX 4060 Ti OC', brand: 'ASUS', spec: '8GB GDDR6', cost: 11000, price: 13990, qty: 3, min: 1 },
  // 顯示卡 > 技嘉
  { cat: () => catId('顯示卡', '技嘉'), name: 'AORUS RTX 5080 MASTER', brand: 'GIGABYTE', spec: '16GB GDDR7', cost: 34000, price: 41990, qty: 1, min: 1 },
  { cat: () => catId('顯示卡', '技嘉'), name: 'EAGLE RTX 4060 Ti OC', brand: 'GIGABYTE', spec: '8GB GDDR6', cost: 10500, price: 13490, qty: 4, min: 2 },
  // 顯示卡 > 微星
  { cat: () => catId('顯示卡', '微星'), name: 'GAMING X TRIO RTX 4070 Super', brand: 'MSI', spec: '12GB GDDR6X', cost: 17500, price: 20990, qty: 2, min: 1 },
  { cat: () => catId('顯示卡', '微星'), name: 'VENTUS 3X RTX 4060 Ti OC', brand: 'MSI', spec: '8GB GDDR6', cost: 10200, price: 12990, qty: 3, min: 1 },
  // 主機板
  { cat: () => catId('主機板'), name: 'ASUS ROG STRIX B650E-F', brand: 'ASUS', spec: 'AM5 DDR5 ATX', cost: 6500, price: 8490, qty: 4, min: 2 },
  { cat: () => catId('主機板'), name: 'MSI MAG B760M MORTAR WIFI', brand: 'MSI', spec: 'LGA1700 DDR5 mATX', cost: 4200, price: 5490, qty: 5, min: 2 },
  { cat: () => catId('主機板'), name: 'GIGABYTE X670E AORUS MASTER', brand: 'GIGABYTE', spec: 'AM5 DDR5 ATX', cost: 11000, price: 13990, qty: 1, min: 1 },
  // 記憶體
  { cat: () => catId('記憶體'), name: 'G.SKILL Trident Z5 RGB DDR5 32GB', brand: 'G.SKILL', spec: '2x16GB DDR5-6000 CL30', cost: 3200, price: 4290, qty: 10, min: 4 },
  { cat: () => catId('記憶體'), name: 'Kingston FURY Beast DDR5 16GB', brand: 'Kingston', spec: '16GB DDR5-6000', cost: 1100, price: 1490, qty: 15, min: 5 },
  { cat: () => catId('記憶體'), name: 'Corsair Vengeance DDR5 64GB', brand: 'Corsair', spec: '2x32GB DDR5-5600', cost: 5800, price: 7490, qty: 3, min: 1 },
  // 硬碟
  { cat: () => catId('硬碟'), name: 'Samsung 990 Pro 2TB', brand: 'Samsung', spec: 'NVMe Gen4 7450MB/s', cost: 4500, price: 5990, qty: 8, min: 3 },
  { cat: () => catId('硬碟'), name: 'WD Black SN850X 1TB', brand: 'WD', spec: 'NVMe Gen4 7300MB/s', cost: 2500, price: 3290, qty: 12, min: 4 },
  { cat: () => catId('硬碟'), name: 'Seagate Barracuda 2TB', brand: 'Seagate', spec: 'HDD 7200RPM SATA3', cost: 1500, price: 1990, qty: 6, min: 2 },
  // 散熱 > 水冷
  { cat: () => catId('散熱', '水冷'), name: 'NZXT Kraken Elite 360', brand: 'NZXT', spec: '360mm AIO LCD', cost: 6500, price: 8490, qty: 3, min: 1 },
  { cat: () => catId('散熱', '水冷'), name: 'Corsair iCUE H150i Elite', brand: 'Corsair', spec: '360mm AIO RGB', cost: 4800, price: 6290, qty: 2, min: 1 },
  { cat: () => catId('散熱', '水冷'), name: 'ASUS ROG RYUJIN III 360', brand: 'ASUS', spec: '360mm AIO LCD', cost: 7500, price: 9490, qty: 1, min: 1 },
  // 散熱 > 風冷
  { cat: () => catId('散熱', '風冷'), name: 'Noctua NH-D15', brand: 'Noctua', spec: '雙塔散熱器 165mm', cost: 2500, price: 3290, qty: 4, min: 2 },
  { cat: () => catId('散熱', '風冷'), name: 'be quiet! Dark Rock Pro 5', brand: 'be quiet!', spec: '雙塔散熱器 250W TDP', cost: 2200, price: 2890, qty: 5, min: 2 },
  { cat: () => catId('散熱', '風冷'), name: 'Thermalright PA120 SE', brand: 'Thermalright', spec: '雙塔 6熱管', cost: 800, price: 1190, qty: 8, min: 3 },
  // 電源供應器
  { cat: () => catId('電源供應器'), name: 'Seasonic FOCUS GX-850', brand: 'Seasonic', spec: '850W 80+ Gold 全模組', cost: 3200, price: 4290, qty: 6, min: 3 },
  { cat: () => catId('電源供應器'), name: 'Corsair RM1000x', brand: 'Corsair', spec: '1000W 80+ Gold 全模組', cost: 4500, price: 5990, qty: 3, min: 1 },
  { cat: () => catId('電源供應器'), name: 'MSI MAG A750GL', brand: 'MSI', spec: '750W 80+ Gold ATX3.0', cost: 2400, price: 3190, qty: 8, min: 3 },
  // 機殼 > ATX
  { cat: () => catId('機殼', 'ATX'), name: 'Lian Li O11 Vision White', brand: 'Lian Li', spec: 'ATX 雙面玻璃 白', cost: 3800, price: 4990, qty: 3, min: 1 },
  { cat: () => catId('機殼', 'ATX'), name: 'NZXT H7 Flow', brand: 'NZXT', spec: 'ATX 高散熱 黑', cost: 2800, price: 3690, qty: 4, min: 2 },
  { cat: () => catId('機殼', 'ATX'), name: 'Fractal Design North', brand: 'Fractal', spec: 'ATX 木質面板', cost: 3200, price: 4190, qty: 2, min: 1 },
  // 機殼 > mATX
  { cat: () => catId('機殼', 'mATX'), name: 'Cooler Master MasterBox Q300L', brand: 'Cooler Master', spec: 'mATX 模組化面板', cost: 1200, price: 1690, qty: 5, min: 2 },
  { cat: () => catId('機殼', 'mATX'), name: 'Thermaltake S100 TG', brand: 'Thermaltake', spec: 'mATX 鋼化玻璃', cost: 1500, price: 1990, qty: 3, min: 1 },
  // 機殼 > ITX
  { cat: () => catId('機殼', 'ITX'), name: 'Cooler Master NR200P Max', brand: 'Cooler Master', spec: 'ITX 含AIO+PSU', cost: 6500, price: 8290, qty: 1, min: 1 },
  { cat: () => catId('機殼', 'ITX'), name: 'NZXT H1 V2', brand: 'NZXT', spec: 'ITX 含AIO+PSU 直立式', cost: 7000, price: 8990, qty: 1, min: 1 },
  // 周邊
  { cat: () => catId('周邊'), name: 'Logitech G Pro X Superlight 2', brand: 'Logitech', spec: '無線電競滑鼠 60g', cost: 2800, price: 3890, qty: 5, min: 2 },
  { cat: () => catId('周邊'), name: 'Razer BlackWidow V4 75%', brand: 'Razer', spec: '機械鍵盤 橘軸', cost: 3500, price: 4690, qty: 3, min: 1 },
  { cat: () => catId('周邊'), name: 'Samsung Odyssey G7 27"', brand: 'Samsung', spec: '27" 2K 240Hz IPS', cost: 8500, price: 10990, qty: 2, min: 1 },
];

import { stockIn } from './models/database';

const insertInv = db.prepare(
  'INSERT INTO inventory (category_id, name, brand, spec, price, quantity, min_quantity) VALUES (?,?,?,?,?,0,?)'
);
for (const item of inventoryData) {
  const r = insertInv.run(item.cat(), item.name, item.brand, item.spec, item.price, item.min);
  // 用 stockIn 建立進貨批次
  stockIn(r.lastInsertRowid as number, item.qty, item.cost, '初始進貨', '初始庫存');
}
console.log(`  ✅ 庫存: ${inventoryData.length} 筆`);

// ========== 客戶資料 ==========
const customerData = [
  { name: '王大明', phone: '0912-345-678', email: 'wang.dm@gmail.com', source: 'YouTube', city: '台北市', district: '中山區', note: '老客戶，組過三台' },
  { name: '李小華', phone: '0923-456-789', email: 'lihua@hotmail.com', source: 'Instagram', city: '新北市', district: '板橋區', note: 'IG 私訊詢問' },
  { name: '張志豪', phone: '0934-567-890', email: 'zhihao.z@yahoo.com', source: 'Line', city: '台中市', district: '西屯區', note: 'Line 群組介紹' },
  { name: '陳美玲', phone: '0945-678-901', email: 'meiling.c@gmail.com', source: '門市', city: '高雄市', district: '前鎮區', note: '門市來店' },
  { name: '林建宏', phone: '0956-789-012', email: '', source: 'YouTube', city: '桃園市', district: '中壢區', note: '看 YouTube 影片來的' },
  { name: '黃雅琪', phone: '0967-890-123', email: 'yachi.h@gmail.com', source: '朋友介紹', city: '台南市', district: '東區', note: '王大明介紹' },
  { name: '吳宗翰', phone: '0978-901-234', email: '', source: 'YouTube', city: '新竹市', district: '東區', note: '科技業工程師' },
  { name: '劉芳瑜', phone: '0989-012-345', email: 'fangyu.liu@gmail.com', source: 'Instagram', city: '台北市', district: '信義區', note: '直播主，需要高階機' },
  { name: '鄭宇翔', phone: '0911-222-333', email: '', source: 'Line', city: '台中市', district: '北屯區', note: '需要靜音主機' },
  { name: '蔡佳穎', phone: '0922-333-444', email: 'jiaying@outlook.com', source: '門市', city: '高雄市', district: '左營區', note: '' },
  { name: '許文傑', phone: '0933-444-555', email: '', source: 'YouTube', city: '新北市', district: '永和區', note: '預算導向' },
  { name: '楊宗霖', phone: '0944-555-666', email: 'tsunglin@gmail.com', source: '朋友介紹', city: '基隆市', district: '中正區', note: '吳宗翰介紹' },
  { name: '周雨潔', phone: '0955-666-777', email: '', source: 'Instagram', city: '嘉義市', district: '西區', note: '' },
  { name: '趙文彥', phone: '0966-777-888', email: 'wenyan.zhao@gmail.com', source: 'YouTube', city: '彰化縣', district: '彰化市', note: '想組影片剪輯機' },
  { name: '孫子涵', phone: '0977-888-999', email: '', source: 'Line', city: '屏東縣', district: '屏東市', note: '遠距客戶' },
  { name: '謝育霖', phone: '0988-999-000', email: 'yulin.hsieh@gmail.com', source: 'YouTube', city: '宜蘭縣', district: '宜蘭市', note: '' },
  { name: '何冠廷', phone: '0911-111-222', email: '', source: '門市', city: '高雄市', district: '三民區', note: '' },
  { name: '馬立群', phone: '0922-222-333', email: 'lichun.ma@gmail.com', source: 'YouTube', city: '花蓮縣', district: '花蓮市', note: '需宅配' },
  { name: '游詩涵', phone: '0933-333-444', email: '', source: 'Instagram', city: '苗栗縣', district: '頭份市', note: '' },
  { name: '蕭宏志', phone: '0944-444-555', email: 'hungchih.s@gmail.com', source: 'Line', city: '雲林縣', district: '斗六市', note: '' },
];

const insertCust = db.prepare('INSERT INTO customers (name, phone, email, source, city, district, note) VALUES (?,?,?,?,?,?,?)');
for (const c of customerData) insertCust.run(c.name, c.phone, c.email, c.source, c.city, c.district, c.note);
console.log(`  ✅ 客戶: ${customerData.length} 筆`);

// ========== 服務紀錄 ==========
const serviceData = [
  { cid: 1, type: '整機組裝', desc: 'RTX 4070S 遊戲主機', date: '2026-01-15' },
  { cid: 1, type: '升級', desc: '加裝 2TB SSD', date: '2026-02-20' },
  { cid: 1, type: '整機組裝', desc: 'RTX 5080 高階主機', date: '2026-03-10' },
  { cid: 2, type: '整機組裝', desc: 'i5-14400F 文書機', date: '2026-02-05' },
  { cid: 3, type: '整機組裝', desc: 'R5-7600X 遊戲主機', date: '2026-01-28' },
  { cid: 3, type: '維修', desc: '更換電源供應器', date: '2026-03-15' },
  { cid: 4, type: '整機組裝', desc: 'i7-14700K 工作站', date: '2026-02-12' },
  { cid: 5, type: '諮詢', desc: '選配討論', date: '2026-03-01' },
  { cid: 6, type: '整機組裝', desc: 'R7-9800X3D 頂規主機', date: '2026-03-05' },
  { cid: 7, type: '整機組裝', desc: '靜音工作站 Noctua 全配', date: '2026-02-25' },
  { cid: 8, type: '整機組裝', desc: 'RTX 5080 直播主機', date: '2026-03-18' },
  { cid: 8, type: '周邊', desc: '加購擷取卡與麥克風', date: '2026-03-19' },
];
const insertSvc = db.prepare('INSERT INTO service_records (customer_id, service_type, description, service_date) VALUES (?,?,?,?)');
for (const s of serviceData) insertSvc.run(s.cid, s.type, s.desc, s.date);
console.log(`  ✅ 服務紀錄: ${serviceData.length} 筆`);

// ========== 估價單 ==========
const quotationsData = [
  {
    custId: 1, custName: '王大明', status: 'completed', deposit: 40000, serviceFee: 2000,
    note: '整機組裝含安裝 Windows', title: 'RTX 5080 高階遊戲主機', area: '新北市', shipDate: '2026-02-24', delivery: 'delivered',
    items: [
      { category: 'AM5', name: 'AMD Ryzen 7 9800X3D', spec: '8C/16T', cost: 14500, price: 16990, quantity: 1 },
      { category: '主機板', name: 'ASUS ROG STRIX B650E-F', spec: 'AM5 DDR5', cost: 6500, price: 8490, quantity: 1 },
      { category: '記憶體', name: 'G.SKILL DDR5 32GB', spec: '2x16GB 6000MHz', cost: 3200, price: 4290, quantity: 1 },
      { category: '顯示卡', name: 'NVIDIA RTX 5080', spec: '16GB GDDR7', cost: 32000, price: 38990, quantity: 1 },
      { category: '硬碟', name: 'Samsung 990 Pro 2TB', spec: 'NVMe Gen4', cost: 4500, price: 5990, quantity: 1 },
      { category: '水冷', name: 'NZXT Kraken Elite 360', spec: '360mm AIO', cost: 6500, price: 8490, quantity: 1 },
      { category: '電源供應器', name: 'Corsair RM1000x', spec: '1000W Gold', cost: 4500, price: 5990, quantity: 1 },
      { category: 'ATX', name: 'Lian Li O11 Vision White', spec: '白色', cost: 3800, price: 4990, quantity: 1 },
    ],
  },
  {
    custId: 2, custName: '李小華', status: 'completed', deposit: 15000, serviceFee: 1500,
    note: '文書機 + 輕度遊戲', title: 'i5 文書遊戲主機', area: '新北市', shipDate: '2026-02-10', delivery: 'delivered',
    items: [
      { category: 'LGA1700', name: 'Intel Core i5-14400F', spec: '10C/16T', cost: 4800, price: 6290, quantity: 1 },
      { category: '主機板', name: 'MSI MAG B760M MORTAR WIFI', spec: 'DDR5 mATX', cost: 4200, price: 5490, quantity: 1 },
      { category: '記憶體', name: 'Kingston FURY DDR5 16GB', spec: '6000MHz', cost: 1100, price: 1490, quantity: 2 },
      { category: '顯示卡', name: 'NVIDIA RTX 4060 Ti', spec: '8GB', cost: 10500, price: 13490, quantity: 1 },
      { category: '硬碟', name: 'WD Black SN850X 1TB', spec: 'Gen4', cost: 2500, price: 3290, quantity: 1 },
      { category: '風冷', name: 'be quiet! Dark Rock Pro 5', spec: '雙塔', cost: 2200, price: 2890, quantity: 1 },
      { category: '電源供應器', name: 'MSI MAG A750GL', spec: '750W Gold', cost: 2400, price: 3190, quantity: 1 },
      { category: 'ATX', name: 'NZXT H7 Flow', spec: '黑色', cost: 2800, price: 3690, quantity: 1 },
    ],
  },
  {
    custId: 8, custName: '劉芳瑜', status: 'deposit', deposit: 30000, serviceFee: 2500,
    note: '直播主機，需雙螢幕輸出', title: 'RTX 5080 直播創作主機', area: '台北市', shipDate: '2026-03-28', delivery: 'assembling',
    items: [
      { category: 'AM5', name: 'AMD Ryzen 7 9800X3D', spec: '8C/16T', cost: 14500, price: 16990, quantity: 1 },
      { category: '主機板', name: 'GIGABYTE X670E AORUS MASTER', spec: 'AM5 DDR5', cost: 11000, price: 13990, quantity: 1 },
      { category: '記憶體', name: 'Corsair Vengeance DDR5 64GB', spec: '2x32GB', cost: 5800, price: 7490, quantity: 1 },
      { category: '顯示卡', name: 'NVIDIA RTX 5080', spec: '16GB GDDR7', cost: 32000, price: 38990, quantity: 1 },
      { category: '硬碟', name: 'Samsung 990 Pro 2TB', spec: 'NVMe Gen4', cost: 4500, price: 5990, quantity: 2 },
      { category: '水冷', name: 'NZXT Kraken Elite 360', spec: '360mm AIO', cost: 6500, price: 8490, quantity: 1 },
      { category: '電源供應器', name: 'Corsair RM1000x', spec: '1000W Gold', cost: 4500, price: 5990, quantity: 1 },
      { category: 'ATX', name: 'Lian Li O11 Vision White', spec: '白色', cost: 3800, price: 4990, quantity: 1 },
    ],
  },
  {
    custId: 5, custName: '林建宏', status: 'draft', deposit: 0, serviceFee: 1500,
    note: '預算 3 萬左右的遊戲機', title: 'RTX 4060 Ti 入門遊戲主機', area: '桃園市', shipDate: '', delivery: '',
    items: [
      { category: 'AM5', name: 'AMD Ryzen 5 7600X', spec: '6C/12T', cost: 4200, price: 5490, quantity: 1 },
      { category: '主機板', name: 'MSI MAG B760M MORTAR WIFI', spec: 'mATX', cost: 4200, price: 5490, quantity: 1 },
      { category: '記憶體', name: 'Kingston FURY DDR5 16GB', spec: '6000MHz', cost: 1100, price: 1490, quantity: 2 },
      { category: '顯示卡', name: 'NVIDIA RTX 4060 Ti', spec: '8GB', cost: 10500, price: 13490, quantity: 1 },
      { category: '硬碟', name: 'WD Black SN850X 1TB', spec: 'Gen4', cost: 2500, price: 3290, quantity: 1 },
      { category: '風冷', name: 'Noctua NH-D15', spec: '雙塔', cost: 2500, price: 3290, quantity: 1 },
      { category: '電源供應器', name: 'MSI MAG A750GL', spec: '750W Gold', cost: 2400, price: 3190, quantity: 1 },
      { category: 'ATX', name: 'NZXT H7 Flow', spec: '黑色', cost: 2800, price: 3690, quantity: 1 },
    ],
  },
  {
    custId: 6, custName: '黃雅琪', status: 'completed', deposit: 45000, serviceFee: 2000,
    note: '9800X3D 全配主機', title: 'R7 頂規遊戲主機', area: '台南市', shipDate: '2026-03-08', delivery: 'delivered',
    items: [
      { category: 'AM5', name: 'AMD Ryzen 7 9800X3D', spec: '8C/16T', cost: 14500, price: 16990, quantity: 1 },
      { category: '主機板', name: 'ASUS ROG STRIX B650E-F', spec: 'AM5 DDR5', cost: 6500, price: 8490, quantity: 1 },
      { category: '記憶體', name: 'G.SKILL DDR5 32GB', spec: '2x16GB 6000MHz', cost: 3200, price: 4290, quantity: 1 },
      { category: '顯示卡', name: 'NVIDIA RTX 4070 Super', spec: '12GB', cost: 16000, price: 19990, quantity: 1 },
      { category: '硬碟', name: 'Samsung 990 Pro 2TB', spec: 'NVMe Gen4', cost: 4500, price: 5990, quantity: 1 },
      { category: '硬碟', name: 'Seagate Barracuda 2TB', spec: 'HDD 7200RPM', cost: 1500, price: 1990, quantity: 1 },
      { category: '水冷', name: 'NZXT Kraken Elite 360', spec: '360mm AIO', cost: 6500, price: 8490, quantity: 1 },
      { category: '電源供應器', name: 'Seasonic FOCUS GX-850', spec: '850W Gold', cost: 3200, price: 4290, quantity: 1 },
      { category: 'ATX', name: 'Fractal Design North', spec: '木質面板', cost: 3200, price: 4190, quantity: 1 },
    ],
  },
  {
    custId: 7, custName: '吳宗翰', status: 'completed', deposit: 35000, serviceFee: 2000,
    note: '工作站，強調靜音', title: 'Noctua 靜音工作站', area: '新竹市', shipDate: '2026-02-28', delivery: 'delivered',
    items: [
      { category: 'LGA1700', name: 'Intel Core i7-14700K', spec: '20C/28T', cost: 10500, price: 12990, quantity: 1 },
      { category: '主機板', name: 'MSI MAG B760M MORTAR WIFI', spec: 'DDR5 mATX', cost: 4200, price: 5490, quantity: 1 },
      { category: '記憶體', name: 'Corsair Vengeance DDR5 64GB', spec: '2x32GB', cost: 5800, price: 7490, quantity: 1 },
      { category: '顯示卡', name: 'NVIDIA RTX 4070 Super', spec: '12GB', cost: 16000, price: 19990, quantity: 1 },
      { category: '硬碟', name: 'Samsung 990 Pro 2TB', spec: 'NVMe Gen4', cost: 4500, price: 5990, quantity: 1 },
      { category: '風冷', name: 'Noctua NH-D15', spec: '雙塔', cost: 2500, price: 3290, quantity: 1 },
      { category: '電源供應器', name: 'Seasonic FOCUS GX-850', spec: '850W Gold', cost: 3200, price: 4290, quantity: 1 },
      { category: 'ATX', name: 'Fractal Design North', spec: '木質面板', cost: 3200, price: 4190, quantity: 1 },
    ],
  },
];

function generateQNo(idx: number): string {
  const dates = ['20260115', '20260205', '20260318', '20260320', '20260305', '20260225'];
  return `Q${dates[idx]}${String(idx + 1).padStart(3, '0')}`;
}

const insertQuot = db.prepare(`
  INSERT INTO quotations (quotation_no, customer_id, customer_name, status, deposit, service_fee, total_cost, total_price, note, item_title, demand_area, ship_date, delivery_status)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const insertQItem = db.prepare('INSERT INTO quotation_items (quotation_id, category, name, spec, cost, price, quantity) VALUES (?,?,?,?,?,?,?)');

for (let i = 0; i < quotationsData.length; i++) {
  const q = quotationsData[i];
  let totalCost = 0, totalPrice = 0;
  for (const item of q.items) { totalCost += item.cost * item.quantity; totalPrice += item.price * item.quantity; }
  totalPrice += q.serviceFee;
  const r = insertQuot.run(generateQNo(i), q.custId, q.custName, q.status, q.deposit, q.serviceFee, totalCost, totalPrice, q.note, q.title, q.area, q.shipDate, q.delivery);
  for (const item of q.items) insertQItem.run(r.lastInsertRowid, item.category, item.name, item.spec, item.cost, item.price, item.quantity);
}
console.log(`  ✅ 估價單: ${quotationsData.length} 筆`);

// ========== 盤商報價 ==========
const supplierPrices = [
  { supplier: '原價屋', product: 'AMD Ryzen 7 9800X3D', price: 14200 },
  { supplier: '原價屋', product: 'AMD Ryzen 5 7600X', price: 4100 },
  { supplier: '原價屋', product: 'RTX 5080 FE', price: 31500 },
  { supplier: '原價屋', product: 'RTX 4060 Ti 8GB', price: 10200 },
  { supplier: '原價屋', product: 'RTX 4070 Super 12GB', price: 15800 },
  { supplier: '欣亞', product: 'Intel i7-14700K', price: 10200 },
  { supplier: '欣亞', product: 'Intel i5-14400F', price: 4600 },
  { supplier: '欣亞', product: 'ASUS ROG B650E-F', price: 6300 },
  { supplier: '欣亞', product: 'MSI B760M MORTAR WIFI', price: 4000 },
  { supplier: '欣亞', product: 'G.SKILL DDR5 32GB 6000', price: 3050 },
  { supplier: '欣亞', product: 'Kingston FURY DDR5 16GB', price: 1050 },
  { supplier: '立光', product: 'Samsung 990 Pro 2TB', price: 4300 },
  { supplier: '立光', product: 'WD SN850X 1TB', price: 2350 },
  { supplier: '立光', product: 'Seasonic GX-850', price: 3050 },
  { supplier: '立光', product: 'Corsair RM1000x', price: 4300 },
];
const insertPrice = db.prepare('INSERT INTO supplier_prices (supplier_name, product_name, price, source_text) VALUES (?,?,?,?)');
for (const p of supplierPrices) insertPrice.run(p.supplier, p.product, p.price, `${p.product} $${p.price.toLocaleString()}`);
console.log(`  ✅ 盤商報價: ${supplierPrices.length} 筆`);

// ========== 店家資訊 ==========
const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
upsertSetting.run('shop_address', '高雄市前鎮區凱旋三路 217 號');
upsertSetting.run('shop_phone', '07-000-0000');
upsertSetting.run('shop_line', '@nightstarzpc');
console.log('  ✅ 店家資訊已設定');

// ========== 盤商 + 進貨 + 結款 ==========
const supplierList = [
  { name: '原價屋', type: 'weekly', tax: 'tax_included', contact: 'LINE: @coolpc' },
  { name: '欣亞', type: 'monthly', tax: 'tax_excluded', contact: '02-2345-6789' },
  { name: '立光', type: 'cod', tax: 'tax_included', contact: 'LINE: likuang' },
  { name: '聯強', type: 'monthly', tax: 'tax_excluded', contact: '07-111-2222' },
  { name: '捷元', type: 'weekly', tax: 'tax_included', contact: '02-8888-9999' },
];
const insSupplier = db.prepare('INSERT OR IGNORE INTO suppliers (name, payment_type, default_tax_type, contact) VALUES (?,?,?,?)');
for (const s of supplierList) insSupplier.run(s.name, s.type, (s as any).tax || 'tax_included', s.contact);

const getSupId = (name: string) => (db.prepare('SELECT id FROM suppliers WHERE name=?').get(name) as any).id;

// 進貨訂單
const poData = [
  { sup: '原價屋', date: '2026-03-18', items: [
    { name: 'AMD Ryzen 7 9800X3D', brand: 'AMD', spec: 'AM5 8C/16T', qty: 2, cost: 14200 },
    { name: 'G.SKILL DDR5 32GB', brand: 'G.SKILL', spec: '6000MHz CL30', qty: 3, cost: 3050 },
  ]},
  { sup: '欣亞', date: '2026-03-20', items: [
    { name: 'Intel Core i5-14400F', brand: 'Intel', spec: 'LGA1700 10C/16T', qty: 3, cost: 4600 },
    { name: 'MSI MAG B760M MORTAR WIFI', brand: 'MSI', spec: 'mATX DDR5', qty: 2, cost: 4000 },
  ]},
  { sup: '立光', date: '2026-03-22', items: [
    { name: 'Samsung 990 Pro 2TB', brand: 'Samsung', spec: 'NVMe Gen4', qty: 5, cost: 4300 },
    { name: 'Seasonic FOCUS GX-850', brand: 'Seasonic', spec: '850W Gold', qty: 3, cost: 3050 },
  ]},
  { sup: '聯強', date: '2026-03-15', items: [
    { name: 'ROG STRIX RTX 4070S OC', brand: 'ASUS', spec: '12GB GDDR6X', qty: 1, cost: 17500 },
  ]},
  { sup: '捷元', date: '2026-03-10', items: [
    { name: 'Corsair RM1000x', brand: 'Corsair', spec: '1000W Gold', qty: 2, cost: 4300 },
    { name: 'NZXT H7 Flow', brand: 'NZXT', spec: 'ATX 黑', qty: 2, cost: 2700 },
  ]},
];

const insPO = db.prepare('INSERT INTO purchase_orders (supplier_id, supplier_name, tax_type, subtotal, tax_amount, total_amount, status, order_date) VALUES (?,?,?,?,?,?,?,?)');
const insPOItem = db.prepare('INSERT INTO purchase_order_items (purchase_order_id, product_name, brand, spec, quantity, unit_price) VALUES (?,?,?,?,?,?)');
for (const po of poData) {
  const supId = getSupId(po.sup);
  const sup = supplierList.find(s => s.name === po.sup);
  const tt = sup?.tax || 'tax_included';
  let subtotal = 0;
  for (const i of po.items) subtotal += i.cost * i.qty;
  let taxAmt = 0, total = subtotal;
  if (tt === 'tax_excluded') { taxAmt = Math.round(subtotal * 0.05); total = subtotal + taxAmt; }
  else if (tt === 'tax_included') { taxAmt = Math.round(subtotal - subtotal / 1.05); }
  const r = insPO.run(supId, po.sup, tt, subtotal, taxAmt, total, 'received', po.date);
  for (const i of po.items) insPOItem.run(r.lastInsertRowid, i.name, i.brand, i.spec, i.qty, i.cost);
}
console.log(`  ✅ 進貨紀錄: ${poData.length} 筆`);

// 結款紀錄
const stlData = [
  { sup: '原價屋', amount: 37500, start: '2026-03-11', end: '2026-03-17', status: 'paid' },
  { sup: '原價屋', amount: 37550, start: '2026-03-18', end: '2026-03-24', status: 'unpaid' },
  { sup: '欣亞', amount: 21800, start: '2026-03-01', end: '2026-03-31', status: 'unpaid' },
  { sup: '立光', amount: 30650, start: '2026-03-22', end: '2026-03-22', status: 'unpaid' },
  { sup: '捷元', amount: 14000, start: '2026-03-03', end: '2026-03-09', status: 'paid' },
];
const insStl = db.prepare('INSERT INTO settlements (supplier_id, supplier_name, tax_type, subtotal, tax_amount, amount, period_start, period_end, status, paid_date) VALUES (?,?,?,?,?,?,?,?,?,?)');
for (const s of stlData) {
  const sup = supplierList.find(x => x.name === s.sup);
  const tt = sup?.tax || 'tax_included';
  let sub = s.amount, tax = 0;
  if (tt === 'tax_excluded') { tax = Math.round(s.amount * 0.05); }
  else if (tt === 'tax_included') { tax = Math.round(s.amount - s.amount / 1.05); sub = s.amount - tax; }
  insStl.run(getSupId(s.sup), s.sup, tt, sub, tax, s.amount, s.start, s.end, s.status, s.status === 'paid' ? s.end : '');
}
console.log(`  ✅ 結款紀錄: ${stlData.length} 筆`);

// ========== 額外使用者 ==========
const userExists = db.prepare("SELECT id FROM users WHERE username = 'staff'").get();
if (!userExists) {
  db.prepare('INSERT INTO users (username, password, display_name, role, permissions) VALUES (?,?,?,?,?)').run(
    'staff', hashPassword('staff123'), '門市人員', 'user',
    JSON.stringify(['dashboard', 'inventory', 'quotations', 'customers'])
  );
  console.log('  ✅ 測試使用者: staff / staff123');
}

console.log('\n🎉 測試資料建立完成！');
console.log('   pnpm dev 啟動系統');
console.log('   管理員: admin / admin');
console.log('   門市人員: staff / staff123');
