# DECISIONS.md — 架構與產品決策

## 差異點（相對同類工具）

1. **主路徑 = 存目前分頁**：`action.onClicked` 直接存起並關閉；不以「先開 popup 再按另一顆按鈕」冒充一鍵存入。
2. **資料安全優先於速度**：寫入失敗／讀回不一致／關閉前 URL 已變 → **不關閉**原分頁。
3. **還原可分批**：大量還原先提示，避免剛省下的記憶體瞬間被吃光。

## 點圖示行為（重要）

- Manifest **不設** `default_popup`。
- `chrome.action.onClicked` → `saveTabs({ scope: 'current' })`。
- 存完後短暫 `setPopup` + `openPopup()` 顯示結果與 Undo（Chrome 允許時）；並用 `alarms` 清掉 popup，讓下一次點擊仍走 `onClicked`。
- 若 `openPopup` 失敗：徽章與 session 仍保留結果；使用者可開 library／再次透過右鍵選單操作。
- **首次引導與音訊確認**是唯一需要額外確認的例外（已實作於 UI）。

## 儲存

- 選 `storage.local` + `unlimitedStorage`：官方文件指出 local 預設約 10MB，大量條目與快照需要餘裕。
- 代價：權限提示較醒目；換得本機可靠性與不做 sync。
- `revision` 樂觀鎖：並行寫入最多重試，避免覆蓋。
- 滾動快照：清空／匯入／demo／重置／較大庫變更前保留最近 5 份。

## 未儲存輸入（5.6）

- **不**申請 `<all_urls>`／content script 讀表單。
- 改為存入成功後的通用英文提醒（字串常數）。取捨：少權限 > 精準偵測。

## P2 選擇

1. **Hibernate（`tabs.discard`）**：分頁留在原位釋放記憶體，與「存起並關閉」並存。價值高、成本低（官方 API）。
2. **`URL | title` 純文字匯入**：方便從 OneTab 類工具遷移。價值高、成本低。
3. **不做跨裝置同步**：與本機限定衝突，明確放棄。

## 記憶體估計

- 公式：`entries.length * 50` MB，UI 標示 **estimate only**，不得當作實測。

## 型別草稿

- 保留並擴充 Codex 初稿 `src/types.ts`（schema v2、Request 聯集等）。
