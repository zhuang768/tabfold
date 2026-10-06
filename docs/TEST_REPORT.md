# TEST_REPORT.md — Tabfold 測試報告

**日期：** 2026-10-07（環境：macOS darwin 24.5.0，Node v26.3.0）  
**範圍：** Round-1 修正後 gate（C01–C24）

## 指令與結果摘要

| 指令                   | Exit code | 結果                                                                      |
| ---------------------- | --------- | ------------------------------------------------------------------------- |
| `npm ci`               | 0         | 165 packages；`found 0 vulnerabilities`；eslint deprecated 為開發依賴提示 |
| `npm run format:check` | 0         | Prettier 通過                                                             |
| `npm run typecheck`    | 0         | 通過                                                                      |
| `npm run lint`         | 0         | 0 warnings                                                                |
| `npm run test`         | 0         | **27** 個單元測試（含並行／Undo／毀損／巢狀備份）                         |
| `npm run build`        | 0         | 產出 `dist/`                                                              |
| `npm run test:e2e`     | 0         | **3** Playwright：存關還原 Undo、同 profile 重啟＋Worker 停醒、popup skip |
| `npm run test:perf`    | 0         | 原始樣本 `output/supervision/round-1/perf-samples.json`                   |
| `npm run pack`         | 0         | `tabfold-extension.zip`                                                   |
| `npm audit`            | 0         | **0** vulnerabilities（未使用 audit --force）                             |

## 單元（安全契約）

- 並行 `saveTabs` 序列化後兩筆皆在庫、`tabs.remove` 有呼叫（C01）
- `MutationQueue` 巢狀 `exclusive`＋`createBackup` 不死鎖
- Undo 經 remigrate／read 仍可用並開回分頁（C02）
- `entries:null`／混合壞筆／未知新版 → 毀損錯誤，不靜默空庫（C03）
- v1 穩定 id、v1 export 匯入非 0（C04）
- 完整欄位 verify、寫入／讀回失敗不關頁（C05）
- URL allowlist、保留 hash 路由、JSON 拒收 unsafe、round-trip 保留 id（C06）
- 記憶體估計用 `totalClosed`，不把 import 當 freed（C18）

## E2E（真實載入未封裝擴充功能）

- Playwright **bundled Chromium**，headed；`dist/` 複製到 `/tmp` 無空白路徑。
- Fixture：本機 HTTP server；分頁由 **extension `chrome.tabs.create`** 開啟（避免 Playwright 擁有生命週期導致關頁死鎖）。
- 案例：
  1. save → close → undo → save → restore；import 帶外站 favicon **不觸發** `/tracker` 請求
  2. 同 profile：load demo → CDP 關閉 service worker → wake `get-state` 筆數不變 → browser close/relaunch 筆數不變
  3. popup Skip 後 `#onboarding` computed `display:none`；options Save settings 顯示成功
- 截圖：`output/playwright/library-no-external-favicon.png`、`after-restart.png`、`popup-after-skip.png`

## 特殊分頁

| 情境                 | 實作                          | 實測                                     |
| -------------------- | ----------------------------- | ---------------------------------------- |
| `chrome://` 等內部頁 | `isInternalUrl`／略過         | 單元 URL；瀏覽器手動點圖示建議複驗       |
| 釘選分頁             | 預設跳過                      | 邏輯覆蓋                                 |
| 播放中音訊           | confirm token 綁定原 tab／URL | UI＋API；E2E 未播真實媒體                |
| 未儲存輸入           | **關閉前** ack，可記住        | E2E 以 `confirmedUnsaved`／settings 覆蓋 |
| 重複網址             | 保守去重，保留 fragment       | 單元                                     |
| 無痕                 | 需使用者開啟允許              | **未**自動化無痕 profile                 |
| 最後一分頁           | 關閉前先開 `chrome://newtab/` | 程式路徑存在                             |

## 故障注入

| 案例                      | 結果                 |
| ------------------------- | -------------------- |
| `LibraryStore` 寫入失敗   | 不關頁／庫不落地     |
| 讀回失敗（verify 中）     | `tabs.remove` 未呼叫 |
| 並行交錯寫入              | 兩筆皆存             |
| Worker Target.closeTarget | E2E：wake 後筆數一致 |

## 效能（原始數字）

見 `output/supervision/round-1/perf-samples.json`（`npm run test:perf` 產生）。重點欄位：

- `popupOpenToSaveVisibleMs.samples`（≥30）、`p50`、`p95`、`targetMs: 200`
- 1000 筆：`entryCountRendered`、`searchMs`、`scrollMs`、`heapUsedBytesFullList`、`domNodesFullList`
- Chrome Task Manager MB：**未驗證**（自動化不可得）

## 匯出再匯入

單元：空庫 round-trip 保留 id；v1 export 正確筆數。E2E：import 後 library 重載且無外連 favicon。
