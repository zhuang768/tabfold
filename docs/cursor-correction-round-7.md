# 【第 7 輪修正】

工程師：Antigravity IDE。唯一專案 `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`，受驗候選 `847f373916fb69a2ffc20d871832f3f5b60cd890`。上一輪已停止，Codex實際完成新版全面審查及獨立驗證；工程 gate 全綠不代表下列新反例通過。這是第7輪，不重開第6輪。

唯一規格仍 `docs/original-requirements.md`，原文 SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`。P0及全域門檻必做；P1按原文盡量且誠實列缺項；P2只既選Hibernate和URL|title。沒有新增雲端、同步、CI、全部P2或無條件exact-once要求。

先讀 `docs/SUPERVISION_ROUND_7.md` 與本輪 `output/supervision/round-7/{core-review-report,ui-review-report,ui-real-review-report,evidence-review-report,functional-ui-browser-other-review}.md`，對照全部83項。不要將未驗證限制直接當成已確認產品bug，也不能將其宣告通過。

## 問題清單、具體修法與預期

### R701 — 備份準備未讀回，清除／回復可失去唯一持久副本

- 檔案行號：`src/browser/storage.ts:486–498,523–540,568–578`；`src/browser/library.ts:84–104`。
- 問題／影響：單一 `tabfold_backups` acknowledged-but-dropped write，public clear仍成功且所有local已無原URL；另救援兩次drop、主庫替換後get拒絕、rollback拒絕，restore-backup雖回error仍失原URL。受控及真正Chrome均已重現；不是推論正常Chrome經常丟寫入。
- 修法／預期：破壞性clear/import/restore前，持久保存且完整讀回驗證至少一份可恢復舊raw的副本、identity及舊salvage；缺失／不一致／讀取未知就中止破壞步驟。rollback只是額外保護，不能作唯一副本。不覆掉其他救援紀錄。故障後唯一URL／完整原raw仍能讀回、錯誤可見，正常clear/backup/import不退化。
- 驗證：`core-backup-test-quality-results-attempt-1.json` 第一案、`core-current-new-results-attempt-1.json` 第四案及 `core-real-browser-results-attempt-1.json` 後兩案；補正式回歸，注入確實命中，獨立未打補丁extension page查全部local值，而非只看APIok。

### R702 — 最新Save B的Undo被舊DB.undo A壓過

- 檔案行號：`src/browser/library.ts:983–1019,1292–1321,1417–1438`；`src/ui/shared.ts:119–155`；`src/ui/popup.ts:354–371`；`src/ui/list.ts:383–400`。
- 問題／影響：A成功；B真正關頁後DB-set拒絕、durable B成功，fresh Worker Undo卻開A並消耗B；UI也選A期限，A到期便隱藏仍有效B。BURL留庫，不能稱URL遺失。
- 修法／預期：前後端共用經驗證的最新操作權威，操作identity／順序／完成關閉集合／原expiresAt一致；不以DB.undo非空提前return，不消耗無關较新操作，不因重開延長TTL。所有原partial／expired／consumed／重試維持。
- 驗證：真Chrome A/B故障與fresh Worker第一案、受控兩次Save specimen及 `ui-latest-save-authority-attempt-1-results.json`；正式API與兩surface能實點最新Undo、B剩餘期限正確。

### R703 — Save已關來源但尚未續寫時，Worker回收後Undo不可重建

- 檔案行號：`src/browser/library.ts:721–730,953–1003`；`src/types.ts:56–76`。
- 問題／影響：真正Chrome remove副作用完成、Promise continuation尚未續行，CDP確實停止Worker且fresh nonce清空；URL已在raw但Undo回expired、沒有恢復頁。Restore與Undo同停點各10/10已過，必須保留。
- 修法／預期：關閉前寫且驗證可重建的Save操作identity、來源tab/URL與原時間／待確認集合；重建查證是否仍開／是否實際已關，保留URL與正確恢復入口。unknown不盲關／盲重送，仍開來源不得誤當已關。不能要求跨Chrome API和DB不可能的原子性，也不能把一般Restore當剛關Undo已完成。
- 驗證：`worker-mid-effect-method-v1-result.json` Save9斷言及原Restore/Undo20；正式加入副作用後、產品continuation前真Worker stop/新realm/原raw/精確URL與開頁數的測試，含永久storage不可用安全拒絕。

### R704 — 普通Restore採用無關同URL頁，opened與統計虛增

- 檔案行號：`src/browser/library.ts:1170–1190,1210–1218,1241–1248`；Undo類似區`1362–1384`須防同型退化。
- 問題／影響：沒有intent/journal的普通Restore對另一視窗同URL頁create0，卻opened1/removed1/stat+1；真Chrome保留還原後再次按Restore也tab數4→4/newTabs空/totalRestored1→2。後者已確認local/session無journal，同一根因，不增加虛構問題。
- 修法／預期：只對有足夠操作identity／已驗證pending或journal的已發生副作用採用既有頁；一般按還原依原契約新開，數字按真副作用。既有中斷重送不重複及空白回復仍保留。不能擅改產品為全面reuse來過關。
- 驗證：core新第二案與 `functional-ui-browser-other-attempt5-result.json` repeat-retain；普通／跨視窗／保留再還原／已確認pending retry分開驗證。

### R705 — Reset後舊Save回呼又寫session並開Popup

- 檔案行號：`src/browser/library.ts:1611–1641,1933–1941`；contextmenu `2020–2025`有同型靜態風險；`PRIVACY.md:25–28`。
- 問題／影響：實際exported onActionClicked完成Save後，hold lastSaveResult session.set；public reset真正完成且local/session={}；release舊回呼又寫lastSaveResult/lastSaveAt並openPopup。受控原碼5斷言3過2失敗，非原生事件、非庫URL復活。原真reset/token撤銷已修且通過，不能重派舊鍵遺漏問題。
- 修法／預期：讓結果發布／Reset有一致可序列化界線及失效操作識別；檢查必覆蓋飛行中的set與popup continuation，僅在await前加RAM boolean不足。舊operation不能重建宣告已清狀態或再開舊結果。保持正常工具列／快捷鍵／contextmenu可用，文件精確交代journal/Undo/cache清理和期限。
- 驗證：`reset-inflight-callback-attempt1-results.json` 同停點＋重設拒絕／重試／新操作控制；補正式回歸，工具列與contextmenu路徑各核對，不冒稱已跑native事件。

### R706 — 新auxiliary await之後缺load generation檢查

- 檔案行號：`src/ui/popup.ts:289,354–400`；`src/ui/list.ts:356,383–431`；`src/ui/shared.ts:130–140`。
- 問題／影響：較早空aux結果返回移除較新Undo，或新get-state失敗後舊aux成功插回Undo。受控4失敗與真正Chrome4失敗都重現。
- 修法／預期：每次load用私有snapshot算authority；每個await後核對generation、DBidentity與最新ready，過期不得改按鈕／timer／target。不能只保持錯誤文字但仍插入舊控制。
- 驗證：`ui-async-authority-attempt-1-results.json` 原12與 `ui-real-review-report.md` 新4；兩surface成功／錯誤／corrupt／storage交疊，正式回歸。

### R707 — 無關操作錯誤移除durable-only Undo

- 檔案行號：`src/ui/popup.ts:25–68,515–519`；`src/ui/list.ts:33–77,555–563`。
- 問題／影響：DB.undo空但真durable有效，Open full list或Settings的error顯示後Undo變0；非Undo操作不應消耗仍有效的Undo。
- 修法／預期：摘要與經驗證effectiveUndo協調，採相同最新load的authority／ids／原expiresAt；不因摘要換掉取消timer，也不補新12秒。錯誤仍可見，Undo仍能點。
- 驗證：`ui-authority-state-attempt-2-results.json` 兩surface無關success/error＋partial/expiry/consumed。

### R708 — Options Loading被警告替換，完成後仍busy

- 檔案行號：`src/ui/options.ts:34–54,191–194`。
- 問題／影響：初始get-state未返按Save，guard正確0patch，但警告換文字後cleanup文字比較失敗，成功讀回仍aria-busy=true。
- 修法／預期：以明確load token/generation管理busy，不以摘要文字當token；保留讀取中warning與dirty form，最新讀取結束清busy。
- 驗證：同一deferred實際init的3個斷言、成功/失敗/corrupt/逆序控制正式化。

### R709 — 固定可見字串尚未全部集中

- 檔案行號：`src/browser/library.ts:491,1043,1062,1268,1499–1522`；`src/browser/storage.ts:376,395`；`src/strings.ts`相關未用常數。
- 問題／影響：實際Save回傳stats warning等仍由literal拼接，scope/tabIds/audiovalidation通路未引用現有常數；原文明確集中所有可見字串。
- 修法／預期：固定文案實際通路使用STRINGS常數或參數化template，維持英文與相同errorcontract。第三方exception detail與使用者title/URL不硬編入constants。不能只新增未引用常數宣告完成。
- 驗證：靜態callsite查核＋真Save部分失敗與validation/error介面文字，既有strings構建測試保持。

### R710 — 正式schema回歸未命中注入，新增故障與流程仍欠正式覆蓋

- 檔案行號：`tests/unit/core.test.ts:1872–1914`；`tests/unit/ui.test.ts:514–582`；`tests/e2e/extension.spec.ts:335–577,767–776,855–872`。
- 問題／影響：R603新fixture首次提醒先擋，databaseSets0、needsUnsavedAcktrue，測試仍綠；現版產品schema防護真正已修，這是測試到達性缺口。原72unit/5E2E真的全過且舊expect保留，不稱全無效；但5E2E未增加本次競態、全raw重啟、副作用途中Worker、正式三scope/完整確認取消/批次取消/backup fault等先前交辦的回歸。
- 修法／預期：有效readyfixture、assert注入真的命中及實際reply/no-close/raw；將R701–R708精確失敗與必要安全流程補入正常測試命令，避免重複鏡像implementation或只跑output自測。新測試先在847建立紅色證據，再最小修正。
- 驗證：完整正式suite無skip/todo/放寬；保留原每個expect、真正audio audible控制、CDP stopped/nonce/raw與原型id。JSON完整比較使用deep equality，object key排列非產品要求；array順序/欄值不刪。

### R711 — npm最低版本推薦無法乾淨安裝

- 檔案行號：`README.md:7`；`docs/TEST_REPORT.md:90`；`docs/DEPENDENCIES.md:26`；`package.json`engines與lock。
- 問題／影響：新Git archive Node22.13/npm10.9.2 ci exit1 Missing esbuild0.28.2；npm11.16於Node20.19及22.13 ci/verify72均exit0。README仍推薦10.9.2；eslint deprecated是直接devDependency，不全是transitive。
- 修法／預期：以本輪乾淨結果定精確支援與可執行安裝指令；最低npm未跑者不可泛稱已支援。若修lock須不同乾淨副本重跑並保留失敗；不能靠既有node_modules。承認install advisory/deprecated與runtime/lint警告不同，不自行approve scripts或變全域設定。
- 驗證：`minimum-node-verification-attempt2/results.json`與`minimum-node20-verification/results.json`原方法，新結果目錄；推薦環境clean ci+verify真的成功。

### R712 — 文件效能數字、候選與量測口徑錯配

- 檔案行號：`docs/TEST_REPORT.md:17,114–129`；`docs/KNOWN_LIMITATIONS.md:3,5,7–11`；`docs/requirements-checklist.md:81,83`；`docs/HANDS_ON_ONLY.md:3,6`；`scripts/perf-measure.ts:109–140`。
- 問題／影響：工程師raw187.27/350.97、11/30>200，文件仍139.44/186.78及舊search/heap；ordinaryTAB冒稱native互動/概括工具不能原生操作；歷史TaskManager/133幀冒充当前候選完全證明。Known打包tmp敘述不符實際pack。原文200ms是合理量目標，沒有擅加所有cold樣本硬門檻。
- 修法／預期：每份raw固定HEAD/時間/環境/樣本/成功失敗方法及清理；ordinaryTAB、真POPUP、firstpaint、第一個可操作、API與OSclick時鐘分開；量不到就未驗證。同步文件/限制/checklist，禁止改數字壓線／隱警告。當前root新1000perf有134rAF、0longtask但1個165.5ms long-animation-frame，不能說已確證完全無jank60FPS。Worker profiler比例非OSCPU；自然idle40s真stopped證据可按範圍引用。
- 驗證：新raw逐項核對；普通頁30sample不替代native200ms；可見UI/連續wheel測真counter/result。不得重用root舊HEAD TaskManager當新版。

### R713 — 研究／設計少數精確歸因缺證據

- 檔案行號：`docs/RESEARCH.md:19–20,28–30,42`；`docs/DESIGN.md:7–9`；來源分类表。
- 問題／影響：BuenJ頁只顯2monthsago卻寫約2024年中；URL|title普遍OneTab相容缺真格式fixture或可核對來源；Raycast2px/#1F6C9F等品牌首頁不足支持精確設計值。已有三本人來源、Things3官方獎項和GoTo作品確實改善，不能撤掉或重派不存在問題。
- 修法／預期：保留真permalink，日期無法取就記頁面相對時間＋accessdate；競品格式用官方說明／真輸出fixture或可信本人來源核對。Tabfold自選tokens明示自身決策、樣本推論不當統計，secondary新聞不標primary。
- 驗證：實際開來源、附小量必要原文或具體位置；不捏造quotes/作者/日期/測量。

### R714 — 剩餘完整验證與交付聲明必須誠實

- 檔案行號：`docs/requirements-checklist.md:81–83`；`docs/KNOWN_LIMITATIONS.md:3–11`；`docs/HANDS_ON_ONLY.md`；相關UI/test腳本。
- 不是把所有疑慮當bug：本輪root Hibernate三種方法在native discard後ChromeSIGSEGV、0斷言，未證產品錯也未證可用；原生TaskManager操作未完成且沒有Save action，不可把savedAndClosedfalse算產品fail。允許無痕未改權限未驗證；真正原生200ms／OSCPU-RAM/全鍵盤链/zoom/對比仍需有效方法。
- 要求／預期：用安全不同可驗方法補上述原規格證據；只有隔離合成profile，不能碰日常Chrome、帳號、設定或自行擴權。能headless就背景跑，真正需要原生視窗先短說明，成功失敗finally關context。保留三次Chrome失敗，不靠skip/換preview/估計值過關。做不到如實列方法/限制/唯一必要外部動作，不虛構全可修已完成。
- 核定已過：true denied-incognito13、fullprofile rawrestart19、三scope42、正常functional24、Restore/Undo中途各10與schema1.5 positive5、原型2和既有UI10、nativePOPUP尺寸/減少動態實測；保留相同功能與獨立斷言。

## 必須使用的適用skill／工具

開工先列本環境真正可讀skill清單與用途、實際使用/沒用理由，不能聲稱全讀却沒有讀。適用：diagnosing-bugs（故障訊號與縮小）、tdd（新反例紅綠）、ai-debt-detector（權威與異步／假測試）、security-best-practices（權限／本機救援）、playwright（真MV3/隔離profile/清理）、npm-skill（lock與支援環境）、code-review（Standards/Spec分開）、impeccable/minimalist-ui（既有原生密度／可及性／狀態）。按可用性讀SKILL.md并紀錄；不為skill加新production依賴、雲端、Figma登入或生成模板。現成Vitest/esbuild/Playwright/Chrome官方API優先；MCP error不自行改授權/模型，可用本機CLI／函式庫繼續。

## 完成後驗證與交付

1. 同一新候選完整跑 `npm run format:check`、`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`npm run test:e2e`、`npm run test:perf`、`npm run pack`、`npm audit`。0錯誤，實際passed/failed/skip/warnings逐項記，單元不少於原72且保留有意義舊測，E2E不得退化。zip全部runtime20檔與當候選dist逐byte一致，sourcemap排除要說明。
2. 所有本輪／歷史probe先複製到 `output/engineer/round-7/<attempt>/`，更新自己的output與candidate metadata再跑，原語意斷言保留。不能直接跑硬編原結果路徑的runner而覆寫監工JSON；結果與log新路徑、原失敗永久保留。0harness只在真的無方法錯誤時宣告。
3. 本輪14項逐項對照實際證據、正式回歸、未驗證限制，更新英文README/Privacy/store及繁中研究/設計/決策/測試/限制。新功能不越原文；不要把委派要求當已做。
4. 保留納入兩份R7監工文件，不修改其原候選觀察／原失敗數字。建立有意義commit，給HEAD及git status，完整總報告後停止產品修改，交Codex独立再驗收。未取得具體必要同意不得GitHub推送/發布/上架。

## 禁止事項

不得改壞已通過部分／使用者修改，不得刪功能或測試、skip、放寬斷言、隱藏警告過關；不得偽造數據/權威specimen，誤把替身當真正Chrome、普通tab當nativepopup、paint當firstinteractive或舊候選當新版。不得覆寫任何 `output/supervision/round-{1..7}` 原證據及protected-evidence/hash lock，不修改lock來掩蓋覆寫。原始需求不可改。不要自行更改模型／訂閱／帳號／權限／付費，勿使用日常Chrome資料。工程師完成聲明不是監工验收通過。
