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
