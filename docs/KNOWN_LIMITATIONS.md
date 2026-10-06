# Known Limitations（已知限制）

1. **Chrome 工作管理員節省前後 MB**：代理人環境無法實測，已標未驗證；UI「Est. ~N MB」僅為 `50MB × 筆數` 估計。
2. **系統 Chrome + Playwright `channel:'chrome'`**：本機自動化未能載入 extension service worker；E2E 改用 Playwright bundled Chromium。日常使用仍以使用者安裝的 Chrome 載入 `dist/` 為準。
3. **路徑空白**：專案目錄名含空白時，部分 Chrome 啟動參數需複製到無空白路徑（E2E 已處理）。
4. **`chrome.action.openPopup()`**：存入後開啟結果 popup 可能因手勢／版本失敗；失敗時仍有徽章與 session 結果，不阻斷存入。
5. **1000 筆虛擬列表**：尚未實作虛擬化；極長清單可能較慢。
6. **無痕模式**：需使用者手動允許；未自動化無痕 profile。
7. **Favicon**：只存分頁 API 的 URL；原站關閉後圖示可能失效，退回字母頭像。
8. **還原至原視窗／順序**：盡力使用 `windowId` + `index`；視窗已關或 index 衝突時退回預設開新分頁。
9. **未儲存表單**：刻意不申請全站讀取權限，僅通用提醒。
10. **正式商店上架、日常 Chrome 設定檔實測**：僅使用者可做（見 `HANDS_ON_ONLY.md`）。
11. **跨裝置同步**：不做（與本機限定衝突）。
12. **環境變數**：不需要；無 `.env.example`。
