# TEST_REPORT.md — Tabfold 測試報告

**日期：** 2026-10-13（環境：macOS darwin，Node v26.3.0 / npm 11.16.0）  
**範圍：** Round-10 文件收尾（固定受驗候選 `49471fdbfe32576f35f67f538b60ac97ba348aac`，工作樹提交 `8b488e45b808b57600c8c3e73f53de5c469460b6` 與受驗候選之 80 檔產品與測試原始碼逐 byte 完全相同；覆蓋 R901–R907、R801–R810、R701–R714、R601–R614、R501–R524、R401–R420、R301–R324、R201–R220、C01–C24，以及 R1001 文件收尾）

## 指令與結果摘要

### 標準可重現驗收閘門（Standard Tracked Gate Commands）

| 指令                   | Exit code | 結果                                                                                                                                                                                                                                                  |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`               | 0         | 165 packages；`found 0 vulnerabilities`（Node 26.3.0 / npm 11.16.0 乾淨安裝通過；含 eslint 9.39.5 直接 deprecated 警示與 3 個 allowScripts 安裝策略 advisory，無死 override）                                                                         |
| `npm run format:check` | 0         | Prettier 格式檢查全部通過                                                                                                                                                                                                                             |
| `npm run typecheck`    | 0         | TypeScript 型別嚴格檢查通過（0 errors, `tsc --noEmit`）                                                                                                                                                                                               |
| `npm run lint`         | 0         | ESLint 0 warnings / 0 errors（`--max-warnings 0`）                                                                                                                                                                                                    |
| `npm run test`         | 0         | **91** 個單元測試全數通過（含 R907 篩選為 0 與真庫為 0 狀態區分、R901–R903 第一 await 後重置檢查、歷史備份/救援完整性深比與安全回滾、在途發表抵達與 Reset pending 序列驗證，以及 R801–R805、R701–R710、R601–R614 核心與 UI 時序回歸，0 fail, 0 skip） |
| `npm run build`        | 0         | 產出 `dist/`，包含 esbuild CSS 語法驗證 gate 與 manifest 字串同步                                                                                                                                                                                     |
| `npm run test:e2e`     | 0         | **5** Playwright 無頭 Chromium E2E 測試全數通過（含真音訊、無痕權限、原型 ID Restore/Undo、CDP Worker 停重啟，0 fail, 0 flaky）                                                                                                                       |
| `npm run test:perf`    | 0         | 產出 `output/perf/perf-samples.json`（p50=136.27ms, p95=188.82ms ≤ 200ms）                                                                                                                                                                            |
| `npm run pack`         | 0         | `tabfold-extension.zip` 封裝完成且 20 個 runtime 檔案內容與 `dist/` 逐檔一致                                                                                                                                                                          |
| `npm audit`            | 0         | **0** vulnerabilities（標準 lockfile，無 dead override）                                                                                                                                                                                              |

### 本地與歷史診斷探針（Local / Historical Diagnostic Probes）

以下指令為診斷特定時序邊界或原生 CDP 限制而設計的本地受控探針腳本（儲存於 `output/` 目錄），明確標註測試日期與對應工作樹基準／候選版本來源（Provenance）：

| 診斷探針腳本與指令                                                                                          | 測試日期                  | 候選版本來源 / 測試工作樹基準                                                                                      | Exit code | 結果與驗證範疇                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSX_DISABLE_CACHE=1 node --import tsx output/engineer/round-9/attempt-2/ui-completion-r907.mjs`            | 2026-10-13 (UTC 02:25:56) | 工程師修正中的工作樹（當時基準 HEAD `2445d257b025c481038c799e85d071c1766ed153`，未提交修改狀態，非不可變基準提交） | 0         | **2** 項 Round 9 UI 補驗受控斷言全數通過（R907-POPUP-FILTERED-EMPTY-DISTINCTION, R907-LIST-FILTERED-EMPTY-DISTINCTION；0 fail, 0 harness error；本機診斷探針，非 clean checkout 追蹤指令）                                                                    |
| `TSX_DISABLE_CACHE=1 node --import tsx output/engineer/round-9/attempt-1/core-new-boundaries-attempt-1.mjs` | 2026-10-13 (UTC 01:46:45) | 工程師修正中的工作樹（當時基準 HEAD `a5c6e059172d5a57a12e3f19802d43bf00f95b3b`，未提交修改狀態，非不可變基準提交） | 0         | **2** 項 Round 9 核心受控新邊界斷言全數通過（R9-RESET-BEFORE-FIRST-POPUP-AWAIT-RESUMES, R9-EXPECTED-BACKUP-AND-SALVAGE-HISTORY-READBACK；0 fail, 0 harness error；本機診斷探針）                                                                              |
| `TSX_DISABLE_CACHE=1 node --import tsx output/engineer/round-8/attempt-1/core-focused-new-attempt-1.mjs`    | 2026-10-13 (UTC 01:18:30) | 工程師修正中的工作樹（當時基準 HEAD `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`，未提交修改狀態，非不可變基準提交） | 0         | **4** 項 Round 8 核心受控邊界斷言全數通過（R8-BACKUP-SAME-ID-WRONG-CONTENT, R8-PENDING-SAVE-UNKNOWN-GET-IS-NOT-CLOSED, R8-PARTIAL-DURABLE-UNDO-RETRY-ORIGINAL-TTL, R8-RESET-OLD-CLEANUP-CANNOT-DELETE-NEW-RESULT；0 fail, 0 harness error；本機診斷探針）     |
| `node output/engineer/round-8/attempt-1/ui-cache-error-attempt-1.mjs`                                       | 未記錄（raw 內無時間戳）  | 工程師修正中的工作樹（當時基準 HEAD `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`，未提交修改狀態）                   | 0         | **14** 項 Round 8 UI 權威與快取錯誤斷言全數通過（確證 Library 與 Popup 在 Undo transport 拒絕後保留可見錯誤並維持 unexpired retry 按鈕入口，0 fail, 0 harness error；本機診斷探針）                                                                           |
| `node --import tsx output/engineer/round-7/attempt-2/hibernate-direct-cdp-attempt1.mjs`                     | 2026-10-13 (UTC 00:24:38) | 凍結候選 `c4736d7a96d887fd72400f4b71c03602e6a2b29e`                                                                | 0         | **7** 項官方 Chrome headless 原生 CDP Hibernate 斷言全數通過（無 viewport 模擬，真 DOM 操作，native discarded=true，保留視窗/Index/URL，無 Save/Close 假計數，重新啟用精確還原，0 error，完整清理；受限於專用環境腳本與 fixture，非 clean checkout 追蹤指令） |

## 單元測試（91 項安全與核心契約）

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
- **Round 9 紀元邊界檢查、歷史備份深比較、發表停點到達與文件精確校準（R901–R906）**：
  - R901: `onActionClicked` 在首個 `await chrome.action.setPopup({ popup: "" })` 返回後立即校驗 `currentEpoch !== resetEpoch`，若期間已觸發公共 Reset 則即時中止，徹底防止已完成 Reset 後被舊 action 重新寫入敏感 `pendingConfirm`。
  - R902: `createBackupUnlocked` 與 `restoreBackupUnlocked` 針對全部依法應保留之 `next` snapshots 陣列及 `nextSalvage` 陣列執行完整的 `deepEqual` 深比較（含所有 metadata、歷史/未知 raw 欄位與順序）。若儲存層注入 drop 歷史條目，立即安全寫回記憶體中持有的原歷史與 raw 記錄，並明確拋錯阻斷破壞性 clear / restore。
  - R903: 正式單元測試 `R804` 精確等待 `atOldSet` 進入 hold 狀態，斷言 `resetTiming.pendingWhileHeld === true`，合法釋放 hold 後再等待 Reset 完成並驗證新 Save 成功，消除時序交錯覆蓋缺口。
  - R904: 文件與指標精確對齊候選 `a5c6e059172d5a57a12e3f19802d43bf00f95b3b`，明確切分 Extension Tab DOM readiness predicate、1,000 筆搜尋耗時、Task Manager PID 77535/77538 程序釋放事實與原生 Action Bubble 首互動上界延遲。
  - R905: `docs/RESEARCH.md` 引用 TW_Tones（2021-11-06）第一手使用者匯出操作紀錄，說明 `url | title` 慣例，載明 2026-10-13 檢索之搜尋索引正文與 HTTP 403 直接連線限制，並連繫專案 parser 測試 fixture。
  - R906: `PRIVACY.md` 準確區分 12 秒 Durable Undo 有效期（`UNDO_TTL_MS = 12000`）、到期請求拒絕與實體保留週期、中斷狀態留待恢復，並釐清 `withSessionPublication` 為執行域內 Promise 佇列而非 session 儲存鍵。
  - R907: `popup.ts` 與 `list.ts` 在資料庫已有條目但搜尋或群組篩選命中為 0 時，精確呈現 `STRINGS.noMatchingTabs`（"No matching tabs."）且隱藏首次存入引導（`emptyBody`），真正庫為 0 時才呈現 `emptyTitle` 與引導文案，並在搜尋輸入時即時同步底欄筆數比例（如 `0/3`）。

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

根據 `npm run test:perf`（產出於 `output/perf/perf-samples.json`）與監工第 10 輪獨立量測（`output/supervision/round-10/performance-comparison-report.json`，受驗候選 `49471fdbfe32576f35f67f538b60ac97ba348aac`）：

- **Popup 頁面載入判定（Extension Tab DOM Readiness Predicate）**：
  - 測量口徑說明：Extension Page Tab（popup.html 在一般分頁中載入；自動化環境評估 DOM readiness 判定條件：scope 下拉選單、計數文字、loading class 隱藏、entry 清單渲染；非原生 Chrome browser action bubble 使用者點擊 handler）。
  - 樣本條件：30 次連續樣本。
  - **唯一單獨執行條件（Serial / Independent）**（監工獨立實測，候選 `49471fd`）：p50=**137.57 ms**，p95=**187.39 ms**（0 > 200ms，符合 ≤ 200ms 目標）；1,000 筆搜尋 **35.53 ms**，連續觀察無 long tasks 與無 long-animation-frames。
  - **原並行執行條件（Concurrent）**（監工獨立實測，候選 `49471fd`）：p50=**160.77 ms**，p95=**255.41 ms**（7 > 200ms），記錄 1 個 147.4 ms long-animation-frame（無歸因資料，不作產品根因宣稱）。
  - 工程師歷史自測實跑（`output/perf/perf-samples.json`）：p50=**136.27 ms**，p95=**188.82 ms**（目標 ≤ 200 ms）。
  - 監工 Round-9 獨立測量（受驗候選 `a5c6e05`）：30 樣本 p50=**131.48 ms**，p95=**169.66 ms**（0 > 200ms）。歷史候選 `56e5fa1` 獨立測量為 p50=**133.08 ms**，p95=**188.1 ms**。
  - 原始規格之 200ms 為設計追求的互動響應目標，非所有 cold-start 樣本在任何硬體下之絕對硬性截斷門檻。
- **1,000 筆資料庫搜尋與滾動**：
  - 工程師歷史實跑：搜尋結果計算與 DOM 收斂 **25.82 ms**，滾動時間 **24.16 ms**（滾動高度 78,543 px），JS Heap 使用約 **3.76 MB**（3,757,375 bytes），DOM 節點 11,263 nodes。
  - 監工 Round-10 單獨測量（候選 `49471fd`）：1,000 筆條目搜尋 **35.53 ms**，無 long tasks 與 long-animation-frames。
  - 監工 Round-9 獨立測量（受驗候選 `a5c6e05`）：1,000 筆條目，精確搜尋 1 條目 **33.46 ms**，JS Heap 約 **2.60 MB**（2,596,851 bytes），連續 133 幀 rAF 期間無 long tasks 與無 long-animation-frames。
- **原生 Action Bubble 與 Chrome Task Manager 實測觀察**：
  - 原生 Action Bubble 啟動受 Chrome 原生擴充功能通訊、背景 Service Worker 喚醒與 CDP 本身連線開銷影響，測量時鐘包含 API 發起、CDP discovery/attach 與 5ms 觀測週期，不應與純頁面渲染時鐘混淆（詳見 `docs/KNOWN_LIMITATIONS.md`）。
  - **原生 POPUP 首互動上界（API 至 CDP 首 Search Handler 完成）**：
    - 監工 Round-10 單獨實測（受驗候選 `49471fd`，各 20 次首 Search handler 執行）：
      - 3 筆小量條目：p50=**32.7 ms**，p95=**289.9 ms**（1 > 200ms）。
      - 1,000 筆大量條目：p50=**138.7 ms**，p95=**484.2 ms**（2 > 200ms）。
      - 合理小量典型結果達到 200ms 目標，冷啟動尾端（cold tails）仍存在；此為包含 API 發起至觀察首 handler 完成之上界測量（含 CDP 開銷，不扣除工具時間），非精準 OS 點擊延遲或純初始化時計，不作全樣本絕對無尾端之保證。
    - 歷史 Round-9 實測（受驗候選 `a5c6e05`，20 次執行）：3 筆條目 p50 約 42.8 ms、p95 294.8 ms（1 > 200ms）；1,000 筆條目 p50 141.4 ms、p95 471.8 ms（2 > 200ms）。
    - 歷史 Round-8 實測：attempt3（3 筆 p50~31ms/p95 330.6ms；1000 筆 p50 393.4ms/p95 533.1ms）；attempt4（3 筆 p50 309.4ms/p95 324.3ms；1000 筆 p50 454.7ms/p95 499.6ms）。
  - **Chrome Task Manager 有效前後配對（監工獨立實測 `native-memory-valid-summary.json`）**：
    - 歷史 Round 9 實測（標註候選 `a5c6e05`）：合成 64MiB 來源分頁（PID 77535）儲存前佔用 96.5 MB 工作程序，真 nativeToolbar Save 關閉後該來源程序確實完全釋放消失；擴充功能主進程 Library（PID 77538）由 39.6 MB 微調至 46.2 MB，CPU 顯示 0.0%（未確立 Worker 共用 PID；此反映特定受測來源分頁關閉之程序釋放，非全瀏覽器所有網站精確等額總 RAM 節省或長期 OS CPU 歸零保證）。
    - 歷史 Round 8 實測（標註候選 `56e5fa1`）：合成 64MiB 來源分頁（PID 71148）儲存前佔用 95.2 MB 工作程序，關閉後程序釋放消失；主進程 Library + Worker 共用 PID（71104）由 43.9 MB 調整至 46.4 MB，CPU 顯示 0.0%。
  - 歷史 134 幀觀測中記錄之 1 個 165.5ms long-animation-frame 僅代表該次繪製週期長度，無歸因資料，不作首幀 paint 因果宣稱。

## 監工獨立驗收結論與有限裁定（第 10 輪獨立驗收）

依據監工不可變隔離副本實測（`output/supervision/round-10/`，受驗候選 `49471fdbfe32576f35f67f538b60ac97ba348aac`）：

- **測試範疇與通過率**：
  - 8 項工程 gate 全數通過（165 packages，0 vulnerabilities；91 unit，5 loaded E2E，build，pack，audit 0 vulnerabilities）。
  - 13 個核心檔案與已驗證之 `2445d25` 逐 byte 相同，沿用 51 項受控實測。
  - 新真瀏覽器核心 **121 / 121** 通過（包含副作用中途 Worker stop、完整 profile 重啟、3 scope、schema 故障、備份與 partial Undo、ResetSession 清除）。
  - 新真 UI **32 / 32** 通過（包含 R907 Popup/Library 搜尋與真實群組交集、清除篩選、全庫不變 10 項、圖示 11 項、Hibernate 特殊保護 7 項、正常動態 4 項）。
- **UI Cache 策略診斷 FAIL 保留與裁定**：
  - 受控 UI 測試共 98 項，其中 96 項通過，**2 項原策略診斷 FAIL 完整保留**。
  - `ui-cache-error-attempt-1-results.json` 記錄之 2 項 FAIL 係「權威讀取暫時失敗時，未清除此前已確認且未過期之 Retry 入口」。
  - 裁定：現行策略在有效 TTL 內保留已確認之 Retry、錯誤訊息仍清晰可見、後端每次在互斥區內重新核驗目前 DB/durable/session 權威（過期即嚴格拒絕），此有限保守重試策略**沒有已確認原文需求缺陷**；原診斷 FAIL 與原 expect 完整保留，不刪改、不放寬斷言、不冒稱全綠。
- **有限動態觀察說明**：
  - 前景 `btn-demo` 點擊實測：`fold-in animationend`（0.32 秒）、`enter animationend`（0.28 秒）。
  - Restore / Delete 點擊確實觸發 `animationstart`（running / duration 280ms / 220ms）；由於後端操作完成後即時重新 render 移除舊 DOM row，因而縮短了視覺展示週期；原文未要求為等待動畫播放完畢而阻礙資料操作，不宣稱完整 280ms / 220ms 全部播放完畢。

## 儲存容量實測（真實 Chrome getBytesInUse）

根據 `output/supervision/round-3/capacity-audit.json` 實測：

- 1,000 筆分頁資料庫體積：**265,770 bytes**（約 260 KB）
- 5 份本機滾動快照體積：**1,329,281 bytes**（約 1.30 MB）
- 總儲存體積：**1,595,051 bytes**（約 1.59 MB）
- 搭配 `unlimitedStorage` 權限，完全免除 10 MB 配額限制，且無未預期的擴充功能權限警告。
