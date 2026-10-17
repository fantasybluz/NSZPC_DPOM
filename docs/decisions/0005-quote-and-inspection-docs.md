# 0005 報價單、出機檢測表參考 Bluz Computer Studio，在瀏覽器產生 PDF／圖片

- 狀態：採用
- 日期：2026-10-16

## 背景

原本「匯出估價單」是開一個新視窗、印一張很陽春的表；出機檢查單是 `quotations.qc_data` 一個 JSON 欄位，存了也沒地方好好給客人看。
使用者的另一個專案 Bluz Computer Studio（`bluz_computer_studio`）已經有做得不錯的報價單和檢測表（A4 版面、匯出 PDF、貼 LINE 的圖片），
要照那個做。客人主要用 LINE 溝通，要能直接貼圖片和文字。

## 決定

- **報價單**（`QuoteDocModal.tsx`）：A4 預覽，下載 PDF、JPG，產生圖片一鍵複製貼 LINE；另外三段可以複製的文字（採購清單、文字版報價、匯款資訊）。
  店家資訊、注意事項、匯款帳號存在 `settings.quote_doc`，所有報價單共用
- **出機檢測表**（`InspectionModal.tsx`）：新的 `inspections` 表（migration 0005），一張訂單一份；高壓測試和逐項檢查存成 JSON 陣列。
  預設項目照星辰原本的出機檢查單（OCCT、R23、AIDA64 + FurMark、驅動、配件），版面和說明文字改寫自 Bluz Computer Studio。舊的 `qc_data` 在 0006 刪掉
- **在瀏覽器產生**：html2canvas 把畫好的 A4 節點截圖（2 倍解析度），jsPDF 轉成 PDF（`frontend/src/lib/docExport.ts`）。
  **不在 Worker 產 PDF**：Worker 沒有瀏覽器引擎，
  用程式自己排 PDF 的話中文字型檔很大、免費方案的 CPU 時間也不夠

## 代價

- PDF 是圖片（截圖），裡面的字不能選取、搜尋，檔案也比文字 PDF 大
- 每台裝置畫出來可能有一點差異（字型），看的是瀏覽器有的字
- html2canvas、jsPDF 加起來幾百 KB，只在按匯出時才載入（`import()`）
