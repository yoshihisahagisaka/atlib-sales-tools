# PIRA共同購買 Phase 1 検証結果

## 結果

- 全アプリ TypeScript strict build：PASS（既存インストール済みTypeScript 5.9.3/依存をread-only参照、依存版変更なし）。
- 追加テスト：**12 PASS / 0 FAIL / 4 SKIP**。
- ブラウザ：**4ケースPASS**（社内/企業 × PC1280px/モバイル390px）。模擬API、XSS文字列のtext描画、横overflowなし、企業の組合/条件選択、社内設定非表示を確認。
- 既存テスト7ファイル：**78 PASS / 2 FAIL / 1 SKIP**。失敗2件は未変更mainのdomain/testを別領域で再取得して同じ失敗を再現（main単独Current Design v1：9 PASS / 2 FAIL）。
- JS構文：UI・preflight・worker PASS。
- 実DB preflight：専用read-only接続未設定でSKIP。
- Production revision/image：gcloud認証DBのPermission deniedで未確認。認証情報の複製/権限回避なし。

## 受入条件との対応

| 条件 | 今回の検証 |
| --- | --- |
| 1 企業申込 | 企業principal→申込保存、サービス/条件/数量をserver検証 |
| 2 所属組合 | 確認済み所属のFK/現在activeを確認。未所属/別企業拒否 |
| 3 自組合だけ閲覧 | A/B組合・A/B企業で一覧/詳細/価格条件の越境拒否 |
| 4 発注権限 | 委任なし組合担当者・企業を拒否、組合管理者を許可 |
| 5 atLIB反映 | 正式発注が共通orderへ保存され社内一覧で参照可能 |
| 6 二重発注防止 | 20回同時再送で1件、異なるkey/版/AUTO拒否。DBのapplication_id UNIQUEも設定 |
| 7 条件固定 | server承認条件からsnapshot、HTTP単価追加指定拒否、order更新trigger拒否 |
| 8 状態監査 | 差戻し/修正/取消・古い版拒否、監査失敗時の全rollback |
| 9 通知失敗 | 未設定/配送例外/再試行・別email配送。申込/発注は保持 |
| 10 既存管理回帰 | 全体build、staff cookie/既存見積routerの独立性、既存golden/repositoryテスト。基準時点の既知失敗2件を区別 |

## 既知の基準失敗（今回修正しない）

main d35581c の `test/currentDesignV1.golden.test.ts`：

1. Golden 5: Lean Scaling selects M04 as opportunity confirmation, not a problem
2. Case 3 guard: Q7のSolution HypothesisがInitial Rule、Focus、Verification Purposeを変えない

両方とも期待値にないM05_GROWTH_CHANGE_ADAPTATIONの候補が追加される差異。基準SHAのdomain全27ファイル＋同testを別領域へ再取得し、同じ2件を再現。共同購買でdomain/testを書き換えていない。既存診断の仕様判断は別レーンへ引き継ぎ、今回のコードで期待値を変更しない。

## 実証していない項目

4つのSKIPは、実PostgreSQLの複数接続/プロセス排他と実効runtime ACL・ledger、Google実ログイン、Slack/SMTP実配送、Production/既存company実測。PGliteではadvisory lockを単一接続queueに置換し、HTTP harnessはsocketなし・parsed body adapterを使用する。ブラウザは実UIを動かすがroute模擬でありbackend/IdPを接続していない。

最初のテスト実行ではJSONBのkey順序差でsnapshot比較が失敗し、canonical比較へ修正した。loopback EACCESはsocket-free harnessで検証範囲を限定した。npm offline ciはzod未cacheで失敗。初回Playwrightはsandbox既定のbrowser pathに実体がなく、既存インストール先を明示して4ケースPASS。いずれもCloud/実DB/依存版/認証設定は変更していない。

コード/文書はレビュー可能だが、実環境へ適用済み・商用利用可能という意味ではない。
