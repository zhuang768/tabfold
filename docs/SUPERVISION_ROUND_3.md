# Tabfold 第 3 輪全面獨立驗收

日期：2026-10-08（Asia/Taipei）。候選 HEAD：`034d3bf82349b52ea950348596d0e6b06454048c`；唯一專案 `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`。原需求 `docs/original-requirements.md` 與唯一原附件逐位元相同。本報告由 Codex 獨立驗收，Antigravity 是修正工程師；工程師回報完成不等於驗收通過。

## 驗收結論

**未通過。沿用第 2 輪相同 83 項需求切片：26 通過、39 失敗、18 有疑慮。** P0 與全域門檻必做；P1 依原文盡量完成並誠實列出缺口，既有功能不能刪掉過關；P2 僅既選 Hibernate 與 URL｜title 純文字匯入。沒有新增同步、雲端服務、部署或上架要求。

8 項基礎工程 gate 都通過，前輪 24 個核心隔離反例全部改善。但新增選取剩餘疑點的 16 個核心斷言全失敗；14 個可控 UI 案例 3 過、11 失敗。它們是不同分母，也不是全專案通過率。實際隔離 Chrome 確認仍有空 scope 誤關兩頁、壞 raw status 讀回後仍關原頁、第二次備份還原覆蓋唯一救援 raw、有效持久 Undo 在重開 popup 文件沒有入口。不得用既有測試全綠抵銷這些反例。

第 3 輪修正要求是 `docs/cursor-correction-round-3.md` 的 R301–R324，共 24 組。先處理 R301–R308 資料安全，再補 UI、正式回歸與實測文件。所有原文、歷史報告及失敗證據保留；新的嘗試使用新結果路徑。

## 實際執行與結果

所有本輪原始證據在 `output/supervision/round-3/`。Node 實測版本為 v26.3.0；其他宣告支援版本尚未驗證。產品程式碼未由監工修改。

| 檢查                                             | 實際結果                                                                       | 證據                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `npm ci`                                         | exit 0，165 套件，audit 0；esbuild/fsevents allow-scripts 提示保留，未自行授權 | `install.log`                                              |
| 格式 `npm run verify` 內 format check            | exit 0                                                                         | `verify.log`                                               |
| 嚴格型別                                         | exit 0                                                                         | `verify.log`                                               |
| lint（max warnings 0）                           | exit 0、零程式警告                                                             | `verify.log`                                               |
| 正式單元測試                                     | 35 通過、0 失敗、0 略過                                                        | `verify.log`                                               |
| build                                            | exit 0                                                                         | `verify.log`                                               |
| 正式擴充 E2E                                     | 4 通過、0 失敗、0 略過，6.6 秒，真正載入 dist                                  | `formal-e2e.log`                                           |
| `npm run pack`／`unzip -t tabfold-extension.zip` | 各 exit 0，ZIP 20 個 runtime 檔案與本輪 dist 逐位元相同                        | `pack.log`、`zip-integrity.log`、`zip-content-match.json`  |
| `npm audit --json`                               | exit 0、0 漏洞                                                                 | `dependency-audit.json`                                    |
| 原核心隔離回歸                                   | 16＋8＝24 通過                                                                 | `core-original-review.log`、`core-original-additional.log` |
| 新核心針對反例                                   | 16 失敗；原始 TS＋可控 API 替身，非真 Chrome                                   | `core-focused-proof.mjs`、`.log`、`core-review-report.md`  |
| 可控 UI 流程                                     | 14 案例，3 通過／11 失敗；原始 TS 記憶體 bundle＋DOM/API 替身，非視覺瀏覽器    | `ui-controlled-audit.mjs`、`.json`、`.log`                 |
| CSS／主要色票靜態檢查                            | 4 CSS parser 零警告；15 組對比均至少 4.5，最低 4.620                           | `ui-css-and-contrast.json`                                 |

正式 E2E 使用監工保留的副本，僅將 `headless:false` 改為 `headless:true` 加官方 `channel:'chromium'`、重導證據路徑，**所有斷言原樣保留**。改動與 SHA256 在 `validation-adaptations.json`；指令 `npx playwright test --config output/supervision/round-3/formal-e2e.config.ts`。工具的 NO_COLOR／FORCE_COLOR 提示保留，不冒稱產品 runtime 警告。正式產品 E2E/perf 仍須改成能背景執行且失敗時 finally cleanup，避免再跳出測試 Chrome。

## 真瀏覽器與資料安全證據

`browser-audit.mjs` 使用隔離複製 dist、暫存 profile、本機 HTTP／音訊 fixture，共 18 情境紀錄；不是 18 個通過斷言。`browser-focused.mjs` 新路徑補 7 個紀錄；`capacity-audit.mjs` 另建隔離 profile。成功／失敗均在 finally 關閉本次 context／server，未操作日常 Chrome 或其他專案。

- 普通存入、原頁關閉、立即 Undo：精確 URL 重開且庫移除，通過。首次 popup 文件 current scope 與確認 token 只關目標、不關其他草稿，通過。首次 library 提醒取消留原頁，通過。
- 真 Chrome 儲存 set 拒絕及 tags 讀回變造留原頁，通過；但 raw status 變成 `INVALID-READBACK` 仍回 saved 1／closed 1，失敗。defaultScope=window 的 runtime 空 scope 仍 saved 2／closed 2，包括不相關頁，失敗。
- 內部 `chrome://version`、預先釘選、同批精確重複 URL 的跳過與說明通過。最後唯一網站分頁存起後仍有 `chrome://newtab/` 保留視窗，通過。寫入等待途中新釘選／音訊條件仍漏查，由可控生產管線反例確證；真 headless 音訊 fixture 未變 audible，不能冒稱真音訊驗收通過。
- 第一次備份恢復後匯出包含 unique 壞 raw，通過；同一快照第二次恢復後匯出不再包含它，失敗。需保留唯一救援資料，不能只看第一回成功。
- session 清空而 DB.undo 尚未過期時，重開 popup 文件 Undo 按鈕 0，失敗。這是普通 extension 文件實測，未當作原生工具列 popup 量測。
- 大量還原 16 筆，Cancel 與 Esc 都開 0 頁且仍 16 筆，通過；持久中断續接、進度與長操作回收仍缺完整正式證據。
- 第三方 favicon tracker 請求增量 0，實際只用本機 `/_favicon/`。受觀察頁面 pageerror／consoleerror 為空；不代表整個系統或所有未執行入口完成資安掃描。
- 真同 profile Chrome 關閉後重新啟動，16 筆完整原始 DB JSON 一致，通過（`restart-before-after.json`）。
- 真 CDP `ServiceWorker.stopWorker`：版本狀態 running → stopping → stopped → starting → running，舊 global nonce 清空、完整 raw DB 相同，證明 **idle Worker 真停止並重建**。Playwright Worker handle 可透明跨 restart 保留，不能硬要求 close event／新 targetId。存起、還原與 Undo 操作中途的 durable 恢復仍未完整驗證。

### 避免將監工工具錯誤算成產品缺陷

第一個 library probe 選到錯 window 而 timeout，後續以正確自己的 window 重試提醒取消通過。舊 corruption probe 查舊 key 而非 SALVAGE，不能以 null 宣稱第一次 raw 丟失；採後續真 export 第一次保留／第二次丟失為故障證據。舊 capacity probe 發不存在的 `backup` request，`Unknown request` 不算產品錯誤；後續以實際 import 和 before-import snapshots 真量測。無痕權限 false 的边界已觀察；嘗試開無痕返回 null 是測試方法限制，enabled-incognito 全閉環未驗，未更動使用者權限。

## 效能、容量與 UI 實際範圍

環境：Darwin 24.5 arm64，Apple M4，10 logical CPU，16 GiB。數據限定此隔離資料集／執行條件，不能當所有裝置保證。

- 1000 筆真 library：載入 266.896 ms，精確搜尋單筆 47.938 ms，實際捲動 27.407 ms、scrollY 78230。390 px viewport 的 scrollWidth 390，無橫向溢出；11,062 DOM nodes。`library-390-1000.png` 已視覺查看。這不是連續 FPS／完整 long-task 預算。
- reduced motion 實际 computed animation none／transition 0s。主要色票對比過；原生 popup、200% 大字體、完整鍵盤／live feedback、淺深主題圖示仍未完整實測。
- 16 筆 ordinary popup 文件實際 ready 的 30 個順序樣本：p50 40.4292 ms／p95 76.8383 ms。起點在 newPage 後，**不是原生工具列 popup**，不能用它宣告原文原生 200 ms 目標達成。工程師原 perf 用按鈕文字存在判 ready，早於載入與 handlers，原 159.19／1090.07 ms 不算真可操作時間。
- 1000 筆 library 3 秒 idle：CDP TaskDuration 增量 0.187751 秒，ScriptDuration 增量 0，heap 12,870,136 bytes。只是 page，不包含 Worker／原生 popup／整個 Chrome。工作管理員前後 MB 尚未實測；不得以產品 50 MB 估算公式替代。
- 真產品匯入 1000 筆，再以 5 次 before-import 操作形成各 1000 筆快照，`getBytesInUse`：DB 265,770 bytes，備份 1,329,281 bytes，全部 storage 1,595,051 bytes（`capacity-audit.json`）。工程研究聲稱 125 KB＋625 KB <1 MB 沒有同條件證據，需要更新。

## 程式與文件全面核對

已逐檔核對 core/browser/types、unit/E2E、UI/HTML/CSS/strings、manifest/build/tooling、README/產品/隱私/商店／研究設計決策測試限制文件。詳細檔案行號、重現、影響與修法見 `core-review-report.md`、`ui-static-audit.md`、`docs-audit-findings.md` 及正式修正文件。

主要剩餘群：raw schema／完整讀回、runtime allowlist、遷移前備份與驗證、關閉部分成功與 Undo/統計、救援與恢復交易、還原重試／Worker durable journal、完整確認鏈、明確 Hibernate 目標、持久 Undo/TTL、stale load／拒絕 Promise、設定草稿競態、固定字串集中、busy／進度／鍵盤、正式安全 unit/E2E、原生視覺與真量測、研究來源與現行報告同步。這些可安全修正或換方法驗證，不是交給使用者的既定限制。

## 同基準逐條矩陣

✅ 僅對明列實測或充分静態核對範圍通過；❌ 確證不符或原必做正式證據未交付；⚠️ 部分改善／尚未驗證。普通成功不抵銷同契約安全反例，未測不稱通過。

| #   | 原文位置 | 需求                                      | 判定 | 第3輪證據／範圍限制                                                                                                                 |
| --- | -------- | ----------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | §0       | 可安裝可用、保守避免資料遺失、無假功能    | ❌   | 普通保存／原24反例改善；仍有runtime空scope關2、錯raw讀回仍close1與第二次salvage消失，browser-audit/focused及core C3-01/02/07        |
| 2   | §0       | 自主決策與階段回報                        | ✅   | 工程師依交接自主執行、繁中日誌與五個有意義小步commit；HEAD034d3bf                                                                   |
| 3   | §1       | 全產品英文、字串集中                      | ❌   | UI靜態U309仍有HTML/manifest/硬編碼固定字串未集中；英文字串語言基本維持                                                              |
| 4   | §1       | README／隱私／商店草稿英文                | ✅   | README、PRIVACY、STORE_LISTING均英文；內容準確性於§12另判                                                                           |
| 5   | §1       | 研究／設計／決策／測試及回報繁中          | ✅   | 指定研究／設計／決策／測試報告及階段日誌維持繁中；報告時效另判                                                                      |
| 6   | §2–3     | 保存網址／標題／圖示、關閉、再開啟核心    | ❌   | 一般save-close-Undo正確URL真Chrome通過；錯raw status仍关原頁、錯scope關不相關頁阻擋安全核心                                         |
| 7   | §4       | 競品、內建節省功能與使用者抱怨調查        | ❌   | docs-audit D306：競品格式／真評論／抱怨無直接來源，不能以泛稱公開規格完成研究                                                       |
| 8   | §4       | 2–3 差異點及選擇理由                      | ✅   | DECISIONS三差異點與理由保留；功能是否達成另列                                                                                       |
| 9   | §4       | MV3、容量、官方最佳實踐查證               | ❌   | 官方storage/MV3連結及unlimitedStorage警告修正；CAS原子保證／容量實測說法仍不準確，D306                                              |
| 10  | §5.1     | 收集→寫入→完整讀回→才關、失敗不關         | ❌   | 真readback INVALID-READBACK被normalize後仍close1；writer/tagsmismatch留頁通過只是部分，C3-01                                        |
| 11  | §5.1     | 批次全成功或逐筆安全、誠實回報            | ❌   | batch remove部分成功被報closed0／Undo清空；close後stats寫fail被吞，C3-06                                                            |
| 12  | §5.2     | 必要欄位與每筆／DB schema                 | ✅   | types及正常真保存具id/url/title/favicon/time/source/group/tags/status與row/DB schema；現行strict安全另列失敗                        |
| 13  | §5.2     | 版本遷移不弄壞舊資料                      | ❌   | schema2與穩定id已落地；遷移無前raw備份／完整讀回，set變造stored與顯示不同，C3-09                                                    |
| 14  | §5.2     | 毀損不清空、原資料匯出與復原              | ❌   | 第一次restore後SALVAGE仍在已修；第二次restore真export unique raw消失，focused salvage case＋C3-07                                   |
| 15  | §5.3     | storage.local／IDB 容量效能可靠性比較     | ❌   | capacity-audit真1000DB265770B＋5snapshot1329281B＝all1595051B；工程研究無raw且宣125KB/<1MB，性能比較欠，D306                        |
| 16  | §5.3     | 最近 N 快照、設定可還原                   | ❌   | 最近5份與復原UI可用部分；第二次salvage遺失、restore mismatch當前DB副作用，C3-07/08                                                  |
| 17  | §5.4     | Worker 回收可重建、頂層同步監聽           | ❌   | 頂層同步listener、idle Worker stopped/globalreset/raw相同實測通過；restore/Undo仍RAM進度，persist-fail重試再開，C3-11               |
| 18  | §5.5     | 瀏覽器 API 與純邏輯分開、可獨立測試       | ✅   | core/browser分離；原24及新增16探針直接原始TS／獨立driver實跑，未代寫功能                                                            |
| 19  | §5.6     | 最小權限、每項用途                        | ✅   | manifest無host與externally_connectable，README及store五權限用途已對齊；runtime內部validation另列                                    |
| 20  | §5.6     | 未儲存輸入的保守通用提醒與取捨            | ❌   | library真首次Cancel留頁、popup原集合token改善；Boolean首次提醒仍可繞過、其他入口丟確認，C3-03/12 U301                               |
| 21  | P0.1★    | 點圖示一鍵存起、動畫與數量回饋            | ❌   | 未正式真toolbar全鏈；首次popup current/token範圍真通過，但runtime空scope擴窗與晚保護變更仍違安全                                    |
| 22  | P0.2★    | popup／完整清單，各欄位與圖示             | ⚠️   | 普通popup文件與完整頁各欄位可見、local favicon命中本機API；原生popup尺寸/裁切/主題未完整驗                                          |
| 23  | P0.3★    | 單筆／全部還原、預設移除設定              | ❌   | current duplicateid/import一成一敗留URL已修；已開後persist-fail重試會重開，C3-11；全量真UI仍欠                                      |
| 24  | P0.4★    | 可用的限時 Undo                           | ❌   | 普通立即Undo正確URL通過；重開popup持久Undo buttons0真確證、未關頁Undo重開／TTL訊息錯，C3-05 U303                                    |
| 25  | P0.5a    | 內部頁略過與提示                          | ✅   | 真chrome://version saved0/closed0有原因且原頁留開；正式extension內部頁亦過                                                          |
| 26  | P0.5b    | 釘選預設不關閉                            | ❌   | 預先pinned真fixture有提示留頁；寫入等待後fresh pinned仍closed1，C3-04原始管線反例                                                   |
| 27  | P0.5c    | 正在播放音訊／影片前確認                  | ❌   | audio boolean/token及混合集合改善；library首次audio鏈停在第二次確認、關閉前新增audio仍關，U301/C3-04；真media頭less未audible僅未驗  |
| 28  | P0.5d    | 未儲存內容提醒                            | ❌   | library真首次提醒Cancel留原頁、popup確認只關anchor通過；首次Boolean仍可直接繞過，C3-03                                              |
| 29  | P0.5e    | 重複 URL 偵測與提示                       | ✅   | exact同批duplicate只存關接受頁、跳過來源留開；path尾斜線/hash不混同，原探針與正式unit過                                             |
| 30  | P0.5f    | 無痕依權限正確處理說明                    | ⚠️   | 隔離browser allowed=false邊界觀察；未擴權，enabled incognito全流程未驗；create null為監工harness錯不算產品fail                      |
| 31  | P0.5g    | 最後一頁不讓視窗意外消失                  | ✅   | 真last-web-tab保存關原頁後window仍在，保留chrome://newtab；保窗create失敗的Undo誤帳另見P0.4                                         |
| 32  | P0.6     | current／others／window 三範圍            | ❌   | 三scope純邏輯與popup預填已改善；handleRequest scope空採defaultwindow真關2，C3-02                                                    |
| 33  | P0.7     | 即時搜尋標題 URL、單筆刪除、二次確認清空  | ⚠️   | 正式demo/search/download回歸恢復、真1000搜尋快；完整單刪/clear二次確認故障與鍵盤尚未真測，stale錯誤另列                             |
| 34  | P0.8     | JSON 匯出匯入、重複／錯誤／版本／摘要     | ❌   | 去重/v1/duplicateID改善；schema寬鬆/完整設定範圍欠定義，File.text拒絕無恢復，C3-01/13 U305                                          |
| 35  | P0.9     | 移除／scope／dark／backup 設定            | ❌   | 正常remove/defaultScope重載真過、基本dirty/visibleerror改善；save中再編輯草稿被覆蓋、舊timer藏新error、snapshot副作用，U306/C3-08   |
| 36  | P0.10    | ≤3 步、可跳過、完成後不再出現             | ✅   | 三步與Skip實際隱藏，complete失敗受控留引導＋可見錯誤；成功狀態寫入DB控制後續不再顯示                                                |
| 37  | P0.11    | empty/loading/error 全面可用              | ❌   | popup錯誤後search復活stale資料、library舊rows/target仍可操作、session/File.text拒絕無回復，U304/305受控確證                         |
| 38  | P0.11    | 鍵盤操作與足夠對比                        | ⚠️   | 15組主要opaque token對比皆≥4.5及native controls/focus outline；完整鍵盤/焦點/200%原生popup未驗                                      |
| 39  | P0.11    | 減少動態偏好                              | ✅   | 真1000頁reduced-motion computed animation none/transition0s；CSSparser零warning                                                     |
| 40  | P0.11    | 非覆蓋型 demo 按鈕                        | ✅   | 正式真demo按鈕填實際庫、既有資料合併及import/demo不加closed契約保留；非假API/數字                                                   |
| 41  | P1.1     | 可自訂快捷鍵存目前頁                      | ⚠️   | manifest可自訂commands存在；真快捷鍵初次與Worker重建後閉環尚未完整驗                                                                |
| 42  | P1.2     | 右鍵存起                                  | ❌   | save-others分支仍丟SaveResult／token／session提示，使用者無法確認或Undo；C3-12靜態必然分支，未冒稱native menu實測                   |
| 43  | P1.3     | 分組、標籤、整組還原                      | ⚠️   | edit/group純邏輯與dialog路徑存在；整組真分批/部分失敗/重新開始／完整順序尚欠，長操作C3-11另列                                       |
| 44  | P1.4     | 白名單永不存起／關閉                      | ⚠️   | whitelist host/subdomain純邏輯與backend保護存在；全部原生入口與編輯並行尚欠，dirty新增race U306                                     |
| 45  | P1.5     | 統計與誠實記憶體估計                      | ❌   | 50MB/closed/lifetime/非live產品說明已加入；close後stats persist失敗仍Saved無警告，library把真部分失敗換成成功，C3-06 U310           |
| 46  | P1.6     | 原視窗與盡量原順序                        | ⚠️   | source window/index排序与fallback存在；真原視窗仍在/消失/相對順序全流程尚未驗                                                       |
| 47  | P1.7     | 徽章數量及已有項目的圖示                  | ⚠️   | badge/count與8PNG active切換源碼齊；native light/dark、各入口錯誤與Worker後全鏈尚未驗                                               |
| 48  | P1.8     | 大量還原數量提示與分批選擇                | ⚠️   | 真16條目Cancel/Esc開0保留16；分批節奏/進度/重送與中斷續行未全驗，U308/C3-11                                                         |
| 49  | P2       | 自選 2–3 項與價值成本                     | ✅   | P2仍只原選Hibernate＋URL｜title，理由成本在DECISIONS；不要求其他候選或sync                                                          |
| 50  | P2       | Hibernate 實際可休眠且保護                | ❌   | backend須讀回discarded、拒active/audio/pinned改善；popup默挑第一inactive A而非明確目標，U302                                        |
| 51  | P2       | URL｜title 純文字匯入                     | ❌   | 正常URL｜title解析/title/duplicate摘要正式回歸改善；真file-read exception無可見恢复，格式來源缺，U305/D306                          |
| 52  | §7       | 具名擴充／生產力／設計社群參考            | ❌   | 具名Notion/Linear/Raycast/Toby/OneTab改善；直接reference與award/design-community來源欠，D306                                        |
| 53  | §7       | 原創風格與 tokens／字體／間距／圖示統一   | ✅   | 暖紙/炭色tokens、統一spacing/rounding/focus/自製圖示維持；未新增主觀設計要求                                                        |
| 54  | §7       | 存入收進、還原展開、清單進出與按鈕動態    | ⚠️   | 四CSSparser0warning、library restore/delete串class已修；正常/失敗動态与batch進出真視覺尚未全驗                                      |
| 55  | §7       | popup 密度、CTA 明確、立即內容            | ⚠️   | 真普通tab文檔內容已測；380×520原生popup引導/長error/CTA/footer/200%可達未驗，不能以普通tab截圖替代                                  |
| 56  | §7       | 16/32/48/128、淺深主題、active 圖示       | ⚠️   | 8個16/32/48/128 normal/activePNG齊、manifest/source接好；原生深淺theme各尺寸辨識未驗                                                |
| 57  | §8       | popup 200ms 目標                          | ⚠️   | 16條目普通popup文檔真ready30 samples p50=40.43/p95=76.84ms；不含newPage且非native；工程早期ready量法錯，D304                        |
| 58  | §8       | 1000 筆搜尋／捲動流暢                     | ⚠️   | 真1000 load266.90/search47.94/實際windowScroll27.41ms、scrollY78230，390無橫溢出；連續FPS/longtask/完整資源尚未量                   |
| 59  | §8       | 自身 CPU／記憶體量測                      | ❌   | 根補1000page idle3s task0.187751s/script0/heap12870136B；工程交付仍無Worker/nativepopup及整擴充資源範圍，D305                       |
| 60  | §8       | 無背景輪詢，事件與必要 alarms             | ✅   | 全讀worker與UI無background polling；只有事件/必要一次性狀態timer与debounce                                                          |
| 61  | §9       | 本機限定、無外連／追蹤／遠端程式碼        | ✅   | 真tracker外請求0；img.src只/_favicon本機，manifest/CSP/程式無遙測追蹤或遠端JS                                                       |
| 62  | §9       | 嚴格 CSP、無 eval、不可信文字             | ✅   | strict script self/connect none、無eval，DOM textContent/createTextNode處理title/URL；runtime输入缺另列                             |
| 63  | §9       | README＋設定 data location／export／reset | ❌   | README/options資料位置與真export/reset入口存在；第二次restore救援原raw消失與錯誤隱藏，C3-07 U306                                    |
| 64  | §10      | 多網站→存入→關閉→清單→正確還原 E2E        | ❌   | 4正式真loadedextension E2E全過但save/Undo/restore主流程仍API，只有demo/search/export/settings真UI；真入口與精確內容全閉環不齊，D302 |
| 65  | §10      | 七種特殊分頁逐項實測                      | ❌   | 本輪internal/pinned/duplicate/lasttab真測改善；freshaudio/unsaved受控缺陷，真media未audible、enabledincognito全鏈未驗，正式7項不齊  |
| 66  | §10      | 寫／讀回故障與 Worker 真回收              | ❌   | 真writefail/tagsmismatch留頁及Worker stopped→wake/raw一致通過；raw status錯值仍關頁、中途save/restore/Undo回收未驗，C3-01/11        |
| 67  | §10      | 真瀏覽器重新啟動資料仍在                  | ✅   | 真同profileclose/relaunch後16筆完整原始DB逐位元JSON一致，restart-before-after.json                                                  |
| 68  | §10      | 1000 筆測試                               | ✅   | 真1000已入庫render1000、精確search999結果1、真document捲到底與390可讀，browser-audit；流暢度完整預算另§8保留疑慮                    |
| 69  | §10      | 完整 export/import 與舊版／毀損安全       | ❌   | 合法entry/五項settings普通roundtrip改善；strictrow、遷移備份/讀回、snapshotmismatch與第二次raw丟失尚未安全，C3-01/07/08/09          |
| 70  | §10      | ≥15 有意義單元與核心失敗處理              | ❌   | 35meaningful正式unit及原24探針全過；新增16安全反例全fail尚未入正式回歸，不能按≥15數量宣契約完整                                     |
| 71  | §10      | 工作管理員步驟、前後 MB 與條件            | ⚠️   | 沒有TaskManager存前/後MB、條件與可重現操作嘗試；一行交給使用者仍不完整，D305，未以公式冒充量測                                      |
| 72  | §10      | 獨立 Known Limitations 且誠實             | ❌   | 独立限制文件存在；仍說核心round1已修、pack/tmp及可自動化項轉交、現報告checklist不一致，D307                                         |
| 73  | §11      | 每階段可建置、實測才完成                  | ❌   | 8工程gate過、8舊核心群改善，但新資料安全16/16与UI11/14反例確證不符，不能宣本階段完成                                                |
| 74  | §11      | 清楚的小步 commit                         | ✅   | docs/core/UI/test/tooling五個清楚小步commit，HEAD034d3bf；未push                                                                    |
| 75  | §11      | 嚴格型別、零警告程式檢查                  | ✅   | 根真strict typecheck/lint0/format/unit/build全部pass；4CSS parser零syntaxwarning。正式CSSsyntax gate仍需補，D309                    |
| 76  | §11      | 無未用套件、全部用途與授權                | ⚠️   | 零runtime依賴、devlicense齊、audit0；tinypool不在lock但override及修漏洞文案仍不準確，D308                                           |
| 77  | §12.1    | 可安裝 dist 與 zip                        | ✅   | 真dist載入、npm pack與unzip -t exit0；20 runtimefiles皆zip/dist byte-identical，zip-content-match.json                              |
| 78  | §12.2    | 完整英文 README 可重現                    | ❌   | engine/zip prerequisite/估算公式改善；README仍稱firstrun自動安裝browser、最低Node gate欠真測，D308                                  |
| 79  | §12.3    | 正確英文隱私政策                          | ✅   | 英文local-only Privacy与實際no server/no tracking/localfavicon觀察一致                                                              |
| 80  | §12.4    | 英文商店名稱／描述／截圖清單、不上架      | ✅   | 英文商店名称/短長描述/shot list齊，五權限改正與manifest一致；未部署/上架                                                            |
| 81  | §12.5    | 五份繁中文件                              | ✅   | RESEARCH/DESIGN/DECISIONS/TEST_REPORT/KNOWN_LIMITATIONS五繁中文件存在；内容品質另列                                                 |
| 82  | §12.6    | 只有使用者能親手做的事                    | ❌   | HANDS_ON有日常profile/上架/快捷鍵真user事項；TaskManager沒有詳細步骤，media/incognito未经工具尝试即轉交，D305/307                   |
| 83  | 監工交付 | .gitignore／機密／GitHub 上傳             | ⚠️   | ignore秘密規則合理；資料安全未過故未push，最終historysecret/remote檢查與repo決策留驗收後，不假完成                                  |

## 下一步與外部交付

將本報告與 R301–R324 修正直接交給正確 Memory Expansion 的 Antigravity 對話，確認它開始執行；完成停止後再全面獨立驗收。第 3 輪尚未通過，沒有 push、部署、上架。GitHub 的 .gitignore、全專案／歷史機密、remote/login／repo決策與具體推送同意，待符合驗收後完成準備並依使用者最新授權規則處理。
