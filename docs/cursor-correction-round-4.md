# 【第 4 輪修正】Tabfold — Antigravity IDE

日期：2026-10-12；唯一根目錄 `/Users/zhuangzijin/Desktop/Memory Expansion`；分支 `feat/tabfold-extension`；受驗候選 `76b534a23df980a5787a44328977768be7eba7e3`。

原始需求唯一依據仍為 `docs/original-requirements.md`，不得在交接增加產品範圍。本輪不是重派第 3 輪：原反例已有改善，現在修實際剩餘及新回歸。Codex 是監工，Antigravity 是工程師。先讀本文件、`docs/SUPERVISION_ROUND_4.md`、本輪三份審查與矩陣，再執行。工程師停碼後才由 Codex 再次獨立驗收。

## 問題清單與修正要求

### R401［阻擋；真 Chrome 已重現］合法 id 被 journal 原型誤判，未開頁就刪 URL

- 檔案＋行號：`src/browser/library.ts:202–209,880–883,911–921,973–975,987–998`。
- 問題／影響：空 journal 是普通 `{}`；合法匯入 id `constructor`／`__proto__` 的繼承屬性被當已開紀錄。公開 JSON 匯入成功後 Restore／Undo 回成功，實際 targetTabs=[] 且庫 entries=[]。不需故障注入就遺失資料。
- 修正／預期：journal 使用受驗 own-key 結構；必須核實真正已開頁與所屬操作才可移除。不能只禁止這兩個 id，或只以 truthy tabId 當成功。保留合法匯入、還原與 Undo 功能。
- 驗證：本輪 `prototype-real-browser.mjs` 兩例從紅變綠，精確 URL 真開且庫正確變化；正式 unit 加正常及特殊 id（包括其他原型名稱），真瀏覽器公開匯入閉環仍過。

### R402［阻擋；受控實測］完整 raw 驗證仍被正規化掩蓋

- 檔案＋行號：`src/browser/storage.ts:324–329,349–371`；`src/core/migrate.ts:53–61,186–199,217–257,391–411`。
- 問題／影響：current stats 字串、無效 theme、Undo 混數字、缺 group/tags 被 normalize 成預期。關頁當下 raw 確實仍錯型，save 卻 closed1。
- 修正／預期：現行 DB／row／settings／stats／revision／Undo 必填、型別、合法範圍及內容完整嚴格解析；直接比原始持久內容。舊版遷移另處理，不能以 normalization 或後續 warning 掩蓋關頁前錯誤。
- 驗證：新 RAW-METADATA 探針及正式實際 save pipeline 逐欄 raw 變造均留來源、明確 error、raw 可救援；原正常 save、過期 Undo、legacy 遷移仍過。

### R403［高；受控實測］首次提醒 token 不能代替後來新增音訊確認

- 檔案＋行號：`src/browser/library.ts:627–634`。
- 問題／影響：`!bound` 與未綁定 `confirmedAudio` 使有效 unsaved token 略過新增 audible，未音訊確認仍關。
- 修正／預期：分別綁 unsaved／audio 的原操作、目標及已確認快照；fresh 新增音訊留頁或再確認。關閉前重核原文保護條件，不把任意 valid token 視為全部同意。
- 驗證：NEW-AUDIO-VALID-UNSAVED-BOUND、Boolean audio、新增 pinned／白名單／無痕／URL／視窗变化；真正音訊確認與取消正常。

### R404［高；受控實測］複合保存失敗留下未關頁的有效 Undo

- 檔案＋行號：`src/browser/library.ts:497–524,504–506,719–779`。
- 問題／影響：set 成功一次 readback 失敗回 saved0/closed0，持久 Undo 仍有效；或只關兩頁之一且 postclose 寫失敗，Undo 仍兩 id。解除故障後重開仍未關的來源頁。
- 修正／預期：可靠保存／關閉階段与實際結果集合，未關頁不能當可 Undo；發生副作用後故障可協調，不靠 UI 回傳的一筆 undoIds 假裝持久庫正確，也不丟已關頁復原能力。
- 驗證：SAVE-ONE-READBACK-FAIL、PARTIAL-CLOSE-POSTWRITE-FAIL，逐 URL 原頁與新頁精確數、權威 DB／操作狀態，錯誤與部分結果可見。

### R405［阻擋；受控實測］備份還原讀回拋錯漏回滾

- 檔案＋行號：`src/browser/storage.ts:491–503`。
- 問題／影響：rollback 僅包內容 false；set 後 readback get／parser throw 回 error，原庫已被 backup 覆蓋。
- 修正／預期：完整 set/remove/read/verify 作可持久恢復交易；讀回拋錯也保住原庫、快照與救援。回滾自身失敗要誠實報告且保留可救回的原始資料，不再吞錯。
- 驗證：BACKUP-READ-THROW、讀回內容／錯型、set/remove、回滾讀寫故障；失敗後完整原庫和救援可核對。

### R406［阻擋／高；實測及靜態］新毀損覆蓋救援；遷移仍用舊 raw

- 檔案＋行號：`src/browser/storage.ts:239–265,252–255,349–369,463–465`；`src/core/migrate.ts:313–347,384–385`。
- 問題／影響：damaged A→restore→damaged B→restore，匯出只剩 B；遷移亦無條件覆蓋 salvage。鎖內只比版本卻寫舊 result；v1 duplicate id 持久成 schema2 後被自身拒絕。
- 修正／預期：獨立可辨識救援歷史／明確保留規則；鎖內重讀並依真正當前內容重算，穩定且唯一 id；故障能恢復遷移前原始內容。保留五正常滾動快照，勿虛稱 storage 原子 CAS。
- 驗證：SALVAGE-TWO-DISTINCT-DAMAGED、多不同壞 raw、遷移與恢復交錯、v1 duplicate、各步讀寫故障；成功 actual raw 與回傳一致，失敗原 raw 可匯出。

### R407［阻擋／高；受控實測］journal 吞錯及過期 tab 誤信仍丟資料／重開

- 檔案＋行號：`src/browser/library.ts:202–245,880–890,973–982`。
- 問題／影響：session.set fail 被吞＋DB fail，重試 create2；第一次已開但持久失敗，使用者關該新頁，重試仍 opened1/removed1，庫與開頁都無該 URL。create→record 中斷沒有 intent，session 也不是跨瀏覽器重啟持久紀錄。
- 修正／預期：最小可靠持久操作身分／目標／create 前 intent／逐筆結果及未知結果模型；核實 tab 存在、URL、操作身分。錯誤不可 best-effort 當成功依據；喚醒／重啟協調保守、不碰無關頁、不盲重開。
- 驗證：JOURNAL-SESSION-FAIL、STALE-TAB、retain／跨 Restore-Undo／已導航／重新匯入相同 id；Worker 在 save/restore/Undo 中途真回收及重啟，不重開、不丟 URL、真進度可重建。

### R408［高；受控實測］runtime 驗證只修 settings，其他請求仍先污染或繞保護

- 檔案＋行號：`src/browser/library.ts:850–863,1074–1081,1099–1105,1190–1195,1213–1219`；`withMutationWrite:96–97`。
- 問題／影響：edit group object 回 error 卻已寫壞 raw；未知 restore mode 對16筆直接開16／刪16，不要求批次選擇。delete string ids 走字串 includes，batch size 小數仍被接受。
- 修正／預期：所有入口 runtime keys/types/ranges 在任何 DB／backup／tab mutation 前集中驗證，合法 mode 明確；save ids/布林/token、restore/group、delete、edit group/tags、文字/settings 均覆蓋。沿用 TS／現有工具，不加無必要 production dependency。
- 驗證：EDIT-REQUEST-CORRUPTS、RESTORE-INVALID-MODE及代表全部 request 錯型／未知 key；error 後原庫／backup／tabs 完整不變；合法編輯與批次選擇仍過。

### R409［高；UI 受控實測］有效 Undo 被非 Undo status 擋住

- 檔案＋行號：`src/ui/popup.ts:23–54,317–331,367`；`src/ui/list.ts:32–66,328–342,416–420`。
- 問題／影響：匯入錯誤或部分結果清 status children，下一 load 因既有 status 不重建，DB Undo 有效但兩 surface 按鈕0。fresh save/session重播也固定12秒非剩餘期限。
- 修正／預期：摘要與權威 Undo 控制分離，保留 error/partial 文案同時呈現仍有效入口；所有路徑遵守真正 expiresAt／數量與過期狀態。
- 驗證：本輪 UI 兩 surface 非Undo錯誤仍保按鈕；部分 Undo failed ids可重試、重開／Worker／近過期，不蓋摘要亦不假延長TTL。

### R410［高；UI 受控實測及靜態］舊非同步 targets 回填失效頁，初始設定尚未 ready 可提交

- 檔案＋行號：`src/ui/list.ts:267–344,366–376`；popup load；`src/ui/options.ts:29–41,130–240`。
- 問題／影響：較新 get-state fail 清 DB／picker，舊 targets 回應再填 id31，Save 仍發 request；options pending 初始false/default可覆寫原設定。
- 修正／預期：各 surface loading/ready/error 與 request generation；舊回應不得復活目標，依庫 mutation 必須 ready；錯誤保留救援/retry通路，設定未讀不可提交空預設。保留已修 dirty/pending draft。
- 驗證：新10斷言的 stale response／Save guard，popup同時序、options延遲/拒絕不能写初值；成功retry正常。

### R411［高；靜態確證］右鍵 Save others 仍丟完整結果

- 檔案＋行號：`src/browser/library.ts:1497–1500`（對照 current/toolbar 結果入口）。
- 問題／影響：首次提醒結果未保存／顯示，確認無法續做；摘要與 Undo 無入口。
- 修正／預期：current/others/toolbar/快捷鍵共用結果派送，保留原 scope／token／目標，必要連續確認、取消和部分结果完整。
- 驗證：真入口首次普通及影音、兩次取消、成功／部分失敗、Undo；不要以直接 API 測試代替入口。

### R412［高；靜態確證］直接 Promise 拒絕與 session 故障仍漏可見恢復

- 檔案＋行號：`src/ui/popup.ts:443,460–462`；`src/ui/list.ts:454`；`src/ui/shared.ts:35–36`。
- 問題／影響：openOptions void 無catch，session catch空吞。File.text 已有catch/finally，不能再當未修。
- 修正／預期：每異步入口有界 catch、英文可見 error、finally復原、可重試；不要因通知錯誤讓有效操作入口失效。
- 驗證：openOptions/session get/set/remove拒絕，零 unhandled rejection，controls仍可用；原File.text兩種錯誤測試保留。

### R413［高；靜態確證］busy／進度／焦點未完整，仍有假動畫

- 檔案＋行號：`src/ui/popup.ts:156–190,475–510`；`src/ui/list.ts:101–135,218–224,442–449`。
- 問題／影響：同surface guard/aria-busy有改善，但相關controls／live進度／焦點未恢復；另一row先加restoring再被guard忽略，單筆 res.ok=false留class，reload重建DOM掉focus。
- 修正／預期：與可靠操作狀態共用真進度和完整busy，finally恢复；防重送跨surface／retain；焦點鍵盤策略、取消/部分結果可理解，不只補 spinner。
- 驗證：延遲與故障、多次click/鍵盤、跨surface、retain、批次、storage reload後可見焦點与controls；無多開或卡busy。

### R414［原文必做］固定字串仍非單一來源

- 檔案＋行號：popup.html `6,14,34`；list.html `6,14,37,44`；options.html `6,13,14`；list.ts `511,539`；library.ts `1315–1324,1382`；build.ts `55–66,95–101`。
- 問題／影響：固定title/brand/aria與error直接copy/hardcode；manifest注入已修，不再重派它。
- 修正／預期：安全從唯一strings生成/填值全部固定可見字串與aria，不翻譯不可信title/url，不用unsafe innerHTML；維持英文及真surface文案。
- 驗證：源碼及build結果對照strings，title/aria/message/HTML；既有manifest同步与本機favicon保留。

### R415［必做］正式回歸缺完整 raw／複合故障／UI時序

- 檔案＋行號：`tests/unit/core.test.ts:931–1223`；現有UI controlled probe；沒有正式UI test檔。
- 問題／影響：只新增6個unit，41全綠不覆蓋本輪新故障與R306/R308；舊14受控全綠也不覆蓋新時序。
- 修正／預期：將本輪12core＋兩類UI及原需涵蓋的核心／UI契約納入正式最小測試；先觀察紅，再同斷言綠。保留既有41、原40核心/14UI語義與demo URL合法assert。
- 驗證：正式全跑，精確URL／完整DB／開關數／error/control狀態；CSS既有零warning gate與故意bad fixture檢出仍過，不需要重改已修CSS。

### R416［必做］正式真 E2E 七特殊／三scope與內容仍缺

- 檔案＋行號：`tests/e2e/extension.spec.ts:76–86,165–168,175–256,553–735`。
- 問題／影響：audio fixture未使用、無真audible/incognito/form draft；scope只有window UI；還原URL只includes。backup只ok，retain/groupbatch取消/毀損遷移閉環不足。
- 修正／預期：保留已真點Save/Undo/Library和現有4例，補原文各特殊／三scope與首次完整確認、精確origin/path/title/content/清單變化、匯入匯出／設定／備份／遷移/retain/批次取消，不以API跳過入口冒充UI。
- 驗證：獨立profile真正載入extension、local fixtures、取消不關、部分結果不丟；真釘選/音訊/無痕/內部/重複/最後頁等權威tab屬性；0外連追蹤与警告。

### R417［必做］途中 Worker 回收與完整 raw 重啟缺實測

- 檔案＋行號：`tests/e2e/extension.spec.ts:369–474`；library journal階段。
- 問題／影響：idle stopped/nonce/fullraw 已有實質改善且本輪4E2E通過；未涵蓋中途save/restore/Undo，restart只count/URLs。
- 修正／預期：保留現有idle證據，新增可控中途停點、真CDP stopped、喚醒協調與同profile重啟完整raw/operation/實際URL個數；不可用page關閉/handle重取充當回收。
- 驗證：明確stopped event、域重置、各危險副作用前後停機不丟/不重開；same-profile全庫逐欄與權威tab結果。

### R418［高］測試 launch／perf 故障仍殘留 context

- 檔案＋行號：`scripts/perf-measure.ts:19–177`；`tests/e2e/extension.spec.ts:39–54`。
- 問題／影響：perf無try/finally；context已建立但worker wait/ID assert失敗時outer拿不到context，finally漏清。
- 修正／預期：所有setup與perf成功/失敗均清自己context/server/profile，保留獨立headless；不要碰日常Chrome。確需可見native/TaskManager時短暫說明，完立即關閉自己的測試窗。
- 驗證：刻意worker wait/readiness/artifact故障仍清context與本輪資源，保留失敗logs；正常E2E/perf仍過。

### R419［原文必做］原生 UI／大字體與效能證據仍不足，數字誤報

- 檔案＋行號：perf-measure.ts `82–87,104–128,162–165`；extension.spec.ts `491–531`；TEST_REPORT.md `75–83`；KNOWN_LIMITATIONS.md `9–10`；HANDS_ON_ONLY.md `6`。
- 問題／影響：ordinary newPage popup不等於native action；一次Tab／存在media規則不等於實際順序/動態。現有raw p95=202.62但文檔188.63、口頭還稱202.62符合≤200。兩rAF終點不等於連續FPS；CPU/Worker/idle/coldwarm/TaskManager未測。
- 修正／預期：同artifact精確報數，注明負載/樣本/版本/硬體/候選；量真interactive action、native尺寸/200%/長錯誤/onboarding/footer/焦點/實際reducedmotion/lightdark/icons，1000筆連續frame/longtask/搜尋捲動、CPU/page&Worker/idle及原生TaskManager。不能用50MB公式、heap或推測process原因替代。ordinary1000 p95不能直接推論原生必失敗。
- 驗證：實際原生與可識別截圖/錄影/條件數據，warm/cold及1000完整輸入輸出；TaskManager需實際嘗試/前後負載/量測步驟。客觀不能測要存本輪限制與未驗，不能一句轉交就全部達標。

### R420［文件／交付必做］安裝與研究來源、最低Node/依賴、完成宣稱不實

- 檔案＋行號：README.md `7,62–76`；package.json `35–36`；DEPENDENCIES.md `12,25`；RESEARCH.md `19–35`；DESIGN.md `5–8`；TEST_REPORT.md `3–4`；requirements-checklist.md `49,81,83`；KNOWN_LIMITATIONS.md `3`。
- 問題／影響：首次跑自動安裝browser宣稱錯；dead tinypool override/消漏洞論述不對鎖檔；最低Node未驗；研究與設計具名缺直接來源，歷史容量誤當現候選；所有R301–324/七特殊/核心競態完整宣稱不成立。
- 修正／預期：正確乾淨環境命令与實際支持Node門檻；保留必要鎖檔/最小依賴；官方/研究/評論/設計來源與真比較，歷史證據標候選日期，英產品文件与繁中研究限制保持原文。逐條checklist依實證，不藏可修缺陷為限制；可安裝dist/zip與隐私商店草稿內容一致。
- 驗證：照README乾淨重現、本輪測試及artifact同candidate；zip逐檔/图示/CSP/permissions、.gitignore/秘密準備。未驗/skip/工具限制如實列出，不能說完成代替證據。

## 必須使用的 skill／工具

開工先盤點工程師實際可用 skill／工具/MCP，每個適用用途與未用原因；不能捏造已用工具。適用：diagnosing-bugs（精確紅綠）、ai-debt-detector（吞錯/假成功/競態）、現有npm/TypeScript/esbuild/Vitest/Playwright（依賴/正式回歸/真Chrome）、適用UI audit/可及性/效能與安全檢查。保留原視覺，不重新設計整個產品；無關部署/cloud/Figma/imagegen等沒必要就不引入。不可為善用skills新增雲端或無必要依賴。MCP錯誤可改用現有CLI/函式庫，禁止改帳號／模型／費用／授权。

## 完成後驗證方式

在唯一根目錄執行，每次嘗試使用新結果路徑，保留紅測與故障結果：

```sh
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
TSX_DISABLE_CACHE=1 node --import tsx output/supervision/round-4/core-fault-probes.mjs
node output/supervision/round-4/ui-new-fault-probes.mjs
node --import tsx output/supervision/round-4/prototype-real-browser.mjs
npm run test:e2e
npm run test:perf
npm run pack
unzip -t tabfold-extension.zip
npm audit
```

本輪監工新探針目前刻意紅，修後相同安全斷言應綠，0 harnesserror/skip；原前輪40core/14UI及所有正式unit/E2E保留。監工probe固定輸出檔僅代表當時測量，後續不可覆寫舊紅證據：以新路徑副本/參數化輸出或新執行目錄保存，保留原期望；只可為實際相容必要更新adapter并說明，不放寬assert。真Chrome與性能/UI/native需附方法與原始數據，不以unit/mock替代。

完成所有R401–R420後小步有意義commit，保留本輪監工文件，不改未通過標成通過。回報每項實際命令、pass/fail/skip/警告、候選HEAD、artifact路径和未驗限制，然後停止修改供Codex獨立全量驗收。

## 禁止事項

不得改壞已通過功能或無關使用者修改；不得刪功能/測試、skip/放寬斷言、隱藏警告、假數字/假完成、把普通tab稱native、把estimate稱實測。不得覆寫歷史失败證據或藉「沒測到」宣告沒bug。只動本專案，保護日常Chrome/原頁/原始資料；不自行改帳號／訂閱／付費／模型／權限；不推送、部署、發布或商店上架。GitHub準備待全驗收與具体必要授權，不是本輪開工動作。
