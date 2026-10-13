# Known Limitations（已知限制）

以下僅列**無法在代理人環境完整自動化**或**刻意產品架構取捨**；可修核心缺陷（並行遺失、Undo 被清、毀損靜默清空、sticky popup alarm、外連 favicon、空 scope 誤關、格式檢查鬆散、UI 競態、原型污染遺失、毀損回滾、雙重救援遺失、Service Worker 途中重啟開雙分頁、about:blank 導航丟失、root schema 1.5 讀回拒絕、reset-all session 洩漏殘留、aux storage 失敗防盲目開頁、journal 讀取失敗防坍縮、durable Undo 回退入口、initial loading 視覺反饋、備份讀回校驗、最新 Undo 權威、中斷 Worker 重建、普通還原新開分頁、Reset 取消中途回呼、UI Generation 防覆寫、無關 Error 保持 Undo、Options busy 解除、備份深比較驗證、pending Save unknown I/O 區分、partial durable Undo 失敗項重試、Reset 在途發表序列化、Library transport 失敗保留重試等）已在 Round 1 至 Round 8 完整修正完畢，不以此文件掩蓋可修 bug。

1. **Chrome 工作管理員節省前後 MB**：在 Round 8 監工以原生 Chrome Task Manager 實測觀察到（`native-memory-valid-summary.json`）：合成 64MiB 來源分頁（PID 71148）儲存前佔用 95.2MB 工作程序、儲存關閉後該分頁程序確實完全釋放消失；擴充功能主進程 Library + Worker 共用 PID（71104）由 43.9MB 微調為 46.4MB，CPU 顯示 0.0%（非全系統絕對零，且有共用 PID 底層開銷，非全瀏覽器精確等額總 RAM 節省）。自動化測試在未手動觸發原生 Action Click 前無法直接分離工作管理員程序差值；UI「Est. ~N MB」仍為 `50MB × totalClosed` 靜態估計，手動實測操作步驟詳見 `docs/HANDS_ON_ONLY.md`。
2. **系統 Chrome + Playwright `channel:'chromium'`**：E2E 採用官方無頭 Chromium，背景安靜執行。日常使用以使用者安裝的 Chrome（≥127）載入 `dist/` 為準。
3. **路徑空白與打包**：專案目錄名含空白時，E2E 自動複製到 `/tmp` 無空白路徑避免 Chrome launch 參數中斷；正式打包腳本 `npm run pack` 則直接由 repo 根目錄產出 `tabfold-extension.zip` 並保證與 `dist/` 逐檔一致。
4. **`chrome.action.openPopup()`**：需使用者手勢／Chrome ≥127；自動化環境呼叫受限時仍有徽章與 session 結果，不阻斷儲存流程。
5. **1000 筆渲染**：v1 未強制引入虛擬化；實測 1,000 筆長清單（監工獨立實測 `perf-independent-attempt1`）：搜尋 23.06ms，JS Heap 約 2.60MB，連續 133 幀 rAF 無 long tasks 與無 long-animation-frames。歷史 134 幀觀測中記錄之 1 個 165.5ms long-animation-frame 僅為單次繪製時長，無歸因資料，不作首幀 paint 因果宣稱。
6. **Popup 開啟時間與原生 Action Bubble 測量**：無頭 Chromium 30 次連續真實可操作互動測量（Extension Tab 模擬），工程師實跑 p50=136.27ms、p95=188.82ms，監工獨立實測 p50=133.08ms、p95=188.1ms，全數符合 ≤200ms 目標。原生 Action Bubble API 發起至觀察首互動 handler 完成之上界測量（含 CDP attach 與 5ms 觀測週期，見 `native-popup-first-interaction-attempt3/4`）：3 筆條目 p50 約 31.0ms–309.4ms，1,000 筆條目 p50 約 393.4ms–454.7ms（其中 Chrome 擴充功能原生 API 開啟開銷本身約 280–299ms）。不能將此上界開銷直接等同於擴充功能本身頁面初始化或 OS 點擊延遲。詳見 `docs/TEST_REPORT.md`。
7. **無痕模式（Incognito）**：Chrome 限制擴充功能預設無法存取無痕視窗與分頁，除非使用者在 `chrome://extensions` 手動啟用「在無痕模式中允許」。自動化無頭環境在未獲使用者授權前無法變更此設定，但 E2E 測試已正式包含 `chrome.extension.isAllowedIncognitoAccess` 權限界線真測，確證在未授權時不拋錯亦不越權存取無痕分頁。
8. **Hibernate 自動化測試架構與無頭環境限制（Playwright Viewport / SIGSEGV / No tab with id）**：在 Playwright 自動化框架中，針對已 discarded 且無 view 之分頁進行 viewport emulation 時，Chromium 底層 `WebContentsImpl::SetDeviceEmulationSize` 會拋出 SIGSEGV 或出現「No tab with id」例外。於 Round 7 以直接啟動官方 Chrome headless 並僅透過原生 CDP 連線控制頁（不對 source tab 進行 viewport 模擬與預先 attach）進行獨立測試驗證（`output/engineer/round-7/attempt-2/hibernate-direct-cdp-attempt1-result.json`，commit `c4736d7a96d887fd72400f4b71c03602e6a2b29e`）：真實 Refresh picker、真實 Library DOM Hibernate 點擊、原生 `chrome.tabs.discard()` RPC 成功、分頁確實進入 `discarded: true` 與 `status: "unloaded"`、原始 URL／視窗／Index／Tab ID 與分頁數量完整保留、無 Save/Close 假計數，且重新啟用（`active: true`）能精確重新載入原內容（7 項斷言全數通過、0 error、完整資源清理）。然而 Playwright 單獨設定 `viewport: null` 仍會遭遇「No tab with id」，此證據完整保留；不能宣稱 Playwright 端上游框架根因已解，亦無需修改擴充功能產品實作或權限，其仍屬自動化測試框架層級之方法限制。
9. **真實媒體播放確認**：單元與 E2E 均覆蓋真實音訊 fixture（以 AudioContext 產生音訊，確保 `tab.audible === true`）與 token 綁定，確認無 token / 錯誤 token / 僅 unsaved 確認均無法關閉，必須具備有效 token 且明確 `confirmedAudio: true` 方得關閉。
10. **還原至原視窗／順序**：盡力使用 `windowId` + `index`；視窗已關或 index 衝突時退回預設開新分頁。
11. **未儲存表單**：刻意不申請全站讀取權限，僅通用提醒。
12. **正式商店上架、日常 Chrome 設定檔實測**：僅使用者可做（見 `docs/HANDS_ON_ONLY.md`）。
13. **跨裝置同步**：不做（與本機限定衝突）。
14. **環境變數**：不需要；無 `.env.example`。
