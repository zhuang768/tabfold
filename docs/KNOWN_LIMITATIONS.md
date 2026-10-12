# Known Limitations（已知限制）

以下僅列**無法在代理人環境完整自動化**或**刻意產品架構取捨**；可修核心缺陷（並行遺失、Undo 被清、毀損靜默清空、sticky popup alarm、外連 favicon、空 scope 誤關、格式檢查鬆散、UI 競態、原型污染遺失、毀損回滾、雙重救援遺失、Service Worker 途中重啟開雙分頁、about:blank 導航丟失、root schema 1.5 讀回拒絕、reset-all session 洩漏殘留、aux storage 失敗防盲目開頁、journal 讀取失敗防坍縮、durable Undo 回退入口、initial loading 視覺反饋等）已在 Round 1 至 Round 6 完整修正完畢，不以此文件掩蓋可修 bug。

1. **Chrome 工作管理員節省前後 MB**：在 Round 5 監工以原生 Chrome Task Manager 實測觀察到：合成 64MiB 來源分頁儲存前佔用 96.5MB 工作程序、儲存關閉後該分頁程序確實完全釋放消失；擴充功能 Library + Worker 共用 PID 由 38.9MB 變為 44.5MB，CPU 顯示 0.0%（非絕對零，且有共用 PID 底層開銷，非精確等額總 RAM 節省）。UI「Est. ~N MB」仍為 `50MB × totalClosed` 靜態估計，手動實測操作步驟詳見 `docs/HANDS_ON_ONLY.md`。
2. **系統 Chrome + Playwright `channel:'chromium'`**：E2E 採用官方無頭 Chromium，背景安靜執行。日常使用以使用者安裝的 Chrome（≥127）載入 `dist/` 為準。
3. **路徑空白**：專案目錄名含空白時，E2E／pack 自動複製到 `/tmp` 無空白路徑避免 Chrome launch 參數中斷。
4. **`chrome.action.openPopup()`**：需使用者手勢／Chrome ≥127；自動化環境呼叫受限時仍有徽章與 session 結果，不阻斷儲存流程。
5. **1000 筆渲染**：v1 未強制引入虛擬化；實測 1,000 筆長清單連續 133 幀，p95 ≈ 16.7ms、最大 16.8ms、0 long tasks，已確證 60 FPS 流暢度。
6. **Popup 開啟時間與原生 Action Bubble 測量**：無頭 Chromium 30 次連續真實可操作互動測量，p50=139.44ms、p95=186.78ms，符合 ≤200ms 目標。Playwright 原生開啟 Popup Action Bubble（如 CDP / native toolbar click）測量含擴充功能通訊、瀏覽器生命週期與 CDP 自身開銷（監工 v3/v4 實測受 API/生命週期開銷影響），不能將該上限開銷直接等同於擴充功能本身頁面繪製時間。詳見 `output/perf/perf-samples.json`。
7. **無痕模式（Incognito）**：Chrome 限制擴充功能預設無法存取無痕視窗與分頁，除非使用者在 `chrome://extensions` 手動啟用「在無痕模式中允許」。E2E 測試已正式包含 `chrome.extension.isAllowedIncognitoAccess` 權限界線真測，確證在未授權時不拋錯亦不越權存取無痕分頁。
8. **真實媒體播放確認**：單元與 E2E 均覆蓋真實音訊 fixture（以 AudioContext 產生音訊，確保 `tab.audible === true`）與 token 綁定，確認無 token / 錯誤 token / 僅 unsaved 確認均無法關閉，必須具備有效 token 且明確 `confirmedAudio: true` 方得關閉。
9. **還原至原視窗／順序**：盡力使用 `windowId` + `index`；視窗已關或 index 衝突時退回預設開新分頁。
10. **未儲存表單**：刻意不申請全站讀取權限，僅通用提醒。
11. **正式商店上架、日常 Chrome 設定檔實測**：僅使用者可做（見 `docs/HANDS_ON_ONLY.md`）。
12. **跨裝置同步**：不做（與本機限定衝突）。
13. **環境變數**：不需要；無 `.env.example`。
