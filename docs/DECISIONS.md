# DECISIONS.md — 架構與產品決策

## 差異點（相對同類工具）

1. **主路徑 = 存目前分頁**：`action.onClicked` 直接存起並關閉；不以「先開 popup 再按另一顆按鈕」冒充一鍵存入。
2. **資料安全優先於速度**：寫入失敗／讀回不一致／關閉前 URL 已變 → **不關閉**原分頁；所有 mutation 經可重入 `MutationQueue` 序列化。
3. **還原可分批**：≥15 筆先明確三選一（分批／全部／取消）；取消／Esc 開 0 筆。

## 點圖示行為（重要）

- Manifest **不設** `default_popup`；`minimum_chrome_version: 127` 對齊 `chrome.action.openPopup`。
- `chrome.action.onClicked` → `saveTabs({ scope: 'current' })`。
- 需要結果／確認時短暫 `setPopup` + `openPopup()`；**立即** `setPopup('')`，**不**用秒級 `alarms`（封裝版 alarm 最小間隔會破壞一鍵入口）。
- 若 `openPopup` 失敗：徽章與 session 仍保留結果；使用者可開 library／右鍵選單。
- **首次危險操作前**顯示未儲存內容提醒（可記住）；引導 ≤3 步可跳過，跳過亦須理解提醒。

## 儲存

- 選 `storage.local` + `unlimitedStorage`：官方文件指出 local 預設約 10MB，大量條目與快照需要餘裕（見 RESEARCH）。
- 代價：權限提示較醒目；換得本機可靠性與不做 sync。
- `MutationQueue` + `revision` + **完整欄位**讀回驗證：並行 save／import／clear 不互相覆寫。
- 滾動快照：清空／匯入／demo／重置／較大庫變更前保留最近 5 份；毀損不靜默清空，保留 raw 可匯出。
- v1 遷移：穩定 id（內容雜湊）、遷移後持久化；未知新版拒收。

## Favicon / CSP

- 不把不可信 `favicon` URL 當 `img.src`；UI 用 Chrome `/_favicon/?pageUrl=` + 字母 fallback。
- CSP：`img-src 'self' data: chrome:`；`connect-src 'none'`；無 remote JS／eval。

## 未儲存輸入（5.6）

- **不**申請 `<all_urls>`／content script 讀表單。
- 首次危險操作前通用英文提醒（字串常數）。取捨：少權限 > 精準偵測。

## P2 選擇

1. **Hibernate（`tabs.discard`）**：分頁留在原位釋放記憶體；library 以可選網頁目標操作，不對 extension 自身頁丟棄。
2. **`URL | title` 純文字匯入**：方便從 OneTab 類工具遷移。
3. **不做跨裝置同步**：與本機限定衝突，明確放棄。

## 記憶體估計

- 公式：`totalClosed * 50` MB（僅計真正存起並關閉的累計），UI 標示 **estimate only**；`totalImported`／目前 `entries.length` 分開顯示，不得把 import／demo 算成已釋放。

## 型別草稿

- 保留並擴充 Codex 初稿 `src/types.ts`（schema v2、Request 聯集等）。
