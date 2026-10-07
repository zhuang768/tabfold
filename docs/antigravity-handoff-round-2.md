# Antigravity 第 2 輪修正交接

使用者於 2026-10-07 明確要求因 Cursor 用量耗盡，改由 **Antigravity IDE** 接續執行開發。Codex 仍擔任監工與品質驗收官；Antigravity 是執行工程師。本文件只交接工程師，驗收依據與專案範圍維持不變。

唯一專案根目錄：`/Users/zhuangzijin/Desktop/Memory Expansion`。分支：`feat/tabfold-extension`。交接時 HEAD：`5ce362c`。Cursor 尚未執行第 2 輪修正，因此接續 **同一第 2 輪**，不另計新輪次。

## 開工順序

1. 確認 IDE workspace、終端機 cwd 與 Git 分支是上述專案；其他 workspace 或工程師正在修改時不要介入。
2. 完整讀取唯一原始需求 `docs/original-requirements.md`、`docs/SUPERVISION_ROUND_2.md`、`docs/cursor-correction-round-2.md`。歷史文件中的「Cursor」工程師指稱，在此次交接後由 Antigravity 承接；保留歷史文件，不改寫舊驗收結論。
3. 讀取 `output/supervision/round-2/core-review-report.md`、`ui-static-audit.md`、`docs-audit-findings.md` 與相應蒐證腳本、log、JSON；不要將監工腳本 exit 0 當作產品通過。
4. 先列本機實際可用、適用的 skills／工具及用途，給短計畫後自主執行。原修正文件列出的六個 skill 是可讀的本機 `SKILL.md`；IDE 未提供同名指令時仍可讀取其完整操作指引，不能虛稱已使用不存在的 MCP／工具。
5. 依 `docs/cursor-correction-round-2.md` 完成全部 **R201–R220**，將失敗時序／故障確證轉成正式回歸。先 focused 修正測試，再停止修改候選並執行完整檢查。

## 最高優先的四個阻擋問題

- R201：`MutationQueue.active` 讓延遲抵達的外部請求穿透鎖；兩個分頁都關閉，最後只保存一筆，另一筆遺失。
- R202：首次安全提醒後傳出空 scope，被解讀成全部視窗，原本指定單頁却關閉不相關草稿頁；library 也直接略過首次提醒。
- R203：匯入重複 id，部分還原開一筆、失敗一筆卻移除兩筆，失敗網址遺失。
- R204：備份復原刪除唯一保存的毀損 raw，救援資料消失；現行 schema 仍有靜默修補。

詳細檔案、行號、影響、修法、驗證及禁止事項以第 2 輪修正文件為準。不可只加 retry、改成功摘要、放寬驗證或以 Known Limitations 包裝可修 bug。

## 完成與交付

實際執行 format、typecheck、lint、單元／整合／真擴充 E2E、build、有效效能量測、pack 與 dependency audit；CSS、真 popup、各特殊頁、並行、完整讀回、Undo、遷移／毀損／備份、完整匯入匯出、Worker 回收及同 profile 重啟均須按修正文件提供可核對證據。

逐項回報 R201–R220 的修改、真命令、exit code、斷言、artifact 與未驗證原因；更新正式測試、需求 checklist 及文件，有意義小步提交。保留所有監工文件並納入版本控制。最後回報 HEAD／git status，**停止修改等待 Codex 整個專案獨立再驗收**。不得自行宣告最終通過。

不得刪弱功能／有效測試、skip 或降低斷言，不改壞已通過部分，不動日常瀏覽器資料、其他專案、帳號／模型／費用／用量／授權。不得 push、部署或上架；GitHub 由 Codex 驗收通過後按使用者授權處理。P2 僅原選 Hibernate 與 URL｜title，保持本機限定。
