# SECU:MIE Insight 共用Staging DB初期化・Migration実行承認パッケージ

作成日: 2026-11-06 JST

基準: PR #45 / `2a2f8a9f78e69cfe15b08e34f6747ac4ee3015e4`

対象: `msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db`

判定: **実行未承認。Production No-Go。**

## 1. 固定対象と非対象

| 区分 | 固定値 |
|---|---|
| database | `secumie_insight_staging` |
| OTP role | `secumie_otp_staging` / CONNECTION LIMIT 6 |
| PIRA role | `secumie_pira_staging` / CONNECTION LIMIT 6 |
| 管理 role | `secumie_admin_staging` / CONNECTION LIMIT 40 |
| Migration role | `secumie_migration_staging` / CONNECTION LIMIT 1 / database owner |
| 保持 role | `secumie_maintenance_staging` / CONNECTION LIMIT 1 |
| Migration | 037, 038, 039, 040, 041のみ |

Secure Guard用database・role・Migrationは作らない。既存Cloud SQL、Sales Tools、PPAP、Portal、Cloud Run revision/traffic、Productionは変更しない。

## 2. 2026-11-06 Read-only確認済みFACT

- Cloud SQLは`RUNNABLE`、private IP `172.20.0.3`のみ、VPC `default`、zone `asia-northeast1-c`、tier `db-custom-2-7680`。
- 接続名は`msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db`。
- Project numberは`135863453696`。Cloud Run service agentは`roles/run.serviceAgent`を保持する。
- 東京`default` subnetは`10.146.0.0/20`。PSA range `172.20.0.0/16`とは重複しない。
- `run.googleapis.com`、`sqladmin.googleapis.com`、`secretmanager.googleapis.com`、`iam.googleapis.com`、`compute.googleapis.com`は有効。
- Organization Policy APIは有効化済み。`run.allowedVPCEgress`のeffective policyは`listPolicy.allValues = ALLOW`で、`private-ranges-only`は許容される。Direct VPC Job作成前のOrganization Policy STOP条件は解消済みである。
- SECU名のService Account、Secret、Cloud Run Jobは存在しない。したがって本書の全GCPリソースは新規差分になる。

## 3. 作成予定リソースとIAM差分

### 3.1 Service Account / Job

| リソース | 用途 | 作成後の権限 |
|---|---|---|
| `secumie-db-bootstrap-stg` SA | database/5 role作成 | `roles/cloudsql.client`、下記6 SecretへのversionAccessorのみ |
| `secumie-db-migration-stg` SA | 037〜041とrole権限設定 | `roles/cloudsql.client`、Migration password SecretへのversionAccessorのみ |
| `secumie-db-bootstrap-staging` Job | Bootstrapを1回実行 | task=1、parallelism=1、retry=0、timeout=15m |
| `secumie-db-migrate-staging` Job | Migrationを1回実行 | task=1、parallelism=1、retry=0、timeout=15m |

Cloud Run service agentの既存`roles/run.serviceAgent`にはDirect VPCに必要な権限が含まれるため、現時点で`roles/compute.networkUser`の追加は計画しない。Job作成時に権限不足が出た場合は無断付与せずSTOPする。runtime SAへCloud SQL Admin、Secret Admin、Network Adminは付与しない。

### 3.2 Secret

作成候補は次の6件、すべてStaging専用、自動replication、version `1`固定参照とする。

- `secumie-stg-db-bootstrap-password`
- `secumie-stg-db-otp-password`
- `secumie-stg-db-pira-password`
- `secumie-stg-db-admin-password`
- `secumie-stg-db-migration-password`
- `secumie-stg-db-maintenance-password`

値はCSPRNGで32 byte以上を生成し、CLI引数、Git、Cloud Logging、Job envの平文、証跡へ出さない。Secret作成・version追加とCloud SQL組込み`postgres` userのpassword設定は、別の明示承認対象である。組込みuserのpasswordはCloud Consoleの非表示入力または同等の承認済み安全経路で設定し、同じ値をbootstrap Secretへ登録する。実行後、bootstrap JobとそのSecret access bindingを撤去し、bootstrap Secret versionを無効化する。

## 4. 実行artifact

`Dockerfile.secumie`の`db-operations` targetをArtifact Registry `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations:<commit>`へbuildする。digest確定後はJobでtagを使わずdigestを固定する。

artifactは次だけを収録する。

- compiled DB CLI
- `migration-manifests/secumie-insight-staging-037-041.json`
- 037〜041の5 SQLだけを入れた`/app/migrations-secumie`
- manifest verifier

build時と実行直前にファイル名、順序、SHA-256、件数5を照合する。001〜036または別SQLが同梱された場合はDB接続前に失敗する。

| Migration | SHA-256 |
|---|---|
| 037 | `a2b15297d894dde5c732cf9a6e74596dd17d223b09a37974ff1c490949a6d69b` |
| 038 | `c97e12560894dd76e04ae2c58d3d703e5931b9903eb261b05af1a0c26d90e677` |
| 039 | `082bbd8506110b671ac2ff7cc3750d8a4abb95701c8dc75273cca19da1606490` |
| 040 | `6708892a7228925fcb1d08a19c6b0cfeb4469bcae2ed7a1e7b503d449e8fe104` |
| 041 | `b004b4bc69b1c379bbc75993b13d3209fa3ddb803ed564cbf53d4bb4d21c09a7` |

Cloud SQL Auth Proxyは`gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.27.0@sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c`に固定する。

## 5. Job接続契約

- Direct VPC egress: network `default`、subnet `default`（東京）、egress `private-ranges-only`。
- Proxy: `--private-ip --address=127.0.0.1 --port=5432 --health-check --http-address=0.0.0.0 --http-port=9090 --quitquitquit --admin-port=9091 --exit-zero-on-sigterm`。
- main containerはProxyの`/startup`成功後に開始する。
- main接続先は`127.0.0.1:5432`。passwordだけSecret versionから注入する。
- main終了時はlocalhostの`/quitquitquit`へPOSTし、sidecarも終了させる。
- Cloud SQL Auth Proxyはprivate IP経路を作らないため、Direct VPCが成立しない場合は実行しない。

### 5.1 Job作成コマンド契約（未実行）

`<DB_OPERATIONS_IMAGE_DIGEST>`は承認対象commitからbuild・scanしたdigestへ置換する。Secretはversion `1`が作成・照合済みの場合だけ指定する。次のコマンド自体も個別承認後に実行する。

```powershell
$project = 'msp-zabbix'
$region = 'asia-northeast1'
$connection = 'msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db'
$image = 'asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations@sha256:<DB_OPERATIONS_IMAGE_DIGEST>'
$proxy = 'gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c'

gcloud run jobs create secumie-db-bootstrap-staging `
  --project=$project --region=$region --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=15m `
  --service-account="secumie-db-bootstrap-stg@$project.iam.gserviceaccount.com" `
  --network=default --subnet=default --vpc-egress=private-ranges-only `
  --container=bootstrap --image=$image --command=node --args=dist/db/bootstrapSecumieInsightStagingCli.js `
  --depends-on=cloud-sql-proxy `
  --set-env-vars="DB_BOOTSTRAP_HOST=127.0.0.1,DB_BOOTSTRAP_PORT=5432,DB_BOOTSTRAP_USER=postgres,SECU_BOOTSTRAP_TARGET_CONFIRMATION=$connection/secumie_insight_staging,CLOUD_SQL_PROXY_ADMIN_URL=http://127.0.0.1:9091/quitquitquit" `
  --set-secrets='DB_BOOTSTRAP_PASSWORD=secumie-stg-db-bootstrap-password:1,SECU_OTP_DB_PASSWORD=secumie-stg-db-otp-password:1,SECU_PIRA_DB_PASSWORD=secumie-stg-db-pira-password:1,SECU_ADMIN_DB_PASSWORD=secumie-stg-db-admin-password:1,SECU_MIGRATION_DB_PASSWORD=secumie-stg-db-migration-password:1,SECU_MAINTENANCE_DB_PASSWORD=secumie-stg-db-maintenance-password:1' `
  --container=cloud-sql-proxy --image=$proxy `
  --args="--private-ip,--address=127.0.0.1,--port=5432,--health-check,--http-address=0.0.0.0,--http-port=9090,--quitquitquit,--admin-port=9091,--exit-zero-on-sigterm,$connection" `
  --startup-probe='initialDelaySeconds=1,timeoutSeconds=2,periodSeconds=2,failureThreshold=30,httpGet.path=/startup,httpGet.port=9090'

gcloud run jobs create secumie-db-migrate-staging `
  --project=$project --region=$region --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=15m `
  --service-account="secumie-db-migration-stg@$project.iam.gserviceaccount.com" `
  --network=default --subnet=default --vpc-egress=private-ranges-only `
  --container=migration --image=$image --command=node --args=dist/db/runSecumieStagingMigrationCli.js `
  --depends-on=cloud-sql-proxy `
  --set-env-vars="DB_HOST=127.0.0.1,DB_PORT=5432,DB_NAME=secumie_insight_staging,DB_MIGRATION_USER=secumie_migration_staging,DB_POOL_MAX=1,MIGRATIONS_DIR=/app/migrations-secumie,MIGRATION_MANIFEST=/app/migration-manifests/secumie-insight-staging-037-041.json,MIGRATION_VERIFIER=/app/scripts/readiness/verifySecumieMigrationManifest.cjs,SECU_MIGRATION_TARGET_CONFIRMATION=$connection/secumie_insight_staging,OTP_DB_ROLE=secumie_otp_staging,PIRA_DB_ROLE=secumie_pira_staging,PIRA_ADMIN_DB_ROLE=secumie_admin_staging,SECU_MAINTENANCE_DB_ROLE=secumie_maintenance_staging,CLOUD_SQL_PROXY_ADMIN_URL=http://127.0.0.1:9091/quitquitquit" `
  --set-secrets='DB_MIGRATION_PASSWORD=secumie-stg-db-migration-password:1' `
  --container=cloud-sql-proxy --image=$proxy `
  --args="--private-ip,--address=127.0.0.1,--port=5432,--health-check,--http-address=0.0.0.0,--http-port=9090,--quitquitquit,--admin-port=9091,--exit-zero-on-sigterm,$connection" `
  --startup-probe='initialDelaySeconds=1,timeoutSeconds=2,periodSeconds=2,failureThreshold=30,httpGet.path=/startup,httpGet.port=9090'
```

Job作成直後は実行しない。`gcloud run jobs describe`でimage digest、SA、network/subnet、retry、timeout、Secret version、Proxy argsを正本と照合してから、実行について別承認を得る。

## 6. 承認後の実行順序

1. Organization Policy APIとeffective `run.allowedVPCEgress`を照合する（2026-11-06 PASS済み）。
2. imageをbuildし、脆弱性scan、manifest検証、image digestを証跡化する。
3. 2 SA、6 Secret、Secret単位IAM、Cloud SQL Clientを作成する。
4. 組込み`postgres` passwordを安全経路で設定し、bootstrap Secret version 1と一致させる。
5. Bootstrap Jobを作成する。作成だけでは実行しない。
6. 直前Gate（instance RUNNABLE、接続数、CPU、backup、既存障害なし、対象DB/role不存在）を確認する。
7. Bootstrap Jobを**1回**実行し、database、owner、5 role属性・connection limit、PUBLIC CONNECT revokeをmetadataだけで確認する。
8. Bootstrapが完全PASSした場合だけMigration Jobを作成する。
9. Migration Jobを**1回**実行する。037〜041適用、ledger 5件一致、Migration 041の`configure_roles`までを一体実行する。
10. Positive/Negative権限test、`SHOW max_connections`、接続余力、保持previewを実行する。保持executeはしない。
11. 証跡保存後、Job、Job image tag、bootstrap Secret access、一時IAMを撤去する。database/role/instance削除は別承認。

Jobの自動retryは0。失敗時の再実行は禁止し、ledger/metadata確認後に個別承認を取り直す。

## 7. 成功判定

- database ownerが`secumie_migration_staging`。
- 5 roleはLOGIN、指定connection limit、`NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS`。
- `schema_migrations`が037〜041の5件だけ。
- `public_auth`、`pira`、`secumie_deployment`だけが新設され、Secure Guard DB/schemaはない。
- OTP roleは`public_auth`の必要操作だけ、PIRA roleは受付の必要操作だけ、admin roleは一覧/施策/監査だけ、maintenance roleは保持関数だけ成功する。
- 各roleの他schema参照、監査UPDATE/DELETE、maintenanceの直接table操作は拒否される。
- `SHOW max_connections`に対して共用基盤のapplication budget 78と、`max(10, ceil(M×20%), server reserved + 5, 実行時接続数 + 5)`の予約枠を満たす。満たさなければBootstrapは最初のDDL前に停止する。
- Job終了後の接続がゼロ、ログにpassword/OTP/JWT/個人情報がない。

## 8. STOP・原状復帰

次で即時STOPする: target/PG16不一致、既存database/role検出、manifest/SHA不一致、Direct VPC/Proxy不成立、予期しないledger、権限test失敗、既存サービス指標悪化、Secret露出、Secure Guard領域への差分。

Bootstrapはrole作成を1 transactionで行い、その後databaseを作る。database作成前に失敗すればrole transactionはrollbackされる。database作成後の失敗は自動修復・自動削除しない。次のmetadataを取得し、別承認で逆順に戻す。

1. 対象databaseの接続を停止・確認。
2. `secumie_insight_staging`だけを削除。
3. 固定5 roleだけを削除。
4. Job、SA binding、Secret versionを撤去/無効化。

Migrationは各ファイル単位transactionとadvisory lockを使用する。失敗ファイルはrollbackされるが、先行Migrationは残る。再実行前にledgerと実schemaを照合し、独断でDELETE/DROP/ledger編集をしない。

## 9. ローカル検証契約

PostgreSQL 16使い捨てDBで次を直列実行する。

1. Bootstrap正常系、role属性・limit・DB owner。
2. target confirmation欠落によるDB接続前fail closed。
3. manifest正常、改ざん、余分な001の拒否。
4. 037〜041 fresh apply、role設定。
5. OTP/PIRA/admin repositoryのPositive test。
6. schema越境、監査UPDATE/DELETE、maintenance直接table操作のNegative test。
7. retention preview/execute/retry安全性（local synthetic dataのみ）。
8. TypeScript buildと`db-operations` image build。

### 9.1 2026-11-06ローカル検証結果

Docker Desktop復旧後、既存container/volumeを変更せず、tmpfsだけを使用する専用`postgres:16` container（PostgreSQL `16.15`）で直列検証した。検証後は今回作成したcontainerだけを停止し、`--rm`で撤去した。既存Supabase 3 containerは停止・変更していない。

| 検証 | 結果 |
|---|---|
| Bootstrap、5 role属性・limit、database owner | 1/1 PASS |
| Bootstrap→artifact verifier→037〜041→role設定 | 2/2 PASS |
| 037〜041 fresh apply、repository、権限、保持 | 4/4 PASS |
| manifest正常、改ざん、001混入、target fail-closed | 3/3 PASS |
| OTP中核回帰 | 1/1 PASS |
| PIRA受付実DB回帰 | 8/8 PASS（空fixture DBへ前提Migration 038適用後） |
| E3管理・CSV/XLSX・監査実DB回帰 | 12/12 PASS |
| 本番相当runtime browser | 2/2 PASS |
| TypeScript build / `git diff --check` | PASS |
| `db-operations` Docker target build | PASS |
| image内5 migration SHA・非root user・revision label・CMD | PASS |
| `npm audit --omit=dev --audit-level=high` | Critical 0 / High 0 / Moderate 7 |

Docker image buildの初回は`.dockerignore`が新規manifest/verifierを除外したため失敗した。対象2資産だけをbuild contextへ許可する最小修正後に再buildし、build内SHA検証を含めPASSした。local PostgreSQLの`max_connections=100`、検証終了前の接続数6を確認したが、これは使い捨て環境の値でありCloud SQL実値の代用にはしない。

ローカル検証のSTOPは解消した。GCP実行前には、Organization Policy確認とCloud SQL内の`SHOW max_connections`実測が引き続き必要である。

## 10. 費用・cleanup

既存Cloud SQLの14日/$75上限はPR #45を継承する。今回追加候補のCloud Run Jobは実行時間だけ、Secret Managerは6 Secret/version、Artifact Registryはimage保存量が増分である。Jobは各1回・15分以内、runtime配備なしのため増分は小さいが、実行前にBilling日次確認を継続する。

Cloud SQL cleanup期限は`2026-11-20 10:12 JST`。Job/一時IAM/bootstrap Secret accessはMigration・検証証跡確定後24時間以内に撤去する。Deletion protection解除、Cloud SQL削除、database/role削除は別の経営者承認が必要である。

## 11. 個別承認が必要な操作

Organization Policy API有効化とeffective policy確認は2026-11-06に完了した。次の承認対象は段階ごとに分離する。

1. 2 Service Account、6 Secret、Secret version、限定IAM、`db-operations` image登録（承認A）。
2. 組込み`postgres` passwordの初回設定（承認B、人間のCloud Console操作）。
3. Bootstrap Cloud Run Job 1件の作成（承認C、未実行）。
4. Bootstrap Job 1回の実行（別承認D）。
5. Bootstrap PASS後のMigration Job作成と1回実行（別承認E/F）。
6. 一時Job/IAM/Secret accessの撤去（別承認G）。

上記承認は分離する。特にJob作成承認はJob実行承認を含まない。

## 参考（公式）

- Cloud Run Direct VPC egress: https://cloud.google.com/run/docs/configuring/vpc-direct-vpc
- Cloud Run multi-container startup order: https://cloud.google.com/run/docs/configuring/jobs/containers
- Cloud SQL Auth Proxy private IP: https://cloud.google.com/sql/docs/postgres/connect-auth-proxy
- Cloud SQL Auth Proxy shutdown endpoint: https://github.com/GoogleCloudPlatform/cloud-sql-proxy/blob/main/docs/cmd/cloud-sql-proxy.md

## 12. 実行前最終確認（2026-11-06）

### 12.1 GCP Read-only結果

| 項目 | 結果 | 判定 |
|---|---|---|
| Cloud SQL | `secumie-sg-shared-staging-db` / `RUNNABLE` / PostgreSQL 16 / private IPのみ | PASS |
| Backup | automated backup `1793927512122`、`SUCCESSFUL`、2026-11-06 10:12 JST完了 | PASS |
| database | `postgres`だけ。`secumie_insight_staging`不存在 | PASS |
| Cloud SQL user | 組込み`postgres`だけ | PASS |
| target PostgreSQL role | DB内部接続前のため未実測。Bootstrap最初のread-only queryで固定5 role不存在を確認し、1件でもあればDDL前STOP | Conditional |
| Service Account / Secret / Job | SECU名の対象リソースは未作成 | PASS（計画差分と一致） |
| Organization Policy API | `orgpolicy.googleapis.com`有効化済み | PASS |
| `run.allowedVPCEgress` | effective `listPolicy.allValues = ALLOW`。`private-ranges-only`許容 | PASS |

2026-11-06に統括提示の実施結果を受領した。API有効化とeffective policy確認は完了扱いとし、policy変更は行わない。確認に使用したRead-only照会は次である。

```powershell
gcloud resource-manager org-policies describe run.allowedVPCEgress `
  --project=msp-zabbix --effective --format=yaml
```

結果は`listPolicy.allValues = ALLOW`であり、Job定義の`--vpc-egress=private-ranges-only`を妨げない。今後effective policyが変化した場合はJob作成・実行前にSTOPし、policyを無断変更しない。

### 12.2 書込み前接続容量Gate

Bootstrap CLIは`postgres` databaseへの最初の1接続で、DDLより前に次を取得する。

- `SHOW max_connections`
- `superuser_reserved_connections`
- PostgreSQL 16の`reserved_connections`（未設定なら0）
- `pg_stat_activity`の実行時総接続数

次を満たさなければ`SECU_BOOTSTRAP_CONNECTION_CAPACITY_INSUFFICIENT`で終了し、database/roleを一切作成しない。

```text
M = max_connections
R = max(10, ceil(M × 0.20), superuser_reserved + reserved + 5, observed_connections + 5)
A = M - R
required: A >= 78
```

判定値は非機密の構造化ログ`secumie_bootstrap_capacity_gate`へ記録する。実測値を100等の想定値で代用しない。単一時点の値は長期peakの代用ではないため、Bootstrap PASS後もruntime配備前にMonitoringで接続peakを検証する。

### 12.3 `postgres`初期passwordとSecret登録

組込み`postgres` userには現在Secretがなく、安全な既存自動経路もない。この1操作だけは人間によるGoogle Cloud Console操作を採用する。

1. atLIB経営者のBootstrap資格情報設定承認を取得する。
2. 承認済みoperatorがローカルpassword managerで32 byte以上のCSPRNG passwordを1件生成する。
3. Google Cloud ConsoleのCloud SQL → 対象instance → Users → `postgres` → Change passwordで設定する。画面共有、録画、チャット貼付をしない。
4. Secret Manager Consoleで`secumie-stg-db-bootstrap-password`を作成し、同じ値をversion 1として非表示入力する。
5. Secret metadataとversion状態だけを確認し、値は再表示しない。
6. Bootstrap SAだけへ当該Secretのversion accessorを付与する。
7. Migration・権限検証完了後24時間以内にBootstrap Jobとaccess bindingを撤去し、version 1を無効化する。

OTP/PIRA/admin/migration/maintenanceの5 passwordも同様に別々の32 byte以上を生成し、6件すべて異なる値とする。値をCLI argument、Git、Cloud Loggingへ出さない。Cloud Console以外の安全な自動注入経路を採用する場合は、具体的差分を再承認する。

### 12.4 実行順序と承認境界

| Gate | 操作 | 承認境界 | 成功条件 |
|---|---|---|---|
| 1 | Organization Policy API・effective policy確認 | 完了 | `private-ranges-only`許容、2026-11-06 PASS |
| 2 | 2 SA、6 Secret、限定IAM、artifact image作成 | **次回個別承認A** | 下記12.6との差分一致、image digest固定 |
| 3 | `postgres` password設定とbootstrap Secret version 1 | **次回個別承認B、人間のConsole操作** | 値非表示、metadata一致 |
| 4 | Bootstrap Job作成（未実行） | **次回個別承認C** | SA、Secret version、Direct VPC、Proxy digest、retry 0をdescribe照合 |
| 5 | Bootstrap Job 1回実行 | **未承認・別承認D** | capacity PASS、対象不存在、database/5 role作成、他差分なし |
| 6 | Migration Job作成（未実行） | **未承認・別承認E** | 037〜041だけ、Migration SA/Secretだけ |
| 7 | Migration Job 1回実行 | **未承認・別承認F** | ledger 5件、role grants、再試行なし |
| 8 | Positive/Negative権限、保持preview、接続確認 | **未承認** | 全PASS、保持executeなし |
| 9 | Job・一時IAM・bootstrap access撤去 | **未承認・別承認G** | 証跡保存後24時間以内、DB/roleは維持 |

Job作成承認は実行承認を含まない。前GateがPASSするまで次の操作を行わない。

### 12.5 担当とSTOP

- 最終承認・リスク受容: atLIB経営者
- 技術実行・一次停止判断・原状復帰: Work
- 設計・証跡レビュー: 設計統括ChatGPT

capacity不足、target既存、backup異常、Secret露出、予期しないIAM、effective policy変更、既存service異常、Secure Guard領域差分のいずれかでSTOPする。無断再試行・権限追加・policy変更・cleanupを行わない。

### 12.6 次回実行承認A〜Cの固定差分

今回統括へ求める承認は次の作成・設定までであり、Bootstrap Jobの実行、Cloud SQL内のdatabase・role作成、Migration 037〜041、Secure Guard側操作を含まない。

#### 承認A: 基盤資格情報とartifact

実行順序は次のとおりとする。

1. Service Account `secumie-db-bootstrap-stg`と`secumie-db-migration-stg`を作成する。どちらにも管理者権限、鍵ファイル、user-managed keyを作らない。
2. Project単位で両SAへ`roles/cloudsql.client`だけを付与する。
3. Staging専用Secret 6件を自動replicationで作成する。Secret値はまだCLI引数へ渡さず、承認済みoperatorがCloud Consoleの非表示入力で各version 1を登録する。
4. Secret単位IAMを設定する。Bootstrap SAには6件すべての`roles/secretmanager.secretAccessor`、Migration SAには`secumie-stg-db-migration-password`だけの同roleを付与する。他Secretへのaccessは付与しない。
5. 承認対象commitの`Dockerfile.secumie` `db-operations` targetを既存Artifact Registry repository `cloud-run-source-deploy`へpushする。build実行主体だけが既存repositoryへの書込み権限を使用し、runtime SAへ`artifactregistry.writer`を付与しない。
6. registryが返すdigestを取得し、manifest検証、脆弱性確認後、Job定義を`asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations@sha256:<digest>`へ固定する。tagだけでJobを作成しない。

権限差分は次のとおりである。

| Principal | Scope | 追加権限 |
|---|---|---|
| Bootstrap SA | Project | `roles/cloudsql.client` |
| Bootstrap SA | Secret 6件それぞれ | `roles/secretmanager.secretAccessor` |
| Migration SA | Project | `roles/cloudsql.client` |
| Migration SA | `secumie-stg-db-migration-password`だけ | `roles/secretmanager.secretAccessor` |
| Job作成operator | SA 2件 | Job作成時に必要な既存`iam.serviceAccountUser`の有無を確認。不足時は追加せずSTOPし、差分を再承認 |
| runtime SA | Artifact Registry | 追加なし |

Cloud SQL Admin、Secret Admin、Artifact Registry Writer、Network Admin、Service Account key作成権限をruntime SAへ付与しない。既存principalのroleを削除・変更しない。

#### 承認B: 組込み`postgres`初期password

承認済みoperatorが12.3の手順を人間のCloud Console操作で行う。Cloud SQLの`postgres` passwordと`secumie-stg-db-bootstrap-password:1`へ同じ32 byte以上のCSPRNG値を非表示入力する。値をCLI、PowerShell履歴、画面共有、ログ、Git、チャットへ出さない。他の5 Secretにはそれぞれ異なる値を登録する。確認対象はSecret名、version番号、enabled状態、IAM metadataだけであり、値を再表示しない。

#### 承認C: Bootstrap Job作成のみ

12.6のA・BがPASSした後、5.1の固定定義により`secumie-db-bootstrap-staging`を作成する。作成後は`gcloud run jobs describe`によるRead-only照合だけを行い、次を確認する。

- main imageが承認済みdigest固定
- Proxy imageが承認済みdigest固定
- Bootstrap SA、Secret version 1、Direct VPC `default/default`、`private-ranges-only`
- task 1、parallelism 1、retry 0、timeout 15m
- target confirmationが共有Staging instanceと`secumie_insight_staging`に固定
- Jobは未実行で、Executionが0件

Job作成に必要な追加IAM、network権限、Organization Policy差分が判明した場合は作成せずSTOPする。承認Cは`gcloud run jobs execute`を含まない。

## 13. 承認A〜C 実行記録（2026-11-06）

### 13.1 実行前Gate

次をRead-onlyで再確認し、PASSした。

- active account `yoshihisa.hagisaka@atlib.jp`、project `msp-zabbix`
- Cloud SQL `secumie-sg-shared-staging-db`は`RUNNABLE`、PostgreSQL 16、private IPのみ、Backup/PITR/deletion protection有効
- 最新automated backup `1793927512122`は`SUCCESSFUL`
- effective `run.allowedVPCEgress`は`listPolicy.allValues = ALLOW`
- 2 SA、6 Secret、Bootstrap Jobは実行前に不存在
- Artifact Registry repository `cloud-run-source-deploy`は既存のDocker STANDARD repository

### 13.2 承認Aの部分実行とSTOP

実行日時: 2026-11-06 JST。技術実行・一次停止判断: Work。

次は成功した。

- Service Account `secumie-db-bootstrap-stg@msp-zabbix.iam.gserviceaccount.com`を作成
- Service Account `secumie-db-migration-stg@msp-zabbix.iam.gserviceaccount.com`を作成
- 両SAへProject scopeの`roles/cloudsql.client`を付与

最初のSecret `secumie-stg-db-bootstrap-password`作成時、PowerShellから渡した`--labels`引数がCLIに2値として解釈され、ラベル値検証エラーで終了した。Secret作成は成立していない。承認済みSTOP条件に従い、その場で処理を停止し、修正再試行、削除、権限拡大、代替設定を行っていない。

停止後のRead-only照合結果:

- 2 SAは存在し、追加roleは各`roles/cloudsql.client`だけ
- 6 Secretはすべて不存在、Secret version 0件
- Secret IAM bindingは未作成
- Artifact imageは未build・未push
- Bootstrap Jobは不存在、Execution 0件
- Cloud SQL databaseは組込み`postgres`だけ。`secumie_insight_staging`、5 role、Migration 037〜041は未作成・未実行
- 承認Bと承認Cは未着手

### 13.3 再開に必要な個別承認

再開には、承認Aの未完了部分だけを次の順で再実行する明示承認が必要である。

1. 6 Secretを作成する。PowerShellでは`--labels='environment=staging,platform=secumie-secure-guard'`を単一引数として渡すか、ラベルを付けずに作成後metadataを別途設定する。正本との差分を増やさない第一候補は単一引数方式とする。
2. Bootstrap SAへ6 SecretのAccessor、Migration SAへMigration SecretだけのAccessorを設定する。
3. IAMとSecret version 0件をRead-only照合する。
4. 承認済みcommitの`db-operations` imageをbuild・検証・pushし、registry digestを固定する。

この再開承認は、Secret version登録、`postgres` password設定、Bootstrap Job作成・実行を含まない。承認Aが完全PASSした後に、承認BとCへ改めて進む。

### 13.4 承認A限定再開結果（2026-11-07）

GCP再認証後、13.3の限定再開承認に従って実行した。

PASS:

- active account `yoshihisa.hagisaka@atlib.jp`、project `msp-zabbix`を再確認
- 既存2 SAと各`roles/cloudsql.client`を再確認し、SAを再作成していない
- 6 Secretを正本の名称、自動replication、labels `environment=staging,platform=secumie-secure-guard`で作成
- Bootstrap SAへ6 Secretすべて、Migration SAへMigration Secretだけの`roles/secretmanager.secretAccessor`を設定
- 6 SecretすべてでSecret version 0件を確認。値は登録・取得していない
- commit `3def3beac1fe006598554acdd95322a8ca45a2fd`から`db-operations` targetをbuild
- image内のMigration 037〜041 manifest、5ファイル、SHA-256照合PASS
- 既存Artifact Registryへpushし、remote digestを確認

固定image:

```text
asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations@sha256:26b41310d957b5dafc83913407295bc1d6a65ec3ef8e0bb7beca0f294f795492
```

STOP:

- Artifact Registry上のpackage vulnerability確認時、`containeranalysis.googleapis.com`がproject `msp-zabbix`で無効と判明
- API有効化は承認A限定再開に含まれないため、自動有効化・再試行を行わずSTOP
- image digestとmanifestは確認済みだが、registry vulnerability結果は未取得のため承認Aを完全PASS扱いにしない

STOP後の状態:

- Bootstrap Jobは不存在、Execution 0件
- Cloud SQL databaseは組込み`postgres`だけ
- Secret version登録、`postgres` password変更、database/role、Migration、Secure Guard操作は未実施
- 承認B・Cは未着手

再開には、`containeranalysis.googleapis.com`をproject `msp-zabbix`で有効化し、固定digestの脆弱性結果をRead-only取得する操作への個別承認が必要である。Critical/Highの扱いが正本の受入条件を満たすことを確認するまでB・Cへ進まない。

### 13.5 Container Analysis API有効化後の再確認（2026-11-07）

ユーザー本人が`containeranalysis.googleapis.com`を有効化した後、固定digestをRead-onlyで再照会した。

- API enabled確認: PASS
- image digest一致: PASS
- 応答にpackage vulnerability、severity、scan statusが含まれない
- 関連API確認では`containerscanning.googleapis.com`が未有効

結果が空であることを「脆弱性0件」と解釈しない。自動スキャン結果が生成されていないため、承認Aは引き続きConditional/STOPとする。承認B・C、Secret version、password、Job、DB操作には進んでいない。

次の個別承認対象はproject `msp-zabbix`で`containerscanning.googleapis.com`を有効化する1操作である。有効化後、固定digestを必要に応じて同一内容で再pushするかスキャン生成を待ち、同じdigestに対するscan statusとseverity別結果をRead-only取得する。API有効化、再push、スキャン待機のどこまでを認めるかを明示承認するまで実行しない。

### 13.6 Container Scanning API有効化後の再確認（2026-11-07）

ユーザー本人が`containerscanning.googleapis.com`を有効化した後、固定digestを再びRead-only照会した。

- `containeranalysis.googleapis.com`: enabled
- `containerscanning.googleapis.com`: enabled
- 固定digest一致: PASS
- package vulnerability、severity、scan status: 引き続き応答になし

API有効化前にpush済みの既存imageにはスキャン結果が生成されていない。空の応答を脆弱性0件とは扱わず、承認Aは引き続きSTOPとする。同じcommit・同じtagのimageを再pushして自動スキャンを開始させる操作は、直前の承認範囲に含まれていないため実行していない。

次の個別承認対象は、既にローカルbuild・manifest検証済みの同一imageを同一tagへ1回だけ再pushし、remote digestが`sha256:26b41310d957b5dafc83913407295bc1d6a65ec3ef8e0bb7beca0f294f795492`から変化していないことを確認したうえで、scan statusとseverity別結果をRead-only照会する操作である。digestが変化した場合、push失敗、スキャン失敗、Critical/High検出時はSTOPし、B・Cへ進まない。

### 13.7 同一image再pushとスキャン結果（2026-11-07）

atLIB経営者の限定承認に基づき、検証済みローカルimageを再buildせず同一tagへ1回だけ再pushした。

- tag: `secumie-db-operations:3def3beac1fe006598554acdd95322a8ca45a2fd`
- push前remote digest: `sha256:26b41310d957b5dafc83913407295bc1d6a65ec3ef8e0bb7beca0f294f795492`
- push前local RepoDigest: 同一
- push回数: 1回
- push結果: 成功、全layerは既存または同一内容
- push後remote digest: 同一（変更なし）

push直後と45秒後に固定digestを`--show-package-vulnerability`でRead-only照会したが、いずれもimage summaryだけが返り、scan status、package vulnerability、severityは生成されなかった。したがって件数は次のとおり「0」ではなく**未取得**とする。

| Severity | 件数 |
|---|---:|
| Critical | 未取得 |
| High | 未取得 |
| Moderate | 未取得 |
| Low | 未取得 |

承認済みSTOP条件「スキャン未完了・結果取得不可」に該当するため、承認AはSTOP。追加build、2回目の再push、API/IAM/registry設定変更、別スキャナー利用を行っていない。承認B・C、Secret version、password、Job、DB、Migrationは未着手のままである。

### 13.8 On-Demand Scanning限定実行結果（2026-11-07）

atLIB経営者の限定承認に基づき、次を実施した。

- 固定digest一致を再確認
- `ondemandscanning.googleapis.com`をproject `msp-zabbix`で有効化: PASS
- Linux実行環境として公式Google Cloud CLI containerを取得
- Cloud SDK image digest: `gcr.io/google.com/cloudsdktool/google-cloud-cli@sha256:18d8c484aaef27d7ef7b54dfb018f73712503d254a16f0a76b2626b4f6003af2`
- 認証access tokenは標準入力から一時container内のmode 600相当ファイルだけへ渡し、CLI引数・ログ・Gitへ出していない
- 固定remote image、location `asia`でOn-Demand Scanを1回だけ開始

結果は**スキャン開始失敗**である。公式Cloud SDK containerに必須component `local-extract`がなく、このinstallationではcomponent managerが無効だった。Scan operationは作成されず、Scan IDは発行されていない。

```text
This action requires the installation of components: [local-extract]
You cannot perform this action because the Google Cloud CLI component manager is disabled
```

承認済みSTOP条件に従い、OS package追加、別Cloud SDK imageへの切替、別Linux環境利用、再実行、IAM変更は行っていない。脆弱性件数は引き続きCritical/High/Moderate/Lowすべて未取得であり、承認AはSTOP、承認B・Cは未着手とする。

## 14. サービスイン前実環境検証・工程簡素化（2026-11-07）

統括方針により、Google Cloud On-Demand Scanningの追加対応を停止する。13.4〜13.8の実施結果とスキャン未完了の事実は維持するが、非公開・Synthetic data限定の共用Staging DB初期化を妨げるSTOP条件とはしない。再push、追加scanner、Cloud SDK component導入を繰り返さない。サービスイン前に、配備対象image全体のセキュリティ確認を別のGo/No-Go Gateとして実施する。

### 14.1 現物棚卸し

2026-11-07 JSTのRead-only確認結果:

| 対象 | 現状 | 判定 |
|---|---|---|
| Cloud SQL | `secumie-sg-shared-staging-db`、RUNNABLE、PostgreSQL 16、private IPのみ | Fit |
| Backup | automated backup `1793988000000`、SUCCESSFUL、2026-11-07 05:43 JST完了 | Fit |
| Database | 組込み`postgres`だけ。`secumie_insight_staging`不存在 | 未初期化 |
| Service Account | Bootstrap/Migration各1件が存在 | 作成済み |
| Project IAM | 両SAに`roles/cloudsql.client`だけ | Fit |
| Secret | 承認済み6件が存在、自動replication、Staging labels | 作成済み |
| Secret version | 6件すべて0件 | 未設定 |
| Secret IAM | Bootstrap SAは6件、Migration SAはMigration SecretだけAccessor | Fit |
| Artifact | `db-operations`固定digestが存在 | Fit |
| Bootstrap/Migration Job | どちらも不存在 | 未作成 |
| Secure Guard領域 | database/role/Migration未作成 | 非対象・維持 |

固定Artifact:

```text
asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations@sha256:26b41310d957b5dafc83913407295bc1d6a65ec3ef8e0bb7beca0f294f795492
```

### 14.2 一括実行差分

経営者の次回一括承認は、以下の順序全体を対象とする。各Gateが正常である限り、工程内で追加承認を挟まない。想定外の権限・対象・データ・接続・既存service影響が判明した場合だけ即時STOPする。

1. **Staging passwordとSecret version 1**
   - 承認済みoperatorがCloud Consoleの非表示入力で6個の相互に異なる32 byte以上CSPRNG passwordを生成・登録する。
   - 組込み`postgres` passwordと`secumie-stg-db-bootstrap-password:1`だけは同じ値にする。
   - OTP/PIRA/admin/migration/maintenanceにはそれぞれ異なる値をversion 1として登録する。
   - 値をCLI引数、PowerShell history、Git、Cloud Logging、画面共有、チャットへ出さない。
   - metadataで全6 versionがENABLEDであることだけを確認する。
2. **Bootstrap Job作成・照合**
   - 5.1の固定定義と固定image digestで`secumie-db-bootstrap-staging`を作成する。
   - Bootstrap SA、6 Secret version 1、Direct VPC `default/default`、`private-ranges-only`、Proxy固定digest、task 1、parallelism 1、retry 0、timeout 15mを`describe`で照合する。
3. **Bootstrap Job 1回実行**
   - 書込み前に`SHOW max_connections`、reserved、現在接続数を実測し、14.3の容量Gateを適用する。
   - target database/5 role不存在、PostgreSQL 16、target confirmationを検査する。
   - PASS時だけ`secumie_insight_staging`とOTP/PIRA/admin/migration/maintenanceの5 roleを作成する。
   - 自動retryは0。失敗時の無断再実行は禁止する。
4. **Migration Job作成・照合**
   - Bootstrap完全PASS後、5.1の固定定義と同じ固定image digestで`secumie-db-migrate-staging`を作成する。
   - Migration SAはMigration Secretだけを参照し、Migration directoryは037〜041の5ファイルだけとする。
5. **Migration 037〜041を1回適用**
   - manifest件数・順序・SHA-256をDB接続前に再検証する。
   - ledgerに037〜041を記録し、Migration 041のrole権限設定まで完了する。
   - 001〜036、Secure Guard Migration、他databaseには適用しない。
6. **受入確認**
   - `SHOW max_connections`と接続容量、database/role属性、schema/table/function ownerをmetadataだけで確認する。
   - OTP/PIRA/admin/migration/maintenanceのPositive/Negative権限testを実施する。
   - 通常runtimeによる監査UPDATE/DELETE拒否、保守主体の期限到達分だけのpreview、未到達データ保護、再実行安全性を検証する。保持executeは行わない。
   - Synthetic dataだけを使用し、実顧客情報を投入しない。
7. **証跡とcleanup**
   - Job execution、Migration ledger、権限test、容量Gateを非機密証跡としてPR #46へ記録する。
   - 一時的なJob/Bootstrap accessの撤去は、検証結果と後続runtime接続計画を確認したうえで行う。database/role/instance削除、deletion protection解除は別の経営者承認対象とする。

### 14.3 一括実行の開始・成功・STOP条件

開始条件:

- Cloud SQL RUNNABLE、最新Backup SUCCESSFUL、既存service異常なし
- database/5 role不存在、6 Secret version 1 ENABLED
- Job定義と固定digestが正本一致
- Staging削除期限`2026-11-20 10:12 JST`と費用上限の管理継続

容量Gate:

```text
M = SHOW max_connections
R = max(10, ceil(M × 0.20), superuser_reserved + reserved + 5, observed_connections + 5)
A = M - R
required: A >= 78
```

成功条件:

- Bootstrap/Migration execution各1回が成功し、自動retry 0
- `secumie_insight_staging`、5 role、Migration ledger 037〜041だけが作成される
- 権限・容量・保持previewの全受入項目PASS
- 既存Sales Tools、顧客Portal、PPAP、Secure Guard、Productionに差分・影響なし

即時STOP条件:

- 対象・digest・manifest・Secret metadata・IAMが正本と不一致
- capacity不足、Backup異常、接続/VPC/Proxy不成立
- 予期しない既存database/role/ledger、権限不足に伴う追加IAM要求
- Secret露出、既存service指標悪化、他service/Productionへの差分
- 部分成功、Migration失敗、データ消失の可能性

STOP時は再実行、修復、削除、権限拡大を独断で行わず、metadataとexecutionログを保全して統括判断へ戻す。

### 14.4 今回求める一括実行承認

次回の経営者承認対象は14.2の1〜7であり、Cloud SQL内のdatabase/5 role作成、Bootstrap/Migration Job作成・各1回実行、Migration 037〜041、権限・容量・保持preview検証を含む。ただし、Production構築、公開、GENERAL有効化、Secure Guard DB/データ操作、実顧客データ、既存サービス変更は含まない。

初期passwordと6 Secret version登録は人間のCloud Console操作が必要である。Workは値を取得・表示せず、metadata確認後に自動工程を継続する。

## 15. Staging DB初期化・一括実行結果（2026-11-08）

### 15.1 実行前Gate

次を確認してBootstrapへ進んだ。

- Git HEAD `7538ff3d3c72eb8b790cc58aa6a709fa575a39d1`、working tree clean
- Cloud SQL RUNNABLE、PostgreSQL 16、private IPのみ、Backup/PITR有効
- 最新automated backup `1794074400000`はSUCCESSFUL
- 固定Artifact digest一致
- `secumie_insight_staging`不存在
- 6 Secretは各version 1が1件だけENABLED。値は取得・表示していない
- Bootstrap Job不存在

### 15.2 Bootstrap Job作成

`secumie-db-bootstrap-staging`を正本の固定定義で作成し、実行前に次を照合した。

- main/Proxy imageは正本のdigest指定
- Direct VPC `default/default`、egress `private-ranges-only`
- Bootstrap SA、6 Secret version 1
- task 1、parallelism 1、max retries 0、timeout 15分
- target confirmationは共有Staging instanceと`secumie_insight_staging`
- 作成直後のExecutionは0件

### 15.3 Bootstrap 1回実行とSTOP

Execution `secumie-db-bootstrap-staging-k8wrx`を1回実行し、task attempt 0、failed count 1、succeeded count 0で終了した。再実行していない。

接続・容量GateはPASSした。

```text
max_connections=400
superuser_reserved=3
reserved=0
observed_connections=10
reserve=80
application_available=320
required=78
pass=true
```

Cloud SQLエラーログで原因を確定した。

```text
ERROR: must be able to SET ROLE "secumie_migration_staging"
STATEMENT: CREATE DATABASE secumie_insight_staging OWNER secumie_migration_staging
```

Bootstrap実装は5 roleのCREATEを1 transactionでCOMMITした後にCREATE DATABASEを実行する。そのため、databaseは未作成だが5 roleはコミット済みである可能性が高い。Cloud SQL Admin APIによる確認ではdatabaseは組込み`postgres`だけで、`secumie_insight_staging`は不存在だった。role現物は新たなDB接続操作なしでは未確認のため、未確認をPASS扱いにしない。

承認済みSTOP条件「部分成功」「想定外の権限不足」に該当するため、次は実施していない。

- Bootstrapの再実行
- role/databaseの削除・修復
- Bootstrap code/image/Job定義の変更
- Migration Job作成、Migration 037〜041
- 権限・保持preview検証
- Bootstrap Job・Secret accessのcleanup

残存リソース:

- Bootstrap Jobとfailed Execution 1件
- Bootstrap/Migration SA
- Secret 6件とversion 1
- 固定Artifact
- Cloud SQL instance
- databaseは`postgres`だけ
- 5 roleは作成済みの可能性が高く、次の承認済みRead-only DB metadata確認が必要

再開には、5 roleの実在・属性をRead-onlyで確認し、組込み`postgres`へmigration roleの一時membershipを付与してdatabase作成後に即時REVOKEする等の最小修復案、または部分作成roleを削除して修正版Bootstrapを再実行する案を比較し、具体的差分を承認する必要がある。現状ではMigrationへ進まない。

## 16. Bootstrap部分失敗・限定復旧Fit/Gap（2026-11-08）

### 16.1 Read-only現物確認

既存Bootstrap Jobの接続経路をExecution overrideし、Job定義を変更せず、`SELECT`だけのmetadata inspectionを実行した。Secret値・業務データは取得していない。

Execution: `secumie-db-bootstrap-staging-gnz9r`

5 roleはすべて存在し、正本と一致した。

| role | LOGIN | connection limit | SUPERUSER | CREATEDB | CREATEROLE | INHERIT | REPLICATION | BYPASSRLS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `secumie_otp_staging` | true | 6 | false | false | false | false | false | false |
| `secumie_pira_staging` | true | 6 | false | false | false | false | false | false |
| `secumie_admin_staging` | true | 40 | false | false | false | false | false | false |
| `secumie_migration_staging` | true | 1 | false | false | false | false | false | false |
| `secumie_maintenance_staging` | true | 1 | false | false | false | false | false | false |

追加確認:

- `secumie_insight_staging`: 不存在
- 想定外の`secumie_*_staging` role: 0件
- 想定外の`secumie*` database: 0件
- `postgres` → `secumie_migration_staging` membership: なし
- 既存`postgres` membershipは`cloudsqlsuperuser`だけ。ADMIN=false、INHERIT=true、SET=true、grantor=`cloudsqladmin`
- `postgres`: SUPERUSER=false、CREATEDB=true、CREATEROLE=true
- `cloudsqlsuperuser`: SUPERUSER=false、CREATEDB=true、CREATEROLE=true
- `createrole_self_grant`: 空文字

### 16.2 最小修復案のローカルPostgreSQL 16検証

使い捨てPostgreSQL 16で、実環境と同じくSUPERUSERではないCREATEDB/CREATEROLE主体、Migration roleへのmembershipなしを再現した。

第一候補の一時SET membership方式は不成立だった。

```text
GRANT secumie_migration_staging TO <bootstrap> WITH SET TRUE
ERROR: permission denied to grant role "secumie_migration_staging"
DETAIL: Only roles with the ADMIN option ... may grant this role.
```

代替候補の一時CREATEDB方式も、membershipなしでは不成立だった。

```text
ALTER ROLE secumie_migration_staging CREATEDB
ERROR: permission denied to alter role
DETAIL: Only roles with the CREATEROLE attribute and the ADMIN option ... may alter this role.
```

一方、role作成者へADMIN optionが自動付与されるローカル構成では操作可能だったが、実環境は`createrole_self_grant`が空でADMIN membershipが存在しないため、その結果を実環境へ適用できない。

### 16.3 判定

ユーザー指示の第一候補は、現在のCloud SQL権限境界では実行不能である。`postgres`だけでは既存Migration roleへのSET付与、属性変更、削除を安全に実施できない。限定Recovery CLI案はローカル検証不合格のため採用・Commitしていない。GCPでGRANT、ALTER ROLE、CREATE DATABASE、REVOKEは実行していない。

次のいずれも新たな統括判断が必要であり、本作業では実施しない。

1. database ownerを`postgres`とし、Migration roleへCONNECT/CREATEを付与する契約変更（現行owner要件から逸脱）。
2. Cloud SQLの内部管理権限を持つ承認済み経路で既存roleへADMIN/SETを付与する（現時点で利用可能な経路未確認）。
3. 共用Staging Cloud SQLを承認済み手順で再構築し、role作成前に`createrole_self_grant`を設定するか、databaseを先に作成してからrole/ownerを設計し直す（既存instance/Secret/証跡への影響大）。

Migration 037〜041へは進まない。Bootstrap Job、failed Execution、Read-only inspection Execution、5 role、6 Secret、2 SA、固定Artifact、Cloud SQL instanceは証跡として維持する。
