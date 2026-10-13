# RESEARCH.md — Tabfold 調查紀錄

## 方法與來源（官方優先）

- Chrome Extensions Storage API：https://developer.chrome.com/docs/extensions/reference/api/storage
  - `storage.local` 配額約 **10 MB**（Chrome 114+）；可申請 `unlimitedStorage` 提高上限。
  - Service Worker **不能**依賴 `window.localStorage`。
- Permissions list（含 `unlimitedStorage`、`favicon`）：https://developer.chrome.com/docs/extensions/reference/permissions-list
- `chrome.action.openPopup`：https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup（實務上穩定使用需較新 Chrome；本專案對齊 **127**）
- `chrome.alarms.create`：https://developer.chrome.com/docs/extensions/reference/api/alarms#method-create（封裝版最小間隔約 30 秒 → **不**用 alarm 清 popup 綁定）
- Favicon API（擴充頁）：Chrome 以 `chrome-extension://<id>/_favicon/?pageUrl=` 提供快取圖示，需 `favicon` 權限，無需 host permission。
- MV3 Service Worker：https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
  - 事件監聽器必須**頂層同步註冊**；狀態需可自 storage 重建。

## 競品與內建功能（公開事實 vs 推論）

| 方案                                         | 公開可查事實（官方來源 / 使用者自述 / 二手報導）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 本專案推論／取捨                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OneTab 官方產品與功能說明                    | **Primary Sources（官方頁面）**：官方首頁 https://www.one-tab.com/ 宣傳一鍵收起分頁可省最高 95% 記憶體（1981 MB / 99 MB 為廠商宣傳例，非受控基準）；頁面載明 Favicon 由 Google 產生、公開分享會上傳伺服器，且提供選用加密同步。功能說明頁 https://www.one-tab.com/help 載明拖放分組、搜尋與「Export / Import tabs as a list of URLs」，以及「Copy links」操作，但官方未明列 pipe 分隔符號等形式化匯出規格。故障排除頁 https://www.one-tab.com/troubleshooting 與救援頁 https://www.one-tab.com/tab-recovery 說明解除安裝會刪除本機庫，廠商主張其程式不會刪除整庫，歸因於瀏覽器資料庫損毀或清理軟體（此為廠商主張）。                                                                                                    | 誤觸關窗、還原瞬間吃記憶體與無自動快照防護是常見痛點。Tabfold 堅持純本機儲存、絕無同步或外連；採用「先寫入驗證後才關閉」與滾動快照保護；相容普遍之 `URL \| title` 純文字匯入格式。 |
| 公開使用者評論（本人 Permalink，非二手報導） | **User Reviews（使用者自述評論）**：<br>1. **資料遺失**：BuenJ 於 Mozilla OneTab 評論（https://addons.mozilla.org/en-US/firefox/addon/onetab/reviews/2736558/ ；於 2026-10-13 檢索時頁面顯示相對時間「2 months ago」）自述更新期間兩度遭遇已存分頁全失，建議備份。<br>2. **大量還原卡死**：kjbaumga 於 Mozilla OneTab 評論（https://addons.mozilla.org/en-US/firefox/addon/onetab/reviews/1687702/）描述一次還原 300 餘分頁導致記憶體耗盡與系統停滯。<br>3. **權限疑慮**：AdAcrobatic7236 於 Reddit 發文（https://www.reddit.com/r/brave_browser/comments/14m2pzc/onetab_extension_question/）對新權限提示感到疑慮，廠商帳號回覆（https://www.reddit.com/r/brave_browser/comments/14m2pzc/comment/jq1lbl1/）澄清為新增分頁群組所需，非讀取本機檔案。 | 使用者高度在意資料持久性、防卡死分批控制與權限透明度。Tabfold 實作 15 筆以上分批確認保護、滾動快照備份、最小權限（無 `<all_urls>`、無外部 Favicon 連線），並提供完整英文隱私聲明。 |
| Chrome Memory Saver                          | **Primary Sources（Google 官方說明）**：https://support.google.com/chrome/answer/12929150?hl=en-GB ：內建於 Chrome，依記憶體壓力自動 discard 未使用分頁，具例外名單，並對播放中媒體、未送出表單、釘選分頁提供保護。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 內建功能屬於自動暫停與重載，無法做為具名保存、搜尋與備份匯出的資料庫。Tabfold P2 提供手動 Hibernate（`chrome.tabs.discard`），兩者定位互補。                                       |
| The Great Suspender 類                       | **Secondary Sources（新聞媒體報導）**：歷史上曾有擴充功能轉手後遭植入惡意代碼爭議（The Verge 報導 https://www.theverge.com/2021/2/4/22266858/the-great-suspender-google-chrome-extension-malware-removed ；ZDNet 報導 https://www.zdnet.com/article/the-great-suspender-chrome-extension-falls-into-shady-hands/ ）。官方 API 見 `chrome.tabs.discard`。                                                                                                                                                                                                                                                                                                                                              | 不採自動背景掃描休眠，僅提供手動受控之 Hibernate，維持安全可預期。                                                                                                                 |

## 設計系統與社群案例參考

- **Things 3 (Cultured Code)**：Apple Design Award 2017 獲獎作品（Apple 官方公告：https://www.apple.com/newsroom/2017/06/apple-design-awards-celebrate-the-best-in-innovation-and-creativity/ ；作者功能頁：https://culturedcode.com/things/features/ ）。借鏡作者描述之「主要操作先行、次要 metadata 漸進展開、清楚 headings 分組、即時搜尋縮小範圍」之操作層級與內容脈絡感。
- **GoTo tab by Pradeep Kumar**：Dribbble 設計社群作者作品（https://dribbble.com/shots/9881121-GoTo-tab ）。作者說明多視窗分頁整合、即時標題/網址搜尋、深色模式與鍵盤上下/Enter/快捷操作。借鏡其鍵盤導覽與同一清單定位之設計。
- **Raycast**：官方頁面 https://raycast.com 。借鏡其鍵盤優先、即打即搜、等寬數據標籤（Mono badge）等工具設計理念；Tabfold 自行決定並定義自身之 2px 焦點指示（`#1F6C9F`）與高對比色票，非直接取用 Raycast 內部官方設計 token。
- **Linear Method**：官方頁面 https://linear.app/method 。借鏡其高資訊密度、單色系微層次、嚴格 1px 細邊框對比與專業冷靜風格；Tabfold 之 1px 邊框規範係 Tabfold 自身的設計決策。
- **純文字相容格式與第一手來源追溯**：
  - **官方文件現狀**：OneTab 官方說明頁（https://www.one-tab.com/help ）僅載明「Export / Import tabs as a list of URLs」及「Copy links」，並未定義形式化 RFC 或公開行內分隔符號語法。
  - **第一手使用者操作紀錄**：檢索於 2026-10-13。TiddlyWiki 社群使用者 TW_Tones 於 2021-11-06 發表之操作紀錄（https://talk.tiddlywiki.org/t/how-to-capture-links-from-browser-tabs-using-onetab-and-other-url-lists/1443 ）中，明確記錄其自 OneTab 匯出之實際內容為每行 `url | title`（以空格與直線管道符號 ` | ` 分隔），並分享其後續針對該格式撰寫之 splitregexp 處理程式碼。本次檢索時直接開啟論壇原頁回傳 HTTP 403 存取限制，搜尋引擎索引則保留了作者正文與發布日期；此限制如實保留，不宣稱本輪成功直接下載原頁或安裝 OneTab 擴充功能。
  - **Tabfold 實作與測試相容**：Tabfold 核心解析器（`src/core/import-export.ts:importPlainTextList`）依據此慣例支援 `url | title`、`url title` 與純 `url` 單行格式，並在 `tests/unit/core.test.ts`（"imports url | title plain text"）以具體測試 fixture 完整覆蓋；若標題缺漏則容錯解析為純網址，若網址無效則安全略過，且每次匯入前強制建立備份快照，防止既有資料損毀。

## 儲存：storage.local vs IndexedDB

| 面向           | storage.local + unlimitedStorage                                                                                                                                                                                                          | IndexedDB                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 容量與測量     | 實測（`output/supervision/round-3/capacity-audit.json`）：1,000 筆結構化條目資料庫為 265,770 bytes（約 260KB）；5 份滾動快照為 1,329,281 bytes（約 1.30MB），總計 1,595,051 bytes（約 1.59MB）。`unlimitedStorage` 消除預設 10MB 配額限制 | 容量更大，適合二進位或媒體 Blob，但結構化分頁清單不需要                    |
| 權限事實       | Chrome 官方文件載明：`unlimitedStorage` 安裝時**不會**觸發額外警告彈窗（與 host permission 不同）                                                                                                                                         | 無需額外權限，但對單純文字清單而言無顯著優勢                               |
| API 與生命週期 | MV3 Service Worker 與前端頁面原生直接存取；無底層原子 CAS，透過單一 Worker 內 `MutationQueue` 循序化與 `revision` 邏輯校驗維持一致性                                                                                                      | 跨非同步 tick 時交易容易提早 autocommit；版本遷移（upgradeneeded）複雜度高 |
| 可靠性架構     | 搭配 `MutationQueue` 循序化＋寫入後立即讀回驗證欄位一致性，失敗則不關閉分頁，交易不一致立即回滾原庫；雙層 Journal（Driver + Session）防範 Worker 途中停止重複開頁                                                                         | 交易強，但在多頁面並行下需繁瑣的鎖與連線管理                               |
| 本專案選擇     | **採用**：以單一 JSON 庫為真實來源，保持匯出／匯入／備份架構高度純粹且可完整比對                                                                                                                                                          | 不採用：避免在初期引入雙軌儲存與過度工程化的遷移負擔                       |

容量實測顯示 1,000 筆資料加 5 份滾動備份體積約 1.59MB，遠低於預設 10MB 配額；此容量數據僅證實儲存佔用空間無虞，不代表並行與故障恢復之可靠性。系統並行與交易安全係由獨立的架構設計所保障：在單一背景 Worker 架構下透過 `MutationQueue` 循序序列化、`revision` 邏輯比對、寫入後讀回驗證、以及雙層持久 Intent/Journal，經由受控故障注入與 Worker 中途終止實測驗證，達成避免關閉非預期分頁之資料保護。

## 本專案差異點（詳見 DECISIONS.md）

1. **預設動作是「存目前這一個分頁」**（點圖示即存）。
2. **先寫入 → 完整欄位讀回驗證 → 才關閉**；mutation 可重入序列化。
3. **本機限定、可匯出／滾動快照／毀損不靜默清空**；favicon 不連外。
