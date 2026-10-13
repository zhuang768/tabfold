# 【第 9 輪修正】Tabfold — Antigravity 執行

唯一根目錄 `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`；受驗候選 `a5c6e059172d5a57a12e3f19802d43bf00f95b3b`，比較基準 `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`。唯一原文 `docs/original-requirements.md` SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`。Codex 是監工，你負責實作；交辦不新增產品需求。先完整讀本文件、`docs/SUPERVISION_ROUND_9.md`、本輪 `core-review-report-attempt-1.md`／`ui-review-report.md`／`evidence-review-report.md` 與失敗 raw。

第 8 輪的五個反例現在全部修好：原核心49、真Chrome兩個focused案例10斷言、Library／Popup真正有效Undo重試均通過。保留這些成果。新問題只有兩組產品缺陷，另有一組必要回歸到達性及三組文件問題；不要用廣泛重構代替最小修正。

## 問題清單、修正要求與預期

### R901 — Reset 已完成，舊 action 在第一個 await 後重建確認資料

- 檔案＋行號：`src/browser/library.ts:2162–2169`；`tests/unit/core.test.ts:2489–2499`。
- 問題與原因：onActionClicked 捕獲 epoch 後先 await setPopup，回來直接 saveTabs。受控原碼中暫停這個第一 await→public Reset 真完成且 local/session={}→釋放舊 await；舊 saveTabs 讀 Reset 後未確認設定，寫入含舊 URL／title／tabId／token 的 pendingConfirm，直到副作用之後2169才拒絕。source仍開、library無復活 URL，不能誤稱資料遺失或原生Chrome自然發生；但 Reset 已清掉的敏感確認狀態被舊操作重建。
- 證據：`output/supervision/round-9/core-new-boundaries-attempt-1-results.json` results[0]，runner/log 同名。明確 held first-await、Reset成功、完整前後raw、0harness/skip。
- 修法：第一 await 回來後、任何 saveTabs／storeConfirm／寫入副作用之前，確認原 action identity/epoch仍有效；失效立即取消。保留既有 publication序列化及下游epoch防護、正常新Save。不要改提醒預設或刪除確認來讓反例不命中。
- 回歸：正式 test 明確等待第一await entered，再Reset成功→釋放→等待old settled；確認完整local/session無舊資料、source仍開；再新合法Save真正成功作正控制。原Reset6與序列化publication情境全保留。

### R902 — 只驗新救援項目，應保留的備份／salvage歷史被丟仍回成功

- 檔案＋行號：`src/browser/storage.ts:494–506`、`:538–551`、`:567–578`；新R801正式回歸 `tests/unit/core.test.ts:2142–2267`。
- 問題與原因：寫完整 next／nextSalvage，讀回卻只 find新snapshot／some(currentRaw)。新副本完全正確時，既有唯一歷史 URL／corrupt raw 被注入丟掉，clear／restore-backup仍回oktrue。現原歷史1＋新1應保2份、遠低MAX_BACKUPS5，不是正常輪替淘汰；也是前R801明文要求的完整應保留歷史，而非新備份功能。
- 證據：同一 `core-new-boundaries-attempt-1-results.json` results[1] 的兩個子情境；rolling oldHistory唯一URL全local消失，salvage唯一 `ONLY-PRIOR-RAW-HISTORY` 全local消失，實際drop各1且response成功。是受控StorageDriver故障，沒有冒稱新真Chrome缺陷。
- 修法：對整份依法應保留的 next snapshots／nextSalvage 深比較，包括所有 metadata、原歷史／未知raw欄位及array順序；物件key順序不敏感。若set已造成歷史不一致，用尚在手中的原歷史／raw作有限、安全的回復或另存可讀回驗證救援；至少明確報失敗並阻止接續破壞，不能只拒清主DB卻放任已丟歷史無救援。不得承諾任意永久storage故障也必能寫成功、不得無限重試。正常MAX5輪替依原規則，不改為無限保留。
- 回歸：上述兩反例先紅、修後原歷史/唯一raw實際仍有可恢復完整副本；完整2份正常控制、滿N正常淘汰控制；保留已過的新副本same-id wrong-content、clear／restore、安全提前中止與rollback組合。不能只比id/count或省略原raw欄值。

### R903 — 正式 R804 未等 publication 停點到達，未驗到標題交錯

- 檔案＋行號：`tests/unit/core.test.ts:2475–2499`、`:2502–2529`。
- 問題與原因：onActionClicked後立刻await reset，沒有等session.set hook entered或assert heldFirst消耗；Reset epoch可先變，oldAction在publication前退掉，測試全綠却未命中宣稱的在途發表。這是必要回歸覆蓋缺口，不算第三個產品bug，也不否定全部87 tests。
- 證據：本輪core報告逐行await時序核對；獨立 `core-focused-new-attempt-1-results.json` 的合法串列adapter已驗：Reset pending while old publication held→release→真Reset及old settled→新Save closed1/result正確。原cleanup已刪，不再等待不可達停點。
- 修法：以確實到達停點的promise/counter控制；assert reset真的pending，釋放舊publication後才await reset完成，然後真正新Save，驗完整新result/時間與無舊popup。符合串列化合法順序，不要求Reset先完成於未釋放publication，不用deadlock/timeout/跳過當成功。加R901不同first-await反例，兩種時序分開。

### R904 — 候選、計時、資源與完成聲明仍錯配

- 檔案＋行號：`docs/TEST_REPORT.md:4`、`:17`、`:20–21`、`:134–150`；`docs/KNOWN_LIMITATIONS.md:3`、`:5`、`:8–10`；`docs/requirements-checklist.md:81–83`；`scripts/perf-measure.ts:109–131`。
- 問題與原因：87unit／R801–R810修後候選仍綁舊56（它實際81unit／五反例未修）；普通TAB readiness稱真互動，但沒有執行handler。R8歷史數字沒有每處完整candidate/date/path；TaskManager一般化成必须manual action才可量差值，openPopup概括需gesture、Library與Worker共PID沒有本輪完整來源證明。所有故障完整修好也與本輪兩個新反例不符。
- 修法：分工程師自测、監工獨立、正式suite、診斷探針；每份結果標真正受測候選、日期、raw路徑、clock範圍。不能將未提交HEAD說成已實測提交；可記tested working tree/base與commit後再次核對。保留所有歷史與不達樣本，沒有全回歸清輪前不宣告產品驗收完成。
- 新可引用證據在round9：87unit/5formalE2E；原core49＋新2紅；真corefocused10/10；UI受控94過＋2策略疑慮（不是UIbug）、真UI去重27/27；root core15、真正Worker30、完整profile restart19、scope42、schema5、Reset、functional25、denied13、Hibernate7均過。原文允許真正可追溯診斷支持實測，不增「所有QA必搬E2E」要求；新確證缺陷要有最小正式回歸，可重現交付不能只指ignored output。
- 本版1000筆search33.46ms、heap2,596,851B、133連續rAF無longtask/longframe；普通TAB readiness30次p50131.48/p95169.66/0>200。native真正首Search handler20次/nativePOPUP/完整DB均過：3筆p5042.8/p95294.8（1>200）、1000筆p50141.4/p95471.8（2>200），含API開始/CDP發現attach/觀測週期之上界，非純init或OS點擊。原200ms是合理量下目標，非everycold絕對門檻，不能扣掉假300ms取勝。method-research-r8只是舊56 instrumented方法研究，API return在async init完成之前，不能當新候選PASS或Chrome300ms根因。
- native-memory-valid-summary.json：自有64MiB sourcePID77535 96.5MB/CPU0→真nativeSave後消失；LibraryPID77538 39.6→46.2MB/CPU0→0，沒有確立Worker共PID、不是全browser精確等額節省／所有網站／長期OSCPU。native確認13/13涵蓋三步引導、unsaved/audioCancelOK、原生右鍵／快捷鍵／鍵盤搜索Restore；Skip、每個鍵盤控制與所有原生scope確認並未因此全驗。Worker40s真自然回收、samplingCPU／heap與OS百分比分開。
- npm clean ci仍有直接eslint9.39.5 deprecated及3 allowScripts advisory，不能隱藏或宣全部安裝零警告。若修既有devtool需先查官方支援與Node/peer相容、保留lock與全部gate；不得全域升級/approve-scripts/改授權或添productiondeps。安裝提示與lint零warning分別記錄。

### R905 — 純文字格式的實際來源仍未落文件

- 檔案＋行號：`docs/RESEARCH.md:19`、`:30`。
- 問題與原因：仍宣OneTab實際/社群 `URL | title`，卻沒對應可追溯實例或版本；原文要求自行查證格式，不需形式RFC。現在官方help頁並不明列pipe格式，不能用模糊首頁替代。
- 修法：補有來源小樣本／第一手使用觀察，正確分版本、檢索與來源角色，並把目前parserfixture與實際相容範圍相連。監工有限線索 `output/supervision/round-9/onetab-format-source-note.md`：2021-11-06 TW_Tones第一手匯出使用說明（https://talk.tiddlywiki.org/t/how-to-capture-links-from-browser-tabs-using-onetab-and-other-url-lists/1443），本次搜尋索引有作者正文，直接fetch403；須保留限制，不冒稱本輪安裝/原頁完整下載成功。可用可核實原作者來源或真樣本，不逼安裝別的擴充功能、添權限、重做研究／設計。保留已修的日期／來源分類／自定token。

### R906 — 隱私政策將有效期限誤稱當秒物理清除

- 檔案＋行號：`PRIVACY.md:27–30`；`src/types.ts:209`；`src/browser/library.ts:191–199`、`:328–339`、`:371–381`、`:1454–1516`。
- 問題與原因：durable寫10秒且TTL到即清，實際12秒、expired被拒不代表local/session所有raw當刻purge；放棄確認／中斷journal可留待安全恢復。publicationqueue是realm內Promise，並非session中的持久key。
- 修法：英文準確區分12秒有效性、物理保留與下次覆寫/消耗/Reset、session browserrestart及local跨restart；中斷狀態為恢復而留存。逐類描述，不為迎合文案增加poll／清資料。Reset清除承諾需配R901修後驗證；在途publication先序列化完成再清session，不說session有queuekey。這是文案準確性，不宣外傳或新主庫URL復活。

## 必須使用的 skill／工具

開工先列此IDE實際可用SKILL.md／MCP／CLI及用途/未用原因，讀適用部分，不只宣稱使用。沿用 `diagnosing-bugs`（同失敗訊號先紅、實際命中與正控制）、`code-review`／`ai-debt-detector`（規格/邏輯/async權威）、`security-best-practices`（原raw/歷史救援/Reset）、`playwright`（真正擴充）、`npm-skill`（lock/支援/警示）。UI設計本輪沒有新缺陷，`impeccable`／`minimalist-ui`必要時檢狀態/可及性，不硬重設計。既有Vitest/Playwright/TypeScript/esbuild/officialChrome足夠；MCP失效用可用CLI，不改帳號／模型／費用／權限。唯一規格已給，不因沒有額外issue tracker要求使用者重新設定專案。

## 完成後實際驗證

1. R901／R902同一反例先紅，修後完整raw與source安全；R903新test確實到達hold，合法Resetpending/release/complete與真正newSave。至少補兩確證bug正式回歸，不刪舊case／matcher。
2. 真跑 `npm run format:check`、`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`npm run test:e2e`、`npm run pack`、`npm audit --json`。現基線87unit/5E2E；記count/fail/skip/flaky/警示。
3. 重新驗原core49/UI96及必要trueChrome、Worker途中30、全profile19、scope42、schema5、Reset、functional25、denied13、Hibernate7、trueUndo重試與期限。相同安全目的不可弱化；合法早中止／串列adapter可用，保留方法錯誤與限制。
4. 每次用新 `output/engineer/round-9/attempt-N/`。複製探針再改自己新路徑，不覆寫任何監工/歷史/evidence-lock；owned contexts/server/profile成功失敗都關。擴充E2E用 `channel:'chromium',headless:true`，不得操作使用者日常分頁；native短測才headful，TaskManager非同步開啟不用多按Enter，每步取得新AX索引。Hibernate用已驗directCDP，discard前不attach source/viewport。
5. 文件、matrix及可重跑交付同步，保留原83切片及P0/global/P1誠實/P2只Hibernate與URL|title，不加sync/全P2/CI/.env。保存本輪兩監工docs不改原文，納入小步有意義commit，回覆新HEAD、逐項結果與未驗限制後停止修改，供Codex完整独立驗收。

## 禁止事項

不得改壞已過功能或無關使用者修改；不得刪功能／測試、skip/todo、放寬斷言、變預設避注入、藏warnings、捏造資源／計時／實測。不得為兩個cache疑慮強制readfail清光Undo。不得改原文與round1–9任何歷史raw、保護副本與hash來消除紅。不得把自己自測當監工正式通過。不得推送／部署／上架／改外部帳號、訂閱、模型、權限或費用；不新建排程／無限重試。已超8輪依使用者新指示繼續安全工作，未達完成定義不能只因輪數停止。
