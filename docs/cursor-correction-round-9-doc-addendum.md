# 【第 9 輪修正：R904／R906 文件補充】

這是同輪文件收尾，非新產品需求。先完成目前 R907 工作，不取消正在執行的步驟。唯一需求仍為 `docs/original-requirements.md`，保留既有監工證據與使用者修改。

## 問題清單與修正要求

1. `PRIVACY.md:28`：宣稱 explicit cancellation 會實體移除 pendingConfirm；封存候選 2445d25 的 `src/ui/popup.ts:428–449` 取消分支只回報取消並 return，沒有移除 RPC。這會誤導資料保留承諾。最小修正為描述取消停止使用者操作、token 有效期及實際消耗／覆寫／session 重啟／Reset 等保留與移除機制；不要為文案另加清理產品功能。
2. `README.md:77`：perf 宣稱 true UI interactive readiness，腳本實際測 Extension Tab DOM readiness predicate，沒有首互動 handler。改為準確量測名稱，勿與原生 Action Popup 或 OS 點擊延遲混用。
3. `docs/KNOWN_LIMITATIONS.md:5`：宣稱必須先手動原生 Action Click 才能分離 Task Manager 程序差值，未受實測支持。移除該通用限制；保留已實測來源／Library PID 與 MB、未證明 Worker 共用 PID／全瀏覽器等額 RAM 的精確限制。`:3` 完整修完聲稱限定為工程師自測範圍，獨立完整驗收尚待，不宣告監工已通過。
4. `docs/TEST_REPORT.md:4,10–24`：工作樹自測、封存候選重測、歷史 perf、ignored output 診斷混列易誤認為同一候選全部重測。標清工程師測試日期、當時工作樹基準／修正範圍、raw 結果位置，提交後可補實際候選。未重測的 perf 用歷史候選／日期標示，不升作新提交通過。`output/engineer/...` 未追蹤腳本不能當 clean checkout 可重跑命令；可誠實標歷史／本機診斷，正式可重現回歸以 `npm test`、`npm run test:e2e` 等 tracked 指令為準；不要求把所有診斷移進 E2E。

## 必須使用的 skill／工具

- 沿用已適用的 code-review／ai-debt-detector 做文件與程式行為對照；若實際環境無此 skill，誠實說明並以 Git、rg、現有函式庫完成。
- Git 與既有 Node／測試工具核對版本、指令與原始結果；不新增依賴或帳號設定。

## 完成後驗證

- `npm run format:check`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`npm run test:e2e`、`npm run pack`、`npm audit`：可重用本次已完成且後續只有文件改動的自測結果，但逐项標明來源與實際数量／失敗／略過，不假裝重新執行。
- 搜尋以上四項舊承諾，確認文件與實際程式、量測時計、候選 provenance 一致。原文需求 SHA 不變。
- 保留並納入兩份第 9 輪 addendum；提供有意義本地 commit、乾淨狀態及完成摘要後停止產品修改，供監工獨立驗收。

## 禁止事項

不得改壞通過功能、刪除功能／測試、skip／放寬斷言、改寫舊失敗證據、冒用歷史量測為當前通過。不得 push、部署、上架或更改帳號／權限。此補充以文件最小範圍處理，不取消 R907 當前執行。
