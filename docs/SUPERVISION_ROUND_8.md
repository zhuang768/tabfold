# Tabfold 第 8 輪獨立驗收

**尚未通過驗收。83 項原始需求切片：52 通過、16 失敗、15 有疑慮。** 本輪另確證 5 組產品問題及 5 組文件／證據問題；已改善的前輪功能保留。這是驗收結果，不是工程師自述。

## 候選、需求與邊界

- 唯一專案 `/Users/zhuangzijin/Desktop/Memory Expansion`，分支 `feat/tabfold-extension`。
- 候選 `56e5fa121858b0a1d4ec57f3e1cce4d274b365a4`；固定比較 `847f373916fb69a2ffc20d871832f3f5b60cd890...56e5fa1`。
- 原始附件與 `docs/original-requirements.md` 逐位元相同，SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`。
- 83 個 ID/reference/requirement 與前輪原表完全相同。P0／全域門檻必做；P1 依原文盡量且誠實；P2 僅既選 Hibernate、URL|title。沒有新增 CI、雲端、同步或 `.env` 需求。
- 開始時 Antigravity 正確 `Memory Expansion — Review`／`Tabfold 功能開發修正與優化` 無 Cancel、無佇列，Git tracked 乾淨，候選已完成兩筆提交。監工才開始執行，沒有同時修改工程師產品檔案。
- 根代理保管工程／真瀏覽器／原生／效能驗證；三個既有唯讀代理分別檢查核心、UI、規格文件，彼此不重複改檔。產品程式與正式測試均未由監工改寫。

完整矩陣與原始證據在本機 `output/supervision/round-8/requirements-matrix.json`／`.md`、`counts.json`、`candidate.json`、`candidate.diff`、各 runner/raw/log。保留所有失敗方法，不覆寫舊檔。

## 實際工程檢查

Node `26.3.0`／npm `11.16.0`。以 `git archive` 的隔離完整候選安裝依賴，避免動到其他代理正在使用的 live node_modules。

| 檢查                         | 實際結果                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| clean `npm ci --no-fund`     | exit0；165 installed／166 audited／0 vulnerabilities                |
| format / strict types / lint | 全 exit0，lint `--max-warnings 0`                                   |
| 正式 unit                    | **81 通過、0 失敗、0 略過／todo**                                   |
| build                        | exit0                                                               |
| 真載入擴充功能正式 E2E       | **5 通過、0 失敗／略過／flaky**；約8.664秒                          |
| pack                         | exit0；20 runtime 檔案與 dist 位元組完全相同，4 maps 按既有規則排除 |
| audit                        | exit0，0 vulnerabilities                                            |

**安裝仍有警示**：直接 eslint9.39.5 deprecated；npm allowScripts 的3個安裝script advisory。完整日誌保留，沒有全域approve或隱藏警示。這些與 lint zero-warning 分開，不能宣稱所有安裝環境零警示。

ZIP SHA256 `5060c2d721322ee96abbc0b7cf96d31f6b59746cc04a474eecfca892b6cd837e`。本輪測試凍結 `frozen-56e5fa1/dist`／ZIP／ownership manifest。建置可安裝不代表資料安全驗收通過。

## Standards：核心／UI 邏輯與安全

完整報告 `core-review-report-attempt-1.md`、`ui-review-report.md`；硬違規與 Fowler 啟發式分開。沒有為風格擴大重構。

| 獨立範圍             | 通過／失敗／疑慮 | 方法                                                        |
| -------------------- | ---------------- | ----------------------------------------------------------- |
| 原39核心＋Reset安全6 | **45／0**        | 真原碼、隔離 storage/tabs 替身；合法 Reset 等候與新操作控制 |
| 新核心4組            | **0／4**         | 原碼受控反例；備份組有 clear/restore 兩子情境               |
| 新核心真Chrome2案例  | **6／4 斷言**    | 2案例均確證失敗，0harness／skip                             |
| 原核心真Chrome3案例  | **15／0**        | 最新B／實際Worker停止；backup故障安全提前中止               |
| 原82 UI              | **82／0**        | 真前端程式、現候選實際後端 fixture                          |
| 新UI14條件           | **11／1／2**     | Library retry失敗；另2cache策略僅疑慮                       |
| 原16＋新5真UI Chrome | **20／1**        | 新Library RPC轉送前拒絕，durable真未消耗                    |

不同層的斷言不合併冒充正式 unit 數量。所有代理及根自有 contexts/profile/server 清理成功；錯誤與方法限制照實列出。

### 確證五組新產品問題

1. **備份內容損毀仍被接受**：`storage.ts:497–503,561–568` 只匹配id。真Chrome snapshot同id但entries被清，public clear真回成功，獨立完整native local不再含唯一原URL。restore的salvage拒絕＋同id損毀backup也有原碼反例。需完整救援讀回驗證。
2. **pending Save未知讀錯被當作已關**：`library.ts:473–487`。來源真仍在受控tabs，get暫時throw卻重建Undo，重開來源並刪庫。只是受控API故障，不冒稱自然Chrome事件；需closed/open/unknown分清。
3. **partial durable Undo失敗項不能重試**：`library.ts:1578–1587,1599–1607`。真Chrome Save(window)關A/B，Undo開A／B primary+fallback暫拒兩次；撤故障仍在原TTL內卻expired。B URL仍留庫，不能說全資料遺失。
4. **舊Reset cleanup刪新Save結果**：`library.ts:2111–2121`。舊cleanup暫停→Reset真完成→新Save真成功並發表→舊cleanup釋放，刪新lastSaveResult/lastSaveAt；URL/durable尚在。需正確操作所有權或序列化，保留已過的原Reset6條。
5. **Library Undo transport拒絕後入口消失**：`list.ts:92–100`。真Chrome有效durable-only仍在、後端未消耗，doUndo先清cache且失敗不reload，入口1→0。錯誤可見仍無法重試；Popup同情境保留，僅最小修Library。

源／行號／影響／精確修正與正反控制見 `docs/cursor-correction-round-8.md` R801–R805。新問題不是重派前輪已修好的缺id讀回、最新B選擇或普通sameURL Restore。

## 真擴充功能整合與恢復

下列全部為本候選重新執行，沒有借工程師自報或前輪通過。

| 流程                                                                                                                     | 結果／限制                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker native remove/create已生效但continuation被hold，再停確切Worker                                                    | Save／Restore／Undo 各10，**30/30**；stopped事件與fresh nonce確證；不宣稱所有指令邊界                                                                                   |
| 完整browser關閉、同profile重啟、完整native local深比、精確還原title/body                                                 | **19/19**                                                                                                                                                               |
| 三種public Save scope                                                                                                    | **42/42**；是API scope，非原生picker全流程                                                                                                                              |
| schema1.5寫入替換讀回故障                                                                                                | **5/5**；注入確實命中，source不關，非未到達的假測試                                                                                                                     |
| 原Reset／撤銷舊confirmation                                                                                              | PASS；全local/session清理，原source保持開啟，無secret canary殘留；與新交錯反例分開                                                                                      |
| JSON完整往返、文字XSS、whitelist、group／retain／ordinary重複Restore、batch取消/20頁、demo、clear/backup、legacy/corrupt | **25/25**；真正DOM/公開API及精確結果                                                                                                                                    |
| 真default-denied incognito來源及regular操作不觸private來源                                                               | **13/13**；allowed mode未調權限、未驗                                                                                                                                   |
| Hibernate                                                                                                                | **7/7**；直接officialChrome/CDP，真Refresh與真DOM Hibernate；source原target未attach，native discarded=true、原ID/window/index/count/URL保留，激活真精確內容；非OS click |
| 原最新A/B與備份安全回歸                                                                                                  | **15/15**；最新B post-close DB故障、durable新B與DB舊A、真停Worker後Undo開B；backup ack-drop允安全提前中止且原raw留存                                                    |

正式 E2E 已有自動化主流程。原文要求的實測可由上述可追溯診斷支持，不自行增設「全部監工探針必搬入正式E2E」門檻；但新增確證缺陷必補必要正式回歸，交付要有可重現方式。

## 原生 UI、效能與資源

- 真native工具列Save、真正POPUP的成功提示與library native Restore已操作；原始AX／PNG與native raw保留。
- native POPUP尺寸380×498、14px；臨時computed-font×2、reduced-motion與有限CDP鍵盤壓力按前輪同法重新驗。不是瀏覽器200%zoom、完整原生鍵盤鏈／所有對比／每種大字體驗收。Worker Performance domain不可用的API錯誤是方法限制，不隱藏成執行正常。
- **原Chrome工作管理員有效前後配對**：自建64MiB source PID71148為95.2MB/CPU0.0，真nativeSave後該來源程序消失；同Library PID71104由43.9→46.4MB/CPU0.0。不得宣稱全瀏覽器精確省95.2MB或每種網站都一樣。前兩次與第三次初始前測因監工多按Enter在已非同步開啟TaskManager後作用於selected process，終止自有來源；失敗完整保存，不判產品bug。有效方法只執行選單、重新bind新視窗，沒有額外Enter。測完全關自有資源。
- **1000筆**：完整render1000、搜尋精確1；search23.06ms、JS heap2,596,804B；133連續rAF，觀測期間無longtask/long-animation-frame。只支持這段條件，不是全情境60FPS保證。
- **普通TAB 30樣本**：DOM-ready p50 133.08/p95 188.1，0>200；不是native-popup第一事件處理。
- **真native POPUP首個Search handler**：3/1000筆各10個連續API開啟樣本，20次真handler精確篩1、完整nativeDB不變。3筆 p50≈31/p95330.6（1>200）；1000筆p50393.4/p95533.1（5>200）。ChromeAPI本身部分≈280–299ms；API開始→觀察可操作後handler完成的上界包含target discovery/attach與5ms觀察，非OS click與精準init計時。功能PASS不代表200ms全部通過，也沒有新增every-cold硬門檻。方法attempt1假設5行cap、attempt2未正規seed比較皆保存，最後attempt3用全部n行及完整actual before/after深比。
- **自然Worker**：停止debugger後40s真targetgone與stopped snapshot；consoleExceptions／errors空。附load samplingCPU／thread metrics／heap，不將其替代OS百分比／全程序RAM。

剩餘原生first-use/audio確認取消、keyboard／context-menu、完整大字體與對比、allowed-incognito等未被本輪方法證實者一律未驗證。可安全代理的測量繼續處理，不推為「只有使用者能做」；安全權限變動仍需必要同意。

收尾另有不同條件 `native-popup-first-interaction-attempt4-result.json`：Widget間隔500ms、3/1000筆各10次，真Search/nativePOPUP與完整DB均通過；3筆p50 309.4/p95 324.3（10>200），1000筆p50 454.7/p95 499.6（10>200）。這不是替換前20樣本；兩組都保留，不能選較好數字宣稱200ms通過。仍屬API開啟＋觀測＋首handler上界，非OS點擊。

## Spec：83需求與文件

原83矩陣 **52✅／16❌／15⚠️**，參見 `requirements-matrix.md`。完整Spec報告 `evidence-review-report.md`；不以Standards計數代替需求計數。

文件五組問題：效能與候選數據錯配及因果過度宣稱；研究日期／格式／精確品牌token來源；npm支援與失敗原因／warning誤述；測試完成／coverage聲稱超出實測；session生命週期與可代理量測範圍不精確。具體檔案行號與最小修法 R806–R810。保持英文產品／README／Privacy／Store，指定研究／設計／決策／測試／限制文件繁體中文。

## 保護與交付狀態

- 舊R7鎖定610檔案全部SHA匹配，**610未變／0變更**。新所有歷史方法分attempt保留；不改期望迎合不安全寫入，也不把timeout當成功。
- Git全歷史227唯一blob以5類常見secret模式掃描，0命中、不輸出秘密值。模式掃描不能證明所有編碼機密皆不存在；最終外部推送前仍核對整個交付範圍。
- `.gitignore`覆蓋node_modules/dist/output/ZIP/.env/key；沒有remote，也未建立／推送／發布。只有通過完整驗收後才準備具體repo／可見度／必要同意。
- 內建持續目標仍是平台blocked，工具無resume；沒有把阻塞狀態假改完成。安全本機監督照常進行，沒有重啟排程、付費服務、帳號／模型／訂閱／權限或背景無限重試。
- 本輪完成後直接交辦第8輪修正並確認正確Antigravity開始。超過8輪依使用者最新指示繼續所有安全工作，不能僅因輪數停止；未達完成定義不宣告完成。
