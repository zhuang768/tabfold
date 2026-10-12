# TEST_REPORT.md — Tabfold 測試報告

**日期：** 2026-10-12（環境：macOS darwin，Node v22.18+ / v26.3.0）  
**範圍：** Round-4 完整修正後（覆蓋 R401–R420、R301–R324、R201–R220、C01–C24）

## 指令與結果摘要

| 指令                   | Exit code | 結果                                                                                         |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `npm ci`               | 0         | 165 packages；`found 0 vulnerabilities`                                                      |
| `npm run format:check` | 0         | Prettier 格式檢查全部通過                                                                    |
| `npm run typecheck`    | 0         | TypeScript 型別嚴格檢查通過                                                                  |
| `npm run lint`         | 0         | ESLint 0 warnings / 0 errors                                                                 |
| `npm run test`         | 0         | **57** 個單元測試全數通過（含 R401–R408 核心資料層與 R409–R414 UI 時序回歸）                 |
| `npm run build`        | 0         | 產出 `dist/`，包含 esbuild CSS 語法驗證 gate 與 manifest 字串同步                            |
| `npm run test:e2e`     | 0         | **5** Playwright 無頭 Chromium E2E 測試全數通過（含真音訊、原型 ID 安全、CDP Worker 停重啟） |
| `npm run test:perf`    | 0         | 產出 `output/perf/perf-samples.json`（p50=139.44ms, p95=186.78ms ≤200ms）                    |
| `npm run pack`         | 0         | `tabfold-extension.zip` 封裝完成且內容與 `dist/` 逐檔一致                                    |
| `npm audit`            | 0         | **0** vulnerabilities（未透過 audit --force，標準 lockfile 無 dead override）                |

## 單元測試（41 項安全與核心契約）

- **基礎範圍與操作（Scope & URL）**：
  - `current`、`others`、`window` 正確選取分頁，排除內部頁面與危險 scheme
  - 嚴格保留 Hash 路由與路徑 query，僅安全規範化結尾斜線
  - 白名單子網域與精確 Host 比對
  - 標題、網址、群組、標籤即時模糊搜尋
- **資料遷移與毀損防護（Migration & Corruption）**：
  - v1 分頁向後相容升級，讀取維持穩定 ID
  - 未知高版本（schemaVersion > 2）嚴格拒絕，避免降版覆寫空庫
  - `entries: null` 或壞項目嚴格拋出 `CorruptDatabaseError`
  - 遷移過程保留有效 Undo
  - 資料庫空值自動初始化為安全空庫
- **匯入與匯出（Import & Export）**：
  - JSON 匯入支援自動 ID 衝突重編號
  - v1 匯出相容格式正確辨識
  - 匯入格式安全過濾非法 scheme（如 `javascript:`、`file:`）
  - 純文字 `URL | title` 格式容錯匯入
  - 惡意 JSON 格式拒絕，不影響現存庫
- **資料庫交易與並行控制（Concurrency & Reliability）**：
  - 寫入失敗保證原始儲存庫不被污染
  - 並行交錯寫入經 `MutationQueue` 循序序列化，所有條目全數保留
  - 讀回驗證（read-back verification）失敗絕不關閉瀏覽器分頁
  - 巢狀備份與交易不互鎖
  - Undo 跨讀取與遷移維持持久性
- **Round 2, Round 3 & Round 4 核心修正（R201–R208, R301–R308, R401–R408）**：
  - R301: 執行階段空/無效 scope 拒絕於 mutation 之前
  - R302: 現行 schema 2 raw 欄位（status、favicon、index、pinned、title）嚴格檢查
  - R303: 首次草稿提醒強制綁定 token，禁止任意布林值繞過
  - R304: 統計數據寫入失敗提示警告而非靜默成功
  - R305: 備份還原保留唯一毀損 raw salvage，交易不符自動回滾
  - R307: Runtime 請求白名單集中過濾，拒絕未知 key 與溢出 batch 數值
  - R401: `constructor` 與 `__proto__` 特殊 ID 原型污染防護，Restore 與 Undo 先開分頁再移除條目，0 資料遺失
  - R402: 格式錯誤之儲存中繼資料在讀回校驗時直接拒絕，不關閉來源分頁
  - R403: 音訊確認權杖解耦，未儲存內容標記不得授權新發聲分頁關閉
  - R404: 關閉前不預先寫入 Undo；僅關閉成功的條目進入 Undo；分頁部分關閉僅復原實際關閉者
  - R405: 備份還原寫入後讀回失敗自動回滾原庫與毀損鍵，保持原始資料庫不變
  - R406: 多次毀損還原累積歷史 salvage（如 `ONLY-A` 與 `ONLY-B` 均保留），不覆蓋既有毀損條目
  - R407: 記憶體 Journal 回退機制，Session Storage 或 DB 寫入失敗重試不重複開頁，過期 Journal 驗證分頁存活
  - R408: 執行階段請求輸入嚴格前期校驗（編輯與還原模式格式錯誤於 mutation 前直接拒絕）
- **Round 4 UI 時序與狀態回歸（R409–R414）**：
  - R409: Popup 與 List 介面非 Undo 錯誤狀態展示時，持久化 Undo 按鈕獨立保留不被銷毀
  - R410: List 分頁選擇器防範過期非同步回應；Options 頁面初次載入前禁用儲存避免覆寫預設值
  - R411: 右鍵選單「Save other tabs」共用主要結果派送與確認邏輯
  - R412: 異步 API（openOptions、session storage）具備有界 catch 與友善英文錯誤提示
  - R413: Restore 單筆失敗清理 `.restoring` 狀態樣式，保持焦點與控制項可用
  - R414: 固定標題、品牌文字、Aria 標籤與錯誤提示統一自 `STRINGS` 安全單一來源生成

## E2E 整合測試（5 項無頭 Chromium 測試）

- **執行環境**：Playwright `channel: 'chromium'`，`headless: true`，背景安靜執行不搶奪桌面焦點；各測試具備獨立暫存目錄與 `try / finally` 資源與目錄徹底清理機制。
- **測試案例**：
  1. **主流程 UI/API 閉環**：Popup 真實點擊存分頁、關閉驗證、Popup Undo 按鈕點擊復原；Library UI 條目還原；Demo 載入；搜尋即時過濾；JSON 下載驗證；外站 favicon tracker 防護（0 連外請求）。
  2. **Worker 停止與恢復（CDP ServiceWorker）**：透過 Chrome DevTools Protocol 監聽 `ServiceWorker.workerVersionUpdated`，以 `ServiceWorker.stopWorker` 觸發真停止（`runningStatus: 'stopped'`），驗證舊執行域 nonce 清空重置為 `null`，喚醒後全庫 Raw DB 欄位 100% 一致；同 profile 瀏覽器重啟驗證持久化。
  3. **Popup 介面與選項無障礙**：略過新手教學即時隱藏 `#onboarding`；鍵盤 `Tab` 焦點走訪檢驗；`prefers-reduced-motion` 樣式規則檢驗；Options 頁面設定儲存與重新整理持久化。
  4. **七種特殊分頁與保窗邊界（含真音訊 Fixture）**：
     - 內部擴充功能/瀏覽器頁面跳過（`Browser pages cannot be saved`）
     - 未儲存表單草稿安全提示（Token-bound confirmation 流程與無效 Token 拒絕）
     - 真實音訊分頁 Fixture（AudioContext 產生音訊，未授權前不關閉，`confirmedAudio: true` 授權後關閉）
     - 重複分頁略過（`Already saved`）
     - 釘選分頁保護（`Pinned tabs stay open by default`）
     - 最後一分頁保窗機制（自動先開新空白頁再關閉，防止視窗銷毀）
     - 本機快照建立與還原閉環
  5. **原型 ID 安全（Prototype ID Safety）**：`constructor` 與 `__proto__` 特殊 ID 在真實 Chromium 瀏覽器中進行完整匯入、資料庫比對、Restore 開啟驗證與條目安全移除，驗證 0 資料遺失。

## 效能實測指標（1,000 條目與 Popup Ready）

根據 `npm run test:perf`（產出於 `output/perf/perf-samples.json`）：

- **Popup 可操作互動時間（Interactive Ready）**：
  - 測量口徑：Extension Page Tab (popup.html emulation in tab; 自動化無法直接量測原生 Chrome Action Bubble)
  - 條件：30 次連續樣本，嚴格檢查 Scope 載入完成、計數呈現、Loading 隱藏、條目清單繪製。
  - p50：**139.44 ms**（標準 ≤ 200 ms，達標）
  - p95：**186.78 ms**（標準 ≤ 200 ms，達標）
- **1,000 筆資料庫搜尋與滾動**：
  - 搜尋結果計算與 DOM 收斂：**21.56 ms**
  - 長清單滾動時間：**22.72 ms**（滾動高度 78,543 px）
  - JS Heap 記憶體使用：約 **3.7 MB**（3,729,730 bytes）
  - DOM 節點數量：11,263 nodes
- **Chrome Task Manager 記憶體**：
  - 自動化腳本無法直接讀取 Chrome 原生工作管理員表格，手動實測操作步驟詳見 `docs/HANDS_ON_ONLY.md`。

## 儲存容量實測（真實 Chrome getBytesInUse）

根據 `output/supervision/round-3/capacity-audit.json` 實測：

- 1,000 筆分頁資料庫體積：**265,770 bytes**（約 260 KB）
- 5 份本機滾動快照體積：**1,329,281 bytes**（約 1.30 MB）
- 總儲存體積：**1,595,051 bytes**（約 1.59 MB）
- 搭配 `unlimitedStorage` 權限，完全免除 10 MB 配額限制，且無未預期的擴充功能權限警告。
