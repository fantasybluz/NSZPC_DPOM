# 發行新版

版號是給使用的人看「這版改了什麼」用的：系統側欄最下面顯示版號，點進去是「更新紀錄」。

## 流程

1. 改好程式後：`npm run check`（型別、文件測試、前端 build）、`npm test`（API 整合測試，要先 `npm run dev`）；文件要一起改（見 [docs/README.md](docs/README.md)）
2. 平常改的東西先寫在 `CHANGELOG.md` 的「## 未發佈」底下（已經部署、還沒發版的會顯示成「下一版」）
3. 要發版時：改 `VERSION` 和 `package.json` 的 `version`（例如 `3.5.0`），把「## 未發佈」那段的標題改成 `## 3.5.0`，上面再補一段空的「## 未發佈」
4. `npm run deploy`，commit、打標籤、推上去：

   ```bash
   git tag v3.5.0
   git push origin cloudflare v3.5.0
   ```

## 版號怎麼跳

- 新功能：第二碼（`3.5.0`）
- 只有修正、文字調整：第三碼（`3.4.1`）
- 大改版（例如換架構、換網址）：第一碼

## 版號從哪裡來

- `VERSION` 是唯一的來源：Worker 的 `/api/version`（`src/worker.ts`）和前端（`frontend/next.config.ts`）都讀它
- 前端建置時把版號、commit、建置日期和 `CHANGELOG.md` 一起放進頁面（`NEXT_PUBLIC_*`）
- 每個人看過的版號存在瀏覽器的 localStorage，版號變了側欄就顯示 NEW，打開更新紀錄後消失
- `tests/version.test.ts` 會檢查 `VERSION` 跟 `CHANGELOG.md` 最新的一版一致
