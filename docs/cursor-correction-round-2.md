# 【第 2 輪修正】

Cursor 是執行工程師，Codex 是監工。第 1 輪修正候選 `5ce362c` 已停止，Codex 已重新完整讀碼、對照原文、安裝、執行全部既有 gate，並用隔離 Chromium／本機 fixtures 獨立驗收。**仍未通過；不是再派第 1 輪。**

唯一根目錄 `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`。唯一需求 `docs/original-requirements.md` 不得修改。先完整讀本文件、`docs/SUPERVISION_ROUND_2.md`、三份蒐證報告：`output/supervision/round-2/{core-review-report,ui-static-audit,docs-audit-findings}.md`。歷史第 1 輪文件保留，不覆寫。

8 項工程檢查通過：format、types、lint、27 unit、build、3 現有 E2E、pack、audit 0。**獨立核心 24 個隔離斷言只有 8 通過、16 失敗**。真瀏覽器亦證實錯範圍關頁、提醒繞過、混合影音漏頁、raw 救援消失。先修資料安全，再補其他門檻，不要用這些 gate 的 exit 0 宣稱全部完成。

## 問題清單與具體修正要求

所有行號依 `5ce362c`。R201–R220 為本輪 20 組問題／證據缺口；每組都須回報實際結果，不只填「修」。

### R201 — 阻擋：延遲抵達的外部請求穿透可重入鎖，已關分頁資料遺失

- 檔案＋行號：`src/browser/storage.ts:137–169`（尤其 141–144）；`tests/unit/core.test.ts:363–365`；全部 mutation 入口。
- 問題／影響：`active=true` 時任何新請求都直接 fn()，沒有辨識鎖持有者。隔離實際 `saveTabs(A)` 等待時再送 B，兩次皆 saved=1/closed=1、remove=[2,1]，最後 DB 只剩 A，B 已關且資料遺失。現有 Promise.all 同步入隊時 active 尚 false，因此假通過。
- 修正：真正序列化外部 mutation；內部用明確 unlocked 方法或持有者 token，不能用全域 boolean 判別可重入。所有 save/restore/Undo/import/delete/clear/settings/backup restore/migration/reset 經一致安全入口。關閉與資料驗證的安全區段不可被 stale writer 穿透。保守定義 save 對 clear/reset 的衝突。
- 驗證：將 `core-review.mjs` 的 delayed-arrival 及 gate 時序轉成正式回歸；A 真進入等待後才送 B，assert B 未進入、兩個已關 URL 全部存在。加入 save/import、save/clear、restore/save、巢狀 backup 無死鎖，測失敗後 queue 仍能續用。

### R202 — 阻擋：首次安全確認將「目前頁」擴大成全部視窗，完整頁還繞過提醒

- 檔案＋行號：`src/ui/popup.ts:269–282,306–312,368–369`；`src/browser/library.ts:210–215,852`；`src/core/scope.ts:26–35`；`src/ui/list.ts:297–302`。
- 問題／影響：處理 session 結果時 scope 尚無 options，OK 送 scope=""；backend 接受空值，scope helper 當 window。真擴充 popup 文件（背景測試分頁，未冒稱原生 toolbar click）重現：指定 anchor 一頁，scope=""、options=0，確認後 anchor 與 unrelated-draft 都關閉，庫有 2 筆。完整頁首次存入則 dialogs=0，直接關掉草稿頁。
- 修正：runtime scope allowlist，非法值拒絕，不默認 window；先初始化安全可操作狀態。**第一個動作就持久綁定原 scope、tab IDs、URL 與 token**，通用提醒／影音提醒只續做同一操作，不從 mutable select／active tab 重選。全部入口共用首次提醒，library 不得無條件 confirmedUnsaved=true。
- 驗證：新隔離 profile 的真 toolbar／快捷鍵／popup／library 首次取消留原頁；確認只關原目標；等待中切 active、導航、改白名單／釘選保守處理。空 scope／未知 scope 不寫、不關。

### R203 — 阻擋：重複 id 匯入使還原失敗項目也被刪除

- 檔案＋行號：`src/core/import-export.ts:168–173`；`src/core/migrate.ts:249–258`；`src/browser/library.ts:724–726`。
- 問題／影響：空庫保留兩個相同 id 的不同 URL；第一筆開成功，第二筆 create 失敗，opened=1/failed=1 卻 removed=2，清單空。已實際執行原始函式重現。
- 修正：現行 DB parser 強制 id 唯一；匯入用明確、可測衝突規則拒絕或重新編號，合法無衝突 export 保留 id。還原精確關聯成功條目，失敗 URL 永遠保留；不能只調摘要掩飾刪資料。
- 驗證：同 id 不同 URL、同 URL 不同 id、既有庫與同批衝突、部分成功/失敗；assert failed URL、完整欄位、剩餘筆數與 removed 正確。

### R204 — 阻擋：復原刪除唯一毀損 raw，現行 parser 仍靜默修補資料

- 檔案＋行號：`src/browser/storage.ts:398–416`；`src/core/migrate.ts:73,99–112`。
- 問題／影響：先 set CORRUPT_KEY 保存原檔，再 remove 同 key；隔離及真瀏覽器復原成功後 raw salvage=null，原始救援消失。現行條目的 group 物件、tags 非字串、title 數字、row schemaVersion=99 仍被轉空／過濾／降版。
- 修正：原檔存於獨立、持久、可匯出的救援快照，不能用即將清除的 marker 作唯一副本；輪替規則避免新壞資料覆蓋唯一舊 raw。現行 schema 逐欄嚴格驗證與版本拒絕，遷移只處理明確舊格式，不能默默補掉內容。backup restore 也須完整寫回驗證，失敗保留當前 DB。
- 驗證：四種錯型與未知新版保留 exact raw；復原後匯出仍含復原前完整 raw；壞 snapshot、set/read reject、content mismatch、最近 N 輪替全部實測。保留本輪已通過的五份輪替、壞 snapshot 不覆蓋與可見備份按鈕。

### R205 — 遷移不持久化，缺時間舊項目的 id 仍漂移

- 檔案＋行號：`src/browser/storage.ts:209–251`（230）；`src/core/migrate.ts:201–202`。
- 問題／影響：每次 storage.get 回 clone，`again[DB_KEY] !== raw` 恒為真，略過持久化；缺 savedAt 以 now 產生 id。實測 storage 仍 schema1，畫面 id restore 開 0。
- 修正：鎖內重讀／比較版本或內容，先備份、一次遷移、完整讀回驗證後落地；時間／id 跨讀取穩定。不可依物件參照做 CAS。
- 驗證：有／無 id、有／無時間的各支援 v1：read→同 id 再 read→以畫面 id 真 restore；存放已現行版本，瀏覽器重啟一致，遷移前 raw 可復原。與並行 mutation 交錯仍不丟資料。

### R206 — 完整 DB 驗證漏 settings/stats/Undo；未關成功仍可 Undo 開重複頁

- 檔案＋行號：`src/core/verify.ts:34–41`；`src/browser/storage.ts:261–298`；`src/browser/library.ts:385–643`（594）。
- 問題／影響：settings/stats/undo 全被改，databaseContentMatches 仍 true；注入 set 清 Undo 後 save closed=1，立即 Undo expired。tabs.remove 失敗 closed=0／原頁仍開，仍回 undoIds 並保留 Undo，點後多開 1 頁。關頁後統計寫失敗也被吞掉，成功摘要未警告。
- 修正：比較預期完整 DB 及**實際原始讀回**全部持久欄位、唯一性與必要順序，不先寬鬆 migration 修補；任一不一致不關。逐筆核對確實關閉的頁才加入可重開 Undo，失敗／部分關閉用準確結果。已發生關頁／還原而後續持久化失敗時，回報真部分結果與可恢復警告，不假成功或重試重開。
- 驗證：每個條目欄位、settings/stats/undo、get reject、remove 部分成功/失敗、keep-window create fail、restore 後 set fail。assert 已關 URL 全存在、未關不被 Undo 重開、剩餘失敗可重試。保留目前條目 tags mismatch 與寫入故障留原頁的成功保護。

### R207 — 匯出資料不完整 round-trip，尾斜線誤去重與訊息缺 runtime 驗證

- 檔案＋行號：`src/core/import-export.ts:25–30,188–197`；`src/browser/library.ts:821–1090`（917–925、949–955）；`src/core/id.ts:31–36`；`tests/unit/core.test.ts:98–99`。
- 問題／影響：export 包含 settings，import 卻忽略；四項設定實測未回復，不能稱整份一致。`/page`、`/page/` 匯入只留一筆，可能不同內容。Request 只 TS cast，scope/patch/ids/type 等無統一驗證。
- 修正：明確保守匯入資料與設定策略，讓可匯出範圍逐欄一致（必要提供設定復原選擇）；保留 path/fragment 的內容差異，exact duplicate 仍去重；入口 runtime allowlist／型別與範圍檢查（含 batchSize）後才 mutation。這是內部安全契約，未證實外部網站可直接 messaging，不要誇大成外部攻擊。
- 驗證：合法完整 export→空庫→再 export 逐欄一致；非法 patch/scope/ids 不寫入；兩條 path 均保留、hash 路由均保留；錯誤／版本／duplicate 摘要準確。

### R208 — 音訊確認只保存音訊，布林旗標可繞過原目標 token

- 檔案＋行號：`src/browser/library.ts:220–268,340,353–369`；右鍵入口 `1182–1205`。
- 問題／影響：token 只含 needsConfirmation，普通 candidates 未存就 return；真本機 autoplay 音訊 audible=true，window 確認後只存／關音訊，普通頁漏掉。無 token 的 confirmedAudio=true 亦可直接關 audible；save-others 右鍵丟掉結果／確認。
- 修正：完整原接受集合與 scope 都綁持久 token，只允許經驗證的同操作確認；變更重新檢查。各入口能取消、確認、讀摘要與 Undo，右鍵 save-others 不丟結果；取消若已有部分動作必須誠實說明。
- 驗證：混合 ordinary/audio 的 window/others、cancel、active/URL/protection 變更、token expiry/reuse/不存在、Boolean-only request；普通與音訊全部原集合被正確處理，取消不關。

### R209 — Hibernate 默選第一頁，成功判定只看 id

- 檔案＋行號：`src/ui/popup.ts:377–386`；`src/browser/library.ts:1040`。
- 問題／影響：popup 呼叫 tabs[0] 而非明確選擇的目標；有 id 不等於 discarded=true。會休眠錯頁或假稱休眠。
- 修正：綁定真目標或提供清楚最小選擇／標題；正確處理 active 無法 discard，不能默換其他頁。以實際結果／讀回 discarded 確认，保護 pinned/audio/whitelist，點回會重載。
- 驗證：視窗 A/B/C、active C，明確目標 B，只 B 被 discard；protected/active/失敗回正確提示，真正回到 B 重載。不新增其他未選 P2。

### R210 — 設定刷新丟未保存輸入；復原錯誤藏在 hidden 表單；引導假完成

- 檔案＋行號：`src/ui/options.ts:59,69–82,162–171`；`src/ui/options.html:36`；`src/ui/popup.ts:99–102`。
- 問題／影響：任何 storage 更新就 load 覆寫 dirty theme/whitelist；毀損時 hidden settings-form 內的 saved-msg 看不到復原／匯出／reset 失敗；onboarding 不看 complete-onboarding 回應就 hide。
- 修正：dirty/version-aware 刷新非編輯欄位與備份，必要提示衝突；表單外常駐全域 live status/error；只有成功保存引導才隱藏，失敗可重試。
- 驗證：未 Save 的白名單遇 library save/delete/demo 與另一 settings 修改仍保留；毀損＋restore set fail 可見明確錯誤；引導 write fail 不假完成。保留目前 settings write fail 真顯示 error、值未改的修正。

### R211 — library 無 Undo 入口，重開 UI 不重建有效 Undo

- 檔案＋行號：`src/ui/list.ts:32–40,303–320`；`src/ui/list.html` 全檔；`src/ui/popup.ts:load`。
- 問題／影響：library save 提示只有文字，真測 Undo buttons=0；README 稱 full library 有 Undo 不成立。只靠 session last result 也不足以從 DB 有效 undo 恢復提示。
- 修正：共用正確的 save 結果／Undo 呈現，在有效 TTL 內各適用頁可操作；從持久 DB 重建、過期停用，部分失敗保留剩餘。R206 的未關頁不能加入重開 Undo。
- 驗證：library 實際存入→按 Undo→正確 URL 重開且移除；popup 關閉再開／Worker 重建仍能在 TTL 內操作；過期、部分失敗無重複／丟項目。

### R212 — CSS 語法錯誤，完整頁必要動態未串接

- 檔案＋行號：`src/ui/styles.css:124–130`；`src/ui/list.ts:182,191–195`；`scripts/build.ts:48–66`。
- 問題／影響：逗號 selector 接 @media，CSS parser 實報 Unexpected @media；build 僅 copy，gate 漏掉。完整頁 restore/delete 沒接 restoring/leaving。
- 修正：合法規則；共用所需收進／展開／清單進出／按鈕動態且和真結果一致，失敗不可永久透明。加合理 CSS syntax gate。維持本輪改善的對比／hidden／減少動態。
- 驗證：CSS parser 零 syntax warnings；淺／深／系統 dark hover、正常與 reduced-motion，popup/library 互動實際可見；失敗列表仍可操作。

### R213 — 英文字串還散落，估算法沒有顯示

- 檔案＋行號：`src/ui/popup.ts:190`；`list.ts:243`；`options.ts:48,54`；HTML title/brand/aria；`public/manifest.json:2,3,8,35,42`；`src/strings.ts:100–101`。
- 問題／影響：OK、(hibernated)、tabs/backup reason/template、HTML/manifest 尚非單一來源；estimateDisclaimer 無任何 UI 使用，英文 README 無 50MB/closed-tab 公式／lifetime 定義。
- 修正：固定可見字串／aria／menu／manifest／HTML 共用唯一常數來源，build 可注入；勿翻譯使用者資料。產品適當位置或可展開說明＋README 英文說清公式、範圍及非實時測量。
- 驗證：掃描固定硬編碼並核對全部 surface；系統中文仍固定英文日期／提示；import/demo 不增加真 closed，Undo/partial 數字定義一致。不要製造MB實測數字。

### R214 — 刪弱既有回歸，單元仍漏安全時序

- 檔案＋行號：`tests/unit/core.test.ts` 與 `tests/e2e/extension.spec.ts:122–330`；證據 `output/supervision/round-2/docs-tests-diff.patch`。
- 問題／影響：原 E2E 搜尋／JSON download／設定值變更、純文字 title 與 import duplicate/invalid 摘要等有效斷言被移除。新3案未等價覆蓋；Undo不驗正確重開URL、restore只驗opened、restart只比筆數。
- 修正：恢復原有效覆蓋，再加入新需求的正確期望，不降低門檻。R201–R213 的確證轉成正式有意義回歸，assert 真行為／精確原頁及DB，不只helper／數量。
- 驗證：≥15 是下限，不是完整覆蓋；每個新失敗案例在未修版會 fail、修正後 pass；無 skip/conditional bypass。完整所有測試通過，不替換／刪掉不相關覆蓋。

### R215 — 真 UI 主閉環與七種特殊頁／所有範圍仍缺正式 E2E

- 檔案＋行號：`tests/e2e/extension.spec.ts:141–203`；`docs/TEST_REPORT.md:46–52`。
- 問題／影響：API confirmedUnsaved=true 主流程避開 R202；內部、釘選、媒體、未存內容、duplicate、無痕、last-tab 尚無完整正式證據，文件部分只有單元或程式路徑。其他 import/backup/migration/keyboard 亦不完整。
- 修正：真實載入 extension，至少主閉環走真操作入口；fixture 精確 URL/title/content/source/order、close、restore與移除／保留都斷言。七種逐項及三scope、白名單／大量整組分批、備份／毀損／遷移／完整 round-trip、同profile restart完整資料。無痕用獨立profile，不碰日常權限。
- 驗證：正式可重現命令、trace/screenshots；真正沒法操作留下嘗試／失敗，僅標未驗證；把監工蒐證轉入工程正式測試，不能拿 docs「有未驗證」當交付通過。

### R216 — Worker 測試沒證明 instance 回收，長操作狀態未持久重建

- 檔案＋行號：`tests/e2e/extension.spec.ts:268–282`；`docs/TEST_REPORT.md:38,61`；`src/browser/library.ts:706–750,771–818`。
- 問題／影響：closeTarget 送出與筆數相同不足以證明回收。根獨立試驗 close.success=true、target 暫消失、全域 nonce 喚醒後為 null、原始 DB 一致，但 Playwright Worker close event 未觸發且 targetId 重用；保留觀察，不以命令送出冒稱完整驗證。長還原 openedIds/進度只存在記憶體，操作中斷續做可能重開。
- 修正：用官方可核對停止狀態／execution-context 銷毀與新context證據（穩定 targetId 不等於同 instance），持久化必要操作進度，保守處理已開／未移除／中斷重試。不要靠永不回收記憶體鎖維持核心安全。
- 驗證：真正 stopped→從事件wake→完整資料一致；save／分批restore／Undo 中途終止再續行，所有已關 URL 不遺失、已成功開項目不默默重開，部分結果透明。

### R217 — 效能指標錯誤，CPU／真 popup／Task Manager 證據不足

- 檔案＋行號：`scripts/perf-measure.ts:67–101,123`；`docs/KNOWN_LIMITATIONS.md:5`；`docs/HANDS_ON_ONLY.md:6`。
- 問題／影響：btn-save visible 早於綁事件和 load；library #list 無overflow，實測設scrollTop仍0；固定sleep不是搜尋完成／FPS。樣本排序後聲稱後期降速，無時序證據；單page heap不是整擴充資源。無CPU／Task Manager實際嘗試與完整步驟。
- 修正：量真 UI ready（資料與事件皆完成）；合理量及1000量區分、冷热／版本／機器條件、保留原序≥30樣本p50/p95。實際document捲動assert位置＋rAF/long-task、search結果完成；自身CPU/heap包含surface範圍、worker／idle活動。用隔離瀏覽器先嘗試nativepopup及工作管理員前後，工具不支援則保留證據／詳細步驟／未驗證，不填假MB。script 不得硬寫歷史 round-1 覆蓋證據。
- 驗證：有效原始樣本及可重現腳本；200ms原文目標如未達說清並最佳化，不只選p50過關。依實際流暢度決定虛擬化。根本輪1000搜尋39.85ms、載入425.23ms、真scroll57.25ms只是單次頁面證據，不能當全門檻。

### R218 — 研究／設計來源與 storage 選型論據未補齊

- 檔案＋行號：`docs/DESIGN.md:3–7`；`docs/RESEARCH.md:19–34`；`docs/DECISIONS.md:20`。
- 問題／影響：仍只有泛稱設計、競品抱怨／格式無來源，1000＋5snapshot尺寸／storage vs IDB可靠性性能無測量。unlimitedStorage「權限提示醒目」仍不精確。
- 修正：具名擴充／生產力／獎站或設計社群與真評論來源，說學到哪些密度／互動手法，不抄素材；官方API事實和自己推論區分。量容量與合理性能，說明可靠性架構及權限取捨；純文字競品格式查證。重用既有研究，不無限研究或導入無關工具。
- 驗證：關鍵事實有直接來源、尺寸raw／指令，決策吻合R201實際交易架構。

### R219 — Node 支援範圍／打包／商店文件與實作不符

- 檔案＋行號：`README.md:7,75`；`package.json:39`；`package-lock.json:1367,3551,3653`；`scripts/pack.ts:15–38`；`docs/DEPENDENCIES.md:12,25`；`docs/STORE_LISTING.md:27`；`docs/requirements-checklist.md:55,83`。
- 問題／影響：>=20 包含不相容Node20.0/21/22.12/23；完整lock engines交集至少 ^20.19 || ^22.13 || >=24。README宣稱pure-JS zip fallback／首次跑自動安裝browser，實作沒有。商店仍寫alarms漏favicon；tinypool override不在lock不作用；checklist完成與未測矛盾。
- 修正：選明確支援LTS範圍並同步engine/lock/README，真測最低支援版；正確記zip／PowerShell平台前置、先裝Playwright瀏覽器。商店／依賴／checklist／TEST_REPORT依最終實測更新；可修bug不可包裝限制。保留audit0、LICENSE、完整授權與ignore改善。
- 驗證：乾淨環境依README成功ci/verify/E2E/pack；最低Node gate成功；zip可載入且內容一致；不要盲force升版或自動授權安裝scripts。

### R220 — loading/error／原生 popup／鍵盤驗收仍不完整

- 檔案＋行號：`src/ui/list.ts:load`、`popup.ts:load/init`、`shared.ts:formatTime`；`popup.css:1–20`；`options.html:36`。
- 問題／影響：錯誤仍可能保留過期 database/targets／可操作按鈕，初始化session/File.text/openOptions等拒絕缺可見回復；大量還原沒有進度／防重送。520px popup在引導＋長錯誤／縮放下尚未證實不裁切，普通tab截图不能替代原生尺寸。saved-msg 無live，完整鍵盤／焦點鏈未驗。
- 修正：明確loading/error/retry，失敗停用不適當操作而保留可救援資料，不顯示過期成功；合理進度與避免重複操作。原生popup實際尺寸／縮放下CTA/footer/Undo/error可達；鍵盤import/search/dialog/restore/settings可完成，status與focus正確。只修必要可用性，不重做已通過風格。
- 驗證：runtime/session/file/format failure、慢read、重送、nativepopup onboarding/長status、鍵盤/200%縮放/light-dark/reduced-motion；無pageerror/unhandled，全部功能能恢復或明確報錯。

## 必須使用的 skill／工具

開工先列本輪實際可用的適用skill與用途；不可只說讀過。沿用既有六項：

| Skill                   | 來源                                                                | 用途                                                  |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| diagnosing-bugs         | `/Users/zhuangzijin/.agents/skills/diagnosing-bugs/SKILL.md`        | 原始實作與可控時序重現R201–R208，再修root cause       |
| ai-debt-detector        | `/Users/zhuangzijin/.agents/skills/ai-debt-detector/SKILL.md`       | 全量審查假成功、吞錯、未用、弱化測试與記憶體狀態依賴  |
| security-best-practices | `/Users/zhuangzijin/.codex/skills/security-best-practices/SKILL.md` | runtime輸入、schema、最小權限、CSP與本機限定          |
| playwright              | `/Users/zhuangzijin/.codex/skills/playwright/SKILL.md`              | 真擴充UI／媒體／故障／Worker／restart／效能／鍵盤證據 |
| impeccable              | `/Users/zhuangzijin/.agents/skills/impeccable/SKILL.md`             | popup有限尺寸、error/dirty/dialog/live/focus實測      |
| minimalist-ui           | `/Users/zhuangzijin/.agents/skills/minimalist-ui/SKILL.md`          | 保留原創tokens／密度，補必要動態與可讀性              |

可用適用 tdd／npm-skill 查清相容性與正式回歸，先讀其SKILL。Chrome官方API／現有Vitest、Playwright、TypeScript、成熟解析工具優先，不自己猜API或以堆套件解決。不需要Cloudflare/Vercel部署、Figma登入、影像生成／雲端同步。不適用說原因即可。

## 完成後的驗證方式

先focused跑上列新回歸，確定根因修好，再freeze並完整驗收：

```bash
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:perf
npm run pack
npm audit --json
```

指令exit0只是工程gate，還要R201–R220真案例的嚴格斷言與artifact。CSSsyntax加入檢查；測試不能skip／conditional bypass／降低門檻。資料安全的確證腳本在 `output/supervision/round-2/`，請先讀並復現，再轉為可版本控制的正式測試。根監工腳本有明確界限，未測不是通過。

更新全部原文需求矩陣與README／隱私／商店／繁中研究設計決策測試限制；逐項回報R201–R220（檔案、實際命令、exit code、assertion、artifact、未驗證原因），保留小步有意義commit。完成後回報HEAD/gitstatus並**停止修改等Codex第3輪全面驗收**。監工文件需保留並納入版本控制。

## 禁止事項

- 不得刪功能／測試、skip、弱化或放寬斷言過關；不得改壞已通過的普通save/Undo、寫入及tags mismatch留頁、內部/釘選/duplicate保護、取消/Esc、同profile持久化、local favicon/CSP、對比/hidden/reduced-motion與audit0。
- 不改原始需求、不用KnownLimitations包裝可修bug、不把API呼叫送出當成功、不用估计當實測、不改歷史驗收證據。P0及全域全部必做；P1誠實未完成；P2僅原選Hibernate與URL|title，不追加sync等範圍。
- 不碰其他專案、真實日常資料／分頁、帳號、模型、費用、訂閱、用量、安裝script授權；不push／部署／上架／擴大敏感或host權限。驗收通過後GitHub由Codex處理。
