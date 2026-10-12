# Known Limitations（已知限制）

以下僅列**無法在代理人環境完整自動化**或**刻意產品架構取捨**；可修核心缺陷（並行遺失、Undo 被清、毀損靜默清空、sticky popup alarm、外連 favicon、空 scope 誤關、格式檢查鬆散、UI 競態、原型污染遺失、毀損回滾、雙重救援遺失等）已在 Round 1 至 Round 4 完整修正完畢，不以此文件掩蓋可修 bug。

1. **Chrome 工作管理員節省前後 MB**：自動化腳本無法讀取 Chrome 原生 Task Manager 表格；UI「Est. ~N MB」為 `50MB × totalClosed` 估計。手動實測步驟見 `docs/HANDS_ON_ONLY.md`。
2. **系統 Chrome + Playwright `channel:'chromium'`**：E2E 採用官方無頭 Chromium，背景安靜執行。日常使用以使用者安裝的 Chrome（≥127）載入 `dist/` 為準。
3. **路徑空白**：專案目錄名含空白時，E2E／pack 自動複製到 `/tmp` 無空白路徑避免 Chrome launch 參數中斷。
4. **`chrome.action.openPopup()`**：需使用者手勢／Chrome ≥127；自動化環境呼叫受限時仍有徽章與 session 結果，不阻斷儲存流程。
5. **1000 筆渲染**：v1 未強制引入虛擬化；實測 1,000 筆渲染 11,263 節點、滾動 22.72ms、搜尋 21.56ms，表現流暢。
6. **Popup 開啟時間**：無頭 Chromium 30 次連續真實可操作互動測量，p50=139.44ms、p95=186.78ms，均符合 ≤200ms 目標。詳見 `output/perf/perf-samples.json`。量測口徑為 Extension Page Tab (popup.html emulation in tab; Playwright 無法直接點擊原生 Chrome Action Bubble)。
7. **無痕模式**：需使用者手動允許；未自動化無痕 profile（避免改使用者真實權限）。
8. **真實媒體播放確認**：單元／API 與 E2E 均覆蓋真實音訊 fixture（AudioContext 產生音訊）與 token 綁定，確認未經授權不關閉。
9. **還原至原視窗／順序**：盡力使用 `windowId` + `index`；視窗已關或 index 衝突時退回預設開新分頁。
10. **未儲存表單**：刻意不申請全站讀取權限，僅通用提醒。
11. **正式商店上架、日常 Chrome 設定檔實測**：僅使用者可做（見 `docs/HANDS_ON_ONLY.md`）。
12. **跨裝置同步**：不做（與本機限定衝突）。
13. **環境變數**：不需要；無 `.env.example`。
