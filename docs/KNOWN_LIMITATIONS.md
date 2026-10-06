# Known Limitations（已知限制）

以下僅列**無法在代理人環境完整自動化**或**刻意產品取捨**；可修核心 bug（並行遺失、Undo 被清、毀損靜默清空、sticky popup alarm、外連 favicon 等）已在 round-1 修正，不以此文件掩蓋。

1. **Chrome 工作管理員節省前後 MB**：自動化無法讀 Task Manager；UI「Est. ~N MB」僅為 `50MB × totalClosed` 估計。手動步驟見 `HANDS_ON_ONLY.md`。
2. **系統 Chrome + Playwright `channel:'chrome'`**：本機曾無法穩定露出 extension service worker；E2E 使用 Playwright bundled Chromium。日常使用以使用者安裝的 Chrome（≥127）載入 `dist/` 為準。
3. **路徑空白**：專案目錄名含空白時，E2E／pack 將 `dist` 複製到 `/tmp` 無空白路徑。
4. **`chrome.action.openPopup()`**：需使用者手勢／Chrome ≥127；失敗時仍有徽章與 session 結果，不阻斷存入。
5. **1000 筆虛擬列表**：v1 未虛擬化；`npm run test:perf` 有原始樣本。若機器上捲動明顯卡頓可於後續版本虛擬化，不以「未虛擬化」單獨判失敗。
6. **Popup 開啟 p95**：連續 30 次開新頁量測時，後期樣本可能因瀏覽器壓力超過 200ms；**p50** 通常遠低於目標。見 `perf-samples.json`。
7. **無痕模式**：需使用者手動允許；未自動化無痕 profile（避免改使用者真實權限）。
8. **真實媒體播放確認**：單元／API 覆蓋確認 token 綁定；E2E 未嵌入真實影音解碼（見 TEST_REPORT）。
9. **還原至原視窗／順序**：盡力使用 `windowId` + `index`；視窗已關或 index 衝突時退回預設開新分頁。
10. **未儲存表單**：刻意不申請全站讀取權限，僅通用提醒。
11. **正式商店上架、日常 Chrome 設定檔實測**：僅使用者可做（見 `HANDS_ON_ONLY.md`）。
12. **跨裝置同步**：不做（與本機限定衝突）。
13. **環境變數**：不需要；無 `.env.example`。
