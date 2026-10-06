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

| 方案                      | 公開可查事實                                                               | 本專案推論／取捨                                                        |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| OneTab 等「一次收起全部」 | Chrome Web Store 上有大量「save all tabs」類擴充；常見權限含 tabs／storage | 誤觸清窗、還原瞬間吃記憶體是產品風險 → 預設只存目前分頁＋大量還原三選一 |
| The Great Suspender 類    | 歷史上有維護／資安爭議見公開報導                                           | 提供**手動** Hibernate（`tabs.discard`），不做自動掃描休眠              |
| Chrome Memory Saver       | 內建、零安裝                                                               | 無法當成「收藏網址後關掉」的可搜尋清單 → 本工具補這條路徑               |

（競品商店頁與評論會隨時間變動；上表不虛構具體星等或匿名引文。）

## 儲存：storage.local vs IndexedDB

| 面向       | storage.local + unlimitedStorage                                       | IndexedDB                                                       |
| ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 容量       | 預設 ~10MB；unlimited 後實務足夠 1000 筆＋N 份 JSON 快照               | 更大，適合二進位／大量 blob                                     |
| API 簡單度 | get/set、可直接從 SW／popup 共用                                       | 需自行封裝交易與跨脈絡                                          |
| 可靠性     | 單一 JSON blob＋revision＋完整讀回驗證即可測                           | 交易強，但遷移／備份需自建                                      |
| 本專案選擇 | **採用**：資料模型是結構化 JSON 清單，非媒體 blob；備份為整庫 snapshot | 不採用（避免雙儲存與遷移成本）；若未來改 IDB 需先備份＋遷移決策 |

粗估：1000 筆（url/title/meta）約數百 KB 級；加 5 份整庫備份仍遠低於需 IDB 的門檻。`unlimitedStorage` 代價是安裝權限提示較醒目。

## 本專案差異點（詳見 DECISIONS.md）

1. **預設動作是「存目前這一個分頁」**（點圖示即存）。
2. **先寫入 → 完整欄位讀回驗證 → 才關閉**；mutation 可重入序列化。
3. **本機限定、可匯出／滾動快照／毀損不靜默清空**；favicon 不連外。
