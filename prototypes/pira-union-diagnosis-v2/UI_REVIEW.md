# UI改善・実画面レビュー対応（2026-10-19）

対象：Draft PR #16。変更前：c9860a07e0d538d4574edcd3129bacca5654866c。
診断の入力・意味状態・ルール・レポート内容を維持し、画面の可読性・余白・ブランド・戻り操作を改善した。

## 変更前後
|項目|変更前|変更後|
|---|---|---|
|1366×768の業務別サンプル下端|823.5px。初期画面の外|643.6px。4件とも初期画面内|
|1440×900の業務別サンプル下端|823.5px|643.6px|
|トップの説明本文|17px|17pxを維持。縮小で収めていない|
|トップの補足・サンプル説明|12px|14px|
|レポート本文|14px|17px|
|優先確認テーマの本文|13px|17px|
|現状表|13px|PC 16px、スマートフォン15px|
|チェックリスト本文・表|本文13px、表11px|本文17px、表PC 16px／スマートフォン15px|
|事故カード本文・補足|本文12px、補足12px|本文16px、補足14px|
|質問の選択肢|PC 15px、スマートフォン14px|全幅18px。分からない・担当外も18px|
|ブランド|atLIB＋仮の「a」マークが主表示|「情報管理セルフチェック」が主表示。提供者atLIBはフッター|
|サンプルからトップへ|明示的なボタンなし|各レポートの「トップページへ戻る」|
|トップ・サンプルを経由した自分の回答|サンプルで置換される|自分の回答とサンプルを別々に保持し、再開可能|

フォントと位置はChromium・ブラウザ倍率100%（deviceScaleFactor=1）で測定。PC 1366×768、1440×900、モバイル幅390px、320pxを検証。モバイルは1画面へ詰めず、説明・質問・結果を読みやすい大きさでスクロールできる配置とした。

## 画面証跡
- [トップ・変更前1366×768](evidence/ui-20261019/before-top-1366x768.jpg)
- [トップ・変更後1366×768](evidence/ui-20261019/after-top-1366x768.jpg)
- [トップ・変更後1440×900](evidence/ui-20261019/after-top-1440x900.jpg)
- [レポート・変更前1366×768](evidence/ui-20261019/before-report-1366x768.jpg)
- [レポート・変更後1366×768](evidence/ui-20261019/after-report-1366x768.jpg)
- [質問・変更前1366×768](evidence/ui-20261019/before-question-1366x768.jpg)
- [質問・変更後1366×768](evidence/ui-20261019/after-question-1366x768.jpg)
- [質問・320px](evidence/ui-20261019/after-question-320x760.jpg)
- [チェックリスト・320px](evidence/ui-20261019/after-checklist-320x760.jpg)
- その他の390px／320px・各画面の証跡は同じフォルダーに保存。

## 戻り・回答の保持
レポートと質問画面に明示的なトップへの戻りボタンを設置。ヘッダーのサービス名から戻る操作もページ再読込にせず、回答を保持する。

自分の回答中にトップへ戻り、4類型のサンプルを見ても、自分の回答を別のメモリー領域で保持する。「回答を続ける」は元の質問・選択へ戻り、完了済みの場合は「今のレポートへ戻る」で自分のレポートを再表示する。サンプルにも「直前のサンプルへ戻る」を用意。

「新しく回答する」だけが自分の回答を置換する操作。確認ダイアログで「今の回答を残す」を選べる。ブラウザの終了・再読込で消える仕様は変えず、永続保存や外部送信は追加しない。

## ブランドの構造
index.htmlにservice / provider / hostの表示領域を分離した。serviceはサービス名、providerはフッターの「提供：atLIB」。hostは空欄・hiddenで、将来の主催表示の配置先だけを用意している。主催・推奨の承認や使用許諾が得られた段階で別途変更する。現在PIRA主催表示はない。

画像ロゴを用いずテキスト表記に統一した。正式ロゴを確認せず仮ロゴを新設することはしていない。

## 変更しないもの・検証結果
- data.js、diagnosis.js、demos.js、既存test/fixturesの計8ファイルは変更前のSHA-256と完全一致。Answer Contract、Semantic State、Deterministic Rule、Report Contract、事故データ、実務資料、7件の期待値を変更していない。
- 診断テスト：**20 PASS / 0 FAIL**。既存3類型の完成本文全文も完全一致。
- 既存ブラウザ回帰：**16 PASS / 0 FAIL**。質問への回答、前後移動、修正、業務分岐・旧回答破棄、正常0件、オフライン動作、印刷を確認。
- 今回のUI検証：**17 PASS / 0 FAIL**。4画面幅の文字サイズ、初期表示、横はみ出し、4類型の戻り、途中回答/完了レポートの再開、サンプル経由の保持、明示的なリセットを確認。
- HTTPリクエスト・ブラウザ例外は0件。
- 印刷：3類型とも**A4・4ページ**。各ページの抽出本文が変更前PDFと完全一致。画面専用CSSを分離したため、既存印刷CSSは変更せず改ページ・表を維持。描画も確認。
- Production、DB、API、Cloud、共同購買機能、mainは変更していない。

[UIテスト・サイズ測定結果](evidence/ui-20261019/ui-results.json) ／ [ブラウザ回帰結果](evidence/ui-20261019/regression/browser-results.json) ／ [PDF照合結果](evidence/ui-20261019/pdf-results.json)

## 再実行
通常の診断テストとブラウザ回帰はREADMEを参照。UI追加検証は既存Playwright/Chromiumを指定して実行できる。

```powershell
node --test test/diagnosis.test.cjs
node test/ui-review.cjs
$env:PIRA_EVIDENCE_DIR = Join-Path $PWD 'evidence/ui-20261019/regression'
node test/browser.cjs
python test/ui-pdf-check.py
```

変更前画像も再生成する場合は、c9860a0のindex.htmlと同階層の5資産を独立フォルダーに置き、PIRA_UI_BEFORE_DIRにその絶対パスを指定する。PIRA_PLAYWRIGHT_MODULEとPIRA_CHROMIUM_EXECUTABLEはREADMEの既存ランタイム指定を使える。

実機スマートフォン、OSの表示倍率差、Safari、物理プリンターは今回も未検証。既存Current Design v1テスト2件の不一致には変更を加えていない。
