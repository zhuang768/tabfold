# 【第 5 輪修正】Tabfold — Antigravity IDE

日期2026-10-12；唯一root `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`，受驗候選 `3ad2802b8c1c6a42468d066924013089d99607e0`。原文唯一依據 `docs/original-requirements.md`；P2只既選Hibernate與URL|title匯入，不增加產品範圍。

先讀 `docs/SUPERVISION_ROUND_5.md`、本文件及 `output/supervision/round-5/{core-review-report,ui-review-report,evidence-review-report}.md`／原始結果。這是新的第5輪，不重派第4輪。根已停碼後獨立跑8gate全過、57unit/5E2E皆0fail0skip、原12core/10UI/真Chrome2原型反例全綠；仍83項26過28失敗29疑慮。新核心15反例全失敗、UI27斷言15過12失敗，是真正剩餘缺陷集，不是整專案比率。

## 問題清單、修正要求與預期

### R501［阻擋；真 Chrome URL 遺失］journal 的 about:blank 不是成功還原

- 檔案＋行號：`src/browser/library.ts:287–298,957–964,1054–1060`。
- 問題／影響：first restore已開頁但DB persist失敗；新頁導航about:blank且無pendingUrl，再retry回opened1/removed1，original URL既無開頁也無庫條目。根真Chrome `journal-about-blank-real-result.json` 已dataLost=true、0harnesserror。
- 修正／預期：核實精確URL/有效pendingUrl與所屬操作；unknown、blank或已導航不能當原URL成功。保守留資料或可觀察續接，不將使用者導航的頁強行改回，不只判tab存在。
- 同情境驗證：原受控C5-05與根真Chrome反例轉綠；原URL仍可救／真還原後才刪，無錯關無多開。

### R502［阻擋／高；真 Worker 已重現］RAM/session fallback與create後才record不符合持久重建

- 檔案＋行號：`library.ts:202–260,264–271,950–972,1052–1067`，`types.ts:62–69`；背景startup無操作續接。
- 問題／影響：R407改成inMemoryJournals，只讓同realm重試綠；create之前沒有intent。session拒絕＋postcreate DB拒絕後，根真CDP stopped=true/nonce=null，retry同URL實際2頁。模擬browser session清空、create已副作用但Promise未回亦重開。
- 修正／預期：先設計最小可持久操作模型（operation id、目標/原頁、階段、確定/未知結果及復原），副作用前intent先寫讀回；喚醒/重啟先協調，未知保守、不盲重開、不碰無關頁。不得把常駐RAM或best-effort session當correctness權威，亦不宣稱DB與Chrome API有共同原子交易。
- 同情境驗證：C5-01/02的fresh realm/session清空/create間斷及根 `worker-journal-recovery-real` 真CDP均綠；save/restore/Undo途中及same-profile restart逐URL數量、完整raw/操作狀態/進度。

### R503［高；已修原型入口的持久回歸］__proto__序列化又丟journal own key

- 檔案＋行號：`library.ts:252–258`。
- 問題／影響：plain={}的plain[k]=number對__proto__無own key。DB失敗後sessionOwnKeys=[]，fresh realm再開同URL。普通無故障原型兩例已過，要保留。
- 修正／預期：可靠操作狀態解析與序列化全程own-key安全，不能禁合法id或只修get入口。相同操作回收後只開一次；各原型名稱、正常id均正常。
- 驗證：C5-03及真回收/重啟，核實持久內容own keys/operation target，不只測同RAM。

### R504［高；跨入口重開］Restore與Undo沒有共同操作結果協調

- 檔案＋行號：`library.ts:199–200,950,1052`。
- 問題／影響：Restore已開、DB fail、改按Undo會create2。同surface guard無法處理跨surface/realm。
- 修正／預期：共用權威操作身分與結果，區分重試/新操作/retain；新入口先協調已發生的結果。保留合法新還原，不以永久禁同id代替。
- 驗證：C5-04、跨Popup/Library/Undo/retain、操作故障恢復與重啟，同URL精確數量。

### R505［高；P0 Undo］已關頁後持久寫全拒，Undo無法重建

- 檔案＋行號：`library.ts:560–575,785–834`。
- 問題／影響：兩次postclose寫都拒，第二次被吞；fresh realm後Undo expired/create0。URL仍saved可普通restore，勿誇成URL全丟，但必做Undo缺失。
- 修正／預期：與R502階段模型整合，實際關閉者可重建Undo，未關者不得重開；計時以實際可用期限/閉頁階段為準，不以寫前時間或固定UI12秒掩蓋慢操作。
- 驗證：C5-06、全部postclose拒絕/途中回收/長寫入，保留原R404未關頁不Undo及partial closed只開實關集合的通過。

### R506［阻擋；先寫後關］缺metadata／trim變造仍被parsed比較掩蓋

- 檔案＋行號：`storage.ts:341–346,366`；`core/migrate.ts:106,131,240–297,334–361,501–522`。
- 問題／影響：刪stats、settings數個必填與undo欄，parser補預設；或raw URL/id加空白後trim回預期，仍closed1，關頁時raw真的不一致。原錯型反例已改善不是同錯。
- 修正／預期：現行schema整庫/rows/settings/stats/revision/Undo完整必填、型別範圍及字串內容直接核對raw；legacy遷移另路徑。禁止用修補/normalize/trim後比較代替。
- 驗證：C5-07兩新反例及逐欄缺失/變造/非整數版本revision，source保留與error；正常current/過期Undo/legacy仍過。

### R507［阻擋；救援失敗丟唯一原庫］snapshot吞錯＋set/remove在rollback外

- 檔案＋行號：`storage.ts:487–499,512–536`。
- 問題／影響：set backup成功但corrupt-marker remove拒，原庫已被替換。更嚴重before-restore snapshot拒仍繼續，readback/rollback亦拒，所有DB/backups/salvage/corrupt皆無original URL。
- 修正／預期：預備救援必须先可靠寫讀回才覆庫；完整set/remove/read/parser/verify都在交易階段，rollback自身失敗也留可重建狀態/原raw且誠實報告，禁止空catch當可靠快照。
- 驗證：C5-08兩例及rollback自身故障／中途中斷；失敗exact原庫可救，成功fullraw一致；保留R405已修readbackthrow單錯。

### R508［高／阻擋；遷移並行/救援］鎖內仍持久鎖外result，覆蓋salvage歷史

- 檔案＋行號：`storage.ts:252–278,264–267,366–386,375–378`。
- 問題／影響：鎖內已看到相同v1新raw仍寫舊result；legacy遷移無條件覆蓋獨有先前salvage。普通兩壞raw restore累積已改善，保留。
- 修正／預期：持鎖重讀後重新判版/重算真正current、各遷移路徑一致；append預備救援並核對，失敗可復原，不虛稱CAS。
- 驗證：C5-09兩例、遷移/restore/並行交錯與各步fault，精確URL/history/raw一致。

### R509［高；遷移自毀］deterministic suffix與現有合法id碰撞

- 檔案＋行號：`core/migrate.ts:421–436`，`storage.ts:270–275`。
- 問題／影響：v1 same,same_v1dup_2,same變兩個same_v1dup_2，persist schema2後自身strict拒Duplicate entry id。
- 修正／預期：穩定且真的唯一，產生後迴圈檢查collision／safe namespace；持久前全schema驗證，保留三URL/原順序與原raw。
- 驗證：C5-10及多層suffix/已有suffix/重複id組，連續讀結果穩定current不自毀。

### R510［高；最後頁保窗］fresh移窗後仍只保anchorWindowId

- 檔案＋行號：`library.ts:333–334,421,668–698,742–744`。
- 問題／影響：写入期間目標從window1移到window2唯一頁，URL不變，closed1卻window2無replacement；此受控反例不是冒稱真窗已關。
- 修正／預期：close前核真正fresh window/範圍/保護條件，保守留頁或按fresh window保護最後頁，不擴大範圍或碰他頁。
- 驗證：C5-11及真Chrome延遲寫入時移窗，實際chrome.windows仍在、對應tab/placeholder可核；正常最後頁/三scope保留。

### R511［高；runtime契約未全］部分驗證在read/migrate/backup後、batch仍小數

- 檔案＋行號：`library.ts:1139–1180,1332–1337,1402–1424`與request各分支。
- 問題／影響：save tabId在讀/migrate後檢查；錯型text可先輪轉backup才拋錯；batch接受小數使分批語義不明。靜態確證，不納入15實測計數，不聲稱外站可攻擊extension。
- 修正／預期：相關request runtime keys/types/integer ranges先驗再任何mutation，非法保留fullDB/backups/tabs，合法API相容。沿用既有TS/工具，不加無必要production dependency。
- 驗證：明確錯型/小數/未知keys代表入口紅綠，original內容與backup不變，合法batch/設定/import仍過。

### R512［高；4個UI反例］權威Undo期限與已用盡控制不同步

- 檔案＋行號：`popup.ts:23–71,334–363,399–400`；`list.ts:32–83,358–387,476–481`。
- 問題／影響：DB剩100ms，fresh結果UI排12000；101ms仍可按。成功Undo後DB.undo=null仍button1。
- 修正／預期：每load/結果独立同步權威ids/expiresAt，更新/取消timer/移除失效；摘要error/partial保留，explicit ids不自延長期限。
- 驗證：U501相同4斷言、慢保存/session重播/跨surface取消；本輪partialUndo剩ids與真剩100ms已過，不重派其為同錯。

### R513［高；3個UI反例］Popup/Options旧load可覆蓋較新failure

- 檔案＋行號：`popup.ts:257–303,320–363`；`options.ts:31–45,86–105,173–193,253–254`。
- 問題／影響：new failure後old success恢復rows/isLoaded，Options真送過期patch。
- 修正／預期：與Library已修generation/ready契約一致，只接受当前請求；error保救援retry、舊回應不能再開Save，保dirty form。
- 驗證：U502三斷言與success/corrupt逆序/storage重疊；Library generation既過不破壞。

### R514［高；3個UI反例］單筆Restore無busy/live，Popup忽略click卻假動畫

- 檔案＋行號：`popup.ts:173–207,521–557`；`list.ts:118–152,235–242,502–510`。
- 問題／影響：真正request pending兩surface disabled=false/aria-busy空/status hidden；Popup第二row被guard忽略卻restoring。
- 修正／預期：接受操作後才動畫、共同真busy/live進度與相關controls/finally，可靠操作狀態可跨surface/realm重建；鍵盤focus有合理回復，不假spinner/假數字。
- 驗證：U503三斷言、延遲/失敗/部分/retain/batch/跨surface、真keyboard焦點。保留同surfaceguard與Library已修先guard/finally。

### R515［高；2個UI反例］session拒絕與Open full list錯誤仍無可見提示

- 檔案＋行號：`popup.ts:477–480,492–508`；`library.ts:1631–1651`結果helper。
- 問題／影響：session get被吞；真送open-library回error也不看，status空。current/others共用派送已修，不再說完全丟result；普通/部分contextmenu即时feedback仍需真入口驗。
- 修正／預期：bounded可見英文warning/error/恢復，保正常control/Undo；不因通知fault重送資料mutation。普通及部分菜单結果有可見入口、原scope/token續接。
- 驗證：U504、session get/set/remove/tabs.create拒與成功retry，無unhandled；真current/others右鍵、取消/成功/部分/Undo，不以API替入口。

### R516［原文明確必做］固定可見後端錯誤未全集中

- 檔案＋行號：`library.ts:330,1134,1162–1180,1213,1269–1341,1465–1468,1535–1537`；`storage.ts:471,506–509,532`。
- 問題／影響：本專案Invalid.../Backup...等固定e.message經res.error顯示，但散在後端。
- 修正／預期：固定英文及參數化template入STRINGS，debugdetail可另欄；不翻使用者title/url、不引語言切換。保HTML/manifest/build已修單一來源。
- 驗證：來源/build/真正error通路對照strings，text安全/CSP/本機favicon保持。

### R517［正式回歸可靠性］Options測試永真，timer/remove模型不能驗期限

- 檔案＋行號：`tests/unit/ui.test.ts:71–74,137–142,167–171,343–355`；`core.test.ts:1568–1613`。
- 問題／影響：Options未init無clicklistener也能no-patch綠；timer立即執行、remove空，不證Undo期限；R407仍同realm且created<=1可0成功綠。
- 修正／預期：真啟init/deferred pending已entered/handler存在再click，解除pending可合法patch；真可前進clock/移除/取消timer；fresh realm/精確成功及fullraw加入。本輪15core及27UI原語義正式化。
- 驗證：測試先紅才綠、沒有listener/移掉guard仍必紅；保57既有assert與原12/10/舊40core14UI，不刪skip/放寬。數字只能報actual，不宣57全部無效。

### R518［必做特殊分頁］音訊case隱性else跳過，無痕未正式真驗

- 檔案＋行號：`tests/e2e/extension.spec.ts:83–92,660–713`；`TEST_REPORT.md:76–84`；checklist49。
- 問題／影響：未assert真audible，if(needsAudioAck)才驗，else直接remove仍綠；backup被当第七种不能代無痕。
- 修正／預期：真正可驗發聲fixture/權威tabs.audible=true後確認、錯token/取消不關、有效綁audio才close；無痕按現權限真測且解釋。失敗保留／換fixture，仍未成標未驗，不靜默略分支說七項全過。
- 驗證：七特殊逐項可識別raw/UI/來源/精確數，不讓被測behavior不出現就整測綠。

### R519［完整正式閉環］三scope/內容/全DB/批次等仍欠

- 檔案＋行號：`extension.spec.ts:174–177,191,227,259,818–958`；`core.test.ts:326–348`。
- 問題／影響：主還原URL只includes、未核content；scope只window；新prototype兩ID都Restore，沒有Undo。JSON/settings/fullbackup/retain/groupbatchcancel範圍仍缺，根原型兩mode補證不等正式suite已含。
- 修正／預期：保5E2E，增精確origin/path/title/content/fullraw/設定/entries/移除與保留、三scope、首次UI確認、groupbatch取消與成功、備份/毀損/legacy匯入閉環；原型Restore及Undo分測。不增加新P2。
- 驗證：真載入ownprofile/localfixtures/public入口，不以API跳過UI冒稱入口；真正0skip/errors/trackers，異常亦不丟資料。

### R520［必做真途中回收與完整重啟］idle證據不能取代副作用途中

- 檔案＋行號：`extension.spec.ts:371–456,462–488`，R502操作階段。
- 問題／影響：idle true停止/nonce/fullraw已過要保留，restart僅count/URL，途中save/restore/Undo仍缺。
- 修正／預期：每危險副作用前後可控停點，真stopped/nonce、喚醒協調、同profile restart全DB/操作/actualURL。非只pageclose/handle重取；debugger影響naturalidle需另分。
- 驗證：根本輪真Worker及blank反例、create→record中間、save閉後持久故障、跨入口与重啟均有正式且完整不重開不遺失結果。

### R521［文件確證不符］效能數字與artifact再次不一致

- 檔案＋行號：`TEST_REPORT.md:17,90–101`；`KNOWN_LIMITATIONS.md:9–10`；checklist81；`perf-measure.ts:161–176`。
- 問題／影響：寫139.44/186.78雙達標，工程師最新raw214.62/307.58且23/30>200；search/scroll/heap也舊值，程式猜process spawn因果未驗。
- 修正／預期：同candidate/方法/負載/日期/raw全30逐项一致，保慢run，推論標假設或刪；1000普通tab不能直接判合理量native必fail/達標。
- 驗證：源文件逐數核raw；根新ordinary1000 p50=146.36/p95=202與工程師run不同，不能選漂亮值作通過證明。

### R522［原文資源/UI門檻］原生/CPU及限制方法需真正完成

- 檔案＋行號：`HANDS_ON_ONLY.md:3,6`；`KNOWN_LIMITATIONS.md:5,8,10`；`TEST_REPORT.md:91,100–101`；`perf-measure.ts:73–90,175–176`。
- 問題／影響：一概說native/TaskManager不能讀與本輪實證矛盾；startup/loadCPU/longidle、完整主題icons/錯誤UI鍵盤/可靠200ms方法尚缺。只有兩rAF終點不是流暢，根已實測1000連續frames，保留。
- 修正／預期：引用根本輪已真測native action/POPUP/font×2可Tabwheel達/reducedmotion/TaskManager真前後及環境；补可靠startup/load page&Worker CPU/heap/idle/coldwarm/合理量popup-ready。root profiler/原生工具已可用，具體unsupported保存實際error，勿虛稱全不可。Playwright新host/native方法附raw與開銷界線；不把上限方法直接當产品200ms判定。
- 驗證：根native timing v1/v2失敗保留，v3/v4各30真POPUP但含API/lifecycle/CDP overhead；需進一步合理方法。1000真133frames p95≈16.7ms/max16.8/longtask0已觀察，不再說未測或為FPS新設門檻；TaskManager sharedPID不重加，CPU0.0非絕對0，source96.5MB工作消失不等精確總RAM節省。只有必要短暫headed、先說明、成功失敗均清自己context/profile，不碰日常Chrome。

### R523［研究/設計必做］具名不是可追溯評論／設計獎社群案例

- 檔案＋行號：`RESEARCH.md:19–23,29–35`；`DESIGN.md:5–8`。
- 問題／影響：仍欠原文要求的具體來源／真評論（資料遺失/卡頓/權限）及獎站/社群案例；歷史容量未完整候選綁定。
- 修正／預期：primary直接連結、review permalink/日期/合規短引或摘要、分清推論；設計案例與學到手法可追溯，不複製素材/程式。保既定視覺，勿重新設計全產品。
- 驗證：原文研究各項有真查證來源；容量/readwrite方法、fixture/日期/candidate/raw界線，不用容量小證安全。

### R524［文件／交付完整］minimum Node與錯完成/pack/privacy描述

- 檔案＋行號：`TEST_REPORT.md:3–4,10,14,21,59,71`；`KNOWN_LIMITATIONS.md:3,7`；checklist49/81/83–85；README7/63–76；package35–36；PRIVACY本機儲存描述。
- 問題／影響：57 suite但章標41、全部R401420/七特殊未支持；Node20.19/22.13門檻未真跑；pack實際root/dist zip非自動/tmp；saved持久local和operation session/RAM未說清。
- 修正／預期：同最後candidate真實pass/fail/unverified/命令/數量/警告/artifact；最低Node實跑或誠實測過範圍，不放寬gate；正確乾淨README與platform界線。英文產品README/privacy/store、指定繁中研究設計決策測報/限制；env無需求已明示，不造雲端。
- 驗證：照README可重現、dist/ZIP20runtime逐bytes/圖示CSPpermissions、全部來源/機密與ignore掃描準備、小步commit；GitHub/外部push/部署/上架仍禁止本輪自行操作。

## 必須使用的 skill／工具

開工盤點工程師實際可用skill/MCP/CLI，說明適用用途/未用原因，不捏造使用。適用diagnosing-bugs（精確故障紅綠）、ai-debt-detector（RAM/吞錯/假成功/競態）、tdd/現有Vitest與Playwright（真時間/可控停點/完整raw）、code-review與既有UI audit/可及性/性能/文檔工具。已證有能力的root native/CDP/TaskManager方法可引用或改善；MCP error可用已有CLI/函式庫，不改帳號/模型/訂閱/費用/授權。無關cloud/deploy/Figma/imagegen不新增依賴服務，保既有美術。

## 完成後驗證方式

唯一root下，先將本輪probe複製/參數化到**新的verify結果路徑**，保期望僅必要metadata/expectedHEAD/adapter相容調整；禁止原指令覆寫22份鎖定證據。實際跑：

```sh
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
TSX_DISABLE_CACHE=1 node --import tsx output/supervision/round-5/core-extra-verify-r5.mjs
node output/supervision/round-5/ui-boundary-verify-r5.mjs
node --import tsx output/supervision/round-5/worker-journal-real-verify-r5.mjs
node --import tsx output/supervision/round-5/journal-blank-real-verify-r5.mjs
npm run test:e2e
npm run test:perf
npm run pack
unzip -t tabfold-extension.zip
npm audit
```

上列四份新verify檔由工程師先建立原probe副本，僅改輸出/metadata及必要adapter；回報列實際可跑命令與結果。本輪15core/27UI同安全期望應綠（27中已15過也保留），root真Chrome兩新故障應綠/0harness；原12/10/兩原型與前輪40core14UI及57正式assert全保。完整真閉環/native/資源必要門檻與原83核定，不是只同probe綠。每次attempt新路徑、記candidate/worktree狀態/版本/方法與限制，不改歷史結果。

完成R501–R524全部可執行工作後，明確小步commit、保留本輪兩份監工docs，回報每項修法/actual counts/fail/skip/warnings/HEAD/artifact/真正未驗限制，**停止修改供Codex獨立全面驗收**。

## 禁止事項

不得破壞已過功能/使用者修改、刪功能或測試、skip/弱斷言/隱藏警告、假數字/假完成/把模型或ordinarytab冒native。不得以「known limitation」遮可修P0安全缺陷、用RAM或禁合法id過關；不overwrite本輪red/evidence-lock或舊歷史。只動唯一專案，不碰其他專案/日常Chrome/data/account/model/付費/權限；不自行push/deploy/publish/store。Codex監工，Antigravity工程師，不回Cursor。
