# Phase 3：固定解説レポート（2026-10-21）

`index.html` を開くと最新の5セクション版を利用できます。インストールやサーバーは不要です。

- [今回の変更・検証・未完了事項](PHASE3_REVIEW.md)
- [固定解説一覧・選択条件](FIXED_EXPLANATIONS.md)
- [全5種類の実務資料](resources.html)
- `npm test`：旧診断20件＋固定解説35件
- `npm run test:browser`：Playwrightによる現行5セクションの20件（PlaywrightとChromiumは開発検証時のみ必要）
- `npm run test:pdf`：先にブラウザ検証で生成した6PDFをpypdfで照合

「PDFで表示」はブラウザ内で作成したPDFを別タブに開きます。印刷ダイアログは呼びません。ブラウザ設定により保存される場合があります。

紹介文の確定全文との照合、人間専門家による追加固定解説の承認は未完了です。現時点は技術デモとして扱ってください。

---

以下は以前の6セクション版の実装記録です。現在の利用方法・検証は上記とPHASE3_REVIEWを優先します。

# 組合事務局の情報管理セルフチェック — ローカル試作品

**2026-10-19 UI改善版**：全画面の文字サイズ、トップの余白、ブランド表記、戻りと回答の再開を改善しました。[変更前後・最新の検証結果](UI_REVIEW.md)を参照してください。診断内容は変更していません。

PIRAのK氏への提案検討用。**フォルダー内の index.html をChrome/Edge等で開くとデモできます。インストール・サーバ起動は不要です。** 本試作品はPIRAの正式な主催・承認・推奨を示しません。PIRAロゴは使用していません。

## 確認手順
1. 一式をローカルへ保存・展開する。index.htmlと同階層のdata.js / diagnosis.js / demos.js / app.js / styles.cssを一緒に置く。
2. index.htmlを開き、「セルフチェックをはじめる」から回答する。共通7問＋業務別合計最大4問。分からない・担当外・該当なしも選べる。
3. 前の質問へ戻り、回答を変更できる。業務を外したときは、その業務の旧回答を破棄する。新たに表示した質問が未回答なら完了しない。
4. 最後に「結果とレポートを見る」を押すと、確定ルールで6セクションの結果を生成する。
5. 「回答を見直す」で編集へ戻れる。「回答・根拠を見る」は版・判定根拠・ハッシュを画面内に表示する。必要なら全文を選択・コピーして手元に保存する。ブラウザ内への永続保存・保存ファイルの再読込はない。
6. 「印刷・PDF保存」でブラウザの印刷画面を開く。A4・倍率100%を基準に、PDF保存を選ぶ。検証環境では3類型とも4ページ。ブラウザのヘッダー/フッターはOFF、背景グラフィックはONを推奨。
7. K氏への短いデモでは、最初の4つの業務別サンプル→確認テーマ→書き込める実務資料→回答編集、の順で示せる。すべて架空回答。教育・研修例は既存MEMBERSHIP分岐で、質問/選択肢IDを追加していない。

画面を閉じる・再読み込みすると回答は消える。サンプルは実在団体の状況ではない。無料相談・企業向け案内のボタンは説明ダイアログのみで、申込・送信を行わない。企業向け診断がすでに提供されているような表示もしない。

## 実装境界
- 本フォルダーだけで完結し、DB、API、認証、通知、顧客登録、共同購買、AI、ブラウザ保存を使用しない。
- 実行アプリのHTTPリクエストは0。CSPはconnect-src/form-actionをnoneに固定。公式出典へのリンクは利用者が明示的に開く場合だけで、診断処理による取得はない。
- public/配下へ置かず、既存Express配信・Productionに接続しない。サーバ・Cloudリソース・migration・既存package.jsonは変更しない。
- PR #13 / #14のコード・設計・ブランチに変更を加えない。
- 評価の正本はSemantic StateとT01〜T08の固定ルール。点数・危険度・製品推薦なし。UNKNOWNだけで優先テーマを作らず、0件終了を許容する。

## Canonicalと判断の継承
|対象|確認結果|
|---|---|
|実装基準|Draft PR #15、48ef973b749021ef314cbe01ac80b210a7dac3e4|
|Sales main|着手時 d35581cec3dbc7d4ca2938f2a9c664906ccc5316。PR15はその直上の文書commit|
|既存Production Canonical|atlib-sales-tools/main。ローカル試作品をProduction Canonicalへ昇格させない|
|Corporate Issue #43|組合自身への支援→価値の実感→所属企業への任意案内の順序を維持|
|Package B/C ADR|版とexact stateのprovenance、および人の保存と再分析の責任分離を確認。今回は人手ヒアリング・DB保存を導入しない|
|PIRA公開160件分析|業務類型・参加価値の参考。公開調査から個別組合の回答を補完しない|

既存記録はPR15 docs/pira-union-diagnosis-v2-design-20261018/の7文書を参照。今回のミラーにはGit管理情報がないため、GitHubの固定SHA・比較API・ファイルAPIで基準を確認した。実環境の台帳・稼働revisionを確認した意味ではない。

## 再利用した既存資産
|資産|実際の再利用方法|流用しない部分|
|---|---|---|
|Sales src/domain/diagnosisReport.ts のcontentHash（基準SHA内）|再帰的なobject key整列と配列順維持のコードをcanonicalStringへ抽出。SHA-256はブラウザ標準Web Cryptoへ置換|node:crypto、DB・AI・旧5章schema|
|Corporate public/business-web/self-check/self-check.js（1caa2eb1fec2d887a41130b0aa0fdf102493562b）|escape関数の実コードを適用。複数選択の排他、前後移動、登録不要の画面状態遷移パターンを継承|軸平均・メーター・方向分類・confidence・相談API|
|IT経営のSemantic State / Guardの設計|未確認/担当外/認識の区別、根拠付き固定文、健全終了。PIRAの小さな判定アダプタへ適用|業務固有のM01〜M06ルールはPIRAへ改名流用しない|
|PR15完成レポート・固定資料|文章と出典データをdata.jsへ構造化。3完成本文を独立fixtureとし全文一致検証|AIの分析・文章生成、外部からの動的事故情報取得|
|既存PDF安全思想|同じ確定結果の印刷、固定出典、安全escapeを継承|専用PDFサービス・Playwright常駐APIは新設しない。PlaywrightはQAのみ|

汎用エンジンの再構築や既存Mルールの書換えは行わない。diagnosis.jsはPR15のPIRA用入力検証・意味変換・8テーマのbounded adapter。全既存サービスから独立している。

## 今回の指示に合わせた表示上の整理
- PR15 F01の意味結果checklistIdsはK01/K02/K03/KUのまま完全一致する。今回の「資料最大3種類」に合わせ、Web/PDF第5章は優先テーマ対応の3資料。KUは第3章の未確認事項整理欄に添える。優先テーマ0件ならKUまたはK00を第5章に出す。
- JSONに含むcanonical MarkdownはPR15完成本文を保持し、画面は表示版PIRA-PROTOTYPE-1.0.0でこの配置を行う。画面と印刷は同一DOM・同一確定結果を使い、印刷時に再判定しない。
- 教育・研修はPR15のMEMBERSHIPを使う。独立のEDUCATION質問ID・回答ID・新分岐を設けない。デモ選択用の名前だけがEDUCATION。
- 引継ぎ申込・フォーム送信は未実装。PDFはwindow.print()のみ。ハッシュ付き記録はローカルダイアログでコピー可能とし、自動ファイル保存には依存しない。

## テストの実行
Node.js 22以降を推奨。診断テストは追加依存なし。

```powershell
cd prototypes/pira-union-diagnosis-v2
node --test test/diagnosis.test.cjs
```

ブラウザ検証は開発環境のPlaywrightとChromiumを使う。アプリ利用には不要。

```powershell
# Playwrightが通常のモジュール探索先にある場合
node test/browser.cjs
# 既存ランタイムのモジュールやブラウザを使う場合は、実在する絶対パスを指定
$env:PIRA_PLAYWRIGHT_MODULE = '<既存Playwrightのディレクトリ>'
$env:PIRA_CHROMIUM_EXECUTABLE = '<既存Chromium実行ファイル>'
node test/browser.cjs
# PDFの文字・A4・出典確認（pypdfを備えたPython）
python test/pdf-check.py
```

結果は[VALIDATION.md](VALIDATION.md)とevidence/を参照。既存Current Design v1の既知テスト2件は変更せず、新規試作品テストと区別している。既存全体の回帰が新たにPASSしたという主張はしない。

## ファイル
- index.html / styles.css / readability.css / app.js：ローカル画面・印刷。readability.cssは画面専用で、既存の印刷CSSを維持
- data.js：固定資料・文章・コンテンツ版
- diagnosis.js：入力契約、意味変換、判定、レポート、ハッシュ
- demos.js：架空のデモ回答
- test/fixtures/：PR15由来の独立期待値と3完成本文
- evidence/：PC・スマートフォン画面、3類型PDF、テスト結果、印刷目視証跡

## 未完了・商用化の追加要件
実組合による言葉・所要時間の検証、PIRA主催表示の許諾、無料提供範囲・窓口・費用、公開方法・保持方針、正式な版公開/改訂体制、事故資料の更新、アクセシビリティ監査、Safari/実機スマートフォン/実プリンターの検証は未実施。今回のスマートフォン検証はChromiumのviewport表示であり、iPhone実機ではない。

紙保管、国外共有、委託先、持出端末、訪問・面談時の詳細運用、ウイルス対策等の網羅的評価はPR15の範囲外。既定の質問を増やさず、評価済みと見せない。専用の訪問時持出チェックリストを増やす場合は別の契約判断を要する。

認証・DB・相談受付・企業版診断・共同購買連携は、デモ前に必要な機能ではないため未実装。Production公開・mainマージ・Cloudリソース作成は行っていない。
