# TEST_REPORT.md — Tabfold 測試報告

**日期：** 2026-10-06（環境：macOS darwin 24.5.0，Node v26.3.0）

## 指令與結果摘要

| 指令                | Exit code | 結果                         |
| ------------------- | --------- | ---------------------------- |
| `npm run typecheck` | 0         | 通過                         |
| `npm run lint`      | 0         | 0 warnings                   |
| `npm run test`      | 0         | **19** 個單元測試通過        |
| `npm run build`     | 0         | 產出 `dist/`                 |
| `npm run pack`      | 0         | 產出 `tabfold-extension.zip` |
| `npm run test:e2e`  | 0         | **3** 個 Playwright 案例通過 |

單元案例涵蓋：存入範圍、去重／白名單／搜尋、遷移（含拒收新版）、JSON／純文字匯入匯出、寫入失敗不落地、樂觀鎖並行、讀回驗證、記憶體估計、demo 資料。

## E2E（真實載入未封裝擴充功能）

- 使用 Playwright **bundled Chromium**（本機系統 Chrome `channel:'chrome'` 在自動化下未露出 extension service worker，已記錄於 Known Limitations）。
- 擴充功能自 `dist/` 複製到 `/tmp/tabfold-e2e-dist`（避免路徑空白問題）。
- 隔離 profile：`output/playwright/user-data`（每次重建，不碰使用者真實資料）。
- 證據：
  - 截圖：`output/playwright/library.png`、`library-with-demo.png`、`popup.png`、`options.png`
  - Trace：`output/playwright/test-results/**/trace.zip`
- 覆蓋：library 載入、Load demo data、搜尋、匯出 JSON、popup／settings、`get-state` messaging。

## 特殊分頁（程式路徑 + 實測狀態）

| 情境                 | 實作                           | 實測                                           |
| -------------------- | ------------------------------ | ---------------------------------------------- |
| `chrome://` 等內部頁 | `isInternalUrl`／略過並提示    | 單元覆蓋 URL 判斷；瀏覽器手動點圖示建議複驗    |
| 釘選分頁             | 預設跳過                       | 邏輯覆蓋；建議手動複驗                         |
| 播放中音訊           | 需確認後才存                   | UI dialog + `confirmedAudio`；E2E 未播真實媒體 |
| 未儲存輸入           | 通用提醒、不申請全站讀取       | 字串與 DECISIONS；無表單注入測試（刻意）       |
| 重複網址             | 去重提示                       | 單元覆蓋                                       |
| 無痕                 | 需使用者開啟「允許在無痕使用」 | **未在無痕 profile 自動化**（見限制）          |
| 最後一分頁           | 關閉前先開 `chrome://newtab/`  | 程式路徑存在；建議手動複驗                     |

## 故障注入

| 案例                                 | 結果                                       |
| ------------------------------------ | ------------------------------------------ |
| 模擬 `LibraryStore.failing` 寫入失敗 | 通過：storage 仍空，對應「不關閉分頁」契約 |
| 樂觀鎖過期 revision                  | 通過：拋 Concurrent                        |
| 讀回驗證                             | 通過：`verifyEntriesPresent`               |

Service worker 被回收後再操作：依賴每次自 `storage.local` 重建；E2E 每次新 context 等於冷啟動讀庫（`get-state` 通過）。**未**另外用 `chrome://serviceworker-internals` 手動停 SW 的自動化。

## 大量資料

- 單元：搜尋／遷移邏輯與資料結構支援。
- **1000 筆捲動流暢度**：未做自動化 FPS 量測（見限制）；清單為一般 DOM，極大清單可能需後續虛擬化。

## 效能抽樣（擴充自身）

在 E2E 同一套 Chromium 中，以 library 頁 `performance.now()` 粗量「導向 list.html → `.brand` 可見」：

- 條件：冷啟動 isolation profile、demo 未載入、本機 2026-10-06。
- 觀察：約數十到低百毫秒級（隨機器變動）；**popup 200ms 目標**：未單獨做連續 30 次統計，標記為**抽樣通過傾向、非正式基準**。

## Chrome 工作管理員記憶體節省

**未驗證。** 自動化工具無法穩定讀取 Chrome Task Manager 的「存起前後」分頁 MB 數字。請使用者依 `docs/HANDS_ON_ONLY.md` 手動對照；UI 上的 MB 僅為估計公式，不得當作實測。

## 匯出再匯入

單元：JSON round-trip 去重行為通過；E2E：demo → Export JSON 檔案含 `tabfold-json` 與 wikipedia URL。
