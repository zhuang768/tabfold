# Tabfold 第 9 輪完整獨立驗收

2026-10-13，唯一根目錄 `/Users/zhuangzijin/Desktop/Memory Expansion`，`feat/tabfold-extension`。候選 `a5c6e059172d5a57a12e3f19802d43bf00f95b3b`，比較基準 `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`。工程師完成第8輪並停止、tracked/untracked乾淨後開始，沒有借自報當通過。監工只寫QA/output及本監工文件，沒有取代工程師實作產品。

唯一原文附件與 `docs/original-requirements.md` 位元SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`。83個ID/reference/requirement維持不變，P0/global全必做、P1盡量誠實、P2只Hibernate與URL|title，沒有加sync、全部候選、CI、.env或所有QA必搬E2E的新門檻。

**結果：83項63✅／10❌／10⚠️；尚未驗收通過。** 完整矩陣 `output/supervision/round-9/requirements-matrix.md/json`、`counts.json`。需求切片與缺陷根因、不同測試層的斷言不混計。

## 工程檢查：本候選真隔離執行

精確git archive `output/supervision/round-9/source-a5c6e05/` 自己clean ci；Node26.3.0/npm11.16.0。原專案node_modules與dist沒有被QA安裝/build覆蓋。

| 檢查 | 實際結果 |
| --- | --- |
| clean npm ci | exit0，165 installed/audit166、0vulnerabilities；直接eslint9.39.5 deprecated與3 allowScripts advisory照實保留 |
| format/types/lint | 全exit0；lint零warning，與安裝提示分開 |
| formal unit | 87/87，0失敗／skip／todo |
| build/pack | 全exit0；ZIP20 runtime檔與frozen dist逐檔位元相同，4maps按原規則不包 |
| npm audit | exit0，0vulnerabilities |
| formal extension E2E | 5/5，0失敗／skip／flaky，11.664s；真正載入擴充的隔離無頭Chrome |

全部命令/日誌 `gates-attempt1.json`／各gate-attempt1.log／`formal-e2e-attempt1.json`，不是工程師自報。凍結 `frozen-a5c6e05/dist`／ZIP／ownership.json；ZIP SHA256 `43f4b0e885d6e11345fc950c7adf570ded7fd3d70716310a9ed6edea8df662b2`。安裝warning沒有approve-scripts／全域更動或隱藏。

## Standards：核心、UI與真恢復

三個平行唯讀分區沿用 code-review／ai-debt-detector／diagnosing-bugs／UI可及性規格；根負責engine/gates/其餘真流程及原生操作。全相關diff與上下文已讀，未改動源碼以hash同源確認既有全檔覆蓋，沒有不停重讀相同全文。Fowler維護性啟發式與具體安全失敗分開。

| 範圍 | 本輪新候選结果 |
| --- | --- |
| 原核心39＋Reset6＋第8輪新4 | 49/49，全目的保留；序列化Reset用合法pending/release/complete/newSave adapter，不等已移除停點 |
| 本輪新核心2 | 0/2，兩個受控原碼確證，0skip/harness；不是新真Chrome自然故障 |
| 第8輪真Chrome focused2案例 | 10/10；wrong-content備份安全中止，partialUndo原TTL內重試成功且不重開已成功項 |
| 受控UI96 | 94通過＋2舊cache策略疑慮，0confirmed UI bug/skip/harness；不能因read失敗就推論Undo已被刪 |
| 真UI Chrome | 去重27/27：原21＋真正撤fault Retry4＋原期限2；第1次未commit tabs.create.url作fixture期望的方法誤差完整保留，attempt2用原保存URL及plannedURL作基準 |
| 原真core3案例 | 15/15；postclose故障最新B、真正Worker停與freshrealm、ack-drop備份安全提前中止 |
| native effects已完成、continuation held時停Worker | Save/Restore/Undo各10＝30/30；真stopped事件/freshnonce/精確source，非全部指令邊界保證 |
| 全profile關閉重啟 | 19/19；完整native local深比、還原原title/body |
| 三種public scope | 42/42；API scope，未冒稱所有native picker確認/取消 |
| schema1.5實際寫讀回故障 | 5/5，注入真命中且source不關 |
| 原Reset/舊token撤銷 | PASS，全local/session清、原source仍開；與本輪first-await交錯反例分開 |
| 真functional UI/API | 25/25：完整JSON往返/文字XSS/white list/groups/retain/ordinary重复restore/batch取消及20頁/demo/clearbackup/legacycorrupt |
| 真default-denied incognito | 13/13；實際private來源不可query、regular操作不碰，符合現權限契約；allowed mode未調權限、未測 |
| 真Hibernate | 7/7；direct officialChrome/nativeCDP、source原target未attach、真Refresh及DOMclick、discarded=true/ID/window/index/count/URL保留、activate精確內容 |

完整 `core-review-report-attempt-1.md`、`ui-review-report.md`、root各同名runner/result/log，所有自己context/profile/server清理成功。formal suite與diagnostic分列；新確證bug需最小必要正式回歸，可追溯診斷亦可支持原文實測，不自行要求整個巨大QA框架移入E2E。

兩個新缺陷：

1. `library.ts:2162–2169` 第一個setPopup await返回後沒有epoch檢查，Reset真完成/localsession空之後舊action繼續saveTabs重建舊URL/title/token確認。source仍開、主庫沒有URL復活，精確影響是舊確認狀態復活。修producer入口，保留publicationqueue。
2. `storage.ts:494–506,538–551,567–578` 完整next讀回只看新snapshot/currentRaw。兩份應保留歷史（低於MAX5）被drop，clear/restore仍成功，唯一旧歷史URL/corrupt raw全local丟。須整list/metadata/raw讀回與已丟歷史的有限安全救援。

證據 `core-new-boundaries-attempt-1-results.json`，51受控49/2、0skip/harness。正式R804 `core.test.ts:2475–2499` 不等session publication停點到達，Reset可先令epoch失效，使全綠卻未測其標題競態；是必要coverage缺口，不多算第3產品bug。具体修法與回歸R901–R903。

## 原生UI、效能與資源：真實方法與範圍

- 短暫sole owned Chrome153.0.8010.12原生CUA工具列Save→真POPUP提示→Library原生Restore→exactsource內容→再Save成功。TaskManager非同步選單開啟只點選後重新bind，沒有多按Enter／終止工作。AX/PNG/observerraw完整保存。
- `native-memory-valid-summary.json`：64MiB synthetic sourcePID77535 96.5MB/CPU0.0→真Save後該PID消失；LibraryPID77538 39.6→46.2MB/CPU0.0→0.0。僅Library row、Worker共PID沒有本次來源；非全browser等額節省／各網站分布／長期OSCPU。前後raw讀值與工具剛開時稍有自然更新，以保存AX為準。
- `native-confirmation-summary.json` **13/13**，native CUA實際操作與完整獨立API觀察配對：unsaved Cancel不關不存；Next/Next/Getstarted走3步後持久完成，後續Popup不再引導；unsaved OK才存閉。真nativeStart音訊，tabs.audible=true，mediaCancel source仍audible且entries/stats不变；OK才存閉。真正網頁右鍵Save／Alt+Shift+S存起，再Popup原生鍵盤Search/TabfocusRestore/Enter開exactURL且移除原項。Skip與全部keyboard／scope仍未因此全驗。
- Native POPUP原法臨時computedfont×2、有限CDP Tab鏈及reducedmotion已重跑；不是browser200%zoom、完整原生可及性/全部對比驗證。Worker Performance domain unsupported保留方法錯誤，不當產品runtime錯誤、也不隱藏。
- 1000筆render1000/searchexact1，search33.46ms、scroll27.17ms、heap2,596,851B、133連續rAF，觀察期無longtask/longframe。不是各情境FPS保証。
- 普通TAB readiness30：p50131.48/p95169.66、0>200；predicate檢scope/rows/loading，不是首handler/nativeBubble。
- 真nativePOPUP首Search handler20：3rows p5042.8/p95294.8/1>200，1000 p50141.4/p95471.8/2>200；native context与完整before/after DB都正確。API起點→發現/attach/5ms觀測→首handler完成是上界，不是精確init或OSpointerclock，不能宣原200目標全面通過／任意扣300ms。原目標也不是任何cold必≤200硬門檻。
- `worker-resource-idle-attempt1-method-result.json`：detach debugger後40s，真targetgone／destroyed／naturalstopped，errors/consoleExceptions空，附CPU sampling/load/heap。這不是OS CPU百分比或全RSS。

全部owned資源已關，不操作日常Chrome、設定、帳號、模型、訂閱、費用或安全權限。方法research-r8只舊56 instrumentedclone，不借為本候選acceptance／Chrome300ms根因。

## Spec與文件、保護與下一步

Spec最終報告 `evidence-review-report.md` 及83 matrix：63/10/10。文件三組：候選/clock/數據／完成claim错配；OneTab pipe實例無可追溯來源；12秒有效性誤稱10秒及當刻物理清除、journal/confirmation保留與realm queue位置錯。具體R904–R906，不重派已修npm原因/研究日期/來源分類/自定tokens，不重設計UI。

- 舊R8 sealed323全SHA未變，0changes；旧R7保護鏈保留，沒有改歷史紅／鎖值。
- 本輪全Git歷史245unique blobs／workspace78檔五種常見secret模式0命中，不打印secret內容；限模式，非所有編碼機密絕對保證。`.gitignore`保護env/key/NMs/dist/output/ZIP，remoteNames=[]，未建立／推送／部署／上架。
- 新raw／失敗方法／對照source與ZIP將按evidence-lock保護。兩份本輪監工docs納入工程師commit且保留原文。沒有所有工程/原文/完整清輪前不宣完成。
- 已超8輪依最新要求繼續可安全工作，不因輪數停止。內建goal平台仍blocked、工具無resume，安全人工監督不依賴它；沒有自建排程／背景無限重試。

下一步直接在正確 `Memory Expansion — Review` 的 `Tabfold 功能開發修正與優化` 對話交辦【第9輪修正】，確認實際開始；工程師停止後再完整獨立驗收。
