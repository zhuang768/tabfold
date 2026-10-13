# 第7輪完整獨立驗收

候選 `847f373916fb69a2ffc20d871832f3f5b60cd890`，工程師 Antigravity IDE；唯一root `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`。原文SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`，已核對原附件一致。R6工程師在正確對話明確停止後，監工才執行；沒有與工程師同時改產品／測試。原P0/global、P1誠實範圍、已選P2兩項未擴充。

**本輪結論：未通過，須第7輪修正。** 工程檢查綠不抵銷獨立重現的唯一備份副本遺失、最新Undo選錯、Save副作用停點與UI競態。所有破壞性測試只用合成資料與拋棄profile，不碰使用者日常Chrome。

需求矩陣83項：36通過、22失敗、25疑慮；精確原ID矩陣見文末；原ID/reference/requirement保持，疑慮不是硬bug。14份修正要求中R714是明示剩餘驗證／限制，沒有把缺證据全報新bug。

## 實際執行結果

| 檢查                       | 通過／失敗／略過                     | 範圍與證據                                                                                                                            |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| clean npm ci               | exit0，0 vulnerabilities             | gates-847f373/ci.log；保留eslint deprecated及npm scripts advisory，不改授權                                                           |
| format/types/lint/build    | 全exit0                              | gates-847f373/results.json及各log；lint0warnings                                                                                      |
| 正式單元                   | 72／0／0                             | 2files；包含一個另證未命中注入的測試，不能據此擴大安全覆蓋                                                                            |
| 正式真MV3 E2E              | 5／0／0，0flaky/errors               | e2e/results-attempt1.json；真headless擴充／獨立profile                                                                                |
| pack/audit                 | exit0，漏洞0                         | zip-verification-attempt2：20runtime逐byte一致，排除4maps；首次collector假設錯已保留                                                  |
| 原核心受控回放＋新反例     | 33／6／0，0harness                   | 共39；不是實機Worker測試                                                                                                              |
| 受控UI                     | 69／13／0，0harness                  | 共82；authority-state採attempt2，前次保留不重複算                                                                                     |
| 真Chrome新核心             | 10／5／0，0harness                   | 3場景15斷言，全部場景有確認反例：backup兩案與A/BUndo；core-real-browser-report-attempt-1                                              |
| 真Chrome補充UI             | 12／4／0，0harness                   | 16；原型2＋原10契約通過、新auxiliary競態4fail；ui-real-review-report                                                                  |
| 真操作非Hibernate          | 24／1／0，0harness                   | 25；fullJSON/XSS/whitelist/edit/group/retain/batchcancel20/Demo/正常backup/legacy；唯一repeat-retain與核心同根                        |
| 真Worker副作用停點         | Save6／3；Restore10／0；Undo10／0    | CDP stopped與fresh nonce成立，來源URL保留；合29，不借ESM或舊HEAD                                                                      |
| 真全profile重啟            | 19／0／0                             | 關Chrome重開同profile，完整local deepEqual＋還原精確title/body                                                                        |
| 真三scope API              | 42／0／0                             | 每種14；不是原生picker UI點擊                                                                                                         |
| 真根schema1.5拒絕          | 5／0／0                              | positive-v2、故障命中1、reply完成saved0/closed0/source保留；oldredoracle NOT_PROVEN保留                                               |
| 真Reset/token撤銷          | PASS                                 | reset-session-real-result；不代表舊飛行回呼全部安全                                                                                   |
| 原碼Reset飛行回呼          | 3／2／0，0harness                    | 5；受控onActionClicked，Reset當下清空，舊回呼重寫session/openPopup；非native事件／非庫URL復活                                         |
| 真未授權無痕               | 13／0／0                             | 原生off-record target、隔離cookie/localStorage、普通Save/Restore不碰private；allowed未驗證未擴權                                      |
| 最低Node新副本             | Node20.19/22.13＋npm11.16 ci/verify0 | Node22.13 bundlednpm10.9.2 ci1 Missingesbuild；乾淨git archive、官方SHA核對；沒有全域設定變更                                         |
| native POPUP／font／motion | 實測，部分限定通過                   | 真POPUP 380×498/3rows ready；temporary14→28px、wheel14Tab可回viewport；reduce8sample0s。非browserzoom/全鍵鏈/對比驗收                 |
| Hibernate                  | 未完成，不判产品pass/fail            | 2headless含disableGPU、1headful在nativeDiscard後ChromeSIGSEGV，0completedassert，失敗及清理全保存                                     |
| 原生TaskManager／工具列    | 未完成                               | 沒有actionclick/來源前後pair；savedAndClosedfalse不是Save失敗。Library39.3MB與tabAX96.5MB不作比較。驗明ownPID62603後退出，profile清理 |

ZIP SHA256 `227b14f5697ebc7d55d9e4972c7d80f6c07ce379232574bd710e08c684eaca7e`；本輪frozen-847f373包含候選dist與ZIP，原件沒有被工程師新編譯覆寫。未上傳GitHub，沒有remote，尚未取得具體目的repo／可見度／推送同意。

## Standards 與 Spec 分開

Standards核心完整來源 `output/supervision/round-7/core-review-report.md`，UI來源 `ui-review-report.md` 及真實補充；固定diff814d668...847f373。全讀核心、UI與相關測試；未變blob按hash和前完整審查沿用，不反覆全文讀。新核心6紅訊號形成5組，飛行Reset新增1組；UI13紅形成authority/generation/status/busy等4組行為問題、固定字串另靜態組；權威問題在工程修正合併，不混算測試斷言成不同bug。Fowler維護建議是判斷，不當原文新需求；沒有要求大改架構。

Spec獨立来源 `evidence-review-report.md` 与原83矩陣。已有三本人來源、官方獎及GoTo作品，保留真改善；剩日期/格式/品牌數值/效能數字/最低npm/清理政策缺精確證據。原文無CI/環境金鑰需要，不新增CI失敗或捏造.env.example。沒發現需要加同步／雲端／全部P2的理由。

## 1,000筆與資源，實測口徑

`perf-independent-attempt1/perf-samples.json` 候選847：1000真entry、搜索精確1結果36.4ms，JSheap2,600,492bytes；普通extensionTAB30個readiness-predicate樣本p50=136.1ms/p95=187.24ms/0>200。不是原生Popup第一handler／OS點擊時鐘，所以原文native200ms目標仍未完整驗證。收集區間共享主機、初始化附近短受控callbackprobe，不稱保證隔離實驗室基線。

連續wheel2.2169s/134rAF，p95=16.7ms/max16.8ms、0longtask，**1個long-animation-frame165.5ms**；不能說整段完全無jank或普遍60FPS。根摘要perf-root-summary保存限制，原raw不改。

`worker-resource-idle-attempt1-method-result.json` 實機officialChrome ownprocess，新847：attached load Page ThreadTime0.249112s/TaskDuration0.247593s；Workerprofile1099samples分類idle1,357,666μs、JS16,299μs等是採樣wall分類，不是OSCPU百分比。heap包含page/Worker及embedder各自數字，不當TaskManagerRAM。detach後40秒真workerTargetGone/naturalStoppedSnapshot，0exception/errors且清理完成。自然stopped不外推所有副作用安全；Save停點仍紅。

## 方法錯誤與資料保護

functional前幾次objectkey序與raw先於RPC完成的collector假失敗均保留；最終attempt5換deepStrictEqual且等待真rpc完成，不刪欄值/array序/產品斷言。native input首次未等待ready保留，attempt2明確ready後取樣；Worker Performance domain不支援記方法限制，不冒充CPU0。Node首次Python extraction API不相容與ZIP初次含map假設錯均當方法錯，不當產品bug。

所有失敗、新嘗試不同路径。舊R6原證据115（113matched＋2由原log按hash恢復）與protected-evidence未改；R7原raw hash清單封存後才交工程師，新engineer output只能output/engineer/round-7/。不改hash掩飾覆寫、不删测／skip／放宽。

機密靜態掃描：reachableGit207blobs/8binary略過，workspace7899檔/read/1059binary與4>10MB略過、6高可信pattern0發現，限制明列；不是證明任意binary/token不存在秘密。gitignore排除.env/node_modules/dist/output/zip/pem/key。0productiondependencies；本輪監工未改產品／正式測試／帳號／model／permissions／fee／日常Chrome。

## 下一步

依 `docs/cursor-correction-round-7.md` R701–R714由Antigravity最小修正，保留已通過與原紅證據；完成後停止產品修改，Codex再整體獨立驗收，不只測修正區域。未核定通過之前不宣告完成／推送／部署／上架。內建goal仍blocked且tool無resume能力，此輪是實際人工監督，未假稱已恢复或在背景运行。

## 原83項需求矩陣

# 第 7 輪需求矩陣（本輪定稿，專案未驗收）

候選：847f373916fb69a2ffc20d871832f3f5b60cd890

draft:false 僅代表本輪已收尾，not accepted。
{"total": 83, "pass": 36, "fail": 22, "uncertain": 25}

| ID  | 原文引用 | 原需求文字                                | 狀態 | 本候選證據                                                                                                                                                                                                             |
| --- | -------- | ----------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | §0       | 可安裝可用、保守避免資料遺失、無假功能    | ❌   | 候選真Chrome三故障複驗皆FAIL（15斷言10過5失敗）；backup drop／回滾拒絕實機無原URL，原文最高資料安全未達。                                                                                                              |
| 2   | §0       | 自主決策與階段回報                        | ✅   | 固定diff847，工程師停碼供root独立驗收；root已真派修正、讀取本輪原碼與保留紅綠證據。                                                                                                                                    |
| 3   | §1       | 全產品英文、字串集中                      | ❌   | UI report確證library491/1043/1062/1268/1499–1522仍固定英文literal（實際Save warning亦如此）；部分STRINGS已真引用，非全數集中。                                                                                         |
| 4   | §1       | README／隱私／商店草稿英文                | ✅   | 本候選README/PRIVACY/STORE完整英文；內容準確性另78/79。                                                                                                                                                                |
| 5   | §1       | 研究／設計／決策／測試及回報繁中          | ✅   | 本候選RESEARCH/DESIGN/DECISIONS/TEST_REPORT/KNOWN與本輪回報繁體中文；歷史引用內容不充動態pass。                                                                                                                        |
| 6   | §2–3     | 保存網址／標題／圖示、關閉、再開啟核心    | ❌   | 正常新保存/精確還原與fullrestart19通過；新普通Restore create0卻remove庫項/虛報opened，backup原URL不可救，核心完整安全未達。                                                                                            |
| 7   | §4       | 競品、內建節省功能與使用者抱怨調查        | ❌   | 三本人評論permalink與Chrome/OneTab官方已補，原缺來源改善；RESEARCH20約2024年中日期無本人頁支持（2026-10-13僅2monthsago），secondary表頭及普遍性仍不準。                                                                |
| 8   | §4       | 2–3 差異點及選擇理由                      | ✅   | DECISIONS3–7三差異與理由保留：current優先、完整先寫讀回才關、本機救援；未擴P2。                                                                                                                                        |
| 9   | §4       | MV3、容量、官方最佳實踐查證               | ⚠️   | MV3/API/容量官方鏈存在；容量仍Round3歷史、RESEARCH42由容量推出可靠性不成立，尚欠同候選準確比較。                                                                                                                       |
| 10  | §5.1     | 收集→寫入→完整讀回→才關、失敗不關         | ✅   | 原12+15+6完整讀回／metadata/schema受控反例新847綠；root-schema-write-real-positive-v2真Chrome注入1.5確有1次變造且回覆save0/close0、來源保留。此項通過不代表mid-save Undo修復。                                         |
| 11  | §5.1     | 批次全成功或逐筆安全、誠實回報            | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 12  | §5.2     | 必要欄位與每筆／DB schema                 | ✅   | 現版必需欄位/root與perrow版本模型明確，strictCurrent讀回與storedbadmeta新原回放均綠；完整恢復另14/17。                                                                                                                 |
| 13  | §5.2     | 版本遷移不弄壞舊資料                      | ✅   | 新847原33核心回放中v1穩定id／競爭／salvage／suffix碰撞等通過；真functional legacy JSON一筆確實遷移為可用穩定v2 identity，rootfullrestart全local一致。範圍按列明病例，不宣所有未來版本相容。                            |
| 14  | §5.2     | 毀損不清空、原資料匯出與復原              | ❌   | 新847真Chrome publicclear單一backup ack/drop＋restore-backup救援drop/read/rollback拒絕後全部原生local無原URL；舊salvage保護原回放已過不可抵銷新失敗。                                                                  |
| 15  | §5.3     | storage.local／IDB 容量效能可靠性比較     | ❌   | RESEARCH36容量歷史有數字、架構選擇有說明；42用小容量宣稱所有queue/journal可靠性已證，且新backup/raw掉落故障反證完整可靠性。                                                                                            |
| 16  | §5.3     | 最近 N 快照、設定可還原                   | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 17  | §5.4     | Worker 回收可重建、頂層同步監聽           | ❌   | root真Worker在Save實际remove後/回覆前stop/nonce新realm，URL留庫但UndoExpired、3/9恢復斷言失敗；Restore/Undo各10/10綠；同步listeners靜態保持。                                                                          |
| 18  | §5.5     | 瀏覽器 API 與純邏輯分開、可獨立測試       | ✅   | core纯邏輯與browser/library、storage分層保持，新正式72unit真執行及替身故障隔離可測。                                                                                                                                   |
| 19  | §5.6     | 最小權限、每項用途                        | ✅   | manifest/README權限列storage/unlimitedStorage/tabs/contextMenus/favicon；無全站host、遠端favicon與runtime第三方服務；容量正當性另15。                                                                                  |
| 20  | §5.6     | 未儲存輸入的保守通用提醒與取捨            | ✅   | 保守通用提醒、token綁定與最小權限取捨明確；新正式special E2E及root初次confirmation/reset流程實際得到提醒；不假稱讀過全站表單。                                                                                         |
| 21  | P0.1★    | 點圖示一鍵存起、動畫與數量回饋            | ⚠️   | 後端action/正常Save有原碼與新5E2E；native-toolbar-memory此次根本未click action，savedAndClosed=false不是產品fail，真正shipped工具列click+即時動畫/數量仍未驗。                                                         |
| 22  | P0.2★    | popup／完整清單，各欄位與圖示             | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 23  | P0.3★    | 單筆／全部還原、預設移除設定              | ❌   | 普通Restore無intent/journal時採無關既有同URL他窗；create0卻opened1、remove1。正常單/多還原已驗，不代表此新契約正確。                                                                                                   |
| 24  | P0.4★    | 可用的限時 Undo                           | ❌   | A/B最後Save B主庫更新失敗、真stopWorker/nonce消失後Undo仍實開A1/B0並消耗較新durable；BURL尚在庫但最後Undo不可用。真mid-save亦UndoExpired/UI權威13fail。                                                                |
| 25  | P0.5a    | 內部頁略過與提示                          | ✅   | 本輪真載入5E2E含內部頁略過錯誤提示，root三scope亦實際保留internal/Library與blank；不借舊候選。                                                                                                                         |
| 26  | P0.5b    | 釘選預設不關閉                            | ✅   | 本輪5真E2E special含pinned skip/resaved0且提示，來源保護邏輯沒擅變；全部特殊模式另65。                                                                                                                                 |
| 27  | P0.5c    | 正在播放音訊／影片前確認                  | ✅   | 新正式5E2E真AudioContext並assert tabs.audible true；無token/錯token/unsaved-only均closed0，有效audio+unsaved確認才close，正常音訊保護已實測。                                                                          |
| 28  | P0.5d    | 未儲存內容提醒                            | ✅   | 新正式special E2E走首次unsaved generic提醒和token失效/綁定，再有效確認才close；不要求新增全站表單讀取權限。                                                                                                            |
| 29  | P0.5e    | 重複 URL 偵測與提示                       | ✅   | 新5正式E2E含重複URL skip/Already saved與不重存；原normalizeURL/hash/路径單元新72綠。                                                                                                                                   |
| 30  | P0.5f    | 無痕依權限正確處理說明                    | ⚠️   | 新847 incognito-denied13真來源/不同context/同源cookie隔離與publicSave/Restore不碰來源全過。未改權限、allowed模式未驗；不以permission布林或denied单模式充整列通過。                                                     |
| 31  | P0.5g    | 最後一頁不讓視窗意外消失                  | ✅   | 新正式E2E真正最後一來源只存後原window保留；core原移窗新回放綠，非僅寫碼。                                                                                                                                              |
| 32  | P0.6     | current／others／window 三範圍            | ✅   | root三真scope新847每14assert=42，實際activeanchor、精確保存/關閉/留存URL與還原title/body皆過；這是publicAPI，非原生下拉UI。                                                                                            |
| 33  | P0.7     | 即時搜尋標題 URL、單筆刪除、二次確認清空  | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 34  | P0.8     | JSON 匯出匯入、重複／錯誤／版本／摘要     | ✅   | 新真functional attempt5實際UI export與file-input JSON import全SavedTab metadata深比較、錯誤匯入不改entries、legacy真遷移通過；dup/version/summary由新72unit及真5E2E/原型實測共同支持。備份破壞性故障另14/69。          |
| 35  | P0.9     | 移除／scope／dark／backup 設定            | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 36  | P0.10    | ≤3 步、可跳過、完成後不再出現             | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 37  | P0.11    | empty/loading/error 全面可用              | ❌   | 原initialloading6真新綠；新Options讀取中Save被guard擋但提示覆蓋後busy永不清，error feedback亦清仍有效durable Undo；完整error/loading未達。                                                                             |
| 38  | P0.11    | 鍵盤操作與足夠對比                        | ⚠️   | 真原生POPUP正常380×498、computedfont×2 430×498，14真Tab/wheel可觸達Save/Search/RestoreAll/Export；非browserzoom/全部surface/themecontrast/readscreen，仍保留未驗範圍。                                                 |
| 39  | P0.11    | 減少動態偏好                              | ✅   | 新847真contextType POPUP下prefers-reduced-motion實際match=true；8代表sample transitions/animation0s；source全域CSS reduce規則與正式E2E存有，非只stylesheet存在。                                                       |
| 40  | P0.11    | 非覆蓋型 demo 按鈕                        | ✅   | Demo為真實本機格式條目與merge非覆蓋；新正式E2E實際按Demo載入並操作搜索，既有原庫保留策略存在。                                                                                                                         |
| 41  | P1.1     | 可自訂快捷鍵存目前頁                      | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 42  | P1.2     | 右鍵存起                                  | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 43  | P1.3     | 分組、標籤、整組還原                      | ✅   | 新真functional實際group filter正確row、Edit dialog持久group/tags、GroupRestore首次真新開來源、retain保留條目均過；再次retain Restore失敗屬共同CORE7B，另23/46，不偽稱所有Restore正常。                                 |
| 44  | P1.4     | 白名單永不存起／關閉                      | ✅   | 新真functional whitelist公共設定接受、來源被略過不關、實際source/library不變三斷言過；不借原碼自稱pass。                                                                                                               |
| 45  | P1.5     | 統計與誠實記憶體估計                      | ❌   | 估計文字清楚標50MB×已關數/非即時、Demo導入數真吻合；但新真repeat-retain Restore create0仍opened1、totalRestored1→2，統計不誠實，與CORE7B同根。                                                                         |
| 46  | P1.6     | 原視窗與盡量原順序                        | ❌   | CORE7B新普通Restore採其他window既有同URL，不新增原窗分頁卻回opened1；原窗index fallback正常設計仍留。                                                                                                                  |
| 47  | P1.7     | 徽章數量及已有項目的圖示                  | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 48  | P1.8     | 大量還原數量提示與分批選擇                | ✅   | 新真functional largeRestore對話前0新頁、真正Cancel後來源/庫不變；再真UI batch20來源exactURLs各一次，20頁確實新開；不是只檢查prompt文字。                                                                               |
| 49  | P2       | 自選 2–3 項與價值成本                     | ✅   | DECISIONS僅選Hibernate、純文字匯入兩P2與成本理由；同步未选，與本機限制相容。                                                                                                                                           |
| 50  | P2       | Hibernate 實際可休眠且保護                | ⚠️   | 新functional2headless（含disableGPU）＋1headful皆nativeDiscard後ChromeSIGSEGV／0assertions；collector未完成全cleanup，不當Hibernatepass或產品bug，root換方法。                                                         |
| 51  | P2       | URL｜title 純文字匯入                     | ❌   | plainURL\|title實作/unit/import新fullrestart正常；RESEARCH30『普遍社群相容』無官方/實際匯出例/本人格式來源，原文要求自行查證仍漏。                                                                                     |
| 52  | §7       | 具名擴充／生產力／設計社群參考            | ✅   | 新RESEARCH26–27具Things3 Apple2017獎官方及GoTo作者Dribbble作品，2026-10-13primary實際查到，學習手法具體；精確Raycasttoken歸因另D703而非全來源欠缺。                                                                    |
| 53  | §7       | 原創風格與 tokens／字體／間距／圖示統一   | ✅   | 現版ownwarm monochrome/tokens/charcoal/focus/自製PNG風格維持，無借圖或臨時重設計；原生可用性需root驗另38/55/56。                                                                                                       |
| 54  | §7       | 存入收進、還原展開、清單進出與按鈕動態    | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 55  | §7       | popup 密度、CTA 明確、立即內容            | ⚠️   | 新真正原生POPUP ready3rows/380×498，×2font時Save/scope仍第一viewport可見、wheel/Tab能達後續；完整first-screen視覺/數量與native互動時間尚未實測，非概括unsupported。                                                    |
| 56  | §7       | 16/32/48/128、淺深主題、active 圖示       | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 57  | §8       | popup 200ms 目標                          | ⚠️   | 新普通TAB30樣本p50=136.1/p95=187.24/max188.79、0>200，限定DOM-ready predicate，非首次event-handler execution或OS工具列nativefirstinteractive；原文目標尚未完整核定，不能單憑TAB宣nativepass。                          |
| 58  | §8       | 1000 筆搜尋／捲動流暢                     | ⚠️   | 新frozen847真1000列表、exactSearch一結果36.4ms、連續2.2169s/134rAF p95 16.7/max16.8ms、0longtask；同窗有1 long-animation-frame165.5ms，不能確證全無jank/完整60FPS或推作native200。                                     |
| 59  | §8       | 自身 CPU／記憶體量測                      | ⚠️   | 新officialChrome實際pageThreadTimeΔ0.249112s/附Debugger負載1.381s、Worker1099採樣與page/workerheap真量值；40秒detach真自然stopped。不是OSCPU百分比/TaskManagerRAM總預算，後者本輪未完成。                              |
| 60  | §8       | 無背景輪詢，事件與必要 alarms             | ✅   | 全入口事件頂層註冊、必要一次popup alarm/短批次等待；無背景setInterval或持續scan，static確證；自然idle動態另17/59。                                                                                                     |
| 61  | §9       | 本機限定、無外連／追蹤／遠端程式碼        | ✅   | manifestlocalstrictconnect，source無remote scripts/telemetry；新5正式E2E外站favicontracker0请求，現版持久來源只在Chromeprofile。                                                                                       |
| 62  | §9       | 嚴格 CSP、無 eval、不可信文字             | ✅   | 严格CSPlocal scripts、無eval；用户title/url通過textContent/URLallowlist，原型id控制與新正式E2E/12原controlled皆過。                                                                                                    |
| 63  | §9       | README＋設定 data location／export／reset | ❌   | 真reset靜止token/owned9/canary全清不關SourcePASS；新受控原onActionClicked callback5斷言3過2fail，publicreset完成local/session{}後舊set重建lastSaveResult/lastSaveAt並開Popup。非庫URL復活/非原生事件，但全清承諾未達。 |
| 64  | §10      | 多網站→存入→關閉→清單→正確還原 E2E        | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 65  | §10      | 七種特殊分頁逐項實測                      | ⚠️   | 新正式5E2E實測internal/pinned/audible/unsaved/duplicates/last-window；新真deniedincognito13也過。允許無痕、首次取消/完整UI確認模式未驗；不宣全部七種類型所有模式通過。                                                 |
| 66  | §10      | 寫／讀回故障與 Worker 真回收              | ❌   | 真root1.5讀回source保留PASS；原多故障新回放green；真mid-effect Save6/9、Restore/Undo各10/10，Save剛實際關來源却UndoExpired仍未完整Worker恢復。                                                                         |
| 67  | §10      | 真瀏覽器重新啟動資料仍在                  | ✅   | 新full-profile-restart-real-result actual Chrome close/relaunch、完整localdeepEqual與2來源exacttitle/body19assert過；metadatamethod舊文字需root修collection標籤但runner/frozen847真绑定。                              |
| 68  | §10      | 1000 筆測試                               | ✅   | 新root frozen847 independent1000實際render1000/exactSearch1/30TAB readiness/134連續rAF與heap資料齊全，並worker-resource1000加載真測；流暢性限制另58/59。                                                               |
| 69  | §10      | 完整 export/import 與舊版／毀損安全       | ❌   | 新真Chrome兩備份raw副本遺失已實證；正常JSON/legacy匯入/原回放通過，不充完整破壞性操作安全通過。                                                                                                                        |
| 70  | §10      | ≥15 有意義單元與核心失敗處理              | ❌   | root新72正式unit全部pass且大量有意義；但新R603fixture前置ack未完導致DBsets0，schemafault從未注入卻綠；需正控制/實際故障訊號保護，不刪舊tests。                                                                         |
| 71  | §10      | 工作管理員步驟、前後 MB 與條件            | ⚠️   | 本候選TaskManager只Library39.3MB/PID62623、Tab AX96.5MB非來源工作row對照；未取得有效sourcebefore/after，未click action且cleanup完成。原文要求同條件前後MB尚未驗，不借Round5。                                          |
| 72  | §10      | 獨立 Known Limitations 且誠實             | ❌   | Known3宣全部可修bug已完對新core6/UI13失败不實；9–10舊133frames/139186達標與currentraw不符、11permission布林過稱真incognito、7pack/tmp誤述。                                                                            |
| 73  | §11      | 每階段可建置、實測才完成                  | ❌   | 本輪全部正式工程gates/E2E綠有實證，但產品新安全/Undo/UI故障與舊分數自稱完成不符；不得依build通過即stage完成。                                                                                                          |
| 74  | §11      | 清楚的小步 commit                         | ⚠️   | 現候選847需新實測或全面靜態證據；不借舊814通過或失敗。                                                                                                                                                                 |
| 75  | §11      | 嚴格型別、零警告程式檢查                  | ✅   | root847normalci後format/types/lint/build exit0、72unit/5E2E0fail/skip；strict/noUnchecked/noUnused保持，程序warning0不混作installwarning0。                                                                            |
| 76  | §11      | 無未用套件、全部用途與授權                | ✅   | 12開發dep0production/nooverride；lock240root+239有完整license/resolvednpmregistry且rootdevmatched。rootaudit0；installdeprecateddirecteslint/allowScriptsnotice保留，非runtime漏洞通過證明。                           |
| 77  | §12.1    | 可安裝 dist 與 zip                        | ✅   | 新frozen847所有20runtimeZIP逐bytes同dist、4*.map明確排除；ZIPsha227b14f5…；20runtime/21entry目錄不誤當丢文件，Windowspack分支未測。                                                                                    |
| 78  | §12.2    | 完整英文 README 可重現                    | ❌   | README7推薦npm>=10.9.2，本候選新Node22.13/git archive clean ci確實exit1 Missing esbuild；Node22.13/npm11.16與新Node20.19/npm11.16各ci＋verify72綠。最低npm宣稱仍與TESTREPORT90矛盾。Node20 bundled npm10本輪未跑。     |
| 79  | §12.3    | 正確英文隱私政策                          | ❌   | Privacy25–27持久/session分區已補，靜止reset真過；但新受控reset完成後舊callback重建session/status並openPopup，與27/README83『all owned records purged』承諾不符。不是宣稱原庫URL被復活。                                |
| 80  | §12.4    | 英文商店名稱／描述／截圖清單、不上架      | ✅   | STORE35行英文名稱/短長描述/權限/screenshots清單是draft未上架；未要求實际store發布或收费。                                                                                                                              |
| 81  | §12.5    | 五份繁中文件                              | ✅   | RESEARCH/DESIGN/DECISIONS/TEST_REPORT/KNOWN五繁中文件都有本候選交付；精確內容缺陷另7/15/72/73，不將存在寫作內容全正確。                                                                                                |
| 82  | §12.6    | 只有使用者能親手做的事                    | ❌   | HANDS_ON_ONLY3/6把TaskManager概括稱代理無法代劳，與root已證明可ownprofile實际AX/操作矛盾；可保留日常profile個人體驗/上架決策限定，不能拖回给使用者測所有必要項。                                                       |
| 83  | 監工交付 | .gitignore／機密／GitHub 上傳             | ⚠️   | .gitignore/privatefile防誤commit靜態良好；secret整workspace/207historyblob6模式0發现但binary/large略過；remote空尚無GitHub交付，未push/改變auth。                                                                      |
