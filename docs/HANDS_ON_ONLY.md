# 只有使用者能親手做的事

以下無法由代理人代勞，需你在自己的環境完成：

1. 在**你的日常 Chrome 設定檔**載入 `dist/`（或 zip 解壓後目錄）並實際使用數天（代理人測試使用隔離 `/tmp` profile）。
2. 用 Chrome **工作管理員**（`Shift + Esc`）對照「存起前後」分頁記憶體。在 Round 5 驗證已透過原生 Chrome Task Manager 實測觀察到：合成 64MiB 來源頁存前工作程序約 96.5MB，存起關閉後該程序確實完全釋放消失；擴充功能主進程 Library + Worker 共用 PID 由 38.9MB 增加至 44.5MB，CPU 顯示 0.0%。手動驗證可重複此步驟檢視日常頁面之釋放幅度。
3. 決定是否上架 Chrome Web Store，並用你的開發者帳號送審（本專案僅準備英文素材草稿）。
4. 自訂快捷鍵衝突時，至 `chrome://extensions/shortcuts` 調整。
5. 無痕模式：若需要，於 `chrome://extensions` → Tabfold →「允許在無痕模式下使用」。
6. 真實影音播放中點圖示，確認取消／確認綁定行為（E2E 已用 AudioContext fixture 驗證授權流程；日常複雜串流媒體播放可手動實測）。
7. 驗收通過後的 GitHub 上傳／發佈由監工流程處理（代理人不 push）。
