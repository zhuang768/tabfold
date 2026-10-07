# 【第 3 輪修正】Tabfold — Antigravity 執行

候選 `034d3bf82349b52ea950348596d0e6b06454048c`；唯一 root `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`。Codex監工，Antigravity工程師。唯一原文 `docs/original-requirements.md`（仍與附件逐位元一致）。本輪是全面獨立驗收後的24組具體修正，不重派第2輪，也不擴大原文範圍。P0與全域必做；P1依原文範圍，已實作不可刪掉掩蓋問題；P2僅原選Hibernate與URL｜title。

原24個隔離反例已全部通過，35unit與4個正式E2E亦獨立通過（根使用僅改headless/channel及證據路徑的正式測試副本，斷言未改）。但新增針對剩餘疑點的16核心探針全失敗、14個可控UI流程3過11失敗；真Chrome亦確證空scope關2頁、壞raw status仍關原頁、第二次復原刪唯一救援raw、有效持久Undo在popup無入口。這些不是全專案通過率，不能只追求原24過。

## 問題清單、修正要求與逐項驗證

### R301［阻擋］空 scope 實際 runtime 入口仍擴成整視窗

- 檔案＋行號：`src/browser/library.ts:906–931`；`tests/unit/core.test.ts:703–719`只測直接saveTabs。
- 問題／影響：`scope:''`被當省略，defaultScope=window時關掉anchor與不相關draft兩頁。根真Chrome `browser-audit-results.json/runtime-empty-scope-still-closes-window`明確saved2/closed2。
- 修改／預期：真正省略與非法空值區分；任何非法值在任何mutation前拒絕。有效confirmToken續做其綁定操作，不靠UI當下scope猜目標。
- 驗證：真handleRequest/runtime、defaultScope=window＋空字串/錯型/未知scope都error、兩原頁留開、DB/backup/Undo不變；正常current/others/window不退化。

### R302［阻擋］現行 raw 被正規化後才讀回驗證，壞資料仍關頁

- 檔案＋行號：`src/browser/storage.ts:308–312,333–347`；`src/core/migrate.ts:53–61,69,106–109,136–189`。
- 問題／影響：status固定saved、source錯型/coerce、favicon等默補；根真set注入status=INVALID-READBACK仍saved1/closed1，raw保留錯值。
- 修改／預期：舊版遷移與現行嚴格解析分開；完整原始持久內容逐欄與預期一致才能關。現行DB、row、settings、stats、undo、source、schema都严格拒錯型/未知版本；不能normalize錯值掩蓋故障。
- 驗證：正式save路徑逐欄變造status/source/favicon/settings/stats/Undo、錯版本、缺必填皆留原頁，明確error且救援raw可匯出；原tags mismatch與正常合法存入仍過。

### R303［高］首次提醒布林繞過及關閉前新保護條件漏查

- 檔案＋行號：`src/browser/library.ts:217–221,320–338,540–553`。
- 問題／影響：新庫只傳confirmedUnsaved:true無token即可關草稿；等寫入時原頁變pinned或audible，fresh get只核URL，仍close1。
- 修改／預期：首次承諾必來自有效綁定原操作token；關閉前重核釘選、音訊、白名單、無痕與URL/視窗狀態，新增保護不關或重新確認。不要聲稱外部网站已能攻擊（沒有externally_connectable證據）。
- 驗證：`core-focused-proof.mjs`之UNSAVED-BOOL與PROTECTION/AUDIBLE-CHANGED情境，更新fresh tab的真fault/時序回歸；提示、取消、普通確認均完成原目標。

### R304［高］實際關閉結果、Undo與後續統計持久化不一致

- 檔案＋行號：`src/browser/library.ts:438–440,597–611,614–648,666–668`。
- 問題／影響：保窗create失敗save0却DBUndo有效，Undo重開未關頁；批次remove部分關後reject回closed0/Undo null；stats寫失敗靜默Saved1。
- 修改／預期：只對真已關項目提供Undo；保窗與關閉失敗正確清理；部分reject逐筆核對原tab存在與身份，誠實saved/closed/failed/Undo。已產生副作用後持久化錯誤須可復原並顯示警告，不吞錯假全成功。
- 驗證：KEEP-WINDOW-FAIL-UNDO、CLOSE-PARTIAL-ACCOUNTING、CLOSE-STATS-FAIL-SILENT；不得多開未關頁／讓已關頁失去復原入口；保存／關閉／匯入demo統計各有意義斷言。

### R305［阻擋］救援raw被下一次備份還原覆蓋、失敗恢復已覆蓋當前庫

- 檔案＋行號：`src/browser/storage.ts:260,264,350,428–430,458–463`。
- 問題／影響：首次salvage有原raw，第二次restore以好庫覆蓋它；根真Chrome firstExport=true/secondExport=false。snapshot readback mismatch throw時當前DB已變alteredbackup。
- 修改／預期：獨立可識別救援歷史與明確保留規則，正常復原不能刪唯一壞raw；恢復建成可持久回復的交易，失敗保住原庫、快照與救援，不以「已有salvage」代替無副作用錯誤。
- 驗證：連續兩次／新壞資料／復原壞快照／set/get/mismatch故障，當前庫與唯一救援逐欄核對；五正常快照輪替保留。

### R306［高］遷移覆蓋無備份／完整驗證，讀到的與實存不同

- 檔案＋行號：`src/browser/storage.ts:239–255,333–345`；`src/core/migrate.ts` v1 parser。
- 問題／影響：v1寫schema2時注入URL改動仍返回未實存舊URL，原legacyOnly raw已消失；v1 id唯一性與過期CAS讀亦缺。
- 修改／預期：保留遷移前原raw、鎖內重讀及內容版本檢查，完成嚴格合法化、完整raw讀回後才回成功；失敗不弄壞舊資料，id稳定唯一。勿稱Chrome storage提供原子CAS。
- 驗證：MIGRATION-BACKUP-AND-VERIFY＋schema0/1/2/未知新版本/duplicateid/缺時間與並行交錯；成功回傳等於actualraw，失敗原raw可救援。

### R307［高］runtime request／settings未在写入前驗證

- 檔案＋行號：`src/browser/library.ts:984–992,1237–1238`與各request分支。
- 問題／影響：restoreBatchSize=1e9＋未知key，雖回mismatch error，raw已寫入；會破壞大量還原保護。
- 修改／預期：集中實際runtime allowlist，驗keys/types/ranges（scope/tabIds/ids/mode/token/布林、patch、edit group/tags、文字等），拒絕在mutation之前；純TS現有工具即可，不為驗證增加無必要production依賴。
- 驗證：RUNTIME-ALLOWLIST及代表所有request錯型／未知值，error且原DB/backup不變；合法設定與文字匯入／編輯仍過。

### R308［高］Restore／Undo進度全RAM，寫失敗或Worker中断后重開

- 檔案＋行號：`src/browser/library.ts:754–817,842–860`。
- 問題／影響：create成功後persist失敗，再次restore/Undo同id開第二頁；長操作沒有可重建journal，生命期依赖Worker常駐。
- 修改／預期：最小可維護的持久操作識別／目標／逐筆結果與新tab關聯／中斷狀態，共用序列化入口。喚醒後先協調已發生結果，不能盲重開；未知結果保守標示待確認、不碰不相關頁。只有還原確證成功才移除，不用永久RAM锁替代持久狀態。
- 驗證：RESTORE/UNDO-RETRY-AFTER-PERSIST-FAIL、途中Worker停機、多視窗／設定retain／批次部分失败，精確每URL與tab數、剩餘庫及operation狀態；不重開／不丢失。

### R309［高］Library首次影音缺第二次確認，右鍵others仍丟結果

- 檔案＋行號：`src/ui/list.ts:351–396`；`src/browser/library.ts:1279–1282`。
- 問題／影響：library初次unsaved確認後直接showStatus/load，audio token無入口；右鍵others不存session不顯示確認/摘要/Undo。
- 修改／預期：所有入口共用完整結果流程，依有效token連續處理必要提醒，最後才成功提示；取消保留原頁與原目標，普通＋影音皆處理。
- 驗證：新profile真library選audio→通用提醒→影音提醒→保存/Undo及兩種Cancel；真快捷鍵／右鍵current與others入口，至少能看到完整確認與結果。

### R310［高］Popup Hibernate仍默選不相關背景頁

- 檔案＋行號：`src/ui/popup.ts:397–421`尤其412/417；`src/browser/library.ts:1095–1123`。
- 問題／影響：activeC時按Hibernate暗中discardA，没有使用者選A的動作。改find(!active)未完成原R209。
- 修改／預期：明確目標／標題／選擇，或精確綁目前頁並說明active不能休眠；不得默換頁。保留backend discarded讀回、pinned/audio/白名單保護。
- 驗證：ABC不同URL明選目標只discard該頁；無可用頁/保护/未discard回報/點回重新載入，以實際tab.discarded和頁內容驗證。

### R311［高］持久Undo入口、剩餘TTL／數量／部分失敗提示錯

- 檔案＋行號：`src/ui/popup.ts:35–44,269–301,382–394`；`src/ui/list.ts:44–53,306–312`。
- 問題／影響：DB.undo有效但session空，根真popup Undo buttons=0；library兩ids仍Saved1，剩100ms顯示12s；load覆蓋真正部分失敗訊息。
- 修改／預期：兩surface以持久權威Undo＋實際expiresAt重建，使用真數量、只显示剩餘時限，保存後reload不蓋錯誤／部分結果；移除過期入口與支持Worker/reopen。
- 驗證：持久Undo/空session/重開/Worker/TTL邊界/多筆/部分失敗，实际URL重開數精確，過期按鈕不假有效。

### R312［高］load故障仍操作舊資料、Promise/檔案拒绝不恢復

- 檔案＋行號：`popup.ts:225–266,382–393,429,473–477,493`；`list.ts:249–300,424–430,465–489,525`；`options.ts:35–38`；`shared.ts:35–36`。
- 問題／影響：popup讀fail後搜尋重畫舊row；library留oldtarget/rows；session/get/remove、openOptions、File.text拒绝逃出init/event，沒有retry或finally可重選。
- 修改／預期：ready/loading/error狀態與有界錯誤處理，清過期記憶體／targets、禁依庫mutation但留救援/設定/retry；成功load才啟用。所有異步入口catch可見英文錯誤、finally復原busy/input，不清真資料、不吞錯。
- 驗證：U304/U305全可控反例提升正式test，真runtime／File.text／session fault UI，error不再呈現oldrows或可操作oldid，恢復後可用；頁error/unhandledrejection零。

### R313［高］Settings保存中新草稿被舊成功蓋掉，舊timer藏新error

- 檔案＋行號：`src/ui/options.ts:15,90–96,145–187`。
- 問題／影響：first提交pending時編輯second，first成功resetdirty使second丟失；成功的1500ms timer隱藏稍後復原error。
- 修改／預期：提交版本／編輯版本分離，或busy時合理停編；成功只清已保存版本，保留新draft。status generation／取消舊timer，只隱藏所屬成功提示。
- 驗證：U306兩種controlled時序與真UI故障，exact first/second值与error可見；已過一般dirty背景刷新/寫fail提示仍过。

### R314［原文必做］固定可見字串尚未單一來源，scope文案不符

- 檔案＋行號：`options.ts:55,61`；`popup.html:6,14,34–42`；`list.html:6,14,37,44`；`options.html:6,13–14,48`；`public/manifest.json:2–3,8,35,42`；`scripts/build.ts:38–66`；`library.ts:225,276,304,328,348,350,1097–1106`；`strings.ts:147`。
- 問題／影響：HTML/manifest原样copy、固定error/template/aria散落；backupreason裸技術碼；defaultScope文字說library但library固定current。
- 修改／預期：唯一strings常數安全生成/填值HTML、manifest与固定message/aria/備份label；文案反映真surface。不翻譯不可信URL/title，不每處重複50MB公式。
- 驗證：扫描所有固定可見字符串来源＋build後HTML/manifest准确，英文、无语言切换、unsafe innerHTML；產品CTA/權限/命令文案無回歸。

### R315［高］長還原無busy／進度／防重送與完整可及操作

- 檔案＋行號：`popup.ts:150–172,443–471`；`list.ts:99–125,204–213,424–426`。
- 問題／影響：restore等待仍可重按，在retain模式重開更多頁；無loading/aria-busy/可重建進度，storage全重繪丟焦點。
- 修改／預期：最小共用operation busy/進度，對應R308journal，相關控制禁重送，finally復原；部分結果/Cancel誠實，鍵盤焦點可恢復、可見live feedback。
- 驗證：同按鈕連按、跨UI相同操作、retain/retry/大量分批、keyboard/Esc／故障，不多開、不卡busy；不只加spinner掩蓋資料層。

### R316［必做］正式unit未覆盖完整安全管線

- 檔案＋行號：`tests/unit/core.test.ts:540–543,561–917`，尤814–832只helper比較。
- 問題／影響：8新增案例有用，但漏完整raw/fault/close/Undo與新16+11失敗時序；demo原URLshape斷言仍被弱化。
- 修改／預期：將本輪core-focused-proof與UIcontrolled確證轉正式最小可維護契約test，驗實際來源頁與DB／提示／操作狀態；保留所有原有效35及前24語義，恢復demo有效URLshape。
- 驗證：每問題先在缺陷版红、修後相同期望綠；用精確多欄位／URL/資料結果，不是只個數、 helperfalse或永真斷言。

### R317［必做］四E2E多走API，七特殊／三scope／完整主UI仍缺

- 檔案＋行號：`tests/e2e/extension.spec.ts:126–251,389–526`，尤136–148/178–180/222–226/438–522。
- 問題／影響：ack先patch，save/Undo/restore API跳過實際入口；URL includes('/a')不足驗origin/path/content；special只有少數種類。
- 修改／預期：保留API契約，補真toolbar/popup/library主閉環、三scope、七特殊（internal/pinned/真audible/未存form/duplicates/incognito邊界/lasttab）、保護/原window順序/retain/groupbatch取消、backup/corrupt/migrate完整roundtrip、keyboard/reducedmotion。只用隔離profile/fixture。
- 驗證：各種逐項真操作、精確URL/title/content/window/source/DB/移除與保留；不能測的先換方法并保存真失敗證據，只標未驗，不偽稱過。不要擴大日常帳號或incognito權限。

### R318［必做］Worker正式test缺真stopped與中斷續接

- 檔案＋行號：`tests/e2e/extension.spec.ts:341–358,379–383`。
- 問題／影響：closeTarget+sleep/entries equality不是回收完成／長操作重建；restart只URLs漏全庫。
- 修改／預期：採根 `browser-focused.mjs` 已實際成功的ServiceWorker.enable/stopWorker version running→stopping→stopped→starting→running、舊global nonce清空、新實例與全raw equality方法。Playwright Worker會透明跨restart保留同handle，**不能強制要求closeevent或新targetId**。再驗R308中途save/restore/Undo。
- 驗證：idle根已確認stopped/nonce=null/rawsame，保留改善；正式案例驗fullDB与中斷精確每URL及操作結果，不能用同數量代替。

### R319［使用者明確要求］背景測試及失敗cleanup

- 檔案＋行號：`tests/e2e/extension.spec.ts:42–43,305–306,359,385,424,524–525`；`scripts/perf-measure.ts:19–20,164`。
- 問題／影響：全部headed反覆搶焦點；context/server只成功最後close，失敗會殘留。
- 修改／預期：可背景的採官方channel:'chromium' headless，必要原生popup／TaskManager/視覺才短暫headed並先说明；fixture/finally確保所有成功、fail、timeout都只關本次context/server。保留獨立暫存profile、不得動日常Chrome設定。
- 驗證：根headless正式4E2E已全過，保留斷言；刻意製造fail确认只關本次测试，不留下Chrome／server，不全域kill其他專案程序。

### R320［必做］真interactive效能／1000流暢／Worker資源／TaskManager缺證據

- 檔案＋行號：`scripts/perf-measure.ts:61–97,99–156`；`src/ui/popup.ts:367–396,490`；`docs/HANDS_ON_ONLY.md:6`。
- 問題／影響：btn有字在listeners/session/load前就成立，script p50=159.19/p95=1090.07ms不是可操作；無nativepopup、連續frame、WorkerCPUheap／工作管理員前後真量。根16項普通popup文檔真ready30样本40.43/76.84ms，1000library266.90ms/load、47.94ms/search、27.41ms真scroll，範圍不能誇為native或全擴充。
- 修改／預期：明確可測ready（資料/scope/handlers/loading/busy一致），合理量與1000、cold/warm、≥30順序样本p50/p95、精確搜尋/捲動completion与連續rAF/longtask；Chrome版本/硬體/範圍/CPU與heap含page/worker/idle，無猜測成因。原生TaskManager隔離負載前後先實際嘗試並保存證據及完整步驟，不能拿50MB估算代替；真受限則未驗證＋原因，勿假實測。
- 驗證：真的可操作且主流程完成才量ready，原樣本/分析可重跑；頁scope與全擴充數據明分，不因虛擬化未用就武斷fail，不在硬體不足時虛報目標。

### R321［必做］研究來源／容量實測／可靠性論述不成立

- 檔案＋行號：`docs/DESIGN.md:5–8`；`docs/RESEARCH.md:17–23,29–35`；`storage.ts:297–308`。
- 問題／影響：具名但無直接參考／評論／獎站社群來源；URL｜title表格破欄；1000=125KB＋5=625KB<1MB無artifact。根真Chrome `capacity-audit.json` 同fixture DB265770／五snapshot1329281／總1595051bytes，每snapshot1000；不是聲稱每種資料集必定此值。storage沒有原子CAS，先get/check/set的邊界要誠實。
- 修改／預期：研究 primary/具體source、評論與推論分清，記2–3差異點取捨；真資料集/bytes/讀寫performance与storage/IDB容量可靠性比較，正確寫同Workerqueue+revision+readback的保障／限制。勿改原文或引第三方服務。
- 驗證：每外部主張來源可追溯；量測脚本＋指令＋環境＋raw支持數字；設計借鏡不得複製素材。

### R322［必做］現行測試/限制/README/依賴文件與候選不一致

- 檔案＋行號：`docs/TEST_REPORT.md:3–19,34–52,61,65–73`；`requirements-checklist.md:49,55,80–85`；`KNOWN_LIMITATIONS.md:3,7,10–12`；`README.md:7,76`；`DEPENDENCIES.md:12,25`；`package.json:35–39`。
- 問題／影響：TEST_REPORT仍round1/27unit/3E2E與舊perffield，checklist卻全部已覆盖；無作用tinypool override說消critical、browser first-run installs錯；最低Node聲明未實跑。真可修bug不能包KnownLimitations交用戶。
- 修改／預期：現行文件按最終HEAD/命令/exit/斷言/新artifact/逐種特殊與缺口更新；保留歷史SUPERVISION/correction完全不覆寫。移除沒作用配置或誠實描述，用已支持最小Node實際驗證、browser install先明確命令；README/Privacy/store英文、研究/測試/限制繁中。
- 驗證：照README乾淨安裝可重現、完整license用途、沒有env需求就說明；每完成勾選都有相同HEAD真證據，不假稱所有24group只因35test過。

### R323［必做］CSS parser錯修了但正式工程gate仍漏

- 檔案＋行號：`scripts/build.ts:38–48`；`package.json:12,19`。
- 問題／影響：本輪4CSS parser0warning是改善，但build只copy，format不是語法gate，前次相同錯可再全綠漏過。
- 修改／預期：用已存在esbuild或現有工具驗全部CSS语法，零warnings納正式verify/build，非新production依賴。
- 驗證：合法CSS全過；故意invalid @media fixture清楚fail，再移除fixture；不把warning隱藏，保留動態与reducedmotion。

### R324［必做／未驗證］原生popup尺寸、大字體／鍵盤／圖示真驗

- 檔案＋行號：`src/ui/popup.css`（380×520、overflow）、`popup.ts:150–172,443–471`、`styles.css`；現有正式E2E未驗此範圍。
- 問題／影響：普通tab screenshot不是原生popup；onboarding/長status/200%字體/footer裁切與焦點／live回饋未證，8icon檔存在不代表light/dark各尺寸可辨。
- 修改／預期：在隔離原生popup/合理page尺寸實際操作，確認最重要CTA、列表、undo/dialog/batch/onboarding/錯誤、200%縮放、Tab/Enter/Esc、reducedmotion/light/dark圖示清楚，修實際缺陷保留minimalist既有視覺，不加新設計服務。
- 驗證：原生與document fallback分開附screenshots/尺寸/方法/實際觀察；工具不支援保存嘗試，只標未驗證，不冒充安裝/原生通過。

## 必須使用的適用 skill／工具

先列實際可用的適用skills／工具及用途，未用說明真原因；不為了用工具加依賴或虛稱MCP。

- `/Users/zhuangzijin/.agents/skills/diagnosing-bugs/SKILL.md`：確定性故障／時序復現、根因、修同一反例。
- `/Users/zhuangzijin/.agents/skills/ai-debt-detector/SKILL.md`：吞錯、假成功、重复UIflow、死配置、RAM依賴審查。
- `/Users/zhuangzijin/.codex/skills/security-best-practices/SKILL.md`：runtime/schema/CSP及不可信文字、權限最小化。
- `/Users/zhuangzijin/.codex/skills/playwright/SKILL.md`：隔離真extension、headless/必要native、fault與全量回歸。
- `/Users/zhuangzijin/.agents/skills/impeccable/SKILL.md`：harden/adapt/鍵盤/錯誤/真popup尺寸，保留產品風格。
- `/Users/zhuangzijin/.agents/skills/minimalist-ui/SKILL.md`：既有tokens/密度/可讀，非整站重做。
- npm-skill適用工具鏈/安裝/最低Node；TypeScript/esbuild/Vitest/Playwright/ChromeCDP優先現有工具，官方文件查證。部署、Cloudflare、Vercel、Figma雲端等無本輪必要，不新增服務／授權。

## 完成後實際驗證與交付

1. 先讀原文、`docs/SUPERVISION_ROUND_3.md`、本文件，及 `output/supervision/round-3/{core-review-report,ui-static-audit,docs-audit-findings}.md`、核心16与UI14反例、browser/focused/capacity JSON／腳本。根probe保留有工具假設錯誤的initial evidence，不把這些harness failure當產品缺陷；新的嘗試用新路徑。
2. 按最小安全修改、每項明确red→green；先修R301–R308保守資料層，再UI/正式tests/測量與文件。不能只改helper或另寫與production無關測試。
3. 實跑 `npm ci`、`npm run format:check`、`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、背景版 `npm run test:e2e`、正確版 `npm run test:perf`、`npm run pack`、`unzip -t tabfold-extension.zip`、`npm audit --json`；各exit0且warning明確處理／不隐藏、正式功能/故障斷言均过。相依最低支援Node真验证，zip內容對dist逐檔一致。
4. 16核心/14UI受控探針是可控替身，不是瀏覽器；24原回歸同樣保留。原腳本有測定bug的fixtures，功能修正必要欄位變化可用有理由的新驗證adapter，不改歷史assertion/log、不降低expectations。真Worker中途／scope／故障／reboot／1000/CPU/TaskManager另提供真證據。
5. 每R301–R324列修改、真命令／exit、count/pass/fail/skip、assertion、artifact與未驗證範圍。把現行正式文檔、兩份新監工文件納有意義小步commit；最後HEAD/gitstatus，停止修改等待Codex全專案獨立再驗。

## 禁止事項

不得改壞已通過queue序列化、URL尾斜線、唯一id/partialrestore基本case、保存後普通Undo、五快照、raw首次救援、lasttab保窗、first-popup綁定、減少動態/對比、本機隱私、engine/pack改善。不得刪功能／有效測試、skip、放寬斷言、改需求清單以過關、用KnownLimitations包可修bug、覆寫歷史原文／監工／失敗證據、假估值冒實測。不得改其他workspace、日常Chrome、帳號/模型/用量/付費/權限，不加不必要production服務依賴。不得push、部署、公開或上架；外部交付由Codex驗收準備好後依使用者最新具體同意處理。
