# WSC × Sales Tools 実装記録（Draft）

## 実装した接続

- `/admin/web-security-check.html` と `/api/admin/web-security-check` は、既存の Google Workspace スタッフ認証ゲート配下に追加した。
- 完成済み WSC VS1、Phase 2A〜2C のモジュールは、`src/wsc/vendor/` に原文のまま取り込んだ。Sales Tools 側には、認証済みの単一実行を Phase 2C の一回限り能力契約へ接続し、VS1 HTML と既存 Playwright によるPDF出力をつなぐ薄いアダプターだけを置いた。
- 診断JSON・HTML・PDFをDBまたはGCSへ保存しない。PDFのバイト列だけを応答し、ブラウザの File System Access API が利用者の選択先へ書き込む。
- CSVはブラウザが読み込み、各物理行を既存 WSC CSV パーサーで検証してから、一社ずつ `/diagnose` を呼び出す。所在地は既存仕様どおり空欄可。

## 未実装：CSV ZIP

既存 `wsc-delivery` のZIP生成はローカルのバッチ成果物・内部保存領域を入力にする。今回の契約では、CSV全体をサーバーへ送らず、企業別PDFをブラウザへ逐次返し、サーバーに成果物を保持しない。

そのため、既存配送コードをそのまま再利用してZIPを作ることはできない。ブラウザ側ZIP実装またはサーバー側の一時バッチ保管が必要になるため、今回の実装には含めていない。統括判断なしに、そのいずれも追加しない。

## 検証範囲

- Synthetic DNS・transportとPDFレンダラー注入で、外部通信なしにWSCの取得→確定論的判定→HTML→PDFバイト列の接続を確認した。
- PDF実機・Chromeのフォルダ選択は、Cloud Runへのデプロイを行わない今回の範囲外であり未検証。
- Sales Tools既存のHTTP待受を必要とする回帰は、現在の隔離環境で `127.0.0.1` への接続が拒否されるため未完了。テスト本体のロジック失敗ではない。
