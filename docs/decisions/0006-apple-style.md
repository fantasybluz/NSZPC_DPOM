# 0006 介面改成 Apple 風格，用 apple.css 疊在原本的樣式上

- 狀態：採用
- 日期：2026-10-16

## 背景

原本是 Bootstrap 5 預設的樣子加一些自己的 CSS（`globals.css`），手機上表格擠成一團、選單排不下。
使用者要整個系統換成 Apple 風格，手機、平板也要能用。

## 決定

- 設計規格用 getdesign 的 Apple 版：`npx getdesign@latest add apple`，產生根目錄的 [DESIGN.md](../../DESIGN.md)，寫 UI 前先看
- **新增 `frontend/src/styles/apple.css`，疊在 Bootstrap 和 `globals.css` 上面**（`app/layout.tsx` 最後 import），用覆蓋 Bootstrap class 和 CSS 變數的方式改：
  顏色（強調色只有 Action Blue `#0066cc`，其他黑、白、淺灰 `#f5f5f7`）、系統字型、圓角、陰影、按鈕、表格、Modal
- **不改寫每個元件**：頁面還是 Bootstrap 的 class，十個頁面幾千行不用動
- 手機版（RWD）：側欄在窄螢幕變成滑出來的、表格外面包可以左右滑的容器、表單改一欄、按鈕好按

## 代價

- 樣式分在兩個檔案、加上 Bootstrap，同一個元件的樣子要看三個地方；新樣式寫在 `apple.css`，不要再加到 `globals.css`
- 覆蓋 Bootstrap 的選擇器要夠具體，有時候要 `!important`
- 升級 Bootstrap 大版本時要檢查 `apple.css` 還蓋不蓋得住
- 每個改到的畫面要在 393px（iPhone）和 1440px（筆電）寬都看過
