# 【第9輪補充 R907】篩選後空清單誤稱整庫沒有資料
原候選a5c6e05；這是第9輪派出後補驗發現的既有P0 empty/search狀態文案問題，不是資料遺失，也不是新增P2創意功能。
問題檔案+行號：src/ui/popup.ts:153–163、src/ui/list.ts:222–227；src/strings.ts:81已有STRINGS.noMatchingTabs。
真正原生證據：output/supervision/round-9/native-keyboard-restore.txt 畫面Search=shortcut、count0/3，卻No saved tabs yet＋再存引導；native-confirmation-attempt1-result.json最後sample持久庫確有3筆、總還原1。這兩份原raw已sealed並保留；UI唯讀代理亦核對，未為此重開Chrome。
最小修法：真正total0才顯原emptyTitle/emptyBody；庫total>0但search/group filtered0，復用現有noMatchingTabs，勿顯整庫首次存入引導。只改這個已確認狀態，不重設計、不添依賴/語言。兩surface一致，Library groupfilter亦合理處理。
驗證：必要UI回歸total0／有資料且零搜尋命中／清搜尋恢复資料，Library groupfilter0；真UI exact entries不變、count0/3和No matching tabs一致。保留原R901–R906、安全/Undo與全部已過功能與測試；不改sealed83矩陣/316raw/原期待來隱紅。完成共同跑原gate/必要UI回歸及新HEAD後供監工完整驗收。
補驗範圍：output/supervision/round-9-ui-completion/ 是舊a5凍結候選的独立補驗，真Skip及reopen7過、light/dark3surface主要文字/focus對比過、Library500/640合理桌面尺寸可達。320px只是壓力限制，native高度498只是headless可用尺寸方法限制，不增手機320或必須520高門檻。未拿舊a5補验冒稱工程師新候選通過。
