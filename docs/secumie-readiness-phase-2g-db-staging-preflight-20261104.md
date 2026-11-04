# SECU Insight Phase 2G DB内部確認・Staging Preflight

照合日: 2026-11-04（Asia/Tokyo）

基準: PR #38 / `5fc668c973214deaa68e8c075ff478831207d3ab`

対象: GCP project `msp-zabbix` / region `asia-northeast1`

本書はRead-only調査と実行計画である。本番・StagingのDB、Cloud Run、Secret、IAM、LB、DNS、Migration、データ、Trafficには変更を加えていない。

## 1. 結論

- 本番Cloud SQL `msp-customer-portal-db` / `sales_tools`の再利用判定は **Conditional Fitを維持**する。
- 7日間の1分粒度では、PostgreSQL接続数は平均3.37、95パーセンタイル5、最大22だった。現状の実負荷は低い。
- 既存の承認済みRead-only DBセッションは存在しない。現在のGCPアカウントはproject Ownerだが、Cloud SQLにはBUILT_IN userのみでIAM DB userはなく、ローカル環境にもDB接続情報はない。Owner権限を理由にPasswordを取得・変更したりuser/roleを追加したりしていない。
- したがって、`SHOW max_connections`、`schema_migrations`、schema/role privilege、function ownerは未確認であり、Production No-Go条件として残る。
- Stagingは負荷上の余地があるが既存用途がある。既存database/revisionを変更せず、承認後に専用database・role・Cloud Run・test Secretを追加する隔離リハーサルは **構築可能性あり / 実行は要承認** と判定する。

## 2. DB内部メタデータのFit/Gap

### 2.1 確認した既存接続手段

| 項目 | FACT | 判定 |
| --- | --- | --- |
| 現在のGCP account | `yoshihisa.hagisaka@atlib.jp`、project roleはOwner | GCP resource metadataはRead-only取得可能 |
| 本番Cloud SQL users | `portal_app`, `postgres`, `ppap_app`, `ppap_sso_verify_app`, `sales_tools_app`, `sales_tools_migration`。すべてBUILT_IN | Read-only専用userなし |
| Staging users | `postgres`, `sales_tools_migration`, `sales_tools_runtime`。すべてBUILT_IN | Read-only専用userなし |
| IAM DB authentication user | 本番・Stagingとも確認できない | IAM login不可 |
| ローカル接続設定 | `DB_*`、`GOOGLE_APPLICATION_CREDENTIALS`は未設定 | 既存セッションなし |
| Secret | 名称・参照設定のmetadataのみ確認済み | Secret値は取得しない |
| リポジトリ | transactionを`READ ONLY`にするpreflight patternあり | 認証済み接続が得られれば再利用可能 |

`gcloud sql connect`はdatabase passwordを必要とし、現在の条件では承認済みRead-only接続にならない。既存passwordの取得、password reset、IAM DB user作成、権限追加は本工程の禁止事項に該当するため実施していない。

### 2.2 未確認メタデータ

次のSQLは未実行であり、結果を推測しない。

- `SHOW max_connections`
- `pg_stat_activity`のdatabase/application/user/state別集計
- `schema_migrations`のfilenameと037〜041の競合
- `public_auth`、`pira` schemaの存在
- role membership、schema/table/sequence/function privilege
- Migration実行role、SECURITY DEFINER関数owner、固定`search_path`
- `sales_tools_app`が既存管理処理に必要な権限を持つか

### 2.3 安全なRead-onlyアクセス条件

いずれかを統括・DB管理者が明示的に承認する必要がある。

1. 既存DB管理者が、所定のSQLだけを実行して個人情報を含まない結果を提出する。
2. 有効期限付きRead-only userを作成し、`CONNECT`、catalog参照、`pg_stat_activity`の非機密列、対象schemaのmetadata参照だけを付与する。作成・削除は別承認の変更作業とする。
3. 承認済みmigration roleの資格情報を短時間だけ使用し、`BEGIN READ ONLY`、statement timeout、許可SQL固定、監査ログ記録のpreflight Jobを実行する。Secret値を人やログへ表示しない。

推奨は1である。2または3の場合も、SQL allowlist、実行者、日時、接続元、結果保存先、資格情報失効方法を事前承認する。

## 3. 接続数予算

### 3.1 実測

測定期間: 2026-10-28 00:00 UTC〜2026-11-04 00:00 UTC。Cloud Monitoringの1分粒度。

| 対象 | 平均 | p95 | 最大 |
| --- | ---: | ---: | ---: |
| 本番PostgreSQL backends | 3.37 | 5 | 22 |
| Staging PostgreSQL backends | 2.28 | 3 | 5 |
| Staging CPU utilization | 11.0% | 13.31% | 54.75% |

Cloud Runの同期間の実instance最大値:

| Service | 設定max | 1分実測max | DB |
| --- | ---: | ---: | --- |
| `msp-customer-portal` | 5 | 2 | 本番共有 |
| `ppap-download-service` | 20 | 2 | 本番共有 |
| `ppap-upload-service` | 20 | 1 | 本番共有 |
| `ppap-virus-scan` | 20 | 3 | 本番共有 |
| `sales-tools` | 20 | 7 | 本番共有 |
| `sales-tools-staging` | 2 | 2 | Staging |

instance_countは0の期間に点がないserviceがあるため、平均値は接続予算に使わず最大値だけを参考にする。

### 3.2 Pool設定

- 統合リポジトリの共通`pg.Pool`はprocess当たり`max: 5`、接続待ち10秒である。
- OTP/PIRA runtimeはこのpoolを利用するため、追加接続上限は`5 × (OTP同時instance + PIRA同時instance)`である。
- 既存Portal/PPAPは別image/codebaseであり、実pool上限をこのrepositoryから確認できない。Cloud SQL backend実測には含まれるが、理論最大は未確認である。
- 既存`sales-tools`は現行revisionのsource artifactとの同一性を別途確認しない限り、repositoryの`max: 5`を現物確定値として扱わない。

### 3.3 予算シナリオ

`M = SHOW max_connections`、既存ピークを22、運用余裕を20%とする。新規接続を許容する条件は次である。

`22 + 5 × (OTP max instances + PIRA max instances) + migration/maintenance reserve <= 0.8 × M`

候補値を確定値として扱わないが、初期リハーサルで各runtimeをmax 1とした場合は最大10接続、各max 2なら最大20接続の追加となる。migration/maintenance用に少なくとも2接続を別枠で確保する。

例:

| Scenario | 新規runtime接続 | reserve込み必要枠 | 20%余裕を含む必要`M` |
| --- | ---: | ---: | ---: |
| OTP 1 + PIRA 1 | 10 | 34 | 43以上 |
| OTP 2 + PIRA 2 | 20 | 44 | 55以上 |

実`M`が未確認のため、本番maxScaleは決定しない。短時間burst、旧新revision併存、maintenance実行をStagingで検証し、実測ピークに応じて見直す。

## 4. DB再利用判定

**Conditional Fit（変更なし）**

Fitを支持するFACT:

- 1分実測の接続数、CPU、memory components、storageは現時点で低い。
- Backup 30世代、PITR 7日、Cloud Run Unix socket接続がある。
- Migration 037〜041と5主体の権限分離はローカルPostgreSQL 16で検証済み。

Fitを妨げるGap:

- 実`max_connections`と既存app pool上限が未確認。
- Migration ledger、schema/role/function ownerが未確認。
- `db-f1-micro`、ZONAL、複数本番service共用で障害影響範囲が広い。
- 同時scale、旧新revision併存、connection exhaustion、restoreを現物相当で未検証。

Fitへ変更する条件は、DB内部Read-only確認、接続budget承認、隔離Staging負荷試験、復元試験、runtime maxScale/alert/rollbackの確定である。一つでも満たせない場合は専用Cloud SQLを選択肢に戻す。

## 5. 隔離Stagingリハーサル実行計画

### 5.1 既存環境を維持する境界

- 既存`sales-tools-staging` service、revision、traffic、URL、databaseを変更しない。
- 既存`sales_tools_staging`、`sales_tools_staging_f4`へMigrationを適用しない。
- 既存userのpassword/privilegeを変更しない。
- 実顧客情報を使用しない。
- 本番SMTP、JWT鍵、Turnstile Secretを使用しない。

### 5.2 作成候補リソース

名称は承認前の計画値であり、まだ作成しない。

| Resource | 候補名 | 用途 |
| --- | --- | --- |
| Database | `secumie_rehearsal` | Migration 037〜041とsynthetic data専用 |
| DB roles | `secumie_otp_rehearsal`, `secumie_pira_rehearsal`, `secumie_admin_rehearsal`, `secumie_maintenance_rehearsal`, `secumie_migration_rehearsal` | 5主体の権限分離 |
| Cloud Run | `secumie-otp-staging` | OTP runtime、min 0/max 1開始 |
| Cloud Run | `secumie-pira-staging` | PIRA runtime、min 0/max 1開始 |
| Service accounts | 上記service別の専用SA | Cloud SQL/Secret/Loggingの最小権限 |
| Secrets | `secumie-staging-*` namespace | test SMTP、Turnstile、HMAC、JWT鍵、DB password |
| Test route | 承認済み限定URLまたはIAM保護経路 | 一般公開せずE2E |
| Restore target | `secumie-rehearsal-restore-YYYYMMDD` | 一時的な復元検証先 |

### 5.3 実行順序

1. 既存Staging利用者、保守時間、owner、費用負担、rollback責任者を承認する。
2. 現状のinstance metadata、backup成功、PITR時点を記録する。
3. 専用databaseと5 rolesを作成し、既存databaseへの権限がないことを確認する。
4. 専用databaseへ037〜041をfilename順に適用し、ledger、owner、privilegeを確認する。
5. syntheticなUNIONデータだけを投入する。GENERALは無効を維持する。
6. test SMTP capture、Turnstile test key、test-only RS256 key/kid、staging issuer/audienceを設定する。
7. 専用Cloud Run 2 serviceをmin 0/max 1、no production trafficで配備する。
8. OTP→JWT→受付→ANSWERING→8問→report→COMPLETED、管理/CSV/XLSX/監査、保持previewを実行する。
9. 並列E2Eで接続数を観測し、max 1からmax 2の順に承認範囲内で負荷を上げる。DB接続、CPU、memory、latency、5xxを記録する。
10. SMTP FAILED/UNKNOWN、Turnstile障害、JWT rotation、jti再利用、DB timeout、revision rollbackを検証する。
11. logical restoreとCloud SQL backup/PITR restoreを分離して検証する。
12. 検証終了後、専用Cloud Run/Secrets/roles/databaseを承認済み順序で削除し、既存service/DBに差分がないことを確認する。

### 5.4 Backup復元

database単位のlogical backup/restoreは専用`secumie_rehearsal`だけを対象にできる。Cloud SQL managed backup/PITRのrestoreはinstance単位であり、既存Staging databaseも一時instanceへ複製される可能性がある。

したがってmanaged restore rehearsalには独立承認が必要である。承認事項は、一時instance名、region、tier、暗号化、network/IAM、既存データへのアクセス禁止、検証SQL allowlist、保持時間、削除責任者、費用上限である。復元後は業務行を閲覧せず、instance/database/schema/ledgerのmetadataとsynthetic receiptだけを確認する。

### 5.5 Stop条件

- 既存Stagingのlatency/5xx/接続数が基準を超える。
- 接続使用率が承認済みbudgetの80%を超える。
- 既存database/schema/roleへの意図しない権限が見つかる。
- Migration ledger競合、owner不一致、rollback不能が見つかる。
- Secret、JWT、OTP、個人情報がlogへ出る。
- Backup/PITR時点、削除責任者、費用上限が不明。
- 既存serviceを置換またはtraffic変更する必要が生じる。

## 6. 追加費用と権限

- 既存Staging Cloud SQL内の専用database/roles自体にinstance固定費の追加はないが、CPU/storage/backup/loggingの従量増がある。
- Cloud Runはmin 0、低頻度検証なら主に従量。Artifact、Secret access、Loggingも従量である。
- Cloud SQLの一時restore instanceは稼働時間、storage、backup/network費用が追加される。作成から削除までの時間上限を承認する。
- 専用LBをリハーサルで作る場合は固定費が発生する。初期機能確認はIAM保護経路を優先し、LB/`trust proxy`最終確認だけを別承認に分ける。
- 必要権限はCloud SQL database/user作成、Migration実行、Cloud Run/SA/Secret作成、test invocation、Monitoring閲覧、restore instance作成・削除である。Owner常用ではなく実行者ごとの最小権限を事前に定義する。

## 7. 実行前の承認事項

1. Read-only DB metadata確認の方式、SQL allowlist、実行者、日時、結果保存先。
2. Staging専用database/roles/service accounts/Cloud Run/Secretsの名称と作成差分。
3. test SMTP、Turnstile、JWT issuer/audience/key/kidの値と管理者。
4. min/max instances、接続budget、負荷上限、停止判断者。
5. 既存Staging利用者への告知と保守時間。
6. logical restoreとmanaged backup/PITR restoreの範囲。
7. 一時restore instanceのアクセス制御、費用上限、削除期限。
8. rollbackと原状復帰チェックリスト、証跡保存期間。

## 8. 残存No-Go

- DB内部metadata未確認。
- PostgreSQL実接続上限と既存全service pool未確定。
- Staging書込み・resource作成が未承認。
- restore rehearsal未実施。
- 本番maxScale、DB roles、Secrets、IAM、DNS/LB、監視値未確定。

以上の解消と統括の明示的なGo判断まで、Production No-Goを維持する。
