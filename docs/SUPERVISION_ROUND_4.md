# Tabfold 第 4 輪獨立驗收

日期：2026-10-12。受驗 HEAD `76b534a23df980a5787a44328977768be7eba7e3`，分支 `feat/tabfold-extension`，唯一原文 `docs/original-requirements.md`。原附件與保存原文先前核對逐位元一致，SHA256 `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b`。

## 結論

**不通過，不可交付。** 第3輪原缺陷有實質改善，但新增／剩餘資料安全與UI錯誤，不能以工程師完成宣稱或基礎綠測替代原文驗收。第4輪修正為 `docs/cursor-correction-round-4.md`（R401–R420）。

本輪初期唯讀限制曾讓正式Vitest在建SSR暫存目錄前EPERM退出，0案例執行；Antigravity亦未獲UI操作核准。2026-10-12使用者明確要求继续Antigravity，檔案與UI操作現已可用；唯讀失敗不當產品缺陷或測試通過。現在已補跑正式gate及真Chrome，不沿用過時阻塞結論。

## 實際執行

根代理確認正確 `Memory Expansion — Task` 對話／唯一root／分支，工程師已停止修改，HEAD與工作區穩定後執行。

證據新路徑 `output/supervision/round-4/gates-2026-10-12/`；不覆写原歷史logs/report。

| 工程 gate            | 本輪實測                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| 依賴安裝             | npm ci --no-fund --ignore-scripts，exit0；相同鎖檔dev依賴，不執行安裝生命期腳本 |
| format:check         | exit0                                                                           |
| typecheck            | exit0                                                                           |
| lint                 | exit0，0 errors/warnings                                                        |
| 正式 unit            | 41通過／0失敗／0略過，exit0                                                     |
| build                | exit0，當前dist重新產出                                                         |
| 正式真 extension E2E | 4通過／0失敗／0略過，exit0；headless Chromium、不同profile                      |
| pack + ZIP完整性     | 已建dist後直接跑scripts/pack.ts與unzip -t，exit0                                |
| npm audit            | exit0，0 vulnerabilities；當時registry結果                                      |

8個基礎gate（format/type/lint/unit/build/E2E/pack/audit）全過；安裝與ZIP另列。這不是完整需求通過數。

根代理前次同HEAD已實跑原40個核心與14個UI受控場景全過；本輪不用把它們原樣重派為未修。CSS四檔零warnings，完全記憶體故意無效CSS產生warning可由現有gate阻擋；當時不是整個build故障注入。

新增核心探針實跑12個安全期望全部失敗，0 harness errors，原TypeScript+Storage/Chrome替身；UI新10個斷言6過4失敗0skip，兩類時序。分別在 `core-fault-results.json/log`、`ui-new-fault-results.json/log`；不是12或10條原文需求，也不冒稱mock是真瀏覽器。

根代理另外真正使用本輪新dist＋隔離headless Chromium＋自己127.0.0.1 fixture，公開JSON匯入特殊合法id：

| 流程                     | 結果                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| id constructor → Restore | 回opened1/removed1；實際targetTabs=[]、remaining=[]，**URL遺失** |
| id **proto** → Undo      | 回成功；實際targetTabs=[]、remaining=[]，**URL遺失**             |

命令 `node --import tsx output/supervision/round-4/prototype-real-browser.mjs`，exit1。`prototype-real-browser-result.json` 為真Chrome結果；context/server/profile在finally清理，未動日常Chrome與資料。Restore走公開import/API；Undo只於該隔離profile補有效Undo fixture，再走真background API。這項不含原生工具列click，不能把它稱native popup驗證。

## 全量審查與邊界

三份分工報告已讀相關全源碼／文件並對照唯一原文、前輪固定候選及回歸證據：`core-review-report.md`、`ui-review-report.md`、`evidence-review-report.md`。需求同83切片保守矩陣草稿由本輪 `requirements-matrix.md`／`counts.json`保存：22通過／34失敗／27有疑慮或未驗；切片不是探針數量。R401–R420逐項附本候選檔案行號、問題影響、最小修法及真驗證方法。

阻擋首先為journal原型直接刪URL、全raw驗證normalize、備份讀回錯誤不回滾、多毀損救援覆蓋與stale journal丟URL。其餘包含複合保存Undo不一致、fresh音訊、runtime先污染、UI有效Undo消失／舊target恢復／busy焦點／字串／錯誤、正式測試及文件證據缺口。

正式E2E已真實重跑，idle CDP停止喚醒有改善；尚不涵蓋途中save/restore/Undo回收或完整raw重啟。原生action popup、200%大字體、實際減少動態、完整keyboard焦點／圖示、連續1000筆frame/longtask、CPU/Worker heap/idle/coldwarm及Chrome Task Manager **本輪尚未驗證**。現有perf artifact與文檔不同值亦已確證，不能把普通tab p95直接推論原生失敗，也不能宣稱未測項全過。

本輪不重跑對已知資料遺失候選的無關長效能測試；先交辦修安全與測試範圍，再於freeze候選完整獨立驗收原文所有門檻。未驗項仍是未通過驗收，不能藉此省略。

## 交辦紀錄

2026-10-12 20:25（Asia/Taipei），根代理已透過cua_repl在正確Antigravity IDE `Memory Expansion — Task` 的 `Tabfold 功能開發修正與優化` 對話實際送出【第4輪修正：R401–R420】。AX已確認新的User message、Working與Cancel；後續又確認Ran git status -s、Analyzed output/supervision/round-4與cursor-correction-round-4.md#L1-120，工程師確實開始讀修正與證據，不是只整理prompt。完整修正文件與三份報告／新紅探針路徑均已交代。工程師執行時監工不改產品或並發跑其build/test，完成停碼後再獨立驗收。任何engineer自測或完工訊息仍需根代理確認；目前不宣告完成、不push、不部署/上架。
