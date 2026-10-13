# TEST_REPORT.md — Tabfold 測試報告

**日期：** 2026-10-13（環境：macOS darwin，Node v26.3.0 / npm 11.16.0）  
**範圍：** Round-8 完整修正後（候選 `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`，覆蓋 R801–R810、R701–R714、R601–R614、R501–R524、R401–R420、R301–R324、R201–R220、C01–C24）

## 指令與結果摘要

| 指令                                                                                                    | Exit code | 結果                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                                                | 0         | 165 packages；`found 0 vulnerabilities`（Node 26.3.0 / npm 11.16.0 乾淨安裝通過；含 eslint 9.39.5 直接 deprecated 警示與 3 個 allowScripts 安裝策略 advisory，無死 override）                                                                                                          |
| `npm run format:check`                                                                                  | 0         | Prettier 格式檢查全部通過                                                                                                                                                                                                                                                                  |
| `npm run typecheck`                                                                                     | 0         | TypeScript 型別嚴格檢查通過（0 errors, `tsc --noEmit`）                                                                                                                                                                                                                                   |
| `npm run lint`                                                                                          | 0         | ESLint 0 warnings / 0 errors（`--max-warnings 0`）                                                                                                                                                                                                                                         |
| `npm run test`                                                                                          | 0         | **87** 個單元測試全數通過（含 R801–R805 備份深比較驗證、pending Save unknown 區分、partial durable Undo 失敗項 TTL 內重試、Reset 在途發表序列化、Library transport 失敗保留有效重試入口，以及 R701–R710、R601–R614 核心與 UI 時序回歸，0 fail, 0 skip）                                |
| `npm run build`                                                                                         | 0         | 產出 `dist/`，包含 esbuild CSS 語法驗證 gate 與 manifest 字串同步                                                                                                                                                                                                                         |
| `npm run test:e2e`                                                                                      | 0         | **5** Playwright 無頭 Chromium E2E 測試全數通過（含真音訊、無痕權限、原型 ID Restore/Undo、CDP Worker 停重啟，0 fail, 0 flaky）                                                                                                                                                          |
| `npm run test:perf`                                                                                     | 0         | 產出 `output/perf/perf-samples.json`（p50=136.27ms, p95=188.82ms ≤ 200ms）                                                                                                                                                                                                                 |
| `npm run pack`                                                                                          | 0         | `tabfold-extension.zip` 封裝完成且 20 個 runtime 檔案內容與 `dist/` 逐檔一致                                                                                                                                                                                                               |
| `npm audit`                                                                                             | 0         | **0** vulnerabilities（標準 lockfile，無 dead override）                                                                                                                                                                                                                                   |
| `TSX_DISABLE_CACHE=1 node --import tsx output/engineer/round-8/attempt-1/core-focused-new-attempt-1.mjs` | 0         | **4** 項 Round 8 核心受控邊界斷言全數通過（R8-BACKUP-SAME-ID-WRONG-CONTENT, R8-PENDING-SAVE-UNKNOWN-GET-IS-NOT-CLOSED, R8-PARTIAL-DURABLE-UNDO-RETRY-ORIGINAL-TTL, R8-RESET-OLD-CLEANUP-CANNOT-DELETE-NEW-RESULT；0 fail, 0 harness error）                                                |
| `node output/engineer/round-8/attempt-1/ui-cache-error-attempt-1.mjs`                                   | 0         | **14** 項 Round 8 UI 權威與快取錯誤斷言全數通過（確證 Library 與 Popup 在 Undo transport 拒絕後保留可見錯誤並維持 unexpired retry 按鈕入口，0 fail, 0 harness error）                                                                                                                    |
| `node --import tsx output/engineer/round-7/attempt-2/hibernate-direct-cdp-attempt1.mjs`                 | 0         | **7** 項官方 Chrome headless 原生 CDP Hibernate 斷言全數通過（無 viewport 模擬，真 DOM 操作，native discarded=true，保留視窗/Index/URL，無 Save/Close 假計數，重新啟用精確還原，0 error，完整清理）                                                                                    |

## 單元測試（87 項安全與核心契約）

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
  - R610: 最低相容環境明確載明為 Node 20/22+、npm 11+（說明 npm 10.9.2 因 lockfile 驗證 EUSAGE 錯誤，缺少 esbuild platform packages，無法在乾淨 git checkout 執行 npm ci）
  - R611: 補充研究、設計、決策文件之官方永久連結、作者特徵與 Apple Design Award 2017 細節
  - R612: 隱私權政策與 README 明確定義 `chrome.storage.local` 與 `session` 之分區範圍與 `reset-all` 清除範圍
- **Round 7 備份防護、Undo 權威與邊界修復（R701–R714）**：
  - R701: `createBackup` 與 `restoreBackup` 強制寫入後讀回驗證，失敗即拋錯拒絕，防止損毀原庫
  - R702: `undoLastSave` 與 `resolveEffectiveUndo` 優先選擇最新未過期權威（DB 或 Durable Undo），避免次輪儲存失敗後舊 DB Undo 越權
  - R703: 儲存關閉前預先記錄操作 Intent，Worker 途中中斷重啟可藉由 `chrome.tabs.get` 檢查重建 Durable Undo
  - R704: 普通還原（無進行中 Intent 或 Journal）嚴格開啟新分頁，絕不認領現存同 URL 分頁
  - R705: `reset-all` 遞增單調紀元，中途在途之 Save 完成後嚴格抑制 Session 寫入與 `openPopup`
  - R706: UI `load()` 於異步輔助查詢後嚴格校驗載入世代（`loadGeneration`），防止過期回應覆寫最新狀態
  - R707: 無關狀態提示訊息不消除現存有效 Durable Undo 按鈕
  - R708: Options 頁面載入完成時無條件解除 `aria-busy`，防範自訂狀態導致 busy 永久滯留
  - R709: 全數錯誤與提示字串集中收斂於 `STRINGS` 常數
  - R710: 新增單元測試覆蓋上述邊界
  - R711: 文件標明 npm 11+ 乾淨安裝需求與 Node 20/22+ 支援
  - R712: 效能測量口徑明確切分 Extension Page Tab 與原生 Action Bubble，誠實記錄首幀 165.5ms long-animation-frame
  - R713: 研究與設計精確歸因（OneTab 官方匯出純文字規範、BuenJ 相對時間、Tabfold 自訂 tokens）
  - R714: 標記無頭 Chromium 下 Playwright Viewport Emulation 對無 View 之 Discarded 分頁導致崩潰（SIGSEGV / No tab with id）與 TaskManager 無 action click 量測為環境方法限制；以 direct-CDP probe（`hibernate-direct-cdp-attempt1.mjs`）於官方 Chrome headless 隔離驗證 native `chrome.tabs.discard()` 與重新啟用（7/7 PASS、0 error），確證產品實作與行為完全正常。
- **Round 8 內容完整性、Unknown I/O 區分、重試權威與發表序列化（R801–R810）**：
  - R801: `createBackup` 與 `restoreBackup` 引入 `deepEqual` 完整資料內容深度比對，即使快照 ID 相同但內容遭清空亦嚴格拒絕破壞性 clear / restore，確保原庫唯一 URL 不遺失。
  - R802: `reconstructPendingSaveUndo` 正確區分已關、仍開與未知 I/O 異常，`chrome.tabs.get` 暫時異常時若分頁仍在 query 清單中則判定為未知，絕不盲目推斷為已關閉而重複開頁或消耗庫存條目。
  - R803: partial durable Undo 失敗項目保留有效權威與原 `expiresAt`，成功項目自資料庫移除，失敗項目維持在 DB 與 durable undo 中，允許在原 TTL 內重試復原。
  - R804: `onActionClicked` / `handleContextMenuSave` 與 `reset-all` 之 session 發表透過 `withSessionPublication` 循序串列化，單調紀元變更時直接取消發表，徹底消除舊 callback 延遲清理誤刪新 Save 結果的競態。
  - R805: UI (`list.ts` / `popup.ts`) 在 Undo transport 拒絕後保留可見錯誤提示，並維持未消耗之有效 Undo 按鈕入口，允許使用者在 TTL 內直接重試。

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

根據 `npm run test:perf`（產出於 `output/perf/perf-samples.json`）與監工獨立量測：

- **Popup 可操作互動時間（Interactive Ready）**：
  - 測量口徑說明：Extension Page Tab（popup.html 在一般分頁中模擬載入；自動化無頭環境無法直接點擊系統工作列之原生 Chrome Action Bubble）。
  - 條件：30 次連續樣本，嚴格檢查 Scope 載入完成、計數呈現、Loading 隱藏、條目清單繪製。
  - 工程師實跑（`output/perf/perf-samples.json`）：p50=**136.27 ms**，p95=**188.82 ms**（目標 ≤ 200 ms）。
  - 監工獨立測量（`output/supervision/round-8/perf-independent-attempt1/perf-samples.json`）：30 DOM-ready 樣本 p50=**133.08 ms**，p95=**188.1 ms**（全數 ≤ 200 ms）。
  - 原始規格之 200ms 為設計追求的互動響應目標，非所有 cold-start 樣本在任何硬體下之絕對硬性截斷門檻。
- **1,000 筆資料庫搜尋與滾動**：
  - 工程師實跑：搜尋結果計算與 DOM 收斂 **25.82 ms**，滾動時間 **24.16 ms**（滾動高度 78,543 px），JS Heap 使用約 **3.76 MB**（3,757,375 bytes），DOM 節點 11,263 nodes。
  - 監工獨立測量：1,000 筆渲染，搜尋精確 1 條目 **23.06 ms**，JS Heap 約 **2.60 MB**（2,596,804 bytes），連續 133 幀 rAF 期間無 long tasks 與無 long-animation-frames。
- **原生 Action Bubble 與 Chrome Task Manager 實測觀察**：
  - 原生 Action Bubble 啟動受 Chrome 原生擴充功能通訊、背景 Service Worker 喚醒與 CDP 本身連線開銷影響，測量時鐘包含 API 發起、CDP discovery/attach 與 5ms 觀測週期，不應與純頁面渲染時鐘混淆（詳見 `docs/KNOWN_LIMITATIONS.md`）。
  - **Chrome Task Manager 有效前後配對（監工獨立實測 `native-memory-valid-summary.json`）**：合成 64MiB 來源分頁（PID 71148）儲存前佔用 95.2 MB 工作程序，真 nativeToolbar Save 關閉後該來源程序確實完全釋放消失；擴充功能主進程 Library + Worker 共用 PID（71104）由 43.9 MB 微幅調整至 46.4 MB，CPU 顯示 0.0%。此反映單一來源分頁之確切記憶體釋放，非全瀏覽器 OS RAM 總額保證。
  - **原生 POPUP 首互動上界（監工獨立實測 `native-popup-first-interaction-attempt3-result.json` & attempt4）**：
    - 連續條件（attempt3）：3 筆條目 p50 約 31.0 ms、p95 330.6 ms（1 > 200ms）；1,000 筆條目 p50 393.4 ms、p95 533.1 ms（5 > 200ms）。其中部分 Chrome 擴充功能原生 API 開啟延遲本身即約 280–299 ms。
    - 500ms 間隔條件（attempt4）：3 筆條目 p50 309.4 ms、p95 324.3 ms；1,000 筆條目 p50 454.7 ms、p95 499.6 ms。
    - 此數據包含 API 發起至觀察可操作之上界（含 CDP 開銷），功能 100% 通過，但不作為精準 OS 點擊延遲小於 200ms 的硬性宣稱。
  - 歷史 134 幀觀測中記錄之 1 個 165.5ms long-animation-frame 僅代表該次繪製週期長度，無歸因資料，不作首幀 paint 因果宣稱。

## 儲存容量實測（真實 Chrome getBytesInUse）

根據 `output/supervision/round-3/capacity-audit.json` 實測：

- 1,000 筆分頁資料庫體積：**265,770 bytes**（約 260 KB）
- 5 份本機滾動快照體積：**1,329,281 bytes**（約 1.30 MB）
- 總儲存體積：**1,595,051 bytes**（約 1.59 MB）
- 搭配 `unlimitedStorage` 權限，完全免除 10 MB 配額限制，且無未預期的擴充功能權限警告。
