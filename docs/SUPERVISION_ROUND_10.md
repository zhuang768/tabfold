# 第 10 輪獨立驗收

日期：2026-10-13。固定實測提交 `49471fdbfe32576f35f67f538b60ac97ba348aac`；81 tracked 檔逐位元核對。工程師其後 amend 為 `8b488e45b808b57600c8c3e73f53de5c469460b6`，80 檔完全相同、唯一差異為 TEST_REPORT 首段一行文字。原始需求 SHA `6076de8521cd86fd6c8644d1cf59c80bebe153a1cf36407ee0e57922a13ca67b` 不變。

## 結果與判定

**原 83 項需求＝81 通過／1 失敗／1 未完成。8 項工程 gate 通過；1 項確認文件問題 R1001 尚待修正，GitHub 尚未交付。未宣告整個專案完成。** 逐條矩陣、計數在 `output/supervision/round-10/requirements-matrix.json`、`requirements-matrix.md`、`counts.json`，原 ID／引用／需求文字不變，需求切片不與測試斷言數混計。

- 隔離 archive 真正 `npm ci`：165 packages、audit 166、0 vulnerabilities。原 eslint deprecated 與 3 個 allowScripts 安裝 advisory 完整保留；未改全域設定或授權套件腳本。
- format／嚴格 types／lint／91 unit／build／pack／audit／真正載入擴充的 5 E2E 全通過，正式測試沒有 skip／放寬斷言。
- E2E 首次有工具 NO_COLOR／FORCE_COLOR 衝突警示；僅自有子行程移除重複 NO_COLOR，未用 `--no-warnings`、未改產品或全域設定。第二次相同 5 案例全過且無警示，首 log 保留。
- 13 個核心來源／正式 core 檔與已獨立驗證的 `2445d25` 逐位元相同，明確沿用其 51 項受控原碼實測；本輪不冒稱重新執行該 51 項。
- 新真瀏覽器核心 **121／121** 通過，包含真正副作用中途 Worker stop、整個 profile 重啟、三 scope、schema 故障、備份與 partial Undo；另 ResetSession 末端清除通過。
- UI 受控 **98 項中 96 通過、2 原策略診斷 FAIL 保留**：權威讀取暫時失敗時保留已確認且未過期的 Retry、錯誤可見、後端每次再核驗，裁定不違反原文；沒有刪改原 FAIL 冒稱全綠。
- 新真 UI **32／32** 通過，R907 Popup／Library 搜尋與實際群組交集、清除篩選及全庫不變 10 項通過，圖示／Hibernate 特殊保護／正常動態有限驗證通過。
- 根代理新真正 JSON 全欄位／group／whitelist／XSS／retain／batch／demo／legacy 流程 **25／25**、無痕預設拒絕 **13／13**、直接 CDP 真 Hibernate **7／7** 通過。
- 原生 Popup 兩組量測各 **20 次** 真 Search handler 與全 DB 一致通過。benchmark 兩種負載條件完整保留，不加總為去重功能數或挑低樣本。
- 打包 **20 runtime 檔與 ZIP 逐位元一致**，ZIP SHA `032081afdd4e0986d003291e315e977a18a13cbdecca29352d18a0755a3b9bed`。

## 量測與有限結論

唯一單獨執行的比較：30 次一般 Extension Tab DOM readiness p50 **137.57ms**／p95 **187.39ms**／0 > 200ms，1000 筆搜尋 **35.53ms**，觀察無 long task／long-animation-frame。原並行條件 p50 160.77ms／p95 255.41ms／7 > 200ms、1 個 147.4ms long-animation-frame 保留，無歸因資料不稱產品根因。

原生 Action Bubble API 至 CDP 首 handler 完成的觀察上界：小量 p50 **32.7ms**／p95 **289.9ms**／1 > 200ms；1000 筆 p50 **138.7ms**／p95 **484.2ms**／2 > 200ms。合理小量典型結果達到 200ms 目標，冷啟動尾端仍存在；不是每個樣本保證，不是精準 OS 點擊或純初始化時計，不扣除工具開銷。

實際本候選 Page／Worker heap 與 CPU sampling 已記錄；卸除偵錯器後 40 秒真 Worker targetGone／destroyed／stopped，無 console exception，自有資源全部關閉。原生 Task Manager 的來源 96.5MB 程序消失、Library 39.6→46.2MB 是明標候選 `a5c6e05` 的既有實測，不冒稱本提交重新量測，亦非全瀏覽器等額 RAM 節省。

正常前景動態（visible／no-preference）：fold-in end 0.32 秒、enter end 0.28 秒；Restore／Delete 有真 animation start，後端完成重新 render 可提前移除節點，未宣稱完整 280／220ms 全部展示。圖示四尺寸與 normal／active 在雙底色可辨識，解碼與真 setIcon 路徑成功；不是所有 OS 工具列像素實測。大字體、對比、500／640 寬與 Skip 的既有明標來源實測只在未改樣式／片段範圍沿用，另本輪正式 E2E 真 Skip／鍵盤／減少動態通過；不要求原文未指定的 320 手機或虛構 WCAG 全認證。

## 尚待修正與證據保護

`docs/cursor-correction-round-10.md` 的 R1001：TEST_REPORT 30–33 把工程師未提交的修正工作樹基準 SHA 當不可變成功提交，Hibernate 日期與候選也與 raw 不符。最小文件修正，禁止改產品／測試／舊失敗紀錄。

方法錯誤全部保留：歷史探針 live HEAD guard 不適用不可變 archive、正確回滾刪 bad backup 後舊 post-read 探針不適用、UI fixture 身分差異、背景動畫／文案預期、圖示 atlas 排列；採合法方法校正，不修改產品安全期望。根代理摘要 helper 的欄位及 archive 路徑篩選錯誤也保留原件與更正紀錄，不能當產品 failure 或抹去。

上一輪封存 316 件仍全數 SHA 相同。當前常見 5 類機密掃描：266 Git blob／82 workspace 檔 0 命中，不是所有編碼機密的絕對證明。未有 remote；GitHub CLI 目前可讀登入狀態，未建立 repo／push／部署／上架。

本輪完整 raw、方法、log、三份分區報告與 cleanup 位於 `output/supervision/round-10/`，歷史候選與初次失敗不覆寫。修正後核對新提交的文件與全產品 byte map，再完成交付授權準備。
