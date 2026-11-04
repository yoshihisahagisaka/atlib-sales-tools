# SECU Insight Phase 2H 隔離Staging実行Runbook・検証契約

作成日: 2026-11-04（Asia/Tokyo）

基準: PR #39 / `bb310eddc0dfbf7a205618240140039805819d6d`

対象: GCP project `msp-zabbix` / region `asia-northeast1`

状態: **準備完了・実行未承認**

本書のコマンドは承認後に指定実行者が使う候補であり、本工程では実行していない。本番・StagingのDB、Cloud Run、Service Account、Secret、IAM、LB、DNS、Migration、データ、Revision、Trafficには変更を加えていない。

## 1. 固定した隔離境界

### 1.1 作成予定リソース

| 種別 | 固定名 | 用途 |
| --- | --- | --- |
| Database | `secumie_rehearsal` | Migration 037〜041、synthetic UNIONデータ |
| DB login/role | `secumie_otp_rehearsal` | OTP runtime |
| DB login/role | `secumie_pira_rehearsal` | PIRA runtime |
| DB login/role | `secumie_admin_rehearsal` | 管理runtime検証 |
| DB login/role | `secumie_migration_rehearsal` | Migration owner/実行 |
| DB login/role | `secumie_maintenance_rehearsal` | 保持関数のみ実行 |
| Cloud Run | `secumie-otp-staging` | OTP専用runtime |
| Cloud Run | `secumie-pira-staging` | PIRA専用runtime |
| Service Account | `secumie-otp-staging` | OTP runtime最小権限 |
| Service Account | `secumie-pira-staging` | PIRA runtime最小権限 |
| Service Account | `secumie-rehearsal-ops` | Migration/保持。runtimeと分離 |
| Secret prefix | `secumie-staging-*` | rehearsal専用資格情報・鍵 |
| Artifact image | `secumie/otp-staging:<SHA>` | `otp-runtime` target |
| Artifact image | `secumie/pira-staging:<SHA>` | `pira-runtime` target |
| Synthetic initiative | `pira-union-rehearsal` | UNIONだけを検証 |

GENERALは無効とする。既存`sales-tools-staging`、`sales_tools_staging`、`sales_tools_staging_f4`、既存user、revision、traffic、URLを変更しない。

### 1.2 実行主体

| 主体 | 許可される操作 |
| --- | --- |
| DB管理者 | metadata SQL、database/login作成、migration roleへの必要権限付与 |
| Migration実行者 | `secumie_rehearsal`だけへ037〜041適用、role設定 |
| Platform実行者 | 専用SA/Secret/Cloud Run作成、監視、rollback、cleanup |
| 検証者 | synthetic dataによるE2E、負荷・障害試験 |
| 停止判断者 | 閾値超過、既存Staging影響、秘密漏えい時の即時停止 |

担当者名、実行日時、保守時間、費用承認番号が空欄のまま実行しない。

## 2. 実行前承認票

次を一つの承認記録に固定する。

- 対象project/region/Cloud SQL instance
- 基準Commitとcontainer image digest
- 作成リソース全件
- 既存Stagingのownerと利用時間帯
- 実行者、確認者、停止判断者、cleanup責任者
- 監視期間と費用上限
- test SMTP、Turnstile、JWT issuer/audience/kidの管理者
- logical restoreの範囲
- managed backup/PITR restoreを実施するか否か
- 証跡保存先と保存期間
- 原状復帰期限

承認対象をStage A〜Eに分割する。前StageのPASSと次Stageの個別承認なしに進めない。

## 3. DB管理者向けRead-only内部確認

### 3.1 実行条件

- 第一候補は既存DB管理者による実行。
- Secret値を人へ渡さない。password reset、新規Read-only role作成、IAM DB user追加をこの確認に含めない。
- databaseは本番なら`sales_tools`、Stagingなら承認された対象名を明示する。
- `psql`は`ON_ERROR_STOP=1`、transactionは`READ ONLY`、statement/lock timeoutを使用する。
- 出力は業務行、SQL本文、client address、認証情報を含めない。

### 3.2 SQL allowlist

正本:

`scripts/readiness/secumie-phase2h-db-metadata-readonly.sql`

実行例（資格情報の取得方法はDB管理者の承認済み手段を使用し、コマンド履歴へpasswordを書かない）:

```powershell
$env:PGDATABASE = '<approved-database>'
$env:PGUSER = '<approved-db-admin-or-readonly-user>'
$env:PGHOST = '<approved-cloud-sql-proxy-or-socket-endpoint>'
psql --set=ON_ERROR_STOP=1 --file scripts/readiness/secumie-phase2h-db-metadata-readonly.sql
```

確認結果:

- `max_connections`
- DB/application/user/state別の接続件数のみ
- 037〜041のledger filename/時刻
- `public_auth` / `pira` / `secumie_deployment` owner
- role属性とtable/function privilege
- SECURITY DEFINER、function owner、固定`search_path`

業務tableの行はSELECTしない。SQL失敗時は権限追加で続行せず、エラーコードと対象query名だけを報告する。

## 4. 共通事前記録

すべてRead-onlyで採取し、承認記録のartifact directoryへ保存する。

```powershell
$Project = 'msp-zabbix'
$Region = 'asia-northeast1'
$Instance = 'sales-tools-staging-db'
$Evidence = '<approved-local-evidence-directory>'

gcloud config list
gcloud sql instances describe $Instance --project $Project
gcloud sql backups list --instance $Instance --project $Project --limit 5
gcloud run services describe sales-tools-staging --region $Region --project $Project
```

Cloud Monitoringのconnection、CPU、memory、storage、instance count、latency、5xxは、Phase 2Gで使用したMonitoring APIのRead-only queryを同じ期間・集計条件で再実行する。

記録するbaseline:

- Cloud SQL connection count、CPU、memory components、storage
- `sales-tools-staging` revision/traffic/instance数/5xx/latency
- database/user一覧（名前・種別のみ）
- backup/PITR設定と最新成功backup
- 既存リソース名一覧

Secret値、environment value、業務データは証跡へ出さない。

## 5. Stage A — DB隔離検証

### A-0 事前条件

- Stage Aの変更承認済み。
- metadata SQL結果に番号・schema・role競合なし。
- `SHOW max_connections`と接続budgetが承認済み。
- 最新backup成功を確認済み。
- database/role作成者と削除者が確定済み。

### A-1 Databaseと5主体

Database作成コマンド候補:

```powershell
gcloud sql databases create secumie_rehearsal --instance sales-tools-staging-db --project msp-zabbix --charset UTF8
```

現在の`gcloud sql users create`はpasswordをprocess引数で受けるため、Runbookには秘密値を含むuser作成コマンドを記載しない。5 usersは、DB管理者の非表示対話入力またはSecret値を引数・標準出力・ログへ出さない承認済み自動化で作成する。方式が承認されるまでA-1はSTOPとする。

DB管理者はmigration roleに`secumie_rehearsal`だけの接続・schema作成権限を与える。他databaseへの権限がないことを確認する。runtime rolesはMigration 041の`configure_roles`実行前にelevated属性がないことを確認する。

### A-2 Migration 037〜041

全Migration directoryを誤って適用しない。承認済みCommitから037〜041だけをimmutable artifactへコピーし、SHA-256 manifestを作る。標準`Dockerfile`の`migration` targetは全Migrationを格納するため、そのままこの専用DBへ実行しない。

```powershell
$MigrationDir = '<approved-temp-directory>\migrations-037-041'
New-Item -ItemType Directory -Path $MigrationDir
Copy-Item migrations/037_public_service_otp.sql,migrations/038_pira_public_intake.sql,migrations/039_pira_admin_export.sql,migrations/040_pira_export_audit_retention.sql,migrations/041_secumie_db_operations.sql -Destination $MigrationDir
Get-FileHash "$MigrationDir\*.sql" -Algorithm SHA256

```

承認済みmigration実行環境へ、build済み`dist/db/migrateCli.js`とこの5-file directoryだけを同一artifactとして格納する。Job内では`MIGRATIONS_DIR`をそのdirectoryへ固定し、`DB_NAME=secumie_rehearsal`、migration user、Cloud SQL socket、password Secretを環境注入して`node dist/db/migrateCli.js`を実行する。Job定義・image digest・5-file manifestを実行前に二者確認する。適用前にledgerが空であること、適用後に5 filenameだけが存在することを確認する。

### A-3 Runtime権限設定

```powershell
$env:OTP_DB_ROLE = 'secumie_otp_rehearsal'
$env:PIRA_DB_ROLE = 'secumie_pira_rehearsal'
$env:PIRA_ADMIN_DB_ROLE = 'secumie_admin_rehearsal'
$env:SECU_MAINTENANCE_DB_ROLE = 'secumie_maintenance_rehearsal'
node dist/db/configureSecumieDbRolesCli.js
```

Migration roleは関数ownerのままruntimeにしない。OTP/PIRA/admin/maintenanceの許可SQLが成功し、他schema、他table、直接DELETE/DDL、監査UPDATE/DELETEが拒否されることを実DBtestで確認する。

### A-4 保持処理

まずpreviewだけを行う。

```powershell
$env:DB_MAINTENANCE_USER = 'secumie_maintenance_rehearsal'
$env:RETENTION_EXECUTE = 'false'
node dist/db/secumieRetentionCli.js
```

syntheticな期限到達/未到達dataを投入した後だけ、別承認でexecuteする。未来時刻による短縮削除拒否、期限到達だけ削除、再実行安全性を確認する。

### A Success / Stop / Rollback

PASS:

- ledgerが037〜041の5件だけ。
- 5主体が相互分離され、既存databaseへ権限なし。
- migration/function ownerが想定どおり。
- 保持preview/executeと拒否testがPASS。
- 既存Staging metricsに異常なし。

STOP:

- ledger/schema/role名競合、elevated runtime role、既存database privilege、想定外owner。
- 接続budget 80%超過、既存5xx/latency増加、Secret/個人情報のlog出力。

Rollback:

- Migration途中失敗時はrunnerのtransaction rollbackを確認し、独断で手修正しない。
- Stage Aだけで停止する場合、証跡取得後に専用databaseを削除し、専用usersを削除する。正確な対象名を再照合し、既存名を対象にしない。

## 6. Stage B — Runtime検証

### B-0 事前条件

- Stage A PASS。
- test-only SMTP capture、Turnstile test key、RS256 key pair/kid、HMACが承認済み。
- 本番Secret/顧客情報を使用しない。
- Artifact imageは基準Commitとdigestを記録済み。

### B-1 Build

```powershell
docker build --target otp-runtime --build-arg SOURCE_REVISION='<approved-sha>' -t '<approved-registry>/secumie/otp-staging:<sha>' -f Dockerfile.secumie .
docker build --target pira-runtime --build-arg SOURCE_REVISION='<approved-sha>' -t '<approved-registry>/secumie/pira-staging:<sha>' -f Dockerfile.secumie .
```

SBOM、image digest、dependency audit、non-root、target内容を証跡化する。

### B-2 Service Account / Secret / Cloud Run

作成候補。実際のproject IAM付与はresource単位の最小権限にする。

```powershell
gcloud iam service-accounts create secumie-otp-staging --project msp-zabbix
gcloud iam service-accounts create secumie-pira-staging --project msp-zabbix
gcloud iam service-accounts create secumie-rehearsal-ops --project msp-zabbix

gcloud run deploy secumie-otp-staging --image '<otp-image@digest>' --region asia-northeast1 --project msp-zabbix --service-account 'secumie-otp-staging@msp-zabbix.iam.gserviceaccount.com' --add-cloudsql-instances 'msp-zabbix:asia-northeast1:sales-tools-staging-db' --min-instances 0 --max-instances 1 --concurrency 20 --ingress all --no-allow-unauthenticated

gcloud run deploy secumie-pira-staging --image '<pira-image@digest>' --region asia-northeast1 --project msp-zabbix --service-account 'secumie-pira-staging@msp-zabbix.iam.gserviceaccount.com' --add-cloudsql-instances 'msp-zabbix:asia-northeast1:sales-tools-staging-db' --min-instances 0 --max-instances 1 --concurrency 20 --ingress all --no-allow-unauthenticated
```

Secretは`secumie-staging-*`として作り、値はfile/stdinから登録する。コマンド本文やGitへ値を書かない。OTP SAにはOTP用Secret、PIRA SAには公開鍵/JWKS URLとPIRA DB Secretだけを付与する。private JWT keyとSMTP SecretをPIRA SAへ与えない。

Stage BはLBなしで認証済みproxyを利用するため、一時的に`ingress=all`とし、IAMで未認証呼出しを拒否する。一般公開URLとして案内しない。`internal-and-cloud-load-balancing`への変更はStage Eの専用LB作成と同時に検証する。

### B-3 接続経路

Stage BではLBを作らない。認証済み`gcloud run services proxy`を各serviceへ立て、ローカルtest harnessが次を同一Originへreverse proxyする。

- `/v1/otp/*`, `/.well-known/jwks.json` → OTP proxy
- その他 → PIRA proxy

proxy PID/portは専用記録へ保存し、終了時に専用processだけを停止する。Cloud Runを一般公開しない。

### B-4 E2E

- OTP send/verify、JWT発行、JWKS検証
- UNION企業情報、RECEIVED→ANSWERING
- 8問、C方式、v7 report、COMPLETED
- admin一覧/詳細/CSV/XLSX/監査
- GENERAL route無効
- 回答/report/PDF非永続化
- SMTP SENT/FAILED/UNKNOWN、Turnstile拒否、JWT rotation、jti再利用拒否

### B Success / Stop / Rollback

PASS: 実Cloud Run、実Staging DB、test external adaptersで全E2Eと回帰PASS。既存Stagingに影響なし。

STOP: 起動fail-closed違反、秘密漏えい、別database接続、既存serviceへのrequest、GENERAL有効化、connection/latency/5xx閾値超過。

Rollback: 専用serviceを前Revisionへ戻すか0 traffic/削除。既存`sales-tools-staging` trafficは操作しない。

## 7. Stage C — 接続・負荷検証

### C-1 Baselineと閾値

Phase 2G baseline:

- Staging backend connections: 平均2.28、p95 3、最大5
- Staging CPU: 平均11.0%、p95 13.31%、最大54.75%

実`max_connections = M`確認後、接続数が`0.8 × M`を超えないことを絶対条件とする。既存serviceの5xx発生、p95 latencyがbaselineの2倍、CPU 80%継続5分、storage急増、接続timeout発生で即時停止する。具体的な通知先と停止判断者を承認票へ記載する。

### C-2 負荷段階

1. max 1ずつ、直列E2E。
2. max 1ずつ、承認済み並列数。
3. metrics確認後にだけmax 2候補を別承認。
4. SMTP timeout、DB timeout、revision併存を障害注入。
5. 旧新revision合計poolも接続budgetへ含める。

connection、CPU、memory components、latency、5xx、instance countを1分粒度で保存する。負荷test requestにsynthetic markerを付け、既存ログと識別する。

## 8. Stage D — 復旧検証

### D-1 Logical backup/restore

対象は`secumie_rehearsal`だけ。schema/ledger/synthetic dataをdumpし、別の承認済みtemporary databaseへrestoreする。既存databaseをdumpしない。restore後にMigration ledger、権限、synthetic receipt、E2Eを確認する。

### D-2 Revision rollback

専用Cloud Runだけを直前の既知正常Revisionへ戻し、health/E2Eを再確認する。既存`sales-tools-staging`のRevision/trafficは変更しない。

### D-3 Managed backup/PITR

**独立承認事項**。Cloud SQL restoreはinstance単位で既存Staging databaseを一時instanceへ複製し得る。次が確定するまで実施しない。

- temporary instance名、tier、region、network、IAM
- 復元時点、RPO/RTO、費用上限、最大存続時間
- 既存dataへのアクセス禁止とmetadata-only SQL allowlist
- cleanup責任者と削除確認

## 9. Stage E — 本番公開経路検証

**独立承認事項**。専用LB、2 serverless NEG、test DNS/証明書または承認済みhostを作る。既存LB、Apache、PPAP、Sales ToolsのURL mapを変更しない。

検証:

- Host/Path分岐、OTP/JWKS/PIRA到達
- Cloud Run `internal-and-cloud-load-balancing` ingressとIAM
- same-origin、固定CORS allowlist、CSP
- GFE headerと`trust proxy`、client IP rate limit
- TLS、redirect、security headers
- backend不調時、certificate/DNS/LB rollback

Stage E終了後、test DNS/LB/NEG/certificate/IPの保持・削除を承認どおり実施する。

## 10. 証跡契約

保存するもの:

- 承認番号、実行者、UTC/JST時刻
- Git SHA、image digest、Migration SHA-256
- resource describe、Revision/traffic、DB metadata結果
- test command、終了コード、件数、PASS/FAIL
- Monitoring chart/export、費用実績
- rollback/cleanup前後のresource差分

保存しないもの:

- Secret値、password、private key、OTP、JWT、session token
- 認証済みemail、企業情報、業務行、実顧客情報
- SMTP本文

推奨保存先は承認済みのアクセス制御されたrelease evidence領域。Gitには非機密の要約とhashだけを記録する。

## 11. 原状復帰チェックリスト

1. test request停止、専用proxy停止。
2. 専用Cloud Run trafficを0またはservice削除。
3. 専用Secret version無効化後、承認どおりSecret削除。
4. 専用SA bindingを削除し、SA削除。
5. logical/managed restore用temporary resource削除。
6. 専用database削除後、5専用users削除。
7. test LB/NEG/certificate/DNS/IPがあれば削除。
8. Artifact保持方針に従いtest imageを削除または隔離。
9. 既存Staging revision/traffic/database/users/IAMがbaselineと一致することをdiff確認。
10. Monitoringで接続数/CPU/5xx/latencyがbaselineへ戻ったことを確認。

削除対象は固定名とresource IDを二者確認する。wildcardやproject全体削除を使用しない。managed backup/PITRの一時instanceは復元検証責任者が削除確認する。

## 12. 費用契約

- 既存Staging DB内のdatabase/rolesにはinstance固定費追加なし。CPU/storage/backup/logging増分は従量。
- Cloud Run 2 serviceはmin 0。検証時間とrequest量に応じた従量。
- Secret Manager、Artifact Registry、Logging/Monitoringは従量。
- Managed restoreの一時Cloud SQLはinstance稼働、storage、backup/network費用が発生するため、独立した金額上限と自動/手動削除期限を設定する。
- Stage EのLBは時間固定費と処理量課金があるため、作成前に期間と上限を承認する。

費用上限未設定または課金通知先未設定なら実行しない。

## 13. 統括の個別承認が必要な操作

| 操作 | Stage | 変更対象 |
| --- | --- | --- |
| DB管理者metadata SQL実行 | Preflight | DB catalog/statisticsのRead-only照会 |
| databaseと5 users作成 | A | `sales-tools-staging-db` |
| Migration 037〜041 | A | `secumie_rehearsal`のみ |
| runtime権限設定・保持execute | A | 専用roles/dataのみ |
| SA/Secret/Artifact/Cloud Run作成 | B | 専用resourceのみ |
| maxScale変更・負荷試験 | C | 専用Cloud Run、共有Staging DB負荷 |
| logical restore | D | 専用temporary database |
| managed backup/PITR restore | D | 一時Cloud SQL instance。独立承認 |
| LB/NEG/IP/certificate/test DNS作成 | E | 新規公開経路。独立承認 |
| cleanup | 各Stage | 承認済み専用resourceのみ |

## 14. 完了判定

本Runbookの完成はStaging実行の承認ではない。Stage A〜Eはすべて未実施であり、Production No-Goを維持する。

実行へ進むには、該当Stageの承認票、担当者、保守時間、費用上限、停止条件、rollback、証跡保存先がすべて確定している必要がある。

## 15. Stage A-1 再開準備追補（2026-11-04）

### 15.1 責任分担

| 責任 | 担当 |
| --- | --- |
| 最終承認・リスク受容 | atLIB経営者 |
| 技術実行・一次停止判断 | Work |
| 原状復帰操作 | Work |
| 設計・証跡レビュー | 設計統括ChatGPT |

Workは固定対象外の変更、既存resourceへの権限変更、監視閾値超過、cleanup不能が判明した時点で停止する。

### 15.2 既存経路のFit/Gap

- 既存`sales_tools_migration` / `sales_tools_runtime`には`CREATEDB` / `CREATEROLE`がなく、A-1管理者として使用できない。
- 既存passwordは変更しない。Secret値を取得して人やローカルshellへ渡す経路は採用しない。
- Cloud SQL Admin APIで通常のBUILT_IN userを作ると、既定では`cloudsqlsuperuser`が付与され、`CREATEROLE` / `CREATEDB` / `LOGIN`を持つ。5 runtime roleをAPIだけで直接作る方式は不適合とする。
- 既存Cloud Run Job、Cloud SQL socket、digest固定image、`maxRetries=0`、Secret Manager参照方式は再利用できる。

公式根拠:

- Cloud SQL PostgreSQL user管理: https://cloud.google.com/sql/docs/postgres/create-manage-users
- Secret version追加: https://cloud.google.com/secret-manager/docs/add-secret-version

### 15.3 採用する管理経路

**一時Cloud Run管理Job + 一時Service Account + memory-only bootstrap password**を採用候補とする。実行は個別承認後とする。

1. digest固定の既存staging migration imageを再利用する。
2. 一時Jobが暗号学的乱数で一時DB管理者passwordをメモリ内生成する。引数、environment、file、標準出力、Cloud Loggingへ出さない。
3. JobがCloud SQL Admin APIで一時BUILT_IN user `secumie_rehearsal_admin_tmp`を作成する。このuserだけが一時的に`cloudsqlsuperuser`を持つ。
4. JobはCloud SQL socketから一時管理者で接続し、固定allowlistだけを実行する。
5. 5 roleのpasswordもJobメモリ内で個別生成し、SQL parameterとPostgreSQL `format(... %I, %L ...)`によって安全にrole DDLを構成する。DDL、password、connection stringはログへ出さない。
6. Workが値なしで事前作成した5専用Secretへ、JobがSecret Manager APIでversionを各1件追加する。値をJob外へ返さない。
7. 検証完了後、一時管理者をCloud SQL Admin APIで削除する。
8. Job/一時SA/custom IAM role/bindingを撤去する。成功後も専用database、5 roles、5 runtime password SecretsはA-2/B用に残す。

Jobはtask 1、parallelism 1、`maxRetries=0`、timeout 10分以下とする。実行時に対象が一つでも存在すれば修復・再利用せずSTOPする。

### 15.4 作成・変更予定resource

個別承認対象。現時点では未作成。

| 種別 | 候補名 | 保持 |
| --- | --- | --- |
| Temporary SA | `secumie-rehearsal-admin-tmp` | A-1後削除 |
| Temporary custom IAM role | `secumieRehearsalBootstrap` | A-1後削除 |
| Temporary Cloud Run Job | `secumie-rehearsal-admin-tmp` | A-1後削除 |
| Temporary DB admin user | `secumie_rehearsal_admin_tmp` | Job内で削除 |
| Database | `secumie_rehearsal` | A-2/Bへ保持 |
| Runtime DB roles | 既定5 role | A-2/Bへ保持 |
| Password Secrets | `secumie-staging-db-{otp,pira,admin,migration,maintenance}-password` | Workが値なしで作成。Jobがversionを1件追加。A-2/Bへ保持 |
| Artifact | 既存migration image digest + hash固定runner | evidence後は保持方針に従う |

既存Staging service、database、user、password、Revision、Traffic、Secret、IAM bindingは変更しない。

### 15.5 一時SAの最小権限

既存project Ownerや既存runtime SAをJobへ流用しない。一時custom IAM roleは次の操作に必要なpermissionだけを含め、project単位の`roles/cloudsql.admin`や`roles/secretmanager.admin`を付与しない。

- 一時custom role: `cloudsql.instances.get`, `cloudsql.users.create`, `cloudsql.users.delete`, `cloudsql.users.list`, `cloudsql.operations.get`
- Predefined: `roles/cloudsql.client`
- Predefined: `roles/logging.logWriter`
- Predefined: `roles/artifactregistry.reader`（対象repositoryへ限定）
- Predefined: `roles/secretmanager.secretVersionAdder`（固定5 Secretsへ個別付与）

一時SAにはSecretの作成、参照、version参照、削除権限を付与しない。Cloud SQL user update、instance update、database API create/delete権限も付与しない。Cloud SQL user操作のcustom role bindingは対象instanceへ制限できるIAM Conditionの適用可否を実行前に検証し、非対応ならproject-levelの短時間権限としてリスクを明示する。runtime password Secretのaccessor権限はA-1では誰にも付与せず、Stage Bでruntime SAへresource単位付与する。

### 15.6 Job内の固定操作

Jobは次の順序以外を実行しない。

1. project、instance、接続数、backup、対象名未存在を再確認。
2. 既存database ACLと`public` schema ACLをmetadata-onlyで確認。
3. 一時管理者を作成し、operation完了を待つ。
4. 一時管理者で接続し、対象名未存在を再確認。
5. 5 roleを`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`で作成する。
6. `secumie_migration_rehearsal`をownerとして`secumie_rehearsal`を作成する。
7. 新databaseで`REVOKE CONNECT ON DATABASE secumie_rehearsal FROM PUBLIC`を実行し、固定5 rolesだけにCONNECTを付与する。
8. 固定5 Secretが空であることを確認し、versionを各1件追加する。
9. role属性、database owner、CONNECT、既存schema/table/function privilegeをRead-only検証する。
10. 一時管理者を削除する。

Migration 037〜041、schema/table/function作成、保持関数、synthetic data投入は行わない。

### 15.7 共有instanceにおける隔離制約

PostgreSQLでは既存databaseが`PUBLIC CONNECT`を許可している場合、新roleだけを対象とした明示的DENYはできない。既存databaseの`PUBLIC CONNECT`をREVOKEする操作は既存serviceへ影響するためA-1対象外とする。

したがってJobは変更前に既存database ACLを確認し、次を区別する。

- 新roleが既存databaseへCONNECTできず、schema/table/function権限もない: PASS候補。
- PUBLIC経由でCONNECTだけ可能だが、既存schema/table/function権限がない: **リスク受容待ちでSTOP**。経営者がCONNECT-only残余リスクを受容するか、専用Cloud SQLへ分離するかを決定する。
- 既存schema/table/functionのUSAGE/CREATE/DML/EXECUTEが一つでもある: 即時STOP、作成済み対象をrollback。

CONNECT-only残余リスクを暗黙にPASS扱いしない。

### 15.8 Password / Secret取扱い

- 乱数はJob内の暗号学的乱数生成器で生成し、roleごとに別値を使用する。
- passwordはcommand、args、environment、temporary file、exception、structured logへ出さない。
- Secret payloadはAPI request bodyのメモリ内だけに保持し、responseへ含めない。
- Job logはresource名、operation ID、hash、PASS/STOP、件数だけを記録する。
- 失敗時もSQL error detailやDDL全文を出さず、固定error codeとStep IDだけを記録する。
- Secret versionは各1件。Stage Bまでaccessorなし。cleanup時はversion destroy後にSecret削除を確認する。

### 15.9 Failure / compensation

Jobは自動再試行しない。各Stepはtarget existenceとownerを確認し、同名の想定外resourceには触れない。

- 一時管理者作成後の失敗: Cloud SQL Admin APIで一時管理者を削除する。
- role作成途中の失敗: 一時管理者接続で、このexecutionが作成したroleだけを逆順削除する。
- database作成後の失敗: 新規接続がないことを確認し、`secumie_rehearsal`だけを削除する。
- Secret version追加途中の失敗: Workが追加済みversionをdestroyし、値なしで事前作成した固定Secretsを削除する。Job自身にはdestroy/delete権限を与えない。
- process crashでpassword喪失: 一時管理者をAPIで削除し、別途承認されたcompensation executionで新しい一時管理者を作り直してcleanupだけを行う。無承認再実行は禁止。

cleanupが完了しない場合、A-2へ進まずSTOPする。

### 15.10 再評価した実行前Gate

| Gate | 現状 | 実行直前条件 |
| --- | --- | --- |
| 責任分担 | PASS | 本節15.1を承認記録へ転記 |
| 最新backup | 過去確認PASS | 実行直前にSUCCESSFULを再確認 |
| 対象未存在 | 過去確認PASS | DB/API/catalogの両方で再確認 |
| 接続数 | 過去SQL実測10 | instance全体18以下。20到達でSTOP |
| CPU/5xx/latency | 過去確認正常 | 実行直前と実行中に監視 |
| 同時接続 | 設計済み | Job pool 1。管理/migration合計2以下 |
| Password経路 | 本追補で具体化 | runner code/hashとIAM差分の承認が必要 |
| DB間隔離 | 未確認 | ACL preflightと残余リスク判断が必要 |
| 費用上限 | 未確定 | Job/Secret/Loggingの上限を承認 |
| Cleanup期限 | 未確定 | 一時resource削除期限と担当を承認 |

### 15.11 費用・cleanup

- Cloud Run Jobは単発・10分以下の従量。
- Secret Managerは5 Secrets、各1 active versionの保管・access費用。
- Database/roles自体にinstance固定費の追加なし。storage/backup/loggingは従量。
- Temporary SA/custom role/DB admin userに直接料金なし。
- 実行後30分以内を一時Job/SA/custom role/admin userのcleanup目標とする。
- A-1がSTOP/rollbackとなった場合、database、5 roles、5 Secretsも同じ承認枠で削除し、既存resource diffがゼロであることを確認する。

### 15.12 次に求める具体的承認

次の変更差分を一つのA-1実行承認として提示する。

1. 一時SA、最小custom IAM role、bindingの作成。
2. 固定5 password Secret resourceを値なしで作成し、一時SAへ各Secretのversion追加権限だけを付与。
3. digest固定imageを使う一時Cloud Run Job作成と1回実行。
4. 一時DB admin userのJob内作成・削除。
5. `secumie_rehearsal`と固定5 rolesの作成、各Secret versionの追加。
6. metadata-only ACL検証。
7. 一時Job/SA/custom role/bindingの削除。
8. CONNECT-only残余リスクが検出された場合は作成を確定せずSTOPし、経営者判断を求める。

承認前は上記resourceを作成・変更しない。Migration 037〜041は別承認を維持する。
