# 【第 6 輪修正】

工程師：Antigravity IDE。唯一 root /Users/zhuangzijin/Desktop/Memory Expansion；分支 feat/tabfold-extension；受驗候選 814d668af8ba3b443d1adeb7ad6b40b6468110f5。你已停止第5輪，Codex完成完整独立再驗收；現在真的開始第6輪，不能將你上一輪自報全完成當作這輪通過。

唯一產品規範仍是 docs/original-requirements.md（與原附件逐byte相同）。P0及所有global必做，P1盡量且誠實列範圍，P2只已選 Hibernate＋URL|title。不得發明產品功能、同步、遠端服務或新設計方向。讀 docs/SUPERVISION_ROUND_6.md 與 output/supervision/round-6/{core-review-report,ui-review-report,evidence-review-report}.md。原83項28通過／23失敗／32疑慮；疑慮不全部當bug，必須按證據處理。

## 問題清單、修正要求與預期結果

### R601 — intent／journal讀寫未知被吞，重建又開同URL

- 檔案行號：src/browser/library.ts:214–255、276–302、344–353、1117–1131、1285–1298。
- 問題與影響：新core attempt2三案例真執行：aux寫回成功卻沒存／明確寫reject／已存journal但之後get拒絕，均被當已知空且create，fresh realm同URL created2。URL仍存在，不誇稱永久資料遺失。原15舊反例已過，新增local key並不證未知結果安全。
- 修法：可追蹤副作用的預備意圖須持久寫入並讀回確證；可靠性讀取拒絕不能回空當不存在。真正不確定的操作須保留URL與可見待確認／可恢復狀態，不能盲重送；可保守拒絕開始／續做。無法跨DB＋Chrome API共同原子，不要求不可能無條件exact-once。跨Restore/Undo已有改善保留。
- 驗證：同三scenario及永久全部寫fail控制；持久證據、開頁數、URL保留、error／unknown區分。根原trueWorker test亦保持0duplicate，不靠記憶體或輸出文字假過。

### R602 — 現行儲存metadata lenient回歸，毀損靜默抹掉

- 檔案行號：src/core/migrate.ts:521–554；src/browser/storage.ts:256、290、377、406；src/browser/library.ts:83–98。
- 問題與影響：schema2的revision="7"/totalSaved="123"/theme="BROKEN-THEME"，get-state回corrupt:false且默補；合法改theme dark又覆掉唯一原錯metadata，raw/salvage/corrupt都無原值。URL仍在，但違反毀損偵測／救援。
- 修法：persisted current read使用完整嚴格契約，與legacy／export partial settings shaping分開；壞current DB不得當正常來源寫回，完整原raw可救。不能用放寬metadata修import。
- 驗證：同fixture應corrupt可見、保留原raw、patch不破壞；正常current、合法legacy遷移與JSON宣告格式仍完整往返。

### R603 — 寫後root schema錯仍關來源，queue自等待

- 檔案行號：src/core/migrate.ts:412–430、492–558；src/browser/storage.ts:257–286、354–359；src/browser/library.ts:987–988。
- 問題與影響：寫後version缺／0／-1／1.5被normalize成2再比對，四受控子案都關來源，save再等自己queue。根另真正Chrome把write後root改1.5：sourceClosed=true、rawRootSchema=1.5、觀察reply pending、injectionCount5、0harness（root-schema-write-real-result.json），不是只有替身。pending採樣不作新的50ms效能門檻。
- 修法：current寫回必直接驗原raw有schemaVersion2和全部欄位一致；legacy0/1僅合法遷移入口處理，不能讓current write後變造當舊資料而通過。queue內badge/read不能再次無token取自己的queue；錯誤要可見、有界，不关來源。不要只讓promisesettle而仍關錯資料。
- 驗證：四原子案＋根真Chrome同場景，source保留、raw救援、明確error；既有正常migration/backup/queue與所有已過反例維持。

### R604 — durable Undo後端能用，使用者卻沒有入口

- 檔案行號：src/browser/library.ts:913–930、1205–1240、1351–1358；src/ui/popup.ts:353–367、435–436、530–542；src/ui/list.ts:372–386、507–512。
- 問題與影響：close成功後DB set失敗、aux正常，durable ids/12秒期限有效、DB.undo=null。重開Popup／Library、Library Save和toolbar session replay四入口都0 Undo，14斷言4 fail。不能用直接call Undo API證產品可用。
- 修法：提供唯一有效權威Undo狀態，驗證ids、與現存entries相交、TTL、用盡／部分成功，兩surface與session replay從相同authority重建並更新。不能續12秒或顯示已消耗狀態；raw key改變需適當通知讀取。
- 驗證：ui-durable-authority原14及一般27，全入口能實點；到期、用盡、partial、storage重載與fresh worker都保持正確。正式測試納這個真契約，不依一次toast。

### R605 — 清除全部仍留狀態／舊確認，可重寫已重設庫

- 檔案行號：src/browser/library.ts:194–204、305–360、1500–1509；src/browser/storage.ts:557–568；src/ui/options.ts:241–251；PRIVACY.md:25–28、README.md:83。
- 問題與影響：真reset-session-real結果：reset成功後pendingConfirm仍含URL，舊token可關來源並寫回DB。新local journal／intent／durableUndo不在原四key清除及raw救援範圍；文件仍誤稱journals只session。
- 修法：按實際所有Tabfold-owned local/session/RAM資料實作清除與確認失效，合理處理進行中操作／儲存拒絕，清除未完成不可回普通全成功；不刪無關資料。清除不能被舊callback／重試悄悄重建。原raw救援需明示並含必要operation狀態，普通JSON匯出不擅自增加未規定跨browser session格式。同步英文privacy/data說明實際持久性／清理。
- 驗證：根同真Chrome案例、successful-save後資料清除、未完成操作與session/local failure、重開surface與browser restart。舊token無效、資料在宣告範圍清乾淨、failed clear可見。測試資料與profile全隔離。

### R606 — 固定可見文案仍散落，新增STRINGS未使用

- 檔案行號：src/ui/popup.ts:546；src/browser/library.ts:430、982、1001、1388–1411、1513–1573、1619、1652、1691、1719–1722；src/browser/storage.ts:489、516–519、543；src/strings.ts:187、201、214–219。
- 問題與影響：SaveResult/status/res.error有固定validation／stats warning／session template literal；常數存在但改它不會改可見文案，唯一需求的字串單一來源未達。
- 修法：實際所有固定可見專案錯誤／模板用既有STRINGS（必要參數化模板），保英文、text安全；runtime第三方exception detail／使用者標題URL不硬翻譯。HTML/manifest/aria已集中部分不重做。
- 驗證：按error/partial/session/get-state通路核對單一來源，不能只增加未引用常數。

### R607 — Library／Options首次讀取沒有loading

- 檔案行號：src/ui/list.ts:337–344、422–451、673；src/ui/options.ts:32–41、138–160、257–258。
- 問題與影響：真init＋deferred get-state，status隱藏且無任何visible loading/busy/progress。6斷言2 fail；Popup Loading已過，Options防初始patch也已過。
- 修法：await前用STRINGS.loading與可及性忙碌語義，只有最新generation的success/error/corrupt才能結束，保dirty draft與救援。不得加人工延遲／假loading。
- 驗證：同deferred六斷言、成功／失敗／逆序，真頁面讀取時可辨狀態。保持原27+10UI綠；操作後focus若實測失敗才最小修，不能把靜態疑慮冒成已驗失敗。

### R608 — 必要回歸沒成為正式可重現交付

- 檔案行號：tests/unit/core.test.ts:347–368、1589–1607、1679–1786；tests/unit/ui.test.ts:82–89、144–165、249–256、381–505；docs/TEST_REPORT.md:4、14、20–23、63–82；docs/requirements-checklist.md:83。
- 問題與影響：65相較57僅新增3core/5展開UI，不是原15core/27UI及新6core/20UI全正式化；ignored output verifier不在Git，可重現交付缺失。已修的Options真init、timer/remove、精確R407與原15/27語義完整都承認通過。
- 修法：把明確行為契約/一般故障/權威狀態加到正常Vitest/E2E，合理參數化、fixture復用，不鏡像實作、不要求每output一份重複case。保65與所有舊強斷言，新fixture至少能先重現相同失败再修到green。
- 驗證：npm run test真0fail0skip與新各semantic checker全過；報實際数量／scope而非「多幾個測試因此R501–524全過」。

### R609 — 真浏览器完整流程／七特殊仍未齐

- 檔案行號：tests/e2e/extension.spec.ts:174–274、377–494、521–557、666–776、855–872、955–1069；docs/TEST_REPORT.md:88–100。
- 問題與影響：incognito只是boolean/fallbackfalse；首次確認/取消、原生popup三scope UI、retain/group/batch cancel、JSON/legacy/corrupt/backup全閉環不足。prototype Undo先save已還原URL而換新ID，未以原特殊ID驗真正Undo。audio確實audible=true必assert與exact主URL已修，不重派。
- 修法：保5原case與assert，補真正隔離分頁與UI/副作用/raw/content；無痕需要實際incognito source與允許／拒絕狀態和產品提示，不能只typeof。只操作合成測試profile，不改日常Chrome帳號或權限；若某真情境平台阻擋則保留具體證據且標未驗，不宣全七過。
- 驗證：全suite0fail0skip；每source存前／close後／restore後精確URL、標題／內容、DB保留／移除／設定；根three-scopes-real42/full-profile-restart-real19已過且可正式化（API scope不可冒稱native select）。原真prototype兩case保持green。

### R610 — 三流程副作用途中真Worker回收與重啟需要完整驗證

- 檔案行號：tests/e2e/extension.spec.ts:377–494；src/browser/library.ts:save/restore/Undo管線；docs/TEST_REPORT.md:88–91。
- 問題與影響：正常idle真正stop/nonce與根自然idle/完整profile重啟都已證有效，不重說只有reload。但現存Restore失敗回覆後stop不等三流程副作用途中；memory fresh realm不能代真正Worker。
- 修法／測法：隔離合成分頁，可控正常API Promise停點（before/after write/read/close/create）、真正CDP stopped事件/old nonce消失，再喚醒或同profile重啟。save／restore／Undo各把URL、剩餘source、操作結果、可用Undo/未知結果/raw全對照。工程師仍負責功能，不要求跨API原子不可能承諾；unknown須可見可恢復。
- 驗證：保原trueWorker/blank案例與fullrestart/naturalIdle，新增三flow精確停點證據、無盲重送/誤移除、URL不失、可見狀態、全部test-owned context/profiles finally清理。

### R611 — 效能資料不一致／方法不能混成達標

- 檔案行號：docs/TEST_REPORT.md:17、104–128；docs/KNOWN_LIMITATIONS.md:5、8–11；scripts/perf-measure.ts:104–138、153–173；docs/requirements-checklist.md:81；docs/HANDS_ON_ONLY.md:3、6。
- 問題與影響：文件139.44/186.78非最新raw；工程師slow30=279.28/491.76，根30=166.83/217.8，另一根30=140.32/203.18均保存。ordinary TAB不是native冷暖首屏；說API需手勢／自動化不能原生或TaskManager只有使用者可做與已成功方法不符。舊3ad資源數不能借成814current全部過。
- 修法：先定義與原文首屏≤200ms相符測量起訖，分别紀錄native首屏paint／完整UI ready／可互動和API/檢查開銷，不將Chrome API壁鐘或FCP偷換成另一指標。記實際Cold/Warm、候選/ZIPhash/date/Chrome/Node/npm/fixture/全部順序30樣本；慢run完整保留，需改善時定位瓶頸最小修，不改門檻/挑樣本。原生/CPU/heap/naturalIdle/1000frames根当前可成功方法見round6 artifacts，正確記限制，不造Unsupported或必須額外FPS門檻。
- 驗證：native可行方法實跑、1000連續scroll/search/motion/資料真counts；CPU不同scope與sharedPID不加兩次、不把空白欄當0、不用估計替真TaskManager、不稱精確physicalRAMsavings。README/測報/限制/checklist引同一最後候選可查證資料，歷史另標，未驗明示。

### R612 — 研究與設計來源仍不可追溯

- 檔案行號：docs/RESEARCH.md:19–27、33–39；docs/DESIGN.md:5–8；docs/DECISIONS.md:38；docs/requirements-checklist.md:26、80。
- 問題與影響：2023-11-14遺失／2024-03-02還原50卡死只有商店大頁，無本人permalink；設計只有品牌首頁，沒有原文指定獎項與作者社群案例。儲存體積小不能推論queue/journal可靠。
- 修法：實際閱讀已有 output/supervision/round-5/research-source-verification.md 的官方與三本人permalink/Apple Things3獎/作者features/Dribbble GoTo；驗證來源並標日期/版本／本人自述／推論。不能捏日期/作者/規格；OneTab現有optional encrypted sync不得籠統稱全產品nosync，但Tabfold仍本機限定。未查到官方URL|title精確格式就誠實標compat範圍，不以parser假官方互通。保既定風格、資產自繪、不抄圖、不增加sync。
- 驗證：每個結論直接primary/permalink支持；本產品token決定與參考觀察分開；研究/設計/決策繁中。

### R613 — 最低Node clean install不能依README重現

- 檔案行號：README.md:7、38–43、62–76；package.json:35–36；docs/DEPENDENCIES.md:26；docs/TEST_REPORT.md:3–10、19。
- 問題與影響：根確實新814 Git副本＋官方最低Node20.19/npm10.8.2與Node22.13/npm10.9.2，clean npmci都EUSAGE Missingesbuild；npm11.16則兩套ci/verify65都過。README只npm缺版本。安裝有directeslintdeprecation/allowScriptsadvisory，不稱0warnings。
- 修法：選可重現且已實測的最小npm工具條件／lock相容解法，清楚英文安裝指令与版本；不自行改使用者全域Node/npm、安全設定、付費／帳號。既存devtool僅按必要相容性處理，無runtime依賴。不用npm install在原root漂移lock後假稱ci可重現；若改lock需再次最低版本clean副本驗證。
- 驗證：README宣告組合乾淨npmci和verify實跑，記Node/npm/lockhash。各requiredgate、ZIP逐byte與文件命令均正確。可區分install advisory與product runtime/lint warning，但不可隱藏；不為消訊息approve全腳本或弱化安全。

### R614 — 完成／限制／checklist聲稱超證據

- 檔案行號：docs/KNOWN_LIMITATIONS.md:3、7–11；docs/HANDS_ON_ONLY.md:3、6；docs/TEST_REPORT.md:4、10、17–23；docs/requirements-checklist.md:81–85；PRIVACY.md:25–28。
- 問題與影響：可修缺陷都已完整修毕、七特殊全真測、所有gate全覆蓋等超過實際；pack並沒有copy/tmp、資源/容量歷史數缺candidate方法。這不是只修文字就完成功能。
- 修法：先完成對應程式/測試，再按最後candidate與實際exit/count/scope更新所有文件；pass/fail/未驗證/P1誠實缺項分開，其他平台未測不加新原需求但標限制；英文產品README/privacy/store，指定繁中文件保持。保留監工docs并納commit，勿改舊紅證據。
- 驗證：每個完成勾選有這一候選真證據；使用者能依README產生可安裝dist/rootZIP；商店/部署/GitHub暫不操作，最終由Codex檢查必要授權。

## 必須使用的適用 skill／工具

開工先列實際可用skill/工具及用途，讀適用既有SKILL，不虛構安裝。優先既有 diagnosing-bugs（同失敗訊號）、tdd／ai-debt-detector／code-review（資料狀態/回歸與最小修）、impeccable/minimalist-ui（既定版面、loading、focus、無障礙）、npm-skill/TypeScript（clean lock與strict契約）。真正瀏覽器用既有 @playwright/test＋官方 Chromium/CDP，native必要時CUA；元件／計時／DOM已有工具不硬寫假替身。未裝skill用既有官方CLI/函式庫且說明，不新增雲端部署、圖像、追蹤、同步或生產依賴。

## 完成後必須執行的驗證

- npm ci；npm run format:check；npm run typecheck；npm run lint；npm run test；npm run build；實際正式E2E（headless chromium）；pack／unzip實際rootZIP／runtime檔逐byte；npm audit，保原raw與所有失敗。
- 保原15core/12fault/27UI/10fault/真prototype2/65unit/5E2E及已改善API/input/原型/audio/TTL/migration/queue。讀回測試需真正read到受控raw；UI需真init/listener/time/DOM移除，不能空remove／同步timer。
- 把本輪新 core-new-boundaries-attempt2.mjs（6）、ui-durable-authority-probes.mjs（14）、ui-initial-loading-probes.mjs（6）、root-schema-write-real.mjs、reset-session-real.mjs 複製成新的 verify-r6 路徑／candidate metadata；所有語義期望不改，結果另寫round6-new-attempt目錄，失敗保留。readback/sourceClosed/unknown/library/Undo都驗，不能仅改exit/passed文字。
- root真Worker/blank/fullrestart19/threeScopes42/native/1000frames/資源/最低Node各保limited scope，補R609/R610真正缺口。不同結果目錄或檔名每次新增，附方法／候選／環境與限制。
- 能背景跑的E2E保headless及獨立profile。原生popup/TaskManager真需可見時先簡短說明，成功失敗均finally清理自建context/server/profile，避免持續搶焦點；絕不操作日常Chrome資料。
- 為適當最小內容作具名小步commit，保已過部分；停止修改後回覆完整candidate HEAD、git status、逐R601–R614變更檔案與實測命令、pass/fail/skip和限制，交Codex獨立全量再驗收。你聲稱完成不等於驗收通過。

## 禁止事項

不得修改／刪掉原始需求、監工紅證據、測試或功能來過關；不得skip／改預期／放寬驗證／隱藏warning／只擬prompt不實作；不得覆蓋使用者無關修改；不得把CLI bool當實際無痕、reload當中途Worker回收、TAB當native popup、oldHead/resource當current、估計RAM當TaskManager；不虛報哪裡全部過。不得自行改模型／帳號／訂閱／費用／授權／日常browser；不得push/deploy/publish/store。任何方法限制先換可驗證方法、留具體錯誤，按授權持續可安全工作。
