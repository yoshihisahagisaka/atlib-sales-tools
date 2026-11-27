# SECU Insight Readiness Phase 2C DB権限・保持運用記録

確認日: 2026-11-02

基準Commit: `6fd9842803c35ec09c4706f9933e73a4536d78e1`

## Fit/Gap

Migration 037〜040にはOTP・PIRA受付テーブル、管理出力監査、監査追記専用trigger、3年経過監査の保守削除関数が存在した。一方、次は未実装だった。

- OTP runtime、PIRA公開受付、Sales Tools管理、Migration、保持保守のDB権限分離
- OTP challenge/session等の24時間削除
- OTPセキュリティ監査の30日削除
- PIRA受付情報の2年削除
- 各保持処理の候補件数、削除件数、再実行安全性
- 環境固有role名をSQLへ安全に渡す手順

既存Migration 037〜040は変更せず、Migration 041と2つのCLIで補完した。

## Role別権限

本番role名はこの文書では確定しない。Deployment Configurationで既存role名を指定し、Migration実行主体が`secumie_deployment.configure_roles()`を一度実行する。関数引数はPostgreSQLの`name`型として受け取り、存在しないrole、重複role、Migration owner、superuser等の昇格roleを拒否し、識別子は`format('%I', ...)`で扱う。roleの作成は行わない。

| 主体 | 許可 | 明示的に不許可 |
| --- | --- | --- |
| OTP runtime | `public_auth`使用、lockのSELECT/INSERT/UPDATE、reservation/challenge/sessionのSELECT/INSERT/UPDATE | DELETE、PIRA schema、保持関数 |
| PIRA公開受付runtime | initiativeのSELECT、submissionのSELECT/INSERT/UPDATE、consumed_jtiのINSERT | DELETE、監査、OTP schema、保持関数 |
| Sales Tools管理runtime | initiativeのSELECT/INSERT/UPDATE、submission/jtiのSELECT、export auditのSELECT/INSERT | auditのUPDATE/DELETE、OTP schema、保持関数 |
| Migration主体 | Migration objectのownerとしてDDL・role設定関数を実行 | runtimeには使用しない |
| 保持保守主体 | 候補確認関数と固定保持期間の削除関数のEXECUTE | tableへの直接SELECT/INSERT/UPDATE/DELETE |

`PUBLIC`には対象schemaおよび保守関数の権限を与えない。監査保守関数は`SECURITY DEFINER`、固定`search_path`、PUBLIC EXECUTE取消を維持する。

実RepositoryのSQLを専用roleで実行して確認した結果、`otp_send_locks`の`SELECT ... FOR UPDATE`にはUPDATE権限が必要だったため、そのテーブルだけUPDATEを許可した。OTP送信履歴は`otp_send_reservations`が正本であり、INSERT/UPDATE権限を付与している。現行コードは`otp_send_events`と`otp_auth_audit`へINSERTしていないため、未使用テーブルへの権限は追加していない。DB監査イベントの記録を必須化する場合は、記録タイミングとresult codeを別途Contractに整合させるまで本番権限を先行付与しない。

## Deployment Configuration

権限設定コマンド:

```text
npm run build
npm run db:configure:secumie
```

Migration接続:

- `DB_NAME`
- `DB_MIGRATION_USER`
- `DB_MIGRATION_PASSWORD`
- `DB_HOST` / `DB_PORT`または`DB_SOCKET_PATH`

対象role名:

- `OTP_DB_ROLE`
- `PIRA_DB_ROLE`
- `PIRA_ADMIN_DB_ROLE`
- `SECU_MAINTENANCE_DB_ROLE`

設定処理はroleを作成しない。GCP現物で確認済みのroleだけを渡す。通常runtimeや保守主体には`secumie_deployment.configure_roles()`を実行させない。

## 保持ジョブ

コマンド:

```text
npm run retention:secumie
```

既定はpreviewであり、削除しない。候補件数をJSONログへ出力する。承認された保守実行時だけ`RETENTION_EXECUTE=true`を設定する。通常実行では日時を渡さず、DBサーバーの`clock_timestamp()`を基準とする。OTPとPIRAの削除は単一DB transaction内で実行し、一方が失敗した場合は全体をrollbackする。

再現用の`RETENTION_REFERENCE_AT`は現在以前だけを許可する。DB関数はNULLまたは将来日時を拒否するため、保守runtimeから保持期限を前倒しできない。過去日時は削除対象を狭めるだけで、保持期間を短縮しない。既存`pira.purge_export_audit_before()`も3年未満のcutoffを拒否し、保守roleには直接EXECUTEを付与しない。

保守接続:

- `DB_NAME`
- `DB_MAINTENANCE_USER`
- `DB_MAINTENANCE_PASSWORD`
- `DB_MAINTENANCE_HOST` / `DB_MAINTENANCE_PORT`または`DB_MAINTENANCE_SOCKET_PATH`
- `RETENTION_EXECUTE`（既定false）
- `RETENTION_REFERENCE_AT`（通常は未指定。ローカル検証・再現時のみISO日時）

固定保持期間:

| データ | 条件 |
| --- | --- |
| OTP challenge、reservation、session、send event | 24時間経過 |
| OTP send lock | 24時間経過かつ直近24時間のreservationなし |
| OTPセキュリティ監査 | 30日経過 |
| PIRA受付 | 2年経過 |
| 受付に紐づくjti | JWT期限経過、または削除対象受付に紐づくもの |
| PIRA出力監査 | 3年経過 |

出力イベント:

- `secumie_retention_preview`: 候補件数
- `secumie_retention_completed`: 候補件数と削除件数
- `secumie_retention_failed`: 秘密値を含まない失敗内容、終了コード1

再実行時は既に削除済みの行を対象にせず、削除件数0で正常終了する。

## 推奨運用（本番値は未確定）

1. 日次でpreviewを実行し、候補件数と異常増加を監視する。
2. 承認済み保守ジョブで`RETENTION_EXECUTE=true`を指定して実行する。
3. 成功イベントと削除件数をCloud Logging等で監視する。
4. 失敗時は原因を解消して同じ基準時刻で再実行する。処理は冪等である。
5. 初回本番実行前にCloud SQL backup/PITR状態を確認する。

本工程ではCloud Scheduler、Cloud Run Job、IAM、Secret、backup設定を作成・変更しない。

## ローカル検証

使い捨てPostgreSQL 16 DBへMigration 037〜041を新規適用した。

- Migration新規適用: PASS
- 4つのruntime/maintenance roleへの安全な権限設定: PASS
- OTP runtimeの必要操作: PASS
- OTP runtimeのDELETE・PIRAアクセス拒否: PASS
- PIRA runtimeの必要操作: PASS
- PIRA runtimeのDELETE・OTPアクセス拒否: PASS
- 管理runtimeの閲覧・initiative管理・監査INSERT: PASS
- 管理runtimeの監査UPDATE/DELETE・OTPアクセス拒否: PASS
- 保守主体のtable直接アクセス拒否: PASS
- 固定期間到達分のみ削除: PASS
- 未到達データ保護: PASS
- 再実行安全性: PASS
- 将来`reference_at`のDB側拒否: PASS
- 過去`reference_at`で未到達データを保護: PASS
- 実OTP/PIRA/Admin Repositoryを専用roleで実行: PASS
- SECURITY DEFINER、固定search_path、PUBLIC EXECUTE取消: PASS

## 本番前No-Go

- Cloud SQL instance/databaseと既存role名の現物確認
- Migration ownerと各関数ownerの確定
- 各runtime service accountとDB userの1対1対応
- 保守ジョブ実行基盤、承認者、schedule、timeout、retryの確定
- Secret Managerから各DB passwordを注入する権限
- Cloud SQL backup/PITR、復元手順、初回実行前backupの確認
- Cloud Loggingの保持、alert条件、実行ログ閲覧権限
- 本番Migration 041適用前のstaging rehearsal
- OTP DBセキュリティ監査をアプリケーションログで運用するか、`otp_auth_audit`へ記録するかの確定

上記が確定するまでProduction No-Goを維持する。
