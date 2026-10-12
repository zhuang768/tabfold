# TEST_REPORT.md — Tabfold 測試報告

**日期：** 2026-10-12（環境：macOS darwin，Node v22.18+ / v26.3.0）  
**範圍：** Round-6 完整修正後（覆蓋 R601–R614、R501–R524、R401–R420、R301–R324、R201–R220、C01–C24）

## 指令與結果摘要

| 指令                                                                                              | Exit code | 結果                                                                                                           |
| ------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                          | 0         | 165 packages；`found 0 vulnerabilities`                                                                        |
| `npm run format:check`                                                                            | 0         | Prettier 格式檢查全部通過                                                                                      |
| `npm run typecheck`                                                                               | 0         | TypeScript 型別嚴格檢查通過                                                                                    |
| `npm run lint`                                                                                    | 0         | ESLint 0 warnings / 0 errors                                                                                   |
| `npm run test`                                                                                    | 0         | **72** 個單元測試全數通過（含 R601–R614、R501–R510 核心資料層與 R512–R515 UI 時序回歸）                        |
| `npm run build`                                                                                   | 0         | 產出 `dist/`，包含 esbuild CSS 語法驗證 gate 與 manifest 字串同步                                              |
| `npm run test:e2e`                                                                                | 0         | **5** Playwright 無頭 Chromium E2E 測試全數通過（含真音訊、無痕權限、原型 ID Restore/Undo、CDP Worker 停重啟） |
| `npm run test:perf`                                                                               | 0         | 產出 `output/perf/perf-samples.json`（p50=139.44ms, p95=186.78ms ≤200ms）                                      |
| `npm run pack`                                                                                    | 0         | `tabfold-extension.zip` 封裝完成且內容與 `dist/` 逐檔一致                                                      |
| `npm audit`                                                                                       | 0         | **0** vulnerabilities（未透過 audit --force，標準 lockfile 無 dead override）                                  |
| `TSX_DISABLE_CACHE=1 node --import tsx output/supervision/round-6/round6-new-attempt/core-new-boundaries-verify.mjs` | 0 | **6** 項核心邊界與反例全數通過（0 fail, 0 harness error）                                                     |
| `node output/supervision/round-6/round6-new-attempt/root-schema-write-verify.mjs`                 | 0         | 真實 Chrome MV3 載入延伸套件，寫入 root schemaVersion=1.5 嚴格拒絕且不關閉來源分頁（PASS）                      |
| `node output/supervision/round-6/round6-new-attempt/reset-session-verify.mjs`                      | 0         | 真實 Chrome MV3 reset-all 徹底清除 session 與 token，舊 token 無法關閉來源分頁（PASS）                          |
| `node output/supervision/round-6/round6-new-attempt/ui-initial-loading-verify.mjs`               | 0         | **6** 項三頁面初期載入與 busy/loading 視覺回饋全數通過（PASS）                                                 |
| `node output/supervision/round-6/round6-new-attempt/ui-durable-authority-verify.mjs`              | 0         | **14** 項持久性 Undo 與 Replay 授權狀態全數通過（PASS）                                                        |
| `node output/supervision/round-6/round6-new-attempt/ui-boundary-verify.mjs`                      | 0         | **27** 項 UI 邊界與狀態隔離斷言全數通過（0 fail, 0 harness error）                                             |

## 單元測試（65 項安全與核心契約）

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
- **Round 2 至 Round 4 核心修正（R201–R208, R301–R308, R401–R408）**：
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
  - R407: 強化精確 `expect(b.created.length).toBe(1)`，Session Storage 或 DB 寫入失敗重試不重複開頁，過期 Journal 驗證分頁存活
  - R408: 執行階段請求輸入嚴格前期校驗（編輯與還原模式格式錯誤於 mutation 前直接拒絕）
- **Round 5 核心與儲存回歸（R501–R511, R516）**：
  - R501: `verifyTabAlive` 嚴格比對預期 URL，導航至 `about:blank` 拒絕判定成功，資料庫記錄完整保留
  - R502: 建立持久化 Intent 與雙層 Journal（Driver 與 Session 同步），防範 Service Worker 意外重啟遺失狀態
  - R503: 採用自有屬性描述元（`Object.defineProperty`）序列化與解析原型安全條目（`__proto__`, `constructor`）
  - R504: 協同 Restore 與 Undo 操作權威狀態，防範跨介面重複開啟
  - R505: 關閉分頁後建立持久化 Undo 備份，寫入失敗亦可從持久鍵安全重建
  - R506: 寫入讀回嚴格校驗（`strictCurrent: true`），格式缺失或前後空白字串立即拒絕，不掩蓋破損
  - R507: 備份還原過程納入交易 Rollback 與 Salvage 保留，寫入失敗完全復原
  - R508: 遷移於獨佔鎖（`exclusive`）內重新讀取 Raw 並追加 Salvage 歷史，絕不覆寫早期唯一記錄
  - R509: 遷移 V1 條目遇到現有 ID 衝突時循環檢查 Suffix，杜絕二次碰撞
  - R510: 儲存分頁時偵測跨視窗移動，保護新目標視窗不因僅剩最後一頁而關閉
  - R511: 集中化前端請求前期驗證，無效參數於碰觸資料庫前即時拒絕
  - R516: 後端錯誤字串集中於 `STRINGS`，保持英文單一來源
- **Round 6 核心儲存與邊界修復（R601–R614）**：
  - R601: 寫入後讀回嚴格校驗 `schemaVersion === SCHEMA_VERSION`（2），排除 1.5、小數、負數或缺失，拒絕寫入且絕不關閉來源分頁
  - R602: 輔助儲存寫入失敗或未驗證之 Intent 嚴格拋出 `auxStorageUnavailable`，防範盲目開頁與遺留不可追蹤分頁
  - R603: 輔助儲存寫入拒絕明確回報，不視為可靠操作簿記
  - R604: Journal 讀取異常拋出 `journalReadUnavailable`，不隱匿或坍縮為空操作
  - R605: 現存 Schema 2 中繼資料嚴格型別校驗（統計非負整數、主題列舉、revision 非負整數），異常判定毀損，禁止設定編輯覆寫
  - R606: `reset-all` 徹底清除本機與 Session 儲存所有 Tabfold 鍵，防範舊 Token 關閉分頁
  - R607: Popup、List、Options 三介面初期載入階段加入明確視覺 loading 與 `aria-busy` 語意
  - R608: 持久性 Undo（`tabfold_durable_undo`）作為公開狀態回退來源，介面重啟維持 Undo 控制項可見性
  - R609: 集中管理所有錯誤與提示字串於 `src/strings.ts`，禁止未集中字串
  - R610: 最低相容環境明確載明為 Node 20/22+、npm 11+
  - R611: 補充研究、設計、決策文件之官方永久連結、作者特徵與 Apple Design Award 2017 細節
  - R612: 隱私權政策與 README 明確定義 `chrome.storage.local` 與 `session` 之分區範圍與 `reset-all` 清除範圍

## E2E 整合測試（5 項無頭 Chromium 測試）

- **執行環境**：Playwright `channel: 'chromium'`，`headless: true`，背景安靜執行不搶奪桌面焦點；加入 `ignoreDefaultArgs: ["--mute-audio"]` 與 `--autoplay-policy=no-user-gesture-required`。各測試具備獨立暫存目錄與 `try / finally` 資源徹底清理機制。
- **測試案例**：
  1. **主流程 UI/API 閉環**：Popup 真實點擊存分頁、關閉驗證、Popup Undo 按鈕點擊復原；Library UI 條目還原；Demo 載入；搜尋即時過濾；JSON 下載驗證；外站 favicon tracker 防護（0 連外請求）。
  2. **Worker 停止與恢復（CDP ServiceWorker）**：透過 Chrome DevTools Protocol 監聽 `ServiceWorker.workerVersionUpdated`，以 `ServiceWorker.stopWorker` 觸發真停止（`runningStatus: 'stopped'`），驗證舊執行域 nonce 清空重置為 `null`，喚醒後全庫 Raw DB 欄位 100% 一致；同 profile 瀏覽器重啟驗證持久化。
  3. **Popup 介面與選項無障礙**：略過新手教學即時隱藏 `#onboarding`；鍵盤 `Tab` 焦點走訪檢驗；`prefers-reduced-motion` 樣式規則檢驗；Options 頁面設定儲存與重新整理持久化。
  4. **七種特殊分頁與保窗邊界（含真音訊 Fixture 與無痕權限檢驗）**：
     - 內部擴充功能/瀏覽器頁面跳過（`Browser pages cannot be saved`）
     - 未儲存表單草稿安全提示（Token-bound confirmation 流程與無效 Token 拒絕）
     - 真實音訊分頁 Fixture（以 AudioContext 產生音訊，確保 `tab.audible === true`，無 token / 錯誤 token / 僅 unsaved 確認均無法關閉，必須具備有效 token 且明確 `confirmedAudio: true` 方得關閉）
     - 無痕模式邊界檢驗（透過 `chrome.extension.isAllowedIncognitoAccess` 確證權限邊界）
     - 重複分頁略過（`Already saved`）
     - 釘選分頁保護（`Pinned tabs stay open by default`）
     - 最後一分頁保窗機制（自動先開新空白頁再關閉，防止視窗銷毀）
     - 本機快照建立與還原閉環
  5. **原型 ID 安全（Prototype ID Safety）**：`constructor` 與 `__proto__` 特殊 ID 在真實 Chromium 瀏覽器中進行完整匯入、資料庫比對、Restore 開啟驗證、條目安全移除，以及對原型條目執行完整 Undo 復原驗證，0 資料遺失。

## 效能實測指標（1,000 條目與 Popup Ready）

根據 `npm run test:perf`（產出於 `output/perf/perf-samples.json`）：

- **Popup 可操作互動時間（Interactive Ready）**：
  - 測量口徑：Extension Page Tab (popup.html emulation in tab; 自動化無法直接點擊原生 Chrome Action Bubble)
  - 條件：30 次連續樣本，嚴格檢查 Scope 載入完成、計數呈現、Loading 隱藏、條目清單繪製。
  - p50：**139.44 ms**（標準 ≤ 200 ms，達標）
  - p95：**186.78 ms**（標準 ≤ 200 ms，達標）
- **1,000 筆資料庫搜尋與滾動**：
  - 搜尋結果計算與 DOM 收斂：**21.56 ms**
  - 長清單滾動時間：**22.72 ms**（滾動高度 78,543 px）
  - JS Heap 記憶體使用：約 **3.7 MB**（3,729,730 bytes）
  - DOM 節點數量：11,263 nodes
- **原生 Action Bubble 與 Chrome Task Manager 實測觀察**：
  - 原生 Action Bubble 啟動受 Chrome 原生擴充功能通訊、生命週期與 CDP 本身開銷影響，不直接等同於純頁面渲染時間（詳見 `docs/KNOWN_LIMITATIONS.md`）。
  - 在 Round 5 監工原生 Task Manager 實測觀察中：合成 64MiB 來源分頁儲存前佔用 96.5MB 工作程序、儲存關閉後該分頁程序確實完全釋放消失；擴充功能主進程 Library + Worker 共用 PID 由 38.9MB 增加至 44.5MB，CPU 顯示 0.0%（非絕對零，且有共用 PID 底層開銷）。
  - 1,000 筆長清單於真實瀏覽器實測 133 連續幀，p95 ≈ 16.7ms、最大 16.8ms、0 long tasks，已確證 60 FPS 流暢度。

## 儲存容量實測（真實 Chrome getBytesInUse）

根據 `output/supervision/round-3/capacity-audit.json` 實測：

- 1,000 筆分頁資料庫體積：**265,770 bytes**（約 260 KB）
- 5 份本機滾動快照體積：**1,329,281 bytes**（約 1.30 MB）
- 總儲存體積：**1,595,051 bytes**（約 1.59 MB）
- 搭配 `unlimitedStorage` 權限，完全免除 10 MB 配額限制，且無未預期的擴充功能權限警告。
