# 星辰電腦 NSZPC 管理系統

內網使用的星辰電腦管理系統，涵蓋庫存管理、訂單管理、盤商報價提取、客戶關係管理、社群追蹤等功能。

## 功能特色

### 1. 庫存管理
- **左側分類樹 + 右側表格**雙欄佈局
- **任意深度分類**：例如 CPU › AMD › AM5（三層），顯示卡 › 華碩（兩層）
- **進貨/出貨管理**：批次進貨記錄、FIFO 或加權平均成本計算
- **批次明細**：每件商品可查看進貨批次、異動紀錄、FIFO 成本 vs 均價
- 成本/售價/利潤計算、低庫存警示
- 圖表視覺化（數量分佈、成本 vs 售價）

### 2. 訂單管理
- 訂單建立與管理，支援多個同分類項目
- **客戶搜尋下拉選單**：自動關聯客戶，帶入地區資訊
- **服務費**獨立欄位、自動計算毛利與毛利率
- 訂單狀態：尚未成交 → 已付訂金 → 尚未結單 → 已完成
- 訂單類型：備料中 / 組裝中 / 測試中 / 待出貨 / 已出貨 / 已送達
- **雙重篩選**：狀態 + 類型可組合篩選
- **項目拖曳排序**：拖曳手把調整零件順序
- **圖片附件上傳**（每筆訂單可上傳多張圖片）
- **匯出訂單**：自訂有效天數、自動帶入客戶物流資訊
- **出機檢查單**：完整 QC 表格匯出（OS/BIOS、OCCT、R23、AIDA64+FURMARK 等）
- **成交自動建檔**：訂單成交時自動將客戶新增至客戶管理

### 3. 盤商報價提取
- **Line 訊息解析**：貼上報價訊息自動提取品名與價格
- **圖片 OCR**：上傳報價單截圖或 Ctrl+V 貼上，自動辨識（Tesseract.js）
- **盤商下拉選單**：自定義盤商清單 + 歷史紀錄自動合併
- **報價日期**：每筆報價記錄日期，按月份分組顯示
- 歷史報價紀錄查詢與篩選

### 4. 客戶關係管理
- 客戶來源追蹤：YouTube、Instagram、Line、門市、朋友介紹
- **台灣地區分佈地圖**視覺化
- 服務紀錄（組裝、維修、升級等）
- 來源分佈統計圖表
- 與訂單雙向關聯

### 5. 社群追蹤
- **YouTube**：設定 API Key + 頻道 ID，即時查看訂閱數/觀看次數/影片數
- **Instagram**：自動爬蟲抓取追蹤人數（含手動輸入備案）
- **店家資訊**：地址/電話/LINE（用於出機檢查單）

### 6. 分類管理
- **任意深度**父子分類架構（無層數限制）
- 每個節點都可新增子分類
- **拖曳排序**
- 自訂圖示（Bootstrap Icons）
- 有庫存的分類無法刪除

### 7. 權限管理
- 使用者帳號管理（管理員/一般使用者）
- **頁面級權限控制**：管理員可設定每位使用者可存取的頁面
- 登入/登出

### 8. 儀表板
- 庫存品項/成本/利潤統計卡片
- YouTube 訂閱數 + Instagram 追蹤數即時顯示
- **當月訂單狀況**：狀態卡片 + 訂單類型 badge（可點擊篩選下方列表）
- 庫存分類圖表
- 低庫存警示（含完整分類路徑）

## 技術架構

| 層級 | 技術 |
|------|------|
| 語言 | TypeScript |
| 後端 | Node.js + Express + tsx + nodemon |
| 資料庫 | SQLite (better-sqlite3) |
| 前端 | HTML/CSS/JS + Bootstrap 5 |
| 圖表 | Chart.js |
| OCR | Tesseract.js (前端) |
| 套件管理 | pnpm |
| 容器化 | Docker + Docker Compose |
| CI/CD | GitHub Actions (Dev/Stage/Production) |

## 快速開始

### 前置需求

- Node.js 22+
- pnpm

### 安裝與啟動

```bash
# 安裝依賴
pnpm install

# 建立測試資料
pnpm seed

# 開發模式（nodemon 自動重啟）
pnpm dev

# 正式啟動
pnpm start
```

系統啟動後會顯示：
```
🖥️  星辰電腦管理系統已啟動: http://localhost:3000
📡 內網存取: http://192.168.x.x:3000
```

### 預設帳號

| 帳號 | 密碼 | 角色 | 權限 |
|------|------|------|------|
| admin | admin | 管理員 | 全部 |
| staff | staff123 | 門市人員 | 儀表板/庫存/訂單/客戶 |

### Docker 部署

```bash
docker compose up -d --build
```

## CI/CD 環境

| 分支 | 環境 | Port |
|------|------|------|
| `develop` | Development | 3001 |
| `staging` | Staging | 3002 |
| `main` | Production | 3000 |

## 測試

```bash
pnpm test
```

## 專案結構

```
├── src/
│   ├── server.ts              # 伺服器入口
│   ├── seed.ts                # 測試資料生成
│   ├── types/                 # TypeScript 型別定義
│   ├── models/
│   │   └── database.ts        # SQLite Schema + 成本計算工具
│   └── routes/
│       ├── auth.ts            # 認證與使用者管理
│       ├── inventory.ts       # 庫存 + 分類 + 進出貨
│       ├── quotations.ts      # 訂單管理
│       ├── customers.ts       # 客戶管理
│       ├── suppliers.ts       # 盤商報價 + OCR
│       └── settings.ts        # 設定 + IG 爬蟲
├── public/
│   ├── index.html
│   ├── img/logo.png           # 登入頁 Logo
│   ├── css/style.css          # 銀白科技感 RWD 樣式
│   └── js/
│       ├── api.js             # API 工具與認證
│       ├── app.js             # 主應用邏輯
│       └── pages/
│           ├── dashboard.js   # 儀表板
│           ├── inventory.js   # 庫存管理（分類樹 + 表格）
│           ├── quotations.js  # 訂單管理
│           ├── suppliers.js   # 盤商報價 + OCR
│           ├── customers.js   # 客戶管理 + 台灣地圖
│           ├── social.js      # 社群追蹤（YT/IG/店家）
│           ├── categories.js  # 分類管理（拖曳排序）
│           └── users.js       # 權限管理
├── tests/
│   └── api.test.ts
├── data/                      # SQLite DB + 上傳檔案（自動建立）
├── deploy/                    # 環境設定檔
├── .github/workflows/         # CI/CD Pipeline
├── Dockerfile
├── docker-compose.yml
├── tsconfig.json
└── package.json
```

## 注意事項

- 本系統設計為**內網使用**，不建議直接暴露到公網
- 認證使用 SHA-256 + 記憶體 Session，重啟伺服器後需重新登入
- 資料庫檔案位於 `data/shop.db`，請定期備份
- 上傳的圖片儲存在 `data/uploads/`
- 每次修改資料庫 schema 後需刪除 `data/shop.db` 重建（`rm -rf data && pnpm seed`）
