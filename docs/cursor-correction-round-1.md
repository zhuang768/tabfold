# 【第 1 輪修正】

你是執行工程師 Cursor。Codex 已完成第 1 輪獨立驗收，結果**未通過**。唯一根路徑為 `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`；唯一原始需求是 `docs/original-requirements.md`，不可修改。先讀完整原文、本文件與 `docs/SUPERVISION_ROUND_1.md`，列出短計畫後自主修到可再驗收。

基準 HEAD `07b0509`。本文件行號均依此版本；修正後文件可記新行號。驗收原始 log、真瀏覽器結果與截圖位於 `output/supervision/round-1/`，不是產品假資料。監工沒有改產品功能。6 項基礎檢查通過，但以下 24 組問題需要修正或補足真實證據；不能用既有 19 unit／3 E2E 通過宣稱核心安全。

## 問題清單與修正要求

### C01 — 阻擋交付：並行存入後關頁並遺失保存資料

- 檔案＋行號：`src/browser/storage.ts:104–127`、`src/browser/library.ts:46–80,154–384`。
- 問題／影響：read revision→set 不是原子 CAS。原始 TS 隔離重現兩次 save 同時回 saved 1，tabs.remove 紀錄 [1,2]，最後 DB 只剩 B，A 已關且遺失。重試不能消除此競態。
- 修正：設計單一可控寫入入口／真正交易，序列化所有 mutation 與關頁相關安全區段；涵蓋 save、restore、undo、import、delete、clear、settings、backup restore、migration、reset，避免 stale snapshot 覆蓋或清空正在保存的資料。不依靠永不回收的全域值保存關鍵狀態。若改 IndexedDB 先查證並記錄遷移與備份決策；不必為修正新增框架。
- 預期：可控交錯 writer 的每個已關閉 URL 都存在完整已驗證資料；成功回報不能事後遭其他 stale writer 覆寫。補並行 save/save、save/import、save/clear／restore 的有意義測試，清空須明確定義且保守處理衝突。

### C02 — 核心 Undo 立即過期、部分失敗不能重試

- 檔案＋行號：`src/core/migrate.ts:172`、`src/browser/library.ts:520–549`。
- 問題／影響：每次 readDatabase 把 undo 改 null。真瀏覽器 save 1 後立即 Undo 回 expired；Undo 部分建立失敗亦不應丟掉剩餘可復原項目。
- 修正：嚴格驗證並保留有效現行 Undo，只有過期／完成／合法遷移才清除。成功建立分頁才移除該筆；保留失敗項目與可用期限，誠實回報。toolbar、popup、library 必須有可用入口。
- 預期：真存入→立即 Undo 可重新開啟正確 URL、移除成功項目；含多筆、部分失敗、TTL、Worker 重建回歸。

### C03 — 毀損被轉成空庫、毀損後備份入口消失

- 檔案＋行號：`src/core/migrate.ts:145–152`、`src/browser/storage.ts:75–97`、`src/ui/options.ts:16–21`。
- 問題／影響：entries:null、全壞／混合壞條目被靜默丟棄。原文禁止靜默清空。設定頁在 database:null early return，已有備份不顯示，真瀏覽器備份按鈕由 1 變 0。
- 修正：區分未初始化、支援舊版、新版與毀損，現行 schema 嚴格驗證，不默默過濾／補回遺失內容；原始資料保留可匯出。設定頁即使 DB 壞仍呈現備份、原檔匯出與明確復原選項；復原前保留目前 raw。恢復失敗不能覆蓋可用資料。
- 預期：null entries／混合壞筆／錯型／未知新版不無聲清空，從可見 snapshot 復原成功；壞 snapshot 留原 DB，最近 N 輪替可實測。

### C04 — 遷移不落地、舊版項目 id 漂移、v1 匯入零筆

- 檔案＋行號：`src/browser/storage.ts:88`、`src/core/migrate.ts:53,115–119`、`src/core/import-export.ts:68`。
- 問題／影響：v1 沒 id 每讀新造 id，畫面 id 無法 restore；匯出 v1 entries 被轉成 tabs 分支的空陣列，假成功 imported 0。
- 修正：支援格式有明確辨識／版本轉換；遷移前備份，完成驗證後安全持久化，id／時間跨讀取穩定。不支援格式明確拒收，不假成功。保護舊庫與未知新版。
- 預期：v1 讀→畫面 id→真還原成功，重啟仍現行 schema；舊版 export 正確筆數及摘要。

### C05 — 讀回漏欄位，關閉／還原部分錯誤未誠實回報

- 檔案＋行號：`src/core/migrate.ts:176–183`、`src/browser/storage.ts:121–127`、`src/browser/library.ts:383–384,474–508,846–847`。
- 問題／影響：驗證漏 source/group/tags/schema/status，storage 僅比 revision；欄位遭改仍通過。tabs.remove 失敗產生 unhandled rejection、沒有提示；restore 已開頁後寫入失敗只回一般錯誤，使用者重試再開重複。
- 修正：驗證原始實際寫回的完整必要內容及 DB 狀態，不能先用寬鬆 migration 修補而掩蓋差異。read 失敗或 mismatch 一律不關。逐筆或完整處理關閉／視窗保留失敗，回傳保存、已關、未關與失敗原因；還原後持久化失敗回報真 opened/removed/failed 與安全警告。必要 operation 狀態須能處理 Worker 中斷，不能將已開啟但未移除冒充完全沒做。
- 預期：故障注入 read reject、各欄位 mismatch、window create fail、tabs.remove fail、tabs.create fail、restore 後 set fail，無未處理例外，原資料／原頁保住且結果准確。

### C06 — URL 驗證、批次去重與 round-trip 錯誤

- 檔案＋行號：`src/core/import-export.ts:127–145`、`src/core/id.ts:11–18`、`src/browser/library.ts:215,419`、`tests/unit/core.test.ts:75`。
- 問題／影響：JSON 接受 javascript/data/chrome/not-a-url；同批相同 URL saved 2；去 fragment 與尾斜線合併不同 hash 路由／內容；import 全改 id，無法完整 export/import 一致。
- 修正：儲存／JSON／文字匯入與還原共用明確 URL allowlist，非法項目拒收並準確計 invalid；來源訊息／匯入內容用 runtime 驗證，不只 TS cast。去重採保守等價規則，不吞掉影響內容的 fragment/path。對既有庫＋同批候選去重，跳過的來源分頁留開。合法 export 匯入空庫保留全部欄位與 id；若真正衝突有明確且可測規則。
- 預期：unsafe／invalid 被拒、已存資料不被修改；#/note/1 與 #/note/2 都可保存；同批 exact duplicate 正確摘要且只處理接受的頁；逐欄完整 round-trip。改掉現有把丟 hash 視為正確的測試，增加保護內容案例。

### C07 — 未儲存內容提醒在關閉後

- 檔案＋行號：`src/browser/library.ts:384,400–401`、`docs/DECISIONS.md:27`。
- 問題／影響：提醒 save it first 發生在關頁後，使用者無機會先存表單；toolbar 第一次就關頁也繞過首次引導。
- 修正：首次危險操作前給簡短英文通用提醒，可記住完成選擇；明確說保存 URL 不能保存表單內容。首次引導≤3步且可跳過，跳過亦須理解安全提醒。保持之後正常一鍵存入；所有入口一致。不可加全站表單讀取權限。
- 預期：真 fixture 未送出輸入／首次 toolbar 存入，取消留頁且無變更；確認後才執行。文件與產品一致。

### C08 — 音訊確認會重新抓不同頁、右鍵缺完整確認與結果

- 檔案＋行號：`src/ui/popup.ts:311–353`、`src/browser/library.ts:791–794,869–885`。
- 問題／影響：confirmedAudio 重新查 active/scope，期間切換／導航可能確認錯頁；右鍵只存 pending 而未提供可用確認；部分非音訊頁先存後取消卻說 Nothing saved。
- 修正：確認綁定原 tab IDs／URL 與操作 token，確認後重查 pinned／whitelist／URL／影音與目標，變更時保守中止或重新確認。右鍵、快捷鍵、toolbar、popup／library 共用安全流程與清楚结果，取消不能誤報已完成部分。
- 預期：真本機媒體播放→取消留頁→確認只關原目標；確認期間切換active/URL/白名單可控；每個入口有可讀錯誤／Undo。

### C09 — 大量還原的 Cancel／Esc 反而全開，整組繞過保護

- 檔案＋行號：`src/ui/popup.ts:410–418`、`src/ui/list.ts:73–78,234–242`。
- 問題／影響：native confirm false 被解讀 batch:false，Cancel/Esc 開所有分頁；group 固定 false，≥15 避過提示，瞬間耗記憶體。
- 修正：明確三選項「分批／全部／取消」，取消完全不執行；單筆／全部／整組／選定集合使用同一門檻與真批次節奏。顯示實際數量與進度，取消與錯誤處理保守。
- 預期：≥15 取消／Esc 開 0；全部是明確按鈕；分批有受控時序且 partial failure 資料保留；group 同樣受保護。

### C10 — popup API 支援版本與 3 秒 alarm 破壞一鍵入口

- 檔案＋行號：`public/manifest.json:6`、`scripts/build.ts:32`（target）、`src/browser/library.ts:783–802,889–892`。
- 問題／影響：minimum 116，但 openPopup 一般可用需 127；setPopup 全域後靠 0.05min alarm 清除。封裝版 alarm 最小 0.5min，會警告並延遲；有 popup 時 onClicked 不觸發，下次按圖示不會一鍵存入。未封裝測試不會揭露封裝版限制。
- 修正：選擇並記錄真相容策略：提高最低版本並對齊 build/README，或實作已測降級。重新設計結果 popup 及綁定清理，不能靠秒級 alarm／常駐記憶體確保核心入口。之後按另個正常頁圖示仍直接存起，失敗／Worker 重建／browser restart 都不留永久 popup 綁定。預設 scope 設定需有明確有效用途，toolbar 偏好 current 可保留但說明，其他存入 UI 必須正確使用設定。
- 預期：真 toolbar 連續兩次不同頁操作、快速連點、popup 開關、回收、重啟與結果失敗都可用且無 alarm 警告。官方來源：[action.openPopup](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup)、[alarms.create](https://developer.chrome.com/docs/extensions/reference/api/alarms#method-create)。

### C11 — favicon 造成外連、CSP 未限制圖片／連線

- 檔案＋行號：`src/ui/popup.ts:137`、`src/ui/list.ts:104`、`src/core/migrate.ts:56`、`public/manifest.json:45–46`。
- 問題／影響：直接把不可信 favicon URL 當 img.src。真匯入 probe 圖片後 endpoint 收到請求，違反本機限定；no-referrer 不代表不連外。
- 修正：保留原文 favicon 功能，以合法本機 Chrome 快取／嚴格驗證的本機圖像與字母 fallback，查證所需最小權限與成本。不向原站／第三方請求，不直接載入任意匯入圖像。CSP 限制 connect/image/object 等實際使用來源，無 remote JS／eval；不放寬 host permission 或新設服務。
- 預期：normal save、import、legacy／corrupt data、demo 與搜尋 render，除使用者明確還原網站之外擴充本身無外部请求；無圖示有效fallback，英文隱私宣告真實。

### C12 — 失敗假成功、messaging 例外與多視窗資料不更新

- 檔案＋行號：`src/ui/options.ts:113–119`、`src/ui/list.ts:167,270–272,324`、`src/ui/shared.ts:3–5`、`src/ui/popup.ts:24,222`。
- 問題／影響：set fail 仍 Saved／Cleared；send 拒絕沒有一致 error recovery；多頁只靠局部 load，另一頁變更後清單／數量／設定過期。
- 修正：所有 mutation 必須检查 res.ok／partial result，再更新畫面；失敗不假套設定，保留操作可重試。集中處理 messaging／初始化／事件 Promise 拒絕，展示可理解英文錯誤。用事件驅動 storage 更新同步各頁狀態，避免 edit被覆蓋與重複觸發；不加背景輪詢。
- 預期：注入每類操作失敗、Worker 喚醒／拒绝，沒有 unhandled rejection；兩個 library/options 同時開，保存／刪除／restore後counts及list准確。

### C13 — 完整清單 Save this tab 沒有效網頁目標，Hibernate 未證實可用

- 檔案＋行號：`src/ui/list.ts:222–227`、`src/browser/library.ts:168–172,747–758,883–884`。
- 問題／影響：library 是 active tab，無 tabId 的 save選到extension自己，按鈕無法保存網頁；Hibernate 類似會對 active／extension tab discard，缺真實成功與保護證據。
- 修正：保留已實作功能但提供明確、真正可操作的網頁目標（例如最小目標選擇／可靠觸發來源），不能默默抓不相關頁。查證 discard 的 active限制與回傳，再讓使用者選到可休眠網頁，保護 pinned／影音／白名單、資料與最後視窗；給真實结果或清楚可恢復原因。
- 預期：從 library 真存選定網頁，非extension自己；真discard後 tab.discarded=true，點回reload、URL正確；不偽造 freed/成功。

### C14 — hidden 被 CSS 蓋掉、popup 內容高度不可達

- 檔案＋行號：`src/ui/styles.css:156,197`、`src/ui/popup.css:1–12,37–42`、`src/ui/popup.ts:63–65,102–104`。
- 問題／影響：完成 onboarding hidden=true仍display:flex；空banner也占位。popup max560+overflowhidden、listmin180與其他區塊超高，footer可達性未驗，不能只在大瀏覽器tab看popup.html。
- 修正：讓 hidden 語意始終有效；合理 flex/min-height/捲動分配使核心按鈕、Undo、footer在有限原生popup仍可用。初次3steps、error長字、1000筆、窄viewport與縮放都不能溢出或切掉重要控制。
- 預期：skip／完成後 computed display none且重新開不顯示；真toolbar popup、鍵盤逐項操作與截圖，所有重要操作可達。

### C15 — Esc 重用舊 dialog returnValue、匯入不可鍵盤操作、提示不朗讀

- 檔案＋行號：`src/ui/popup.ts:206–215`、`src/ui/list.ts:176–180,313–324`、`src/ui/list.html:35–47,55–72`、`src/ui/popup.html:32,60`、`src/ui/options.html:42`。
- 問題／影響：對話框重用不清returnValue，前次OK/save後Esc仍可能確認／保存；匯入label與hidden input不在tab順序；dialog缺accessible name，status沒有live區。
- 修正：每次對話重置狀態，cancel/Esc保證無mutation，returnValue與事件明確；焦點進出正確。真button或可鍵盤語意啟動importfile選擇；dialog名稱與status/error aria-live恰當。避免以任意新增tabindex代替完整語意。
- 預期：先確認一次→第二次Esc，無刪除／保存；全程只鍵盤可完成匯入、搜索、restore、settings／退出；可存取名稱與動態提示驗證。

### C16 — 字色對比與必要動態未完成

- 檔案＋行號：`src/ui/styles.css:5,119–120,215–247`、`docs/DESIGN.md:17–20`。
- 問題／影響：muted對背景4.144:1／白4.478:1，小文字不足4.5；darkprimaryhover背景#3d4346與文字#1a1b1a僅1.719:1。現有主要只有fold/entry入場，缺還原展開與退場。
- 修正：用主题token修正normal/hover/focus/disabled文字與控制對比，維持原創一致風格。補原文必要存入／還原／清單進出／按鈕微互動，尊重reduced-motion，不卡核心資料流程，不加無必要動畫函式庫。
- 預期：淺深各狀態可讀，正常小文字≥4.5:1；真正互動展現動態，減少動態時無必要位移，按鈕與焦點仍清楚。

### C17 — 全部可見字串未集中，日期不是英文

- 檔案＋行號：`src/ui/shared.ts:23–28`、`src/ui/list.ts:57,160,236,271`、`src/ui/options.ts:43,49,95`、`src/browser/library.ts:173–176,812–826`，各 HTML 與 manifest。
- 問題／影響：系統中文日期實際出現在截圖；大量labels/errors/context menu/hints/version字串散落。違反原文英文＋单一常數檔。
- 修正：集中到src/strings.ts（含模板、aria文案、錯誤、菜单、產品固定HTML／manifest文案可由build注入共享來源），明確英文日期與fallback。使用者自己的title/group/tags保持原文，不翻譯資料。
- 預期：系統中文環境固定產品文案仍英文；搜尋掃描／測試證明沒有遺漏英文硬編碼，所有可見字串單一來源。

### C18 — 統計把 import／demo 也呈現為釋放的記憶體

- 檔案＋行號：`src/browser/library.ts:675–677,736–738`、`src/ui/popup.ts:288–294`、`src/ui/list.ts:35–44`、`docs/DECISIONS.md:36`。
- 問題／影響：僅建立本機條目的匯入／demo增加存起累計，以entries.length×50畫 freed；未關網站也可顯示巨量已釋放。估計標籤不能讓虛構行為變真實。
- 修正：明確區分目前保存筆數、真正執行保存／關閉的累計與匯入／demo；估計不得把未關頁算成已釋放，說明時間與估算范围。Undo／還原保留／失敗時統計定義一致，不追求瀏覽器未開放的假實時MB。
- 預期：只demo/import不產生實際freed聲稱，部分失敗counts準確；公式及原始實測數據分開。

### C19 — 單元測試數量有，但安全契約沒有測

- 檔案＋行號：`tests/unit/core.test.ts:167–197`、`docs/TEST_REPORT.md:16,44–48`。
- 問題／影響：no close path只呼叫writeDatabase，沒呼叫saveTabs／觀察tabs.remove；並行測試是循序stale revision，全部通過仍漏C01/C02。
- 修正：用可控asyncdriver／浏覽器API替身測原始實作的行為，不只測helper。將C01–C18適當確證轉成正式有意義回歸；至少15只是最低數量，不要複製實作湊數。
- 預期：寫／讀回／欄位／關閉失敗assert原頁不關或精確部分结果；真正交錯並行無lostupdate；Undo、strict corruption、stable migration、URL/id roundtrip、cancel再開dialog全部覆蓋。

### C20 — 真主流程與 Worker／特殊頁完整 E2E 缺漏

- 檔案＋行號：`tests/e2e/extension.spec.ts:30–46,69–153`、`docs/TEST_REPORT.md:26,32–38,50`。
- 問題／影響：3 E2E只demo/search/export/get-state；每次刪profile不能證明持久化。新context不是同庫Worker被回收。
- 修正：真載入extension＋本機HTTP fixtures，測多不同頁→實際入口→關閉→庫與欄位→restore。真停止extensionworker／喚醒，同profilebrowserclose/relaunch，不每次刪profile冒充restart。逐一測internal、pinned、真media、unsaved提醒、duplicates、無痕permission狀態、最後一頁，以及原視窗順序、大量restore、備份／壞資料／匯入完整。無痕需隔離專用profile，勿改使用者真實extension權限；如果工具確實無法做到附嘗試證據並誠實未驗證。
- 預期：正式可重現指令、嚴格斷言、trace/screenshots、真tabopen/close與正確URL/欄位。可在API層故障注入，但主流程不可全mock；workerstop必須證明原instance已終止。

### C21 — popup／1000 筆／CPU／記憶體與效果缺正式量測

- 檔案＋行號：`docs/TEST_REPORT.md:53–64`、`docs/HANDS_ON_ONLY.md:6`、`docs/requirements-checklist.md:81–84`。
- 問題／影響：只有無raw數字的「數十至低百毫秒」推估，未量自身CPU／heap／真popup。監工1000筆單次library 250.93ms、search7.60ms不能代替全部效能。
- 修正：合理條目量下量popup開啟至可操作，保留足夠重複樣本（建議≥30）與p50/p95、機器/browser/版本/冷热條件。1000真條目搜尋、捲動與layout，量測自身記憶體與CPU／閒置活動。按實測決定是否virtualize，不能以未virtualize本身判失敗。用隔離瀏覽器嘗試工作管理員前後MB測試；工具不可得則留下實際嘗試／失敗與完整使用者步驟、明確未驗證，不假填數字或把可測都丟使用者。
- 預期：有可重現原始數字與腳本／記錄；200ms為原文目標，超過誠實分析並最佳化；無背景輪詢。估計公式不能當實測。

### C22 — 研究／設計來源與儲存選型論據不足

- 檔案＋行號：`docs/RESEARCH.md:13,15–21,29–33`、`docs/DESIGN.md:3–7`、`docs/DECISIONS.md:19–22`。
- 問題／影響：競品抱怨無來源，設計只有泛稱，IDB/storage性能與可靠性沒實際比較，unlimitedStorage權限提示敘述不精確。
- 修正：官方API技術來源優先、具名競品／內建功能與真實評論來源；分開來源事實與自己的推論。具名擴充、生產力與設計社群／獎站案例說明學到的密度、動態等，不複製素材。補storagevsIDB容量／效能／可靠性、1000條目＋N快照尺寸與權限利弊。純文字競品格式若聲稱相容須查來源。重用已做研究不要無限研究。
- 預期：每項關鍵事實可查來源，架構吻合C01決策與測量，無虛構評論／工具。官方權限：[permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)。

### C23 — 文件、格式／打包前置、依賴授權與 Git ignore 缺口

- 檔案＋行號：`README.md:32–67`、`scripts/pack.ts:15`、`tests/e2e/extension.spec.ts:13,32`、`docs/DEPENDENCIES.md:8–16`、`.gitignore:1–8`、`docs/requirements-checklist.md:83`。
- 問題／影響：README缺Node/npm/Playwright浏覽器安裝/headed環境、zip系統工具；cp／/tmp／rm／zip未說支援平台；jsdom未用、@eslint/js/globals授權用途缺；env/private key未ignore；checklist 完成與大量未測矛盾。
- 修正：README用乾淨環境可重現npmci/icons/build/verify/e2e/pack步骤、最低Chrome、browser安装與系統前置；Node fs/os tmp改善測试copy，打包支援平台明確或用現成可靠工具（若新開發依賴先解釋必要與授權）。移除未用dev套件更新lock，補全用途中授權，補MIT LICENSE（若尚缺）。ignore .env/變體與私鑰，保留所需example；無env需求不要空.env.example。更新各報告與checklist實測/未測狀態；KnownLimitations不可掩盖可修核心bug，HANDS_ON只列真的需本人做的事。
- 預期：按README乾淨重跑成功，pack產出zip與dist內容一致可載入；gitcheckignore敏感檔有效，未將測试profile或機密commit。保留監工報告與修正文檔，不覆寫其歷史结論；可新增本輪處理對照。

### C24 — 開發依賴已知 critical 漏洞與安裝提示

- 檔案＋行號：`package.json:33`（Vitest，依目前版實際定位）、`package-lock.json`（vitest/tinypool/@vitest/mocker）；`output/supervision/round-1/dependency-audit.json`。
- 問題／影響：獨立npmci/audit顯示2critical、1moderate，在開發測試工具鏈。安装也有deprecatedeslint/whatwg-encoding與腳本政策提示，不能直接宣稱零警告完整交付。
- 修正：查證官方／維護者advisory與相容patched版本，最小升版／移除未用套件，測全部單元＋E2E及engines相容性；不要npm audit fix --force盲修、不要關audit/降低檢查/自動擴大安裝腳本授權。環境自身無法消除的提示要有正確原因與限制，不當runtimewarning也不遮掩。
- 預期：npmci可重現、npm audit無這些已知漏洞，patch後全部gate通過，production依賴仍保持最小；不要宣稱未證實的production RCE。

## 必須使用的 skill／工具

開工先列本輪**實際可用**且適用的技能／工具及用途，不適用者說明理由；不能只稱讀過就算完成檢查。

| skill                   | 位置                                                                | 本輪用途                                                                          |
| ----------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| diagnosing-bugs         | `/Users/zhuangzijin/.agents/skills/diagnosing-bugs/SKILL.md`        | 依確證復現C01–C18，修rootcause，保留失敗證據                                      |
| ai-debt-detector        | `/Users/zhuangzijin/.agents/skills/ai-debt-detector/SKILL.md`       | 未處理失敗／假成功／unused／虛構API全面復審；parser不可用不可將[]當通過           |
| security-best-practices | `/Users/zhuangzijin/.codex/skills/security-best-practices/SKILL.md` | URL／CSP／favicon／敏感資料與最小權限                                             |
| playwright              | `/Users/zhuangzijin/.codex/skills/playwright/SKILL.md`              | 真擴充E2E、故障與Worker／browserrestart、keyboard與視覺證據；使用者明確授權測試檔 |
| impeccable              | `/Users/zhuangzijin/.agents/skills/impeccable/SKILL.md`             | popup有限尺寸、dialog、鍵盤、對比、狀態與微互動驗收                               |
| minimalist-ui           | `/Users/zhuangzijin/.agents/skills/minimalist-ui/SKILL.md`          | 保留原創簡潔風格，改善密度／tokens與可達性                                        |

可再用實際可用的 tdd／npm-skill 做回歸與相容套件管理，先讀對應SKILL再用。不要求無關Cloudflare/Vercel部署、Figma帳號、影像生成或外部追蹤服务；不為使用skill而加框架。優先重用現有TypeScript、Chrome APIs、Vitest、Playwright及成熟開發工具；自製PNG腳本已能產出所需圖示，不為「現成工具」重寫沒問題的素材。

## 完成後的驗證方式

先確認腳本名稱與新版工具實際相容，必要新增明確測試／效能腳本並寫入README。至少實際執行並記錄：

```bash
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run pack
npm audit --json
```

- 必須全部指令成功，lint零警告；單元≥15且覆蓋真安全契約，不只數量；E2E完成C19–C21所列真主流程與邊界。資安audit要真正解決已知漏洞。
- 對每個C01–C24回報「修改檔案／結果／實際命令／exitcode／案例與artifact／未驗證原因」，不要空泛宣稱所有通過。
- 量測需原始樣本，不能只有估計。Worker真停止／重啟profile要可核對；讀回reject與欄位失真原頁留開。
- 完整重新檢查原始需求，P0與全域門檻必做；P1盡量完整、未完成誠實列；P2只驗選定兩項，不新增sync等無關功能。
- 更新TEST_REPORT、KNOWN_LIMITATIONS、README、DECISIONS、checklist與可安装dist/zip；有意義的小步commit，保留現有無關變更與監工文檔。
- **完成後停止修改，回報最後commit／gitstatus供Codex再次全面獨立驗收。** 不自行宣布最終通過。

## 禁止事項

- 不得刪功能／刪測試／skip／降低斷言或放寬品質門檻過關；不得改壞已通過的文字安全、最小權限、單筆成功闭環、寫入失敗留頁與同profile持久化。
- 不修改original-requirements.md、不用KnownLimitations包装可修核心bug、不用文字回報代替真測試、不把fake數字或demo當真實節省。
- 不介入別的Cursor視窗／專案，不改帳號、模型、訂閱、費用或用量限制，不替使用者授權installscript、不碰日常瀏覽器資料與分頁。
- 不push、不部署、不發布／上架、不擴大host或敏感權限，不接外部服务，不刪除使用者重要資料。GitHub待Codex驗收通過再處理。
