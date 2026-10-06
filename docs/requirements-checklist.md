# Tabfold 需求追蹤清單

狀態：`未開始` | `進行中` | `完成` | `部分完成` | `无法验证` | `不做（已記錄）`

來源：`docs/original-requirements.md`（全文原樣，不可修改）

## 0–1 角色與語言

| ID   | 需求                             | 狀態 | 證據                                               |
| ---- | -------------------------------- | ---- | -------------------------------------------------- |
| R0   | 可安裝、可實際使用的完整擴充功能 | 完成 | `dist/`、`tabfold-extension.zip`                   |
| R1.1 | 產品介面英文；字串集中單一常數檔 | 完成 | `src/strings.ts`                                   |
| R1.2 | README／隱私權／商店文案英文     | 完成 | `README.md`、`PRIVACY.md`、`docs/STORE_LISTING.md` |
| R1.3 | 研究／設計／決策／測試報告繁中   | 完成 | `docs/RESEARCH.md` 等                              |

## 2–3 問題與核心解法

| ID  | 需求                                     | 狀態 | 證據                                  |
| --- | ---------------------------------------- | ---- | ------------------------------------- |
| R3★ | 儲存網址／標題／圖示 → 關閉 → 可重新開啟 | 完成 | `src/browser/library.ts` save/restore |

## 4 調查

| ID   | 需求                  | 狀態 | 證據                    |
| ---- | --------------------- | ---- | ----------------------- |
| R4.1 | 競品與內建功能調查    | 完成 | RESEARCH.md             |
| R4.2 | 差異點 2–3 個         | 完成 | DECISIONS.md            |
| R4.3 | MV3／儲存配額官方查證 | 完成 | RESEARCH.md（官方連結） |

## 5 架構與資料安全

| ID    | 需求                               | 狀態 | 證據                                   |
| ----- | ---------------------------------- | ---- | -------------------------------------- |
| R5.1★ | 先寫後關；失敗不關；批次誠實結果   | 完成 | library saveTabs + 單元 failing write  |
| R5.2  | 資料模型＋schema＋遷移＋毀損不靜默 | 完成 | types/migrate/storage CorruptDataError |
| R5.3  | storage 選型＋滾動備份             | 完成 | storage.local + backups                |
| R5.4  | SW 不依賴常駐狀態；監聽器頂層同步  | 完成 | registerServiceWorkerListeners         |
| R5.5  | 瀏覽器 API 與純邏輯分離            | 完成 | `src/core/*` vs `src/browser/*`        |
| R5.6  | 最小權限；未儲存輸入不請求全站讀取 | 完成 | DECISIONS + 通用提醒                   |

## 6 P0

| ID    | 需求                                                  | 狀態     | 證據                                    |
| ----- | ----------------------------------------------------- | -------- | --------------------------------------- |
| P0.1★ | 點圖示一鍵存起關閉＋回饋                              | 完成     | onClicked；DECISIONS 記錄               |
| P0.2★ | popup 與完整清單頁                                    | 完成     | popup.html / list.html                  |
| P0.3★ | 單筆／全部還原；預設移除設定                          | 完成     | restore + settings                      |
| P0.4★ | Undo                                                  | 完成     | undoLastSave                            |
| P0.5  | 特殊分頁七項實測                                      | 部分完成 | 邏輯完成；部分僅建議手動（TEST_REPORT） |
| P0.6  | 三種存入範圍                                          | 完成     | scope + UI                              |
| P0.7  | 搜尋／刪除／清空二次確認                              | 完成     |                                         |
| P0.8  | JSON 匯入匯出＋摘要                                   | 完成     |                                         |
| P0.9  | 設定頁（移除／範圍／深色／備份）                      | 完成     |                                         |
| P0.10 | 首次引導 ≤3 步可跳過                                  | 完成     | popup onboarding                        |
| P0.11 | empty/loading/error；鍵盤；對比；reduced-motion；demo | 完成     |                                         |

## 6 P1

| ID   | 需求                 | 狀態 | 證據                         |
| ---- | -------------------- | ---- | ---------------------------- |
| P1.1 | 可自訂快捷鍵         | 完成 | manifest commands            |
| P1.2 | 右鍵選單             | 完成 | contextMenus                 |
| P1.3 | 分組標籤／整組還原   | 完成 | edit-entry + restore-group   |
| P1.4 | 白名單               | 完成 | settings whitelist           |
| P1.5 | 誠實統計＋估計記憶體 | 完成 | stats + estimate disclaimer  |
| P1.6 | 原視窗／順序還原     | 完成 | createTabSafe index/windowId |
| P1.7 | 徽章數量             | 完成 | updateBadge                  |
| P1.8 | 大量還原分批保護     | 完成 | BATCH_RESTORE_THRESHOLD      |

## 6 P2

| ID  | 需求                    | 狀態 | 證據                                   |
| --- | ----------------------- | ---- | -------------------------------------- |
| P2  | 選 2–3 項並記錄價值成本 | 完成 | Hibernate + URL\|title 匯入；不做 sync |

## 7–12 設計／效能／隱私／測試／交付

| ID  | 需求                                | 狀態     | 證據                                |
| --- | ----------------------------------- | -------- | ----------------------------------- |
| R7  | 設計研究＋自製圖示＋微互動          | 完成     | DESIGN.md + public/icons            |
| R8  | 200ms／1000 筆／量測／無輪詢        | 部分完成 | 抽樣；1000 虛擬化未做               |
| R9  | 本機限定、CSP、不可信文字、資料說明 | 完成     | textContent、CSP、settings          |
| R10 | E2E／單元≥15／故障注入／限制誠實    | 完成     | 19 unit + 3 e2e + KNOWN_LIMITATIONS |
| R11 | 每階段可建置＋嚴格型別＋小步 commit | 完成     |                                     |
| R12 | dist＋ZIP＋文件齊全                 | 完成     |                                     |
