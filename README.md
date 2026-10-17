# 星辰電腦 NSZPC 管理系統（DPOM）

星辰電腦內部用的管理系統：庫存（批次、FIFO 成本）、訂單（報價單、出機檢測表、發布到官網）、客戶、叫貨與結款、保固與維修、報表、YouTube／IG 數字、權限管理。

- 網址：<https://dpom.bluz.dev>（在 Cloudflare Access 後面，要先被加進允許清單）
- 一個 Cloudflare Worker（`nszpc-dpom`）：API 是 `src/`，資料在 D1、照片在 R2；前端是 `frontend/`（Next.js 靜態輸出 + Bootstrap 5，Apple 風格）
- 登入用 Cloudflare Access 的 email 驗證碼，系統不存密碼
- 官網（`nszpc_web`）是另一個 Worker，完成的訂單用 Workers RPC 發布成官網的出機紀錄

```
瀏覽器 → Cloudflare Access → Worker nszpc-dpom ─┬─ /api/* → src/worker.ts ── D1、R2、WEBSITE（官網的 WebsiteAPI）
                                                └─ 其他   → frontend/out
```

## 快速開始

```bash
npm install && npm --prefix frontend install
cp .dev.vars.example .dev.vars   # 本機用 DEV_USER_EMAIL 登入
npm run build                    # 前端
npm run dev                      # http://localhost:8787
npm run test:docs                # 文件、版號檢查（不用開伺服器）
npm test                         # 加上 API 整合測試（要開著 npm run dev）
npm run deploy                   # 檢查 → 正式 D1 migration → 部署
```

詳細步驟（多 Worker 本機開發、Cloudflare Access 設定、加使用者、備份還原、換網域）在 [docs/setup.md](docs/setup.md)。

## 文件

| 文件 | 內容 |
|---|---|
| [docs/README.md](docs/README.md) | 文件索引、維護規則、自動檢查 |
| [docs/requirements.md](docs/requirements.md) | 功能和業務規則 |
| [docs/architecture.md](docs/architecture.md) | 架構、資料表、D1 的限制、登入、扣庫存、安全 |
| [docs/api.md](docs/api.md) | 每一支 API |
| [docs/setup.md](docs/setup.md) | 開發、測試、部署、Cloudflare 設定 |
| [docs/decisions/](docs/decisions/) | 重要決定（ADR） |
| [docs/GUIDE.md](docs/GUIDE.md) | 操作說明（給店裡的人） |
| [DESIGN.md](DESIGN.md) | 介面設計規格 |
| [CHANGELOG.md](CHANGELOG.md)、[RELEASING.md](RELEASING.md) | 更新紀錄、怎麼發版 |
| [CLAUDE.md](CLAUDE.md) | 給 AI 的入口：指令、慣例、改程式要一起改的文件 |
