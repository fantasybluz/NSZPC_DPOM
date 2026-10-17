# 0009 版號：VERSION 單一來源、CHANGELOG.md，跟 cocktail-party、trip-ledger 同一套

- 狀態：採用
- 日期：2026-10-17

## 背景

原本版號寫在 `package.json` 和程式裡（`/api/version`、側欄），沒有一個固定的來源；使用的人也不知道每次更新改了什麼。
使用者的其他專案（cocktail-party、trip-ledger）已經有一套：一個 `VERSION` 檔、`CHANGELOG.md`、測試檢查兩邊一致。

## 決定

- 根目錄的 `VERSION`（例如 `3.4.0`）是唯一的來源：
  - Worker：`wrangler.jsonc` 的 `rules` 把 `VERSION` 當文字打包，`GET /api/version` 回它
  - 前端：`frontend/next.config.ts` 建置時讀 `VERSION`、`CHANGELOG.md`、git commit，放進 `NEXT_PUBLIC_*`
  - `package.json` 的 `version` 也要一樣（測試會檢查）
- `CHANGELOG.md` 寫給使用的人看，平常寫在「## 未發佈」底下，發版時改成版號（流程在 [RELEASING.md](../../RELEASING.md)）
- 側欄最下面顯示版號，點進去是更新紀錄；版號跟瀏覽器 localStorage 記的不一樣就顯示 NEW
- 版號接著原本的 3.x：新功能跳第二碼、修正跳第三碼、大改版跳第一碼
- `tests/version.test.ts` 檢查 `VERSION` 是 `x.y.z`、`CHANGELOG.md` 最上面是「未發佈」下一段就是 `VERSION`、`package.json` 一樣

## 代價

- 發版要改三個地方（`VERSION`、`package.json`、CHANGELOG 標題），漏了 `npm run check` 會失敗
- 前端的版號是 build 時放進去的，只改 `VERSION` 不重新 build 的話前端顯示舊的（`npm run deploy` 會 build）
