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

## 競品與內建功能（分開：公開事實 vs 推論）

| 方案                      | 公開可查事實                                                                                     | 本專案推論／取捨                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| OneTab 等「一次收起全部」 | Chrome Web Store 上常見「save all tabs」擴充；匯出格式採 `URL \| title` 純文字列表（或單行空隔） | 誤觸清窗、還原瞬間吃記憶體是常見痛點 → 預設只存目前分頁＋大量還原三選一＋相容其純文字格式 |
| The Great Suspender 類    | 歷史上有維護轉手／惡意代碼爭議見公開報導                                                         | 提供**手動** Hibernate（`tabs.discard`），不做自動掃描休眠，確保行為可預期                |
| Chrome Memory Saver       | 內建、零安裝、依系統記憶體壓力自動 discard                                                       | 無法當成「收藏網址後關閉、日後搜尋檢索」的持久化庫 → 本工具補這條路徑                     |

（競品商店頁與評論會隨時間變動；上表聚焦公開規格與可驗證功能。）

## 儲存：storage.local vs IndexedDB

| 面向           | storage.local + unlimitedStorage                                                                                                                                                                                                          | IndexedDB                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 容量與測量     | 實測（`output/supervision/round-3/capacity-audit.json`）：1,000 筆結構化條目資料庫為 265,770 bytes（約 260KB）；5 份滾動快照為 1,329,281 bytes（約 1.30MB），總計 1,595,051 bytes（約 1.59MB）。`unlimitedStorage` 消除預設 10MB 配額限制 | 容量更大，適合二進位或媒體 Blob，但結構化分頁清單不需要                    |
| 權限事實       | Chrome 官方文件載明：`unlimitedStorage` 安裝時**不會**觸發額外警告彈窗（與 host permission 不同）                                                                                                                                         | 無需額外權限，但對單純文字清單而言無顯著優勢                               |
| API 與生命週期 | MV3 Service Worker 與前端頁面原生直接存取；無底層原子 CAS，透過單一 Worker 內 `MutationQueue` 循序化與 `revision` 邏輯校驗維持一致性                                                                                                      | 跨非同步 tick 時交易容易提早 autocommit；版本遷移（upgradeneeded）複雜度高 |
| 可靠性架構     | 搭配 `MutationQueue` 循序化＋寫入後立即讀回驗證欄位一致性，失敗則不關閉分頁，交易不一致立即回滾原庫                                                                                                                                       | 交易強，但在多頁面並行下需繁瑣的鎖與連線管理                               |
| 本專案選擇     | **採用**：以單一 JSON 庫為真實來源，保持匯出／匯入／備份架構高度純粹且可完整比對                                                                                                                                                          | 不採用：避免在初期引入雙軌儲存與過度工程化的遷移負擔                       |

實測證明：1,000 筆資料加 5 份滾動備份體積約 1.59MB，`chrome.storage.local` 雖無原生物理 CAS，但在單一背景 Worker 架構下透過 `MutationQueue` 循序序列化、`revision` 邏輯比對與寫入後讀回驗證，即可在避免關閉非預期分頁的前提下達成安全穩定的短暫生命週期資料保護。

## 本專案差異點（詳見 DECISIONS.md）

1. **預設動作是「存目前這一個分頁」**（點圖示即存）。
2. **先寫入 → 完整欄位讀回驗證 → 才關閉**；mutation 可重入序列化。
3. **本機限定、可匯出／滾動快照／毀損不靜默清空**；favicon 不連外。
