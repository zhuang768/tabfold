# 第 6 輪獨立驗收報告

日期：2026-10-12。唯一專案：/Users/zhuangzijin/Desktop/Memory Expansion；分支 feat/tabfold-extension；候選 814d668af8ba3b443d1adeb7ad6b40b6468110f5。Antigravity 明確完成並停止後才驗收，驗收前 Git 乾淨。Codex 未修改產品或正式測試。

## 判定

尚未達成完成條件。原 83 需求切片維持相同 ID／引用／文字：28 通過、23 失敗、32 有疑慮。疑慮包括真正未驗證的情境及 P1 誠實範圍，不等同 32 個程式 bug。已有改善承認通過，不重派以前已修反例；新明確失敗仍需修。

## 真正執行與結果

- 正常 npm ci、format、嚴格 typecheck、lint --max-warnings 0、65 單元、5 真正載入擴充功能的無頭 E2E、build、pack、audit 全 exit 0；單元／E2E 0 失敗、0 略過、E2E 0 flaky/全域 error；audit 0 vulnerabilities。安裝仍有 direct eslint deprecation 及 install-script policy advisory，未隱藏或修改安全設定，不稱完全 0 警告。
- 20 個 runtime 檔案與 ZIP 逐 byte 一致，SHA256 23d42058e64679150c9062948b83a233bd434aaf2f9ad9fb495c015bd2711ca6。第一 ZIP 蒐證誤用 output/ 路徑 exit 9，保留失敗後用實際專案根 ZIP 驗證成功；不是產品打包故障。已凍結 frozen-814d668/dist 與 ZIP。
- 原 15 核心與 12 核心故障、27 UI 與另 10 UI 故障全綠。原真正原型 ID Restore／Undo 兩案例也重跑通過。工程師 15／27 verifier 沒有放寬／刪期望；metadata／輸出／排版 adapter 不等於新的更廣證明。
- 新核心完整 6 checks：1 通過、5 失敗、0 harness error（root schema 四子案為一組）；新 UI 共 47 斷言：41 通過、6 失敗、0 略過、0 harness。初次核心腳本 exit13 未完整 suite、一次子代理平台分類錯誤均留存，不算產品 suite 成敗。
- 真 Chrome：原 restore session 寫失敗＋DB 寫失敗＋CDP 停 Worker／nonce 重置不再重開；原 about:blank 導航不再丟 URL，兩案例通過。真正同 profile 關瀏覽器重啟後 full local strict deepEqual、精確還原標題／內容 19 斷言通過。current／others／window 真 active tab/public API 精確關閉／保留／還原 URL 與標題／內容各 14，合計 42 斷言通過；這是 API scope，不是原生 popup 下拉互動全閉環。
- 新增真 Chrome 寫後 raw root schemaVersion=1.5 的一般 storage 讀回故障：實際來源被關閉、raw 仍1.5、當次觀察回應 pending，5次真變造寫入已行使，0 harness error；保留 root-schema-write-real-result/log。這證明先寫讀回一致再關的違反，不是僅替身；觀察 pending 不單獨證明無限卡住，queue 自等待另有核心替身與靜態鏈證據。URL仍在raw，不誇稱永久URL遺失。
- 真 reset-all 失敗：成功回覆後 session pendingConfirm 仍含來源 URL，重設前 token 仍可關閉來源並復寫 DB；沒有操作日常 Chrome 或重要資料。
- 原生 POPUP context 已確認。普通 380×498、computed font 精確 ×2 的 430×498 可藉真 wheel／14 Tab 觸達控制項；實際 reduced-motion 抽樣 0s。字體壓力不是 browser zoom，不能由 viewport 外的初始 Save 推論無法捲動。Worker Performance domain 不支援是方法界線，已用 Runtime heap／Profiler 代替。
- 真出貨工具列點擊保存／關閉及原生 Saved1/Undo 可見；Task Manager 合成 64MiB 來源 PID50010 96.9MB/CPU0.0，關閉後精確來源名稱篩選 0 行；Library＋Worker 共用 PID50011 38.9→45.0MB。前 AX CPU0.1／稍後 screenshot0.0、後0.0只是瞬時樣本，不是整段零 CPU；空白 child 欄位不加第二次，不推算精確 physical RAM savings。測試 context/server/profile 全清理。
- 1000 項真互動 133 frame intervals／2208ms，p95≈16.8ms、max≈16.8ms、0 long tasks/long frames；精確搜尋只一條正確 URL/title。官方普通 TAB 30樣本 p50 166.83/p95 217.8（6>200）；獨立普通 TAB 30樣本 p50 140.32/p95 203.18（2>200）。保留工程師慢 run 279.28/491.76，不挑漂亮 run。都不是原生 OS click 冷暖 200ms 達標證明。
- 1000 條目下 page ThreadTime Δ0.279343s、Worker 1111 profiler samples 的 sampling/JS/idle categories及獨立 V8 heap 已保存；卸 Worker debugger、40,016ms 無 Worker RPC／無 stopWorker後有真正 Target destroyed/gone 及 stopped snapshot。不是整個 OS CPU／長期 retained heap benchmark，GC 減少 heap 不當作 leak-free 證明。
- 新候選乾淨 Git 副本最低 Node20.19/npm10.8.2、Node22.13/npm10.9.2 均 npm ci exit1 Missing esbuild；改用既存 npm11.16 後兩套 ci＋verify各 65 單元及全部工程檢查通過。官方 runtime SHA 核對，未改系统 Node/npm。README 缺 npm 條件仍失敗。
- 歷史 R4 八份、R5 22份＋補充13份＋最低版本17份，共60個 hash鎖定證據保持原樣。四種高信心機密 pattern 掃 71 tracked files／commit diff 0 hit，不等於證明所有機密不存在；最終交付仍需最後版本掃描與外部推送必要同意。

## 明確主要問題

1. 操作 intent/journal 成功但未存、寫拒絕／讀未知仍被吞而盲目重建；同 URL 又開兩頁。沒有聲稱 URL 永久遺失或要求不可能的共同原子交易。
2. current stored metadata 改回 lenient，合法修改靜默覆掉原始壞值；post-write root schema 缺／0／負／小數仍 normalize 驗過並真關來源，save 再等自己 queue。
3. durable Undo 尚有效，public state/UI 卻無入口；reset 未完整清 local/session/RAM 狀態。
4. Library/Options 初始讀缺 loading、固定可見字串仍未全集中；正式回歸與特殊／batch／retain／匯入救援／中途回收等完整情境未齊。
5. 測報／限制／checklist仍舊效能數字與過度完成宣稱；研究本人評論與設計獎／作者來源不足，最低 npm 安裝条件缺漏。

完整原因、行號、可重現失敗與修法見 core-review-report.md、ui-review-report.md、evidence-review-report.md 及 docs/cursor-correction-round-6.md。所有證據在 output/supervision/round-6/；這份監工報告不代表所有需求通過。

## 原文逐項矩陣

# 第 6 輪同 83 項需求最終矩陣

候選 814d668af8ba3b443d1adeb7ad6b40b6468110f5；ID/reference/原需求字串逐項保持相同，P2只有既選兩項。

✅ 28 / ❌ 23 / ⚠️ 32。是需求切片，不是測試通過率。

| ID  | 原文     | 需求                                      | 狀態 | 本輪實證與界限                                                                                                                                                                                                         |
| --- | -------- | ----------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | §0       | 可安裝可用、保守避免資料遺失、無假功能    | ❌   | 根新真Chrome reset-all保留pendingConfirm URL/舊token可再close及寫庫；C6-03四schema變造子案實際closed1/rawAtClose不符且savePromise pending；工程綠與舊反例修復不能抵銷新安全缺陷。                                      |
| 2   | §0       | 自主決策與階段回報                        | ✅   | 工程師自主完成R5後停碼供監工；root真正派出、獨立驗收與這輪工程結果已確認。                                                                                                                                             |
| 3   | §1       | 全產品英文、字串集中                      | ❌   | UI602/C6-05靜態確證popup546、library430/982/1001/1388–1573及storage489/516–543等固定可見文案仍literal；已有STRINGS常數未用。原HTML/manifest集中修復保留。                                                              |
| 4   | §1       | README／隱私／商店草稿英文                | ✅   | README/PRIVACY/STORE本候選英文；內容準確性與data scope另D605/D607。                                                                                                                                                    |
| 5   | §1       | 研究／設計／決策／測試及回報繁中          | ✅   | 指定RESEARCH/DESIGN/DECISIONS/TEST_REPORT/KNOWN_LIMITATIONS維持繁中；監工回報繁中。                                                                                                                                    |
| 6   | §2–3     | 保存網址／標題／圖示、關閉、再開啟核心    | ❌   | 根正常shipped action/Restore/Undo及原Worker/blank反例已過；C6-03不合法root schema仍關來源、C6-01未知journal讀寫盲重開、reset-all真失敗，完整核心安全未達。                                                             |
| 7   | §4       | 競品、內建節省功能與使用者抱怨調查        | ❌   | D604 RESEARCH19兩精確日期評論只有CWS泛頁，沒有作者/permalink；權限本人評論缺，primary研究來源未完。                                                                                                                    |
| 8   | §4       | 2–3 差異點及選擇理由                      | ✅   | DECISIONS3–7保留三差異點及理由，核心存目前頁解法未換。                                                                                                                                                                 |
| 9   | §4       | MV3、容量、官方最佳實踐查證               | ⚠️   | 官方MV3來源仍存在；本輪真自然idle與newfullrestart已驗，不再列未測；容量仍Round3且RESEARCH以大小證可靠性/讀寫效能來源缺D602。                                                                                           |
| 10  | §5.1     | 收集→寫入→完整讀回→才關、失敗不關         | ❌   | C6-03四子案raw根schema缺失/0/-1/1.5，write後normalize成2通過比較，實際來源closed1且rawAtClose错。新6受控1過5失敗0harness，不能用原15綠宣全raw安全。                                                                    |
| 11  | §5.1     | 批次全成功或逐筆安全、誠實回報            | ⚠️   | 原postclose/partialclose15綠保留；C6-03保存後回應pending有確證但非批次完整範圍，全部公開scope/批次結果仍待，不以單例冒整批實測。                                                                                       |
| 12  | §5.2     | 必要欄位與每筆／DB schema                 | ✅   | 本候選既有types/entries/DB帶schema與id/url/title/favicon/time/source/group/tags/status，結構存在；安全行為另核。                                                                                                       |
| 13  | §5.2     | 版本遷移不弄壞舊資料                      | ⚠️   | R509suffix與遷移舊反例根新15綠；完整legacy/corrupt/import/backend故障與新core報告待，不宣同一原反例未修。                                                                                                              |
| 14  | §5.2     | 毀損不清空、原資料匯出與復原              | ❌   | C6-02 storedcurrent read lenient將revision='7'/stats='123'/BROKEN-THEME修補成正常；合法patch覆寫且原錯metadata在DB/salvage/corrupt皆不可匯出。URL仍留，不誇整庫URL丟失。                                               |
| 15  | §5.3     | storage.local／IDB 容量效能可靠性比較     | ❌   | D602 RESEARCH33–39只歷史Round3容量與定性架構，缺可追溯讀寫效能比較，且體積小推資料安全不成立。                                                                                                                         |
| 16  | §5.3     | 最近 N 快照、設定可還原                   | ⚠️   | 正式backup只至少1與ok；原15受控交易fault改善，設定全raw/跨階段候選核定待D603。                                                                                                                                         |
| 17  | §5.4     | Worker 回收可重建、頂層同步監聽           | ❌   | 根idleStopped/nonce/fullraw及舊postcreate真stopretry均過；另40,016ms無RPC無stopWorker自然targetDestroyed/gone/stopped確證。但C6-01 auxiliary讀寫未知仍當空，freshrealm3案盲重開2頁且普通success，不能完整重建。        |
| 18  | §5.5     | 瀏覽器 API 與純邏輯分開、可獨立測試       | ✅   | 純core/browser API分離不變，正式65 source測試與新受控fault可脫離瀏覽器；不冒mock當Chrome。                                                                                                                             |
| 19  | §5.6     | 最小權限、每項用途                        | ✅   | 五permission/無host、manifest/README用途同；本輪未新增debugger/全站權限。                                                                                                                                              |
| 20  | §5.6     | 未儲存輸入的保守通用提醒與取捨            | ⚠️   | 保守通用提醒/token source與正式APIcase存在；首次真UI提示/取消、所有公開入口未全驗。                                                                                                                                    |
| 21  | P0.1★    | 點圖示一鍵存起、動畫與數量回饋            | ✅   | 根本候選真正Cua Chrome Extensions→Tabfold shippedaction：來源關、精確URL存、nativeSaved1/Undo與LibrarySaved1可見，setup已ack/onboard非首次提醒全驗；普通一鍵入口已實測。                                               |
| 22  | P0.2★    | popup／完整清單，各欄位與圖示             | ⚠️   | popup/list真E2E展示來源與基本欄位；本輪native尺寸/錯誤/大字體/全部圖示完整UI未收到。                                                                                                                                   |
| 23  | P0.3★    | 單筆／全部還原、預設移除設定              | ❌   | 原Restore/Undo與真blank安全改善；C6-01三aux drop/reject/read故障重建同URL created2、移庫普通成功，未知結果協調未可靠。不是永久URLloss或要求無條件exact-once。                                                          |
| 24  | P0.4★    | 可用的限時 Undo                           | ❌   | 原27UI一般Undo期限/用盡全過；新增durable specimen後端可恢復但get-state DB.undo=null，兩surface reopen/Librarysave/toolbar session replay共4個Undo入口應1實0；UI601/C6-04。                                             |
| 25  | P0.5a    | 內部頁略過與提示                          | ✅   | 根新special E2E測extension內頁saved0/skippedBrowserpages；限定內頁代表情境，不冒所有chrome://逐頁已驗。                                                                                                                |
| 26  | P0.5b    | 釘選預設不關閉                            | ⚠️   | 正式pinned API skipped0saved結果已綠；真source仍在/全部入口/fresh狀態全scope待。                                                                                                                                       |
| 27  | P0.5c    | 正在播放音訊／影片前確認                  | ⚠️   | 根5E2E audible權威true必驗/APItoken過，暗else已修；真確認取消UI與逐wrongtoken source/fullraw全部仍未驗，不借原native單Save當媒體流程。                                                                                 |
| 28  | P0.5d    | 未儲存內容提醒                            | ⚠️   | 真token API有測但主流程預先ack/onboarding；首次通用提醒UI取消/記住之真閉環待。                                                                                                                                         |
| 29  | P0.5e    | 重複 URL 偵測與提示                       | ✅   | 根新E2E duplicate saved0/skippedAlreadySaved及既有URL邏輯source，正常去重情境通過。                                                                                                                                    |
| 30  | P0.5f    | 無痕依權限正確處理說明                    | ⚠️   | formal767–776 only isAllowedIncognitoAccess boolean，fallbackfalse也綠；沒有真incognito來源及incognito=true/授權操作，不能稱七類完整。                                                                                 |
| 31  | P0.5g    | 最後一頁不讓視窗意外消失                  | ✅   | 本輪正式Chrome最後來源頁存後原window仍在，原15受控fresh移窗反例亦修復；限定普通最後頁真scope＋移窗控制場景，不稱所有移窗原生故障已測。                                                                                 |
| 32  | P0.6     | current／others／window 三範圍            | ✅   | 根真正候選three-scopes-real current/others/window各14assert/共42pass、errors[]，activeA錨點、保存/關閉/留存精確URL、還原三來源exacttitle/body及各URL1tab；是API契約非nativePopup下拉互動正式全驗。                     |
| 33  | P0.7     | 即時搜尋標題 URL、單筆刪除、二次確認清空  | ⚠️   | Demo搜尋真E2E1/clearfilter復原；單刪/二次confirm清空/鍵盤fault完整UI待，不冒已全完成。                                                                                                                                 |
| 34  | P0.8     | JSON 匯出匯入、重複／錯誤／版本／摘要     | ⚠️   | 格式/schema/重複/unsafe有單元及真prototypeimport，完整DB/settings roundtrip/壞檔UI/摘要全部待D603/D606。                                                                                                               |
| 35  | P0.9     | 移除／scope／dark／backup 設定            | ⚠️   | 本輪正式remove/defaultscope保存reload過、原race27過；Settings初始loading缺UI603已確證映射37，theme/whitelist/全部backup設定完整仍待。                                                                                  |
| 36  | P0.10    | ≤3 步、可跳過、完成後不再出現             | ⚠️   | 正式Skip後hidden/displaynone過但initial visible條件if仍可略；首次complete/reopen/提示error全鏈待。                                                                                                                     |
| 37  | P0.11    | empty/loading/error 全面可用              | ❌   | 原27邊界全修復；新47UI共41過6失敗，durableUndo入口4缺、Library/Settings真deferred初始load hidden/空/no busy各1失敗。Popup初始Loading已過勿重派。                                                                       |
| 38  | P0.11    | 鍵盤操作與足夠對比                        | ⚠️   | 真native computedfont×2的14Tab完整鏈與wheel可觸Save，並非全部不可用；這不是browserzoom，操作後focus/對比/error/全部surface仍未完整核定。                                                                               |
| 39  | P0.11    | 減少動態偏好                              | ✅   | 根新native真正POPUP reducedMotion matches=true、取樣多control transition/animation0s，加source規則與正式CSS检查；不擴成所有動態/所有場景已觀察。                                                                       |
| 40  | P0.11    | 非覆蓋型 demo 按鈕                        | ✅   | 本候選根正式真Demo click/render/search，形狀source保留，合併不覆蓋全部分支另core核。                                                                                                                                   |
| 41  | P1.1     | 可自訂快捷鍵存目前頁                      | ⚠️   | manifest可自訂command與入口source有；真快捷鍵首次/worker醒後/結果回饋未實驗。                                                                                                                                          |
| 42  | P1.2     | 右鍵存起                                  | ⚠️   | 共享context派送保留結果；真current/others右鍵入口、可見部分結果/確認/Undo本輪未驗。                                                                                                                                    |
| 43  | P1.3     | 分組、標籤、整組還原                      | ⚠️   | 分組標籤/整組source與基礎单元；真groupbatch/取消/partialfail/fullorder未全驗。                                                                                                                                         |
| 44  | P1.4     | 白名單永不存起／關閉                      | ⚠️   | whitelist單元保留，全部真入口/fresh保護/並發設定完整未驗。                                                                                                                                                             |
| 45  | P1.5     | 統計與誠實記憶體估計                      | ⚠️   | 50MB估算且lifetime closed/import區分source；root新多操作stats持久完整核定待，不把TaskManager舊快照當估值驗證。                                                                                                         |
| 46  | P1.6     | 原視窗與盡量原順序                        | ⚠️   | sourcewindow/index/fallback實作保留；候選真原window存在/消失/順序所有情境未驗。                                                                                                                                        |
| 47  | P1.7     | 徽章數量及已有項目的圖示                  | ⚠️   | badge與active八PNG存在；本輪真toolbar兩theme/尺寸/多入口與Worker數量尚未量。                                                                                                                                           |
| 48  | P1.8     | 大量還原數量提示與分批選擇                | ⚠️   | 批次mode/取消source、非法mode單元；真大量批次選擇/節奏/中途中斷、分組入口完整未驗。                                                                                                                                    |
| 49  | P2       | 自選 2–3 項與價值成本                     | ✅   | DECISIONS35–39維持Hibernate與URL\|title兩選項與取捨，不要求其他候選P2/sync。                                                                                                                                           |
| 50  | P2       | Hibernate 實際可休眠且保護                | ⚠️   | Hibernate tabs.discard目標source保留；真discarded與active/audio/pinned不同情境本輪未完整實測。                                                                                                                         |
| 51  | P2       | URL｜title 純文字匯入                     | ❌   | D604 URL\|title parser單元存在，但競品精確格式官方或實際匯出仍未可追溯，原文要求自行查證。                                                                                                                             |
| 52  | §7       | 具名擴充／生產力／設計社群參考            | ❌   | D604 DESIGN5–8仍無設計獎站＋作者社群作品案例；官方生產力homepage不自動代社群/獎項。                                                                                                                                    |
| 53  | §7       | 原創風格與 tokens／字體／間距／圖示統一   | ✅   | 既定暖紙/炭tokens、自繪fold8PNG、spacing/type保持原創，無新增主觀風格門檻或抄素材。                                                                                                                                    |
| 54  | §7       | 存入收進、還原展開、清單進出與按鈕動態    | ⚠️   | 舊27假動畫/Restorebusy反例已過；根真actionSaved可見，完整fold/unfold/error/retain/group各動態視覺未全驗。                                                                                                              |
| 55  | §7       | popup 密度、CTA 明確、立即內容            | ⚠️   | 新真POPUP normal380×498；computedfont×2為430×498，首屏Save外但Tab及wheel確可達，不誤判不能用。正常/長錯誤/多資料首屏密度與全部CTA仍未全核。                                                                            |
| 56  | §7       | 16/32/48/128、淺深主題、active 圖示       | ⚠️   | 自繪16/32/48/128＋active檔/manifest齊；兩browsertheme各尺寸本輪真觀察未完成。                                                                                                                                          |
| 57  | §8       | popup 200ms 目標                          | ⚠️   | 根本輪官方口徑TAB30 p50=166.83/p95=217.8六>200；另一獨立TAB30 140.32/203.18兩>200，全raw保留。均非native冷暖OS點擊200ms量測，不能sole判nativefail或達標，文件139/186仍錯。                                             |
| 58  | §8       | 1000 筆搜尋／捲動流暢                     | ✅   | 根814 frozen獨立1000render/精確title+URL搜尋1/50wheel期間133連續frames2208.3ms，p95≈16.8/max16.8/longtask0/longframes0；限定此fixture機器實測，不加固定FPS門檻。                                                       |
| 59  | §8       | 自身 CPU／記憶體量測                      | ✅   | 本輪真自己的pageThreadTimeΔ0.279343s/約1.395s負載窗、WorkerProfiler1111samples、page/Worker前後heap與TaskManager sharedPID38.9→45.0MB/CPU快照已量記錄；非完整峰值CPU benchmark/物理RAM savings，不從GC推retainedleak。 |
| 60  | §8       | 無背景輪詢，事件與必要 alarms             | ✅   | 事件驅動無背景輪詢；根卸Worker debugger後40,016ms無RPC/無stopWorker，targetDestroyed/gone/stopped真自然idle，保留有限範圍正向證據。                                                                                    |
| 61  | §9       | 本機限定、無外連／追蹤／遠端程式碼        | ✅   | root新E2E tracker0及manifestconnectnone/無host，無新遠端code/telemetry依賴，限定已查本產品scope。                                                                                                                      |
| 62  | §9       | 嚴格 CSP、無 eval、不可信文字             | ✅   | strictscriptself/connectnone、build無遠端code，文字textContent既定結構；其他API契約另core/UI核。                                                                                                                       |
| 63  | §9       | README＋設定 data location／export／reset | ❌   | 根reset-session-real真正814公共save→reset-all後session pendingConfirm仍有URL/舊token，retry saved1/closed1/復寫DB；一鍵清全部与狀態失效未達，D605。                                                                    |
| 64  | §10      | 多網站→存入→關閉→清單→正確還原 E2E        | ⚠️   | 本輪5正式UIE2E＋真fullrestart19/三scope42驗保存關閉與Restore精確title/body/各URL1tab，是normal正向完整內容證據；API契約不能冒native三下拉、retain/groupbatch/首次UI等同鏈全部正式覆蓋，D603仍有scope限制。             |
| 65  | §10      | 七種特殊分頁逐項實測                      | ❌   | D603 audio必assert改善；Incognito只是boolean許可查詢，不是真無痕分頁，原必做七種逐項實測仍不齊。                                                                                                                       |
| 66  | §10      | 寫／讀回故障與 Worker 真回收              | ❌   | 原12＋15core/舊trueWorker＋aboutblank綠保留；新C6-03 rawschema四子案實際關來源，C6-01aux一般讀寫故障盲重開，必要fault整體仍fail。三flow全部副作用stage真回收尚不完整。                                                 |
| 67  | §10      | 真瀏覽器重新啟動資料仍在                  | ✅   | 根truefullProfile同candidate/同profile真close+relaunch，full local deepEqual、Restore精確URL/body，19assertpass；自然idle亦另已實測，不能混稱未驗。正式491–494應擴充是suite問題。                                      |
| 68  | §10      | 1000 筆測試                               | ✅   | 根本候選perf-independent-v2明確HEAD、1000列/精確搜尋title+URL1結果/133frames與raw，真正瀏覽器限定fixture通過；非所有native時間預算。                                                                                   |
| 69  | §10      | 完整 export/import 與舊版／毀損安全       | ❌   | D603/D606 formalroundtrip部分entryfields、backup只ok，完整settings/fullDB/舊版/毀損真閉環缺；舊受控交易fault改善保留。                                                                                                 |
| 70  | §10      | ≥15 有意義單元與核心失敗處理              | ❌   | 65正式真unit過；舊options永真/timer/remove<=1已修，不重派；15core/27UI未全部正式化/ignoredoutput不交付，完整必做失敗覆蓋仍欠D606。                                                                                     |
| 71  | §10      | 工作管理員步驟、前後 MB 與條件            | ⚠️   | 根真正新TaskManager sourcePID50010=96.9MB0.0→來源filter0row/真closed；library+Worker共PID50011=38.9(AXCPU0.1/後截圖0.0)→45.0/0.0。不重加PID、不當exactphysicalRAM saving；正式docs仍3ad數字與欠當輪完整方法。          |
| 72  | §10      | 獨立 Known Limitations 且誠實             | ❌   | Known宣全部bug修、139/186雙達標/借3adframe資源；本輪新schema/aux/durableUI/reset/minnpm10fail證明仍有可修缺陷及不實完成範圍，須同期誠實report。                                                                        |
| 73  | §11      | 每階段可建置、實測才完成                  | ❌   | 65/5/工程8gate與舊27core27UI綠是改善；新core6=1過5fail、UI47=41過6fail、真resetfail/研究docsgap，尚不能交付或宣完成。                                                                                                  |
| 74  | §11      | 清楚的小步 commit                         | ⚠️   | 814一個跨20files完整R5commit訊息有意義；清楚但不是原小步最佳形態，無需改寫歷史。                                                                                                                                       |
| 75  | §11      | 嚴格型別、零警告程式檢查                  | ✅   | root新format/type/lint0warnings/build/65unit/5E2E全過，strict保持；install warning另D607而非程序lint錯。                                                                                                               |
| 76  | §11      | 無未用套件、全部用途與授權                | ✅   | 12direct用途/許可證与lock一致，zero runtime/no override/tinypool，root本輪audit0；保已修不再派deaddep。                                                                                                                |
| 77  | §12.1    | 可安裝 dist 與 zip                        | ✅   | root新dist真載Chrome、pack/zip-v2pass、20runtimebyte同，hash23d42058...；firstzip錯路徑是collector非產品。                                                                                                             |
| 78  | §12.2    | 完整英文 README 可重現                    | ❌   | 根新Gitarchive814 Node20.19 bundlednpm10.8.2和22.13 bundled10.9.2 clean ci均exit1 Missingesbuild；npm11.16兩版本ci+verify65過。README只寫npm，最低支援照抄步驟不能安裝，應明定已驗npm或修lock。                        |
| 79  | §12.3    | 正確英文隱私政策                          | ❌   | 新增session說明改善；local持久intent/journal/durableUndo沒完整說明，reset-all真保URL/舊token；privacy保存與刪除範圍欠準確D605，不誤判有外連。                                                                          |
| 80  | §12.4    | 英文商店名稱／描述／截圖清單、不上架      | ✅   | 英文name/short/full/storepermissions/截圖shotlist齊且DO NOT SUBMIT，無自行發布。                                                                                                                                       |
| 81  | §12.5    | 五份繁中文件                              | ✅   | 五指定繁中文檔存在，語言合要求；內容不實另D601–607，不因存在算品質全過。                                                                                                                                               |
| 82  | §12.6    | 只有使用者能親手做的事                    | ❌   | HANDS_ON3仍說以下全無法代理但6已有代理TaskManager；日常使用者複核可列，方法/历史candidate與步驟需清楚D602。                                                                                                            |
| 83  | 監工交付 | .gitignore／機密／GitHub 上傳             | ⚠️   | 新package/lock原SHA核對/ZIPbyte/ignore/71tracked+1.42MBhistory四patterns0準備完成；不是所有機密證明，GitHub可見度/必要push授權/遠端交付仍待。                                                                          |
