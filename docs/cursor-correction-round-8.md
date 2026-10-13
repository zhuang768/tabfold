# 【第 8 輪修正】Tabfold — Antigravity 執行

候選 `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`，分支 `feat/tabfold-extension`，唯一根目錄 `/Users/zhuangzijin/Desktop/Memory Expansion`。原文 `docs/original-requirements.md` SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`；不新增產品需求。Codex 是監工，Antigravity 負責實作。第 7 輪修正確實改善原有問題，請保留。

先讀本文件、`docs/SUPERVISION_ROUND_8.md`、本輪三份審查報告與相關失敗 raw，再以最小範圍修正。不要用「已讀／已整理」代替執行。完成後停止修改，提供候選 HEAD 與逐項驗證，等待監工獨立驗收。

## 問題清單與修正要求

### R801 — 完整備份內容未驗證，已在真 Chrome 重現唯一 URL 遺失

- 檔案／行號：`src/browser/storage.ts:497–503`、`:561–568`、`:574–604`；`src/browser/library.ts:84–104`；正式 test `tests/unit/core.test.ts:1949–1971`。
- 問題：備份只找到相同 snapshot id 就算成功。當寫入後 id 正確但 `database.entries=[]`，clear 仍回成功並清除原庫，所有 native local 副本不再有原唯一 URL。restore-backup 的 salvage 寫失敗＋fallback 備份同 id 損毀，也會替換唯一原 raw。這是內容完整性與資料安全失敗，不能只確認 id／筆數。
- 證據：`output/supervision/round-8/core-focused-new-attempt-1-results.json` results[0] 包含 clear／restore 子情境；`core-real-focused-attempt-1-results.json` cases[0] 真 native snapshot 寫壞、主 DB 真清除、獨立原生讀取完整 local 確認 URL 遺失，errors 空。
- 修法／預期：破壞性 clear/import/restore 前，至少一份完整可恢復原 raw 的持久救援須讀回驗證。深比較 snapshot id、metadata、完整資料內容及應保留的救援歷史；不能忽略欄位、array 順序或損毀 raw。物件 key 順序不應造成誤判。未確認內容便安全中止，原 DB 與唯一原 raw 留存；rollback 是補充保護。
- 回歸：正式 suite 加有真 URL 的 clear、restore same-id wrong-content 反例，salvage 拒絕／backup 損毀組合及正常成功控制，確認注入真正到達，不只測空庫或不存在 id。

### R802 — pending Save 將未知讀取失敗當作「已關閉」

- 檔案／行號：`src/browser/library.ts:473–487`、`:503–512`；正式 R703 `tests/unit/core.test.ts:2018–2051`。
- 問題：任何 `chrome.tabs.get` throw 都加入已關項目。受控原碼中原 source 仍開、query 可見，get 暫時拒絕卻重建 Undo，隨後重開同 URL 並移除庫條目。不能將 I/O 未知當作確定消失。
- 證據：`core-focused-new-attempt-1-results.json` results[1]，實際受控來源仍在，新增同 URL 一頁，原條目被刪。這是記憶體 API 故障注入，不冒稱 Chrome 自然錯誤。
- 修法／預期：區分確定已關、確定仍開、無法查證；未知保持資料及可重試狀態，不無據開頁／消耗條目。處理來源已導航與缺少 API 時也保守。保留已通過的真正 Worker 中途 Save 恢復。
- 回歸：正式 case 覆蓋上述三種狀態與真閉後成功控制；不能把 mock 所有 throw 都固定轉成不存在。

### R803 — partial durable Undo 提前消耗失敗項目的權威

- 檔案／行號：`src/browser/library.ts:1463–1466`、`:1578–1587`、`:1599–1607`。
- 問題：選 durable 後 A 開啟成功／B 暫時 create 失敗，DB.undo 沒保留 failedIds，local/session durable 全刪；原 TTL 內撤除故障再 Undo 卻稱 expired。B URL 尚留庫，這是重試功能失效，不能稱 B 資料全失。
- 證據：原碼 focused results[2]；真 Chrome `core-real-focused-attempt-1-results.json` cases[1]，public Save(window) 真關兩頁、同操作 DB/durable 同 expiry；A 真開、B primary/fallback 真拒 2 次，撤故障後 B 仍沒開且回過期。
- 修法／預期：成功項移除，失敗項保留同次 operation 的有效權威與原 expiry；消耗及清理以真正全部完成／實際過期為準。不得延長 TTL、倒退到舊 A、重複開成功項或改壞最新 B 選擇。
- 回歸：以兩次真流程或合法實物 fixture 測全部成功／部分失敗／全部失敗／重試／過期／已消耗，含 DB 與 durable 的正常來源。

### R804 — 舊 Reset 回呼清理會刪掉新 Save 的結果

- 檔案／行號：`src/browser/library.ts:2111–2121`，特別是 epoch 改變後無條件 remove。
- 問題：舊 session publication 被暫停，Reset 真完成，舊 cleanup 又被暫停；新 Save 真關來源並發表新 lastSaveResult/lastSaveAt 後，釋放舊 cleanup 會刪新結果。新 URL/durable 尚留，主要影響新操作回饋／權威狀態。
- 證據：focused results[3] 的完整序列、故障計數與新 Save 正控制。原 R705 的 6 個安全檢查已全通過，這是不同交錯。
- 修法／預期：publication／cleanup 必須屬於正確操作，或適當序列化最終發表；不能無條件移除任何後來寫入的結果。允許合法 Reset 等候在途工作，但成功 Reset 後舊操作不能發表，亦不得破壞新操作。
- 回歸：保留原 6 條；新增在途舊 cleanup／Reset完成／新Save成功／舊cleanup釋放的安全案例，確認新結果與 popup 仍正確。不要以 timeout 或沒有新操作當成功。

### R805 — Library Undo transport 拒絕後失去仍有效的重試入口

- 檔案／行號：`src/ui/list.ts:92–100`。
- 問題：doUndo 先清 currentEffectiveUndo，RPC 失敗不 reload；durable-only 操作尚未被後端消耗，入口卻由 1 變 0。Popup 同情境入口保留，Library 失效。
- 證據：`ui-review-report.md`；`ui-cache-error-attempt-1-results.json`；`ui-real-faults-attempt-1-results.json` 新案例最後 observation。真正已閉 source，DB.undo=null／local+session durable 未過期；客戶端轉送前拒絕，後端完整 raw 未消耗，錯誤可見但入口消失。
- 修法／預期：失敗後按最新權威重新載入或保留仍有效操作；不隱藏錯誤、不捏造成功、不延長 TTL；真正成功或過期才消耗。只改已確認 Library 邊界，保留 R706–R709 已通過行為。
- 回歸：正式 UI case 確認錯誤可見、TTL內 retry 可用並實際成功，含 DB與durable來源。get-state 讀取失敗時 cache 策略目前兩項只是疑慮，沒有「讀失敗就強制清光 Undo」的新需求。

### R806 — 效能／候選／量測方法與文件仍錯配

- 檔案／行號：`docs/TEST_REPORT.md:3–4`、`:17`、`:135–146`；`docs/KNOWN_LIMITATIONS.md:5`、`:8–10`；`docs/requirements-checklist.md:81`。
- 問題：仍引用舊 139.44/186.78／search／heap 數字及 Round6 標題，沒有對應候選；舊 165.5ms long-frame 原 raw 只有 duration，不能自行說是首幀／paint 因果；歷史 Task Manager 不能替代本版驗證。
- 修法／預期：每份結果分別標 candidate、日期、條件、完整 raw 路徑及 clock 範圍，同步 README／checklist／limits／report；舊測量保留為歷史，不能借為目前通過。根本輪真 TaskManager／native／perf 證據可引用，必須明記是監工獨立測量，不冒稱工程師另跑。
- 本輪證據：普通 TAB 30 DOM-ready 樣本 p50 133.08/p95 188.1（不是 native第一操作）；1000 render/search 1 exact，search23.06ms、heap2,596,804B，133連續rAF，無longtask/longframe；`perf-independent-attempt1/perf-samples.json`。
- `native-memory-valid-summary.json`：單一自建64MiB源頁 TaskManager PID71148，95.2MB/CPU0.0→真nativeToolbar Save後來源程序消失；同Library PID71104 43.9→46.4MB/CPU0.0。不是全瀏覽器 OS RAM 精確省多少、不是各網站分布。真nativeSave/Popup/Restore及所有資源清理均驗證。
- `native-popup-first-interaction-attempt3-result.json`：3/1000筆各10次真POPUP API開啟＋首個真Search handler、完整nativeDB前後一致。API開始→觀察可操作後handler完成的上界包含CDP發現/attach；3筆p50約31/p95330.6（1>200），1000筆p50393.4/p95533.1（5>200）；部分Chrome API本身約280–299ms。不能將upperbound當精準init／OS點擊延遲；功能PASS不代表200ms全部通過。原文是合理資料下200ms目標，不擅設每個cold sample絕對門檻。保留不達／方法限制，提出有根據的下一個量測或最小改善，別盲改UI掩蓋Chrome開啟成本。
- `worker-resource-idle-attempt1-method-result.json`：解除偵錯後40s真自然回收/targetgone；heap與sampling CPU不等於TaskManager OS值。單次0.0%亦不是長期CPU保證。

收尾另有不同條件 `native-popup-first-interaction-attempt4-result.json`：Widget間隔500ms、3/1000筆各10次，真Search/nativePOPUP與完整DB均通過；3筆p50 309.4/p95 324.3（10>200），1000筆p50 454.7/p95 499.6（10>200）。這不是替換前20樣本；兩組都保留，不能選較好數字宣稱200ms通過。仍屬API開啟＋觀測＋首handler上界，非OS點擊。

### R807 — 研究日期、格式與設計精確歸因仍欠來源

- 檔案／行號：`docs/RESEARCH.md:17–22`、`:29–30`、`:42`；`docs/DESIGN.md:7–9`。
- 問題：BuenJ評論寫「存取2024年底」無當時紀錄；OneTab純文字格式稱官方實際輸出卻沒有URL／fixture／版本；精確Linear1px／Notionhex仍歸為品牌官方值；1.59MB體積不能推出queue/journal安全穩定的因果證明。
- 修法／預期：只標真正存取日期／頁面相對時間；OneTab以可核實官方説明或真匯出樣本／可信作者實例補證，否則準確列相容慣例與不確定性。精確token標Tabfold自身決策或提供觀察，三目的性評論不是代表性統計。保留已補好的原作者permalink、Things3獎項、GoTo作者來源與Raycast自身決策；不用重新設計介面。分開primary／使用者自述／二手／推論，容量與故障驗證分開。

### R808 — npm 支援建議已改善，但錯誤原因／警示仍寫錯

- 檔案／行號：`README.md:7`；`docs/DEPENDENCIES.md:26–27`；`docs/TEST_REPORT.md:10`、`:28`、`:91`。
- 問題：npm10.9.2原失敗是ci lock驗證EUSAGE/Missing esbuild/platform packages，還未進postinstall，不能自稱binary postinstall已知bug。真正deprecated來自直接eslint9.39.5；npm11另有3個allowScripts advisory，不能錯歸legacy工具或抹掉。
- 修法／預期：依保存日誌記錄實際支持過的精確Node/npm與原因，概括推薦不等於每個npm11版本都實測。若更新既有dev工具，先查官方相容性並重跑本輪必要gate；不增加production依賴、不全域升級、不自動approve-scripts或改授權。區分安裝警示與lint零warning，交付限制如實列出；原零警告門檻不能藉隱藏log過關。
- 監工本輪：Node26.3.0/npm11.16.0，git archive隔離clean ci成功165installed/audit166/0vuln；完整81unit/5E2E與format/types/lint/build/pack/audit都通過；相關log在round8 source/gates，正式章名不要仍寫65。

### R809 — 完成聲明超出實際結果，新增確證問題須納入可重跑回歸

- 檔案／行號：`docs/KNOWN_LIMITATIONS.md:3`；`docs/requirements-checklist.md:83`；`docs/TEST_REPORT.md:28`；上述 R801–R805 正式測試位置。
- 問題：全R701–714／全部歷史結果全綠與真正新故障不符。81unit確有新增，但5正式E2E全文未改，不能自稱所有特殊/中途/並行情境已在正式E2E補完。
- 修法／預期：分工程師自測、監工獨立結果、正式套件與診斷探針；原文要求實測的關鍵項均提供可追溯報告，新增5個確證bug至少有有意義正式回歸並保留實機證據。原文沒有要求每個監工診斷都搬入正式suite；已實際跑的關鍵探針可以支持實測，但需可重現交付，不將ignored output未交付當README可重跑命令。最小合併必要回歸工具與fixture，避免巨大重複框架。
- 任何未測範圍如原生scope完整確認/取消、原生快捷鍵與contextMenu、大字體／完整鍵盤及allowed-incognito，都準確標未驗；能用隔離本機方法繼續者不要推給使用者當「只有本人能做」。不得因此增加／調整帳號、模型、訂閱、權限或費用。

### R810 — session 資料生命週期與只有使用者能做的範圍不精確

- 檔案／行號：`PRIVACY.md:26–27`；`README.md:83`；`docs/HANDS_ON_ONLY.md:3–6`。
- 問題：session在operation完成全部自清的概括不符lastSaveResult/lastSaveAt及為恢復保留的durable/journal；全清承諾需對應Reset與舊callback安全。自有profileTaskManager已可代驗，不應概括不能代理量測。
- 修法／預期：英文寫實際每類key存放／完成、TTL、browserrestart及Reset清除時機；承諾要與修R804後真結果相符。區分可代理的隔離profile量測與使用者日常profile體驗／上架決策／必要權限。不要改產品儲存行為只是為了讓文案看似正確。

## 必須使用的適用 skill／工具

1. 開工先列此IDE實際可用skill/MCP/CLI、用途與未用原因，不虛報。沿用已讀 `diagnosing-bugs`（先紅訊號＋控制／不同假設）、`ai-debt-detector`／`code-review`（小範圍邏輯與規格）、`security-best-practices`（原raw／恢復／文字注入）、`playwright`（真擴充與實機）及 `npm-skill`（支援／lock／警示）。使用有實際路徑的SKILL.md並讀適用段落。
2. UI只修R805及既有權威一致性，適用時用 `impeccable`／`minimalist-ui` 做可及性/狀態檢查；沒有設計改動就説明不用，勿硬加框架。
3. 既有Vitest、Playwright、TypeScript/esbuild與officialChrome/nativeCDP足夠，不加不必要函式庫或productiondeps。MCP不可用可用既有CLI，不改帳號或授權。

## 完成後實際驗證

- `npm run format:check`、`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`npm run test:e2e`、`npm run pack`、`npm audit --json`。記錄精確counts/fail/skip/flaky/警示；現基線81unit/5E2E，新增必要cases應增加，原case不能少。
- 新確認5個問題的相同反例先失敗→修後安全成功/安全拒絕，再跑原39核心、Reset6、82UI、15真舊core、30真正Worker、25functional、19全profile重啟、42scope、schema5、denied13、真Hibernate7及必要新case。源fixture從候選正確types取得；安全提前中止／合法Reset等待允許，不以不安全實作滿足舊harness假設。
- 每次新attempt使用 `output/engineer/round-8/attempt-N/`，候選SHA＋完整raw＋注入計數＋owned profile/context/server清理。複製監工探針到工程師自己的新路徑再適配，不覆寫任何監工／歷史raw。錯方法也保存，不能重用filename掩掉失敗。
- 瀏覽器E2E預設 `channel:'chromium', headless:true`，獨立profile。真Hibernate用已驗證directCDP方法，正常source在discard前不要被偵錯器／viewport attach；真native量測才短暫headful並關所有own context。TaskManager選單開啟是非同步，**不要多按Enter**；重新讀新視窗與新AX索引，再操作。勿觸碰日常Chrome／其他專案。
- 新dist/zip20runtime等完整匹配、讀回／恢復語义、文件與checkbox如實同步。提交小步有意義commit後停止，回覆每項結果與未驗限制；Codex再獨立驗收整個專案。

## 禁止事項

不得改壞已通過的schema/migration/鎖/去重/特殊頁/ordinaryRestore/最新Undo/真Worker恢復/UI generation/可及性/英文產品字串與本機隱私；不得刪功能或測試、skip、放寬斷言、藏警示、換預設讓故障注入不命中、捏造計時或資源數字。不能把unknown當missing、把所有read失敗都清狀態、把具體操作外推成全部正常。不要推送／部署／上架／變更帳號模型訂閱費用權限。保留兩份第8輪監工文件並納入版本控制；保護round1–8全部歷史及原文。

超過8輪仍未符合條件時依使用者最新指示繼續可安全執行的工作，列具體阻礙／方法／必要決策，不僅因輪數停止。不得自行建排程或無限背景重試。
