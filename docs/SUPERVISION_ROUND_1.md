# Tabfold 第 1 輪獨立驗收

驗收日期：2026-10-07（Asia/Taipei）。基準 commit：`07b0509`，分支：`feat/tabfold-extension`。

結論：**未通過，交付 Cursor 第 1 輪修正。** 6 項基礎檢查通過，但發現 24 組缺陷或交付缺口。這兩個數字分別計算檢查指令與修正群組，不代表需求完成率。

唯一需求基準：`docs/original-requirements.md`，已與使用者附件逐位元比對一致。Codex 只審查、測試及撰寫監工文件，沒有代寫產品功能。Cursor 回報完成並停止後才開始驗收。所有瀏覽器操作使用獨立測試 profile 與本機 fixture，未碰使用者日常分頁、資料或帳號。

## 執行證據

本輪根代理的原始證據：`output/supervision/round-1/`。該資料夾依現有 `.gitignore` 忽略，不會把測試 profile、trace 或測試資料推送至 GitHub。

| 實際執行                                            | 結果                                                                                 | 證據                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `npm ci`                                            | exit 0；205 套件；含棄用／套件執行政策提示與漏洞摘要                                 | `install.log`                                     |
| `npm run verify` 中的 format:check                  | ✅ 通過                                                                              | `verify.log`                                      |
| 嚴格 typecheck                                      | ✅ 通過                                                                              | `verify.log`                                      |
| lint                                                | ✅ 通過，0 lint warnings                                                             | `verify.log`                                      |
| 單元測試                                            | ✅ 現有 19 案例通過；核心安全覆蓋不足                                                | `verify.log`                                      |
| build                                               | ✅ 通過，真實產出 `dist/`                                                            | `verify.log`                                      |
| `npm run test:e2e`                                  | ✅ 現有 3 案例通過，19.0 秒；未涵蓋存入關閉再還原主流程                              | `existing-e2e.log`                                |
| `npm audit --json`                                  | ❌ exit 1，開發依賴 2 critical、1 moderate                                           | `dependency-audit.json`                           |
| `node output/supervision/round-1/browser-audit.mjs` | 完成真實擴充功能隔離驗收，包含成功與失敗結果；此蒐證腳本的 exit 0 不代表產品驗收通過 | `browser-audit-results.json`、`browser-audit.log` |

開發依賴漏洞位於 Vitest／tinypool／@vitest/mocker，不能據此宣稱 production bundle 已證實可被遠端攻擊。仍須更新到已修補且相容的版本，再跑完整檢查；不可直接強制套用破壞性升版。

首次蒐證遇到 fixture 分頁仍在 pending navigation，已修正測試等待條件再跑。`browser-audit-initial-results.json` 僅保留診斷，不作存入流程通過證據。正式採用 `browser-audit-results.json`。

## 真實瀏覽器發現

| 情境                               | 狀態 | 實際結果與界限                                                                                                  |
| ---------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| 單筆存入、寫回、關閉               | ✅   | saved 1，原分頁關閉，庫內有保存條目；只代表單筆情境                                                             |
| 存入後立即 Undo                    | ❌   | DB 讀回 undo=null，立即回 `Undo window expired.`                                                                |
| 單筆還原、成功後移除               | ✅   | opened 1、removed 1、remaining 0                                                                                |
| 內部頁與釘選頁                     | ✅   | 明確略過，兩個原分頁皆仍開啟                                                                                    |
| 真 Worker 寫入 API 失敗            | ✅   | 注入 disk write failure；saved 0，原分頁仍開啟                                                                  |
| 同批兩個相同 URL                   | ❌   | saved 2，庫內重複 2 筆，兩頁均被關閉                                                                            |
| 關掉視窗全部候選頁時保留視窗       | ⚠️   | 視窗仍開啟，但新分頁 URL 尚 pending；仍需精確的「只有最後一頁」獨立案例                                         |
| 設定寫入失敗                       | ❌   | 實際值沒改，畫面仍顯示 `Saved.`                                                                                 |
| 匯入任意 favicon URL               | ❌   | 本機 fixture 的 tracker endpoint 確實收到來自擴充清單的圖片請求，違反不連外部伺服器要求                         |
| 新版／毀損 DB 與快照復原入口       | ❌   | 毀損前有 1 個備份按鈕，毀損後變 0，無法從設定復原                                                               |
| 完成／跳過 onboarding              | ❌   | hidden=true 但 computed display=flex、仍高 167.78px；空 status 亦占 18.19px                                     |
| 1000 筆 library 初步量測           | ⚠️   | 單次載入 250.93ms、搜尋 7.60ms、DOM 12048 nodes；390px 寬無橫向溢出。不代表捲動 FPS、popup 200ms 或資源預算通過 |
| 真正關閉並重新啟動同一測試 profile | ✅   | 條目完整 JSON 相同，2 筆仍在；不等於 Worker 回收測試                                                            |
| 此輪 library pageerror             | ✅   | 收集為空陣列；不能推論所有入口都無錯誤                                                                          |

截圖：`popup-after-skip.png`、`library-small-1000.png`。Popup 截圖是在 `popup.html` 測試分頁取得，不能冒充原生 toolbar popup 的裁切驗收；其 footer 在頁面下方，配合 max-height/overflow 設定，需要真 popup 複驗。

另由核心審查代理執行原始 TypeScript＋可控非同步 storage driver／Chrome API 替身，確認：

- 並行 `saveTabs(A)`、`saveTabs(B)` 都回 saved 1，remove 記錄 `[1,2]`，最後 DB 只剩 B。**A 分頁已關且資料遺失**，不是僅有理論競態。
- 現行 schema 的 `entries:null`、全壞條目或混合毀損條目被靜默轉成空庫／丟掉資料。
- v1 缺 id 的資料每次讀取產生新 id；get-state 後依畫面 id restore 回 `No matching tabs.`，storage 仍 v1。
- JSON 匯入接受 javascript/data/chrome 協定與不合法字串；尚未證實瀏覽器執行其中腳本，不宣稱已證實 XSS。
- v1 export 的 entries 無聲匯入 0；不同 hash 路由被錯誤去重。
- 讀回驗證漏掉 source/group/tags/schema/status 等保存欄位。
- tabs.remove 失敗造成事件入口 unhandled rejection、無結果提示；還原後寫入失敗也隱藏已開啟的部分結果。

這些是實際純邏輯／入口執行證據；不是全部真實瀏覽器驗證。

## 需求逐項對照

✅ 僅表示下列明確範圍有讀碼與相應證據；⚠️ 表示未測、部分完成或證據不足；❌ 表示已找到不符合的行為。不能把「檔案存在」等同完整需求通過。

| 原文位置 | 需求                                      | 判定 | 證據／缺口                                                                        |
| -------- | ----------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| §0       | 可安裝可用、保守避免資料遺失、無假功能    | ❌   | 可載入；並行遺失、Undo 與失敗假成功阻擋日常使用                                   |
| §0       | 自主決策與階段回報                        | ✅   | Cursor 對話、DECISIONS 與小步交付                                                 |
| §1       | 全產品英文、字串集中                      | ❌   | 硬編碼 labels/messages，日期跟系統語系為中文                                      |
| §1       | README／隱私／商店草稿英文                | ✅   | 對應文件存在且英文；內容正確性另列                                                |
| §1       | 研究／設計／決策／測試及回報繁中          | ✅   | 文件與對話；個別用詞可校正                                                        |
| §2–3     | 保存網址／標題／圖示、關閉、再開啟核心    | ❌   | 單筆閉環實測成功；全域資料安全與 Undo 不通過                                      |
| §4       | 競品、內建節省功能與使用者抱怨調查        | ❌   | 抱怨未附來源，調查論據不足                                                        |
| §4       | 2–3 差異點及選擇理由                      | ✅   | DECISIONS 已列三點；實作達成另列                                                  |
| §4       | MV3、容量、官方最佳實踐查證               | ❌   | 有部分來源；openPopup 版本與 alarms 用法錯誤                                      |
| §5.1     | 收集→寫入→完整讀回→才關、失敗不關         | ❌   | 單筆寫入失敗保護有效；並行與欄位驗證失敗                                          |
| §5.1     | 批次全成功或逐筆安全、誠實回報            | ❌   | duplicates、關閉 API 例外與部分結果未處理                                         |
| §5.2     | 必要欄位與每筆／DB schema                 | ✅   | types 與單筆保存內容；驗證完整性另列                                              |
| §5.2     | 版本遷移不弄壞舊資料                      | ❌   | 遷移不持久化且 id 不穩定，舊版匯入漏資料                                          |
| §5.2     | 毀損不清空、原資料匯出與復原              | ❌   | 寬鬆解析丟資料，設定快照入口被 early return 隱藏                                  |
| §5.3     | storage.local／IDB 容量效能可靠性比較     | ❌   | 無具體比較與容量證據，並行可靠性假設不成立                                        |
| §5.3     | 最近 N 快照、設定可還原                   | ❌   | 輪替程式存在，但毀損後入口失效；輪替尚需實測                                      |
| §5.4     | Worker 回收可重建、頂層同步監聽           | ⚠️   | 同步監聽通過讀碼；真回收與操作中斷尚未實測                                        |
| §5.5     | 瀏覽器 API 與純邏輯分開、可獨立測試       | ✅   | core/browser 分離，單元及隔離 TS 執行                                             |
| §5.6     | 最小權限、每項用途                        | ⚠️   | 無 host permission；tabs 有理由。需修正 unlimitedStorage 的提示敘述及 alarms 用途 |
| §5.6     | 未儲存輸入的保守通用提醒與取捨            | ❌   | 提醒在關閉之後，無法避免表單丟失                                                  |
| P0.1★    | 點圖示一鍵存起、動畫與數量回饋            | ❌   | openPopup 相容與 popup binding 不可靠，首次未提示，關閉錯誤無回饋                 |
| P0.2★    | popup／完整清單，各欄位與圖示             | ❌   | 頁面存在；外連 favicon、日期語系、popup 版面與 hidden 問題                        |
| P0.3★    | 單筆／全部還原、預設移除設定              | ❌   | 單筆正常路徑通過；取消全部還原反而全開、寫後失敗結果不透明                        |
| P0.4★    | 可用的限時 Undo                           | ❌   | 立即 Undo 過期                                                                    |
| P0.5a    | 內部頁略過與提示                          | ✅   | 真瀏覽器 chrome://version 留開與提示                                              |
| P0.5b    | 釘選預設不關閉                            | ✅   | 真瀏覽器釘選 fixture 留開與提示                                                   |
| P0.5c    | 正在播放音訊／影片前確認                  | ❌   | 有 dialog，但確認重抓 active/scope、右鍵無完整流程；真媒體未測                    |
| P0.5d    | 未儲存內容提醒                            | ❌   | 先關後提醒                                                                        |
| P0.5e    | 重複 URL 偵測與提示                       | ❌   | 同批重複兩筆、不同 hash 路由誤判                                                  |
| P0.5f    | 無痕依權限正確處理說明                    | ⚠️   | 文件提及，未獨立實測                                                              |
| P0.5g    | 最後一頁不讓視窗意外消失                  | ⚠️   | 批次視窗保留觀察成立，精確最後一頁與 API 失敗尚待測                               |
| P0.6     | current／others／window 三範圍            | ⚠️   | 純函式測試通過；全部入口真實三範圍尚缺，預設範圍行為須釐清                        |
| P0.7     | 即時搜尋標題 URL、單筆刪除、二次確認清空  | ❌   | 搜尋通過；清空失敗仍說 Cleared、dialog Esc 語意不安全                             |
| P0.8     | JSON 匯出匯入、重複／錯誤／版本／摘要     | ❌   | 不合法 URL、舊版空匯入、id 改寫導致非完整 round-trip                              |
| P0.9     | 移除／scope／dark／backup 設定            | ❌   | 設定錯誤假成功、毀損備份不可用                                                    |
| P0.10    | ≤3 步、可跳過、完成後不再出現             | ❌   | hidden 被 CSS 蓋掉，完成後仍看得到                                                |
| P0.11    | empty/loading/error 全面可用              | ❌   | messaging rejection 無回復、資料錯誤與假成功                                      |
| P0.11    | 鍵盤操作與足夠對比                        | ❌   | import label 不可聚焦、dialog 名稱／live feedback 缺、dark hover 對比 1.719:1     |
| P0.11    | 減少動態偏好                              | ⚠️   | CSS 有實作；真互動與最終新增動態仍需驗證                                          |
| P0.11    | 非覆蓋型 demo 按鈕                        | ✅   | E2E 實際產生本機條目；統計污染另列                                                |
| P1.1     | 可自訂快捷鍵存目前頁                      | ⚠️   | manifest commands 有設定，原生快捷鍵與錯誤回饋未測                                |
| P1.2     | 右鍵存起                                  | ❌   | 音訊 pending 無可用確認／結果入口，Promise 例外未處理                             |
| P1.3     | 分組、標籤、整組還原                      | ❌   | edit Esc 可能保存、整組繞過大量還原保護                                           |
| P1.4     | 白名單永不存起／關閉                      | ⚠️   | 純函式通過；真流程與確認期間改設定須測                                            |
| P1.5     | 統計與誠實記憶體估計                      | ❌   | 有估計聲明；import/demo 的條目也被當已釋放記憶體，應區分實際行為                  |
| P1.6     | 原視窗與盡量原順序                        | ⚠️   | 分支存在，原視窗存在／消失、多筆順序未完整實測                                    |
| P1.7     | 徽章數量及已有項目的圖示                  | ⚠️   | API 與素材存在；跨頁變動／錯誤／重啟一致性仍待測                                  |
| P1.8     | 大量還原數量提示與分批選擇                | ❌   | Cancel/Esc 全開，group bypass                                                     |
| P2       | 自選 2–3 項與價值成本                     | ✅   | 選 Hibernate 與 URL｜title；不要求其他候選、sync 不選                             |
| P2       | Hibernate 實際可休眠且保護                | ⚠️   | 目前對 active 或 library tab discard；真實可用性／保護／結果未證                  |
| P2       | URL｜title 純文字匯入                     | ⚠️   | 基本單元通過；聲稱競品格式需來源，需鍵盤與完整匯入實測                            |
| §7       | 具名擴充／生產力／設計社群參考            | ❌   | DESIGN 只有泛稱，缺案例及來源                                                     |
| §7       | 原創風格與 tokens／字體／間距／圖示統一   | ✅   | 自製圖示、骨色與炭色 tokens，沒有大量漸層／emoji 模板；可用性缺陷另列             |
| §7       | 存入收進、還原展開、清單進出與按鈕動態    | ❌   | 只有部分入場，缺還原／退場可驗證動態                                              |
| §7       | popup 密度、CTA 明確、立即內容            | ❌   | hidden 與 max-height/overflow；真 popup 操作尚待驗證                              |
| §7       | 16/32/48/128、淺深主題、active 圖示       | ⚠️   | 8 個 PNG 與產生腳本存在；真 toolbar light/dark 可辨識證據不足                     |
| §8       | popup 200ms 目標                          | ⚠️   | 無有效 popup 基準及多次樣本，不能以 library 單次代替                              |
| §8       | 1000 筆搜尋／捲動流暢                     | ⚠️   | 真 1000 筆 search 7.60ms；捲動仍未測。無需先強制虛擬化                            |
| §8       | 自身 CPU／記憶體量測                      | ❌   | 缺實際數字與測試條件                                                              |
| §8       | 無背景輪詢，事件與必要 alarms             | ✅   | 讀碼無輪詢；不合理 3 秒 alarm 另列修正                                            |
| §9       | 本機限定、無外連／追蹤／遠端程式碼        | ❌   | 無 analytics／remote JS；favicon 真實發出外部圖片請求                             |
| §9       | 嚴格 CSP、無 eval、不可信文字             | ❌   | textContent 與無 eval 有效；CSP 未限制外部圖像／連線                              |
| §9       | README＋設定 data location／export／reset | ❌   | 說明與按鈕存在；失敗回饋與毀損復原不完整                                          |
| §10      | 多網站→存入→關閉→清單→正確還原 E2E        | ❌   | 現有 3 E2E 不測主流程；監工單筆不能補足工程交付測試                               |
| §10      | 七種特殊分頁逐項實測                      | ❌   | 完整證據缺漏，不可僅建議使用者手測                                                |
| §10      | 寫／讀回故障與 Worker 真回收              | ❌   | 真寫失敗保護通過；讀回故障／回收未測，現有單元假稱 no close path                  |
| §10      | 真瀏覽器重新啟動資料仍在                  | ✅   | 監工 same-profile 關閉／重開 JSON 相同；需轉正式回歸                              |
| §10      | 1000 筆測試                               | ⚠️   | 監工初測，正式捲動與效能證據不足                                                  |
| §10      | 完整 export/import 與舊版／毀損安全       | ❌   | id 改寫、URL 過寬、舊版零筆、寬鬆遷移                                             |
| §10      | ≥15 有意義單元與核心失敗處理              | ❌   | 數量 19 合格；不呼叫 saveTabs 的 no-close 測試不驗契約                            |
| §10      | 工作管理員步驟、前後 MB 與條件            | ⚠️   | 無實測或可重現完整嘗試，不能用估計替代                                            |
| §10      | 獨立 Known Limitations 且誠實             | ❌   | 文件存在；checklist 宣告完成與未測互相衝突，有可修缺陷被當限制                    |
| §11      | 每階段可建置、實測才完成                  | ❌   | 可建置；核心測試不足而多項標完成                                                  |
| §11      | 清楚的小步 commit                         | ✅   | 現有 7 個有意義 commits                                                           |
| §11      | 嚴格型別、零警告程式檢查                  | ✅   | typecheck/lint 通過；安裝／runtime 完整零警告尚不能宣稱                           |
| §11      | 無未用套件、全部用途與授權                | ❌   | jsdom 未使用、依賴文件有遺漏，開發工具有已知漏洞                                  |
| §12.1    | 可安裝 dist 與 zip                        | ⚠️   | dist 真載入、zip 已存在；本輪未獨立重 pack／內容核對                              |
| §12.2    | 完整英文 README 可重現                    | ❌   | 缺 Node/npm、Playwright browser 安裝、headed 環境／zip 平台前置                   |
| §12.3    | 正確英文隱私政策                          | ❌   | 英文已完成，但外部圖片請求與本機宣告不一致                                        |
| §12.4    | 英文商店名稱／描述／截圖清單、不上架      | ✅   | STORE_LISTING 存在，未上架；功能文案應隨修正更新                                  |
| §12.5    | 五份繁中文件                              | ✅   | 檔案齊全；研究／測試內容品質另列失敗                                              |
| §12.6    | 只有使用者能親手做的事                    | ❌   | 把可於隔離環境嘗試的測試轉交使用者，缺詳細工作管理員步驟                          |
| 監工交付 | .gitignore／機密／GitHub 上傳             | ⚠️   | 無 remote；未到上傳門檻。.env/私鑰防護缺，完整歷史機密掃描待最終驗收              |

## 技能、審查與下一步

本輪用 ai-debt-detector、security-best-practices 檢查失敗處理、權限、CSP、輸入及套件；minimalist-ui 評估風格；依使用者明確測試要求執行 Playwright 真擴充 E2E。另以獨立代理分工核心／UI／文件，均不改功能。沒有因可用而引入 Cloudflare、Vercel、Figma 或外部追蹤服務；本機擴充沒有部署／雲端需求。

完整修正要求：`docs/cursor-correction-round-1.md`，C01–C24。Cursor 完成後必須停止，Codex 再做整個專案的獨立驗收。現階段禁止宣告完成、push 或上架。
