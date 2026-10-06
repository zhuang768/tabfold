# RESEARCH.md — Tabfold 調查紀錄

## 方法與來源（官方優先）

- Chrome Extensions Storage API：https://developer.chrome.com/docs/extensions/reference/api/storage
  - `storage.local` 配額約 **10 MB**（Chrome 114+）；可申請 `unlimitedStorage` 提高上限。
  - Service Worker **不能**依賴 `window.localStorage`。
  - 建議以 Storage API 做跨脈絡持久化。
- MV3 Service Worker 遷移：https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
  - 事件監聽器必須**頂層同步註冊**。
  - 不可依賴常駐全域變數；狀態需可自 storage 重建。
  - 長時間 `setTimeout` 不可靠，改用 `alarms`。
- IndexedDB：可存更大結構／二進位，但跨 popup／SW 需自行封裝；官方對擴充功能仍主推 `chrome.storage` 做設定與中小型結構化資料。

## 競品與內建功能（公開評論常見點）

| 方案                                | 優點               | 常見抱怨                                                     |
| ----------------------------------- | ------------------ | ------------------------------------------------------------ |
| OneTab 等「一次收起全部」           | 一鍵清窗、清單集中 | 誤觸收起全部、還原瞬間吃爆記憶體、雲端／帳號疑慮、權限感過大 |
| The Great Suspender 類休眠          | 分頁仍在列         | 歷史曾有資安事件、自動休眠干擾表單                           |
| Chrome 內建 Memory Saver / 休眠分頁 | 系統級、零安裝     | 使用者無法「收藏網址後關掉」當書籤式清單；控制粒度有限       |

## 本專案差異點（詳見 DECISIONS.md）

1. **預設動作是「存目前這一個分頁」**（點圖示即存），不是預設清掉整個視窗。
2. **先寫入 → 讀回驗證 → 才關閉**；失敗絕不關分頁。
3. **本機限定、可匯出／滾動快照／毀損不靜默清空**。

## 儲存選型結論

- 主庫：`chrome.storage.local` + `unlimitedStorage`（1000 筆清單與備份快照需要頭寸；不利弊見 DECISIONS）。
- 不使用遠端 sync（與「本機限定、不做跨裝置同步」一致）。
- 不引入第三方 favicon 服務；只保存 Chrome 分頁 API 提供的 `favIconUrl`。
