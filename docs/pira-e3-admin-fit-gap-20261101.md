# PIRA工程E3 管理・出力 Fit/Gap

## 再利用

- Google Workspaceスタッフ認証、HttpOnly `staff_session`、`/admin` と `/api/admin` の認証ゲートを再利用する。
- PostgreSQL Pool、Migration runner、Zod strict schema、既存の管理画面静的配信方式を再利用する。
- PIRA受付Schemaだけを参照し、Sales Toolsの営業案件・Case・顧客マスタへ結合しない。

## 追加した最小差分

- `/admin/pira/` と `/api/admin/pira/v1/` を独立追加。
- `PIRA_ADMIN_EMAILS` allowlistに含まれるスタッフだけが施策変更・CSV/XLSX出力・保持期限候補確認を行える。空または未設定はfail closedで、他のWorkspace認証済みスタッフは閲覧のみ。
- Migration 039で出力件数、成否、失敗コード、施策集合を監査へ追加し、UPDATE/DELETE禁止triggerと検索・保持期限索引を追加。
- CSVはUTF-8 BOM、XLSXは1シート・固定11列。営業利用可否は画面だけに表示しファイルへ含めない。
- 出力上限は10,000件。監査書込みが失敗した場合はファイルを返さない。
- 受付2年・出力監査3年の削除候補を抽出するが、削除ジョブは実行しない。

## 出力監査の成功境界

`success=true`は、サーバー内でファイル生成が完了し、同じ出力条件・件数の監査INSERTが成功し、HTTPハンドラーがファイル応答を開始できる状態になったことを示す。監査INSERTは`res.send()`より前に行うため、監査失敗時はファイル本文を返さない。これはブラウザへの応答開始を表すサーバー側記録であり、利用者端末での保存完了・ファイルを開いたこと・利用者が内容を確認したことは表さない。

## 監査保持と権限

- 通常runtime roleは監査表のUPDATE/DELETE権限を持たず、追記専用triggerも維持する。
- Migration 040は3年を経過した監査だけを削除できる`SECURITY DEFINER`関数を追加し、PUBLICの実行権限を剥奪する。
- 本番では承認済み保守roleだけに関数のEXECUTEを個別付与する。通常API、管理画面、runtime roleからは実行できない。
- 削除ジョブ、保守role名、スケジュール、承認・復旧手順はDeployment Configurationであり、本PRでは作成・実行しない。

## `npm audit --omit=dev`（2026-11-01）

本番依存は20パッケージ（critical 1 / high 5 / moderate 14）が報告された。一括更新は行っていない。

| パッケージ | 重大度 | 今回の影響範囲 | 修正版 |
| --- | --- | --- | --- |
| `proxy-addr` | critical | Expressのproxy信頼・IP判定。既存依存で、PIRA XLSX固有ではない | あり |
| `@grpc/grpc-js` | high | Google系依存のTLS認証文脈・エラー露出。今回の管理出力経路では直接使用しない | あり |
| `body-parser` | high | 圧縮request body DoS。既存Express依存 | あり |
| `brace-expansion` | high | glob展開DoS。実行時に利用者入力をglobへ渡さない | あり |
| `nodemailer` | high | SMTP解析・TLS・DoS。既存OTPメール経路の直接依存 | `10.3.1`（major更新） |
| `zod` | high | 大型collection検証のメモリ消費。既存strict API検証の直接依存 | `4.6.7`（major更新） |
| `exceljs` | moderate | XLSX生成の直接依存。出力行は最大10,000件に制限 | audit提示は`3.4.0`だがdowngradeのため要個別評価 |
| `archiver` / `archiver-utils` / `zip-stream` / `readdir-glob` / `glob` / `minimatch` | moderate | ExcelJSのZIP生成依存。ファイルパス・globを利用者から受け取らず、メモリ上の固定構造だけを生成 | 一部あり／ExcelJS downgrade提示 |
| `uuid` | moderate | ExcelJS・Google系依存。問題対象のbuffer付きv3/v5/v6 APIを本処理は呼ばない | `11.1.1`系への更新要評価 |
| `gaxios` / `google-gax` / `retry-request` / `teeny-request` | moderate | 既存Google API依存。PIRA出力経路では直接使用しない | あり |
| `qs` | moderate | 既存Express query parsing DoS | あり |
| `rimraf` | moderate | 依存ツール。PIRA実行時の出力処理では使用しない | あり |

ExcelJS系の警告は、任意ディレクトリの圧縮やglob検索を行わず、固定ワークブックをメモリ生成する現在の経路では到達範囲が限定される。ただし解消済みとは扱わず、本番公開前に代替ライブラリ、上流修正版、依存overrideのいずれかを別承認で評価する。

## 公開前STOP

1. `PIRA_ADMIN_EMAILS`の承認済み本番値と変更手順。
2. Migration 039の本番適用、runtime roleの最小権限、切り戻し手順。
3. 2年・3年保持の削除ジョブ、バックアップとの整合、実行承認。
4. GENERAL同意文言の最終承認。
5. 上記依存警告のリリース判定。今回、依存の一括更新や本番変更は行わない。
