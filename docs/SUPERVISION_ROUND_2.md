# Tabfold 第 2 輪獨立驗收

驗收日期：2026-10-07（Asia/Taipei）。候選 HEAD：`5ce362c7eb6eb304d8542d91ee6ec32e47e58f96`，分支 `feat/tabfold-extension`。

**未通過，交付 Cursor 第 2 輪修正 R201–R220（20 組缺陷與證據缺口）。** 8 項工程檢查通過；原文83項驗收切片：20通過／40失敗／23有疑慮。獨立核心24個隔離斷言8通過16失敗。這些數字使用不同分母，不能混稱需求完成率。P0/全域必做，P1依原文盡量完成，P2只驗原選Hibernate與URL｜title。

唯一原文 `docs/original-requirements.md` 和附件逐位元一致。Cursor 01:07回報「已停止修改」後才驗收，確認正確 Memory Expansion／Tabfold extension development 視窗。根與三個審查代理完整重讀 core/browser/types、所有UI/HTML/CSS/strings/manifest、全部unit/E2E/toolchain/scripts及文件，Codex沒有代寫產品功能，只新增監工文件／ignored蒐證腳本。測試均獨立暫存profile與本機fixture，不動日常資料或帳號。

## 實際執行

| 指令／檢查                                     | 結果                                                                                    | 證據（output/supervision/round-2）                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| npm ci                                         | exit0，165 packages、audit0；eslint deprecated及allow-scripts提示保留，未擴大script授權 | install.log                                                              |
| npm run verify 的 format/types/lint/test/build | 五項exit0，lint零warning、27 unit通過                                                   | verify.log                                                               |
| npm run test:e2e                               | exit0、3案通過、10.2秒；不等於完整核心驗收                                              | existing-e2e.log                                                         |
| npm run pack、unzip -t                         | exit0、zip完整性成功，dist已真正載入                                                    | pack.log                                                                 |
| npm audit --json                               | exit0、0 vulnerabilities                                                                | dependency-audit.json                                                    |
| node --import tsx …/core-review.mjs            | exit1：16斷言6過10失敗，非腳本解析錯                                                    | core-review.log                                                          |
| node --import tsx …/core-additional.mjs        | exit1：8斷言2過6失敗                                                                    | core-additional.log                                                      |
| node …/browser-audit.mjs                       | exit0，含成功與已確證失敗，不當產品通過                                                 | browser-audit-results.json/log                                           |
| node …/perf-ready-audit.mjs                    | exit0，30個ready樣本及獨立nativepopup嘗試，範圍界限保留                                 | perf-ready-audit.json/log                                                |
| 純CSS parser／scope／對比                      | CSS warning、空scope確證；10組主要文字對比最小4.620:1                                   | ui-css-parser-warnings.json、ui-empty-scope-proof.json、ui-contrast.json |

第一次browser蒐證有測試selector錯誤（#save-settings）及Chrome StorageArea替身未綁this，已修正蒐證腳本後完整再跑。初次JSON/log保留initial檔作診斷，不作寫入/驗證通過證據；正式採browser-audit-results.json。沒有修改產品處理這些蒐證錯誤。

## 最重要的確證

1. **已關分頁資料遺失**：真正原始saveTabs＋可控driver，A在等待時B穿透active鎖；兩者saved=1/closed=1，最後僅A，B已關且資料不在。
2. **首次單頁確認變整視窗**：真擴充popup文件作背景tab的scope空、options0；OK後anchor與unrelated-draft均關，Saved2。這不是原生toolbar click證據，但實際執行了相同初始化／確認／backend鏈，非僅理論。
3. **重複ID刪失敗資料**：兩個不同URL同id，restore opened1/failed1卻removed2。
4. **raw救援消失**：真毀損後備份按鈕仍可見（改善），復原成功卻corrupt_raw=null。
5. 真audio audible=true混合window確認只存影音，普通頁漏掉；library初次無dialog直接關草稿頁且沒有Undo按鈕。
6. migration不落地、完整DBverify漏Undo/settings/stats、strict row靜默修補、未關頁Undo多開、尾斜線及設定roundtrip皆有原始TS失敗斷言。

改善實測：一般save→close→立即Undo正確URL；真set fail與tags readback mismatch皆不關；設定寫fail顯示錯誤且值不變；內部/釘選留開；exact duplicate只關接受一頁；tracker請求增量0；16筆Cancel/Esc開0保留全部；reduced-motion停動畫；真同profile重啟原始DB完全一致。

## 效能與Worker證據界限

Apple M4／10 logical CPU／16GiB，Darwin24.5 arm64，測試Chromium153.0.8010.12。16條目的popup文件作普通tab，從goto至scope/內容完成ready的30個順序原始樣本：p50 50.21ms，p95 109.27ms；不含newPage建立，**不冒稱原生popup**。原生action.openPopup呼叫成功並找到popup target，單次API返回337.36ms，Playwright未捕捉為Page，實際ready/裁切未驗證。

1000真條目單次library載入425.23ms、搜尋到精確1項39.85ms、實際window捲動57.25ms（scrollY78246.5），390px無橫溢出、11061 DOM elements；不等於連續FPS/longtasks達標。工程perf script的#list.scrollTop仍0，證實原「scroll77ms」不是捲動量測。

16項library5秒idle觀察TaskDuration增0.008201秒、ScriptDuration增0、JSheap6,565,592bytes；只是該page範圍，未含Worker/browser/nativepopup，不能宣稱整擴充資源。Task Manager前後MB仍未驗，要求Cursor先實際嘗試並提供步驟/界限。

Worker closeTarget返回success=true、原target暫消失，喚醒後全域instance nonce清空、原始DB完全一致；targetId重用、Playwrightcloseevent未觸發。保留實際觀察，不用送命令/筆數一致當完整回收證明；正式停止狀態/執行context與操作中斷續接仍需補，見R216。重啟raw前後JSON存worker-before-after.json及restart-before-after.json，不能用parsed物件key順序差異誤報資料損壞。

## 原文逐项矩陣

✅只對明列範圍有證據；❌確證不符或必做證據缺漏；⚠️部分改善、未測或範圍不足。矩陣沿用第1輪83個原文切片，全部重新判定。

| 原文位置 | 需求                                      | 判定 | 第2輪證據／缺口                                                                  |
| -------- | ----------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| §0       | 可安裝可用、保守避免資料遺失、無假功能    | ❌   | R201–R206；已關分頁遺失與錯範圍關頁阻擋交付                                      |
| §0       | 自主決策與階段回報                        | ✅   | Cursor自主決策、繁中回報與有意義小步提交                                         |
| §1       | 全產品英文、字串集中                      | ❌   | 英文日期改善；HTML/manifest/部分提示尚未集中，R213                               |
| §1       | README／隱私／商店草稿英文                | ✅   | 英文文件語言符合；內容準確性另外驗收                                             |
| §1       | 研究／設計／決策／測試及回報繁中          | ✅   | 指定文件及回報維持繁中                                                           |
| §2–3     | 保存網址／標題／圖示、關閉、再開啟核心    | ❌   | 普通單頁/Undo實測改善；並行與錯範圍仍失敗                                        |
| §4       | 競品、內建節省功能與使用者抱怨調查        | ❌   | 評論、格式來源與論據欠缺，R218                                                   |
| §4       | 2–3 差異點及選擇理由                      | ✅   | 仍列三差異點與取捨；達成程度另驗                                                 |
| §4       | MV3、容量、官方最佳實踐查證               | ❌   | Chrome127改善；權限/容量與可靠性論據仍缺，R218                                   |
| §5.1     | 收集→寫入→完整讀回→才關、失敗不關         | ❌   | R201遺失已關URL，R206完整DB驗證漏Undo等                                          |
| §5.1     | 批次全成功或逐筆安全、誠實回報            | ❌   | 部分錯誤有提示；重複id還原仍刪失敗項目                                           |
| §5.2     | 必要欄位與每筆／DB schema                 | ✅   | types及真保存欄位完整；strict parser與唯一性另列失敗                             |
| §5.2     | 版本遷移不弄壞舊資料                      | ❌   | clone參照比較略過落地、缺時間id漂移，R205                                        |
| §5.2     | 毀損不清空、原資料匯出與復原              | ❌   | 部分錯型靜默修補，restore刪唯一raw，R204                                         |
| §5.3     | storage.local／IDB 容量效能可靠性比較     | ❌   | 缺1000筆+快照尺寸及性能/可靠性比較，R218                                         |
| §5.3     | 最近 N 快照、設定可還原                   | ❌   | 五份輪替與壞snapshot保護通過；復原raw保留失敗                                    |
| §5.4     | Worker 回收可重建、頂層同步監聽           | ⚠️   | 頂層同步listener存在；stop target/nonce観察保留，長操作續接未驗，R216            |
| §5.5     | 瀏覽器 API 與純邏輯分開、可獨立測試       | ✅   | core/browser分離，原始TS可控driver獨立執行                                       |
| §5.6     | 最小權限、每項用途                        | ⚠️   | 無host；新增favicon具用途，但商店/權限說明仍不精確                               |
| §5.6     | 未儲存輸入的保守通用提醒與取捨            | ❌   | 提醒已在前，但首次scope錯／library繞過，R202                                     |
| P0.1★    | 點圖示一鍵存起、動畫與數量回饋            | ❌   | R202初次確認多關不相關頁；真toolbar全鏈未正式回歸                                |
| P0.2★    | popup／完整清單，各欄位與圖示             | ⚠️   | 兩個清單及英文日期可見；原生尺寸、favicon實際命中尚未完整                        |
| P0.3★    | 單筆／全部還原、預設移除設定              | ❌   | 正常還原/API路徑改善；重複id部分失敗丟資料，R203                                 |
| P0.4★    | 可用的限時 Undo                           | ❌   | 普通立即Undo正確URL通過；library無入口／未關頁仍重開                             |
| P0.5a    | 內部頁略過與提示                          | ✅   | 本輪chrome://version明確提示、原頁留開                                           |
| P0.5b    | 釘選預設不關閉                            | ✅   | 本輪真pinned fixture留開、有原因                                                 |
| P0.5c    | 正在播放音訊／影片前確認                  | ❌   | 真audio audible=true；混合確認漏普通頁且boolean可繞token，R208                   |
| P0.5d    | 未儲存內容提醒                            | ❌   | 真popup文件首次確認多關草稿頁、library無提醒                                     |
| P0.5e    | 重複 URL 偵測與提示                       | ❌   | exact同批與hash改善；尾斜線誤去重，R207                                          |
| P0.5f    | 無痕依權限正確處理說明                    | ⚠️   | 文件存在；本輪無痕獨立profile完整行為未實測                                      |
| P0.5g    | 最後一頁不讓視窗意外消失                  | ⚠️   | ensureWindowSurvives存在；本輪exact最後一頁/失敗仍欠正式證據                     |
| P0.6     | current／others／window 三範圍            | ❌   | 空scope被當window，真確認範圍錯，R202；正常三scope完整UI待補                     |
| P0.7     | 即時搜尋標題 URL、單筆刪除、二次確認清空  | ⚠️   | 1000即時search實測；完整delete/clear/二次確認及故障正式回歸待補                  |
| P0.8     | JSON 匯出匯入、重複／錯誤／版本／摘要     | ❌   | 危險URL/v1改善；重複id、設定roundtrip/完整schema失敗                             |
| P0.9     | 移除／scope／dark／backup 設定            | ❌   | 寫fail提示改善；dirty刷新、raw復原與runtime驗證失敗                              |
| P0.10    | ≤3 步、可跳過、完成後不再出現             | ❌   | skip hidden已改善；保存引導失敗仍假完成，R210                                    |
| P0.11    | empty/loading/error 全面可用              | ❌   | 仍有stale資料/targets及拒絕缺回復，R220                                          |
| P0.11    | 鍵盤操作與足夠對比                        | ⚠️   | 10組對比計算最小4.620:1；鍵盤import語意改善，完整焦點/live未驗                   |
| P0.11    | 減少動態偏好                              | ✅   | 真1000列reduced-motion: animation none/transition0s                              |
| P0.11    | 非覆蓋型 demo 按鈕                        | ✅   | load-demo-data保留既有庫；統計不加totalClosed                                    |
| P1.1     | 可自訂快捷鍵存目前頁                      | ⚠️   | manifest/commands存在；真快捷鍵首次與重建尚欠正式證據                            |
| P1.2     | 右鍵存起                                  | ❌   | save-others丟確認及结果、完整Undo入口未完成，R208                                |
| P1.3     | 分組、標籤、整組還原                      | ⚠️   | guard/reset改善；真edit/整組分批與部分失敗完整證據待補                           |
| P1.4     | 白名單永不存起／關閉                      | ⚠️   | 純邏輯/確認再查存在；真所有入口與狀態改變尚欠證據                                |
| P1.5     | 統計與誠實記憶體估計                      | ❌   | import/demo分離改善；未關Undo/統計寫吞錯與未顯示公式，R206/R213                  |
| P1.6     | 原視窗與盡量原順序                        | ⚠️   | source排序存在；原視窗存在/消失與順序完整實測待補                                |
| P1.7     | 徽章數量及已有項目的圖示                  | ⚠️   | badge與active icons存在；真跨頁/錯誤/worker/native主題未全驗                     |
| P1.8     | 大量還原數量提示與分批選擇                | ⚠️   | 真16筆Cancel及Esc開0、保留16；節奏、進度與整組全部證據未齊                       |
| P2       | 自選 2–3 項與價值成本                     | ✅   | 只選Hibernate與URL                                                               | title，未要求其他候選或sync |
| P2       | Hibernate 實際可休眠且保護                | ❌   | popup默選第一頁且id視為discard成功，R209                                         |
| P2       | URL｜title 純文字匯入                     | ⚠️   | 基本單元支援；完整文字/title/鍵盤回歸與格式來源仍不足                            |
| §7       | 具名擴充／生產力／設計社群參考            | ❌   | DESIGN仍泛稱，缺具名研究來源，R218                                               |
| §7       | 原創風格與 tokens／字體／間距／圖示統一   | ✅   | 維持暖色/炭色token、統一自製圖示，未重做風格                                     |
| §7       | 存入收進、還原展開、清單進出與按鈕動態    | ❌   | CSS非法@media；完整頁restore/delete未接動態，R212                                |
| §7       | popup 密度、CTA 明確、立即內容            | ⚠️   | 原生popup API開啟target成功；未被Playwright page捕捉，裁切尚未驗                 |
| §7       | 16/32/48/128、淺深主題、active 圖示       | ⚠️   | 8 PNG齊全；真原生light/dark各尺寸辨識未完成                                      |
| §8       | popup 200ms 目標                          | ⚠️   | 16筆文件ready30樣本p50 50.21/p95 109.27ms；native API337.36ms並非ready數值       |
| §8       | 1000 筆搜尋／捲動流暢                     | ⚠️   | 1000搜尋39.85ms/真scroll57.25ms單次；錯script scrollTop0，連續FPS/longtask未量   |
| §8       | 自身 CPU／記憶體量測                      | ❌   | 根補page idle/heap；工程交付缺worker/整擴充範圍及完整CPU，R217                   |
| §8       | 無背景輪詢，事件與必要 alarms             | ✅   | 讀碼無背景輪詢，移除alarm；事件驅動                                              |
| §9       | 本機限定、無外連／追蹤／遠端程式碼        | ✅   | tracker增量0；favicon只local endpoint，無追蹤/remote JS                          |
| §9       | 嚴格 CSP、無 eval、不可信文字             | ✅   | connect none/img限定；textContent/無eval；runtime與schema驗證另列                |
| §9       | README＋設定 data location／export／reset | ❌   | 說明/匯出/reset有；復原錯誤hidden、raw保留失敗，R204/R210                        |
| §10      | 多網站→存入→關閉→清單→正確還原 E2E        | ❌   | 既有3案通過但API避首次UI、斷言不足與刪除回歸，R214/R215                          |
| §10      | 七種特殊分頁逐項實測                      | ❌   | 根補internal/pinned/audio/unsaved/duplicates；incognito/last-tab等仍欠正式全證據 |
| §10      | 寫／讀回故障與 Worker 真回收              | ⚠️   | 真set fail/tags mismatch原頁留開通過；worker長操作與完整DB mismatch未過          |
| §10      | 真瀏覽器重新啟動資料仍在                  | ✅   | 根真同profileclose/relaunch後16筆原始DB逐位元JSON相同                            |
| §10      | 1000 筆測試                               | ⚠️   | 真1000條目/搜尋/窄版通過觀察；工程腳本捲動無效，完整資源待補                     |
| §10      | 完整 export/import 與舊版／毀損安全       | ❌   | 設定roundtrip、重複id、strict/migration/raw復原失敗                              |
| §10      | ≥15 有意義單元與核心失敗處理              | ❌   | 27個既有單元過；24獨立隔離斷言16失敗且既有覆蓋被刪弱                             |
| §10      | 工作管理員步驟、前後 MB 與條件            | ⚠️   | 無前後MB/完整步驟及實際操作嘗試；不得用公式替代，R217                            |
| §10      | 獨立 Known Limitations 且誠實             | ❌   | 文件存在；可修bug未被發現、checklist與未測互相矛盾，R219                         |
| §11      | 每階段可建置、實測才完成                  | ❌   | 8gate過但CSS語法警告及資料安全確證未過，不能算階段完成                           |
| §11      | 清楚的小步 commit                         | ✅   | 本輪六個有意義commit，未push                                                     |
| §11      | 嚴格型別、零警告程式檢查                  | ❌   | strict types/lint0通過；CSS syntax warning漏gate，R212                           |
| §11      | 無未用套件、全部用途與授權                | ⚠️   | jsdom移除/完整license改善/audit0；無作用override與文件仍不正確                   |
| §12.1    | 可安裝 dist 與 zip                        | ✅   | 真dist載入、pack exit0、unzip -t成功；未到安全可交付門檻                         |
| §12.2    | 完整英文 README 可重現                    | ❌   | Node範圍/zip fallback/browser安裝不符，R219                                      |
| §12.3    | 正確英文隱私政策                          | ✅   | 英文隱私文件與local favicon/no tracker觀察一致                                   |
| §12.4    | 英文商店名稱／描述／截圖清單、不上架      | ❌   | 英文素材有；仍列alarms漏favicon需更新，未上架                                    |
| §12.5    | 五份繁中文件                              | ✅   | 五份繁中文件存在；內容品質另列                                                   |
| §12.6    | 只有使用者能親手做的事                    | ❌   | 可自動化驗證仍轉交/TaskManager無詳細步驟，R215/R217                              |
| 監工交付 | .gitignore／機密／GitHub 上傳             | ⚠️   | ignore秘密改善；尚未到GitHub門檻、無remote，完整歷史secret掃描最後進行           |

## 修正與停止條件

完整指令 `docs/cursor-correction-round-2.md` 的R201–R220含行號/影響/修法/skill/真驗證/禁止事項。六個適用skill沿用；另npm-skill用于lock engines核對，平行代理只審查蒐證，未改功能。不得為skill導入無關框架/外部服務。

Cursor完成後再次整個專案驗收，不只修正區域。正式需求範圍與全gate＋一輪完整無新問題才進GitHub；此時不push/上架。保留原始資料、已通過部分、歷史文檔與所有有效測試，不skip/刪測試/放寬斷言。修正最多8輪，現在派第2輪。

## 派送狀態

第2輪修正 prompt 已透過正確的 Memory Expansion／Tabfold extension development 對話送出。Cursor 隨即顯示 **Total usage limit reached**／**monthly limit**，沒有開始修正。監督追蹤已停用，避免重複催送；待使用者恢復 Cursor 可用額度並要求繼續後，接續同一第2輪。未修改帳號、模型、費用或授權，未 push。
