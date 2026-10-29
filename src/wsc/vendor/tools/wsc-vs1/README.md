# WSC VS1（内部レビュー用試作）

既存の診断JSONをネットワーク接続なしで評価し、単一HTMLを生成する汎用ツールです。サイトの公開コード・PowerShell取得コマンド・CSV一括処理は変更しません。

```powershell
node tools/wsc-vs1/engine.mjs tools/wsc-vs1/fixtures/atlib-security-check-v2.json tools/wsc-vs1/fixtures/atlib-company.json tools/wsc-vs1/out-atlib.html tools/wsc-vs1/out-atlib-result.json
node tools/wsc-vs1/test.mjs
```

## Fit / Gap

- Fit: 入力JSON、企業情報、日時、根拠値から決定論的にHTMLを生成する。atLIBは回帰用fixtureのみであり、企業名・所在地・URL・結果をハードコードしていない。
- Fit: `rules.json` と `explanations.json` を実行時に読み込む。未定義条件は推測せず、利用者向け表示をせず内部記録に残す。
- Fit: v7基準の表紙、縦スクロール、概要FV、詳細、印刷ボタン、印刷用CSSを同一テンプレートで生成する。固定解説は添付ドラフトをそのまま同梱し、v7「はじめに」は別ファイルとテストで全文一致を検証する。
- Fit: URLはスキーム・ホスト・有効ポート・パス・クエリを正規化して完全一致を要求する。大文字小文字、既定ポート、末尾の`/`だけは表記差として扱う。`www`、別スキーム、別パス、リダイレクトは推測で同一視せず、生成を停止する。
- Fit: 指定7項目のFVは承認済み固定文を使い、補足は実測根拠から表示する。その他の判定IDは既存の固定解説の結果文を維持する。
- Fit: 最終デザインの共通写真・4種アイコンをHTMLへ`data:` URLで埋め込むため、生成HTML単体でローカル閲覧と印刷ができる。素材の出典・ライセンス確認状態は`assets/LICENSES.md`に記録する。
- Gap: CSPメタ指定、CSPの強度・frame-ancestors、SPF完全構文、DMARC例外値、TLS取得側が出す `UNVERIFIED` の利用者向け文言は、統括記録どおりVS1では未対応。
- Gap: ブラウザの印刷確認はローカルHTMLを開いて手動確認する工程。自動化された視覚確認は含まない。
- Gap: 提供素材の作成者・元URL・外部利用ライセンスは未提示のため、外部配布に必要な確認は未完了として記録している。
