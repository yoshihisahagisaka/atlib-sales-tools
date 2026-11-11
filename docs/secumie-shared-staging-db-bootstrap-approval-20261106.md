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

## 17. Bootstrap部分失敗・復旧方式1の限定検証（2026-11-08）

### 17.1 統括判断と変更境界

第16節の調査結果を受け、database owner要件だけを次のとおり補正する方式1を採用候補とした。

- `secumie_insight_staging`は組込み`postgres`をownerとして作成する。
- 既存5 roleの属性、password、membershipは変更しない。
- Migration roleには対象databaseの`CONNECT`/`CREATE`と`public` schemaの`USAGE`/`CREATE`だけを付与する。
- databaseと`public` schemaからPUBLIC権限を撤回する。
- Migration 037〜041のSQL本文は変更しない。

GCP上のCREATE DATABASE、GRANT、REVOKEおよびMigrationは実行していない。

### 17.2 一回限りのRecovery artifact

`src/db/recoverSecumieInsightStagingCli.ts`を追加し、対象を固定したfail-closedなRecovery処理を実装した。処理前に次を検証する。

- 接続先は`postgres`、PostgreSQL 16、実行主体は非SUPERUSERかつCREATEDB。
- 固定5 roleがすべて存在し、LOGIN、connection limit（6/6/40/1/1）、非特権属性、NOINHERITが正本と一致する。
- 想定外の`secumie_*_staging` roleがない。
- `secumie_insight_staging`が存在しない。
- 実行主体からMigration roleへの直接membershipがない。

前提一致時だけ、次を実施する。

1. `postgres` ownerで`secumie_insight_staging`を作成する。
2. 新database内の単一transactionでPUBLICのdatabase/schema権限を撤回する。
3. 固定5 roleへCONNECTを付与する。
4. Migration roleだけへdatabase CREATE、`public` schema USAGE/CREATEを付与する。
5. owner、ACL、5 roleのCONNECT、Migration権限をRead-onlyで検証する。

CREATE DATABASEはPostgreSQLの仕様上transaction外である。database作成後にACL設定が失敗した場合、databaseは残るが、Recoveryは失敗終了し、再実行を拒否する。無断cleanupや再試行は行わず、現物確認と統括判断へ戻す。

### 17.3 ローカルPostgreSQL 16検証

使い捨てPostgreSQL 16で、Cloud SQL現物と同じ次の条件を再現した。

- Bootstrap主体: 非SUPERUSER、CREATEDB/CREATEROLE、Migration membershipなし
- 固定5 role: LOGIN、NOINHERIT、非特権、connection limit 6/6/40/1/1
- 対象database: 不存在

結果:

| 検証 | 結果 |
|---|---|
| 方式1 Recovery、owner/ACL検証 | PASS |
| Migration 037〜041のみの適用、ledger 5件 | PASS |
| OTP/PIRA間の不要な参照拒否 | PASS |
| OTP roleによる`public` schema CREATE拒否 | PASS |
| role属性不一致時のdatabase作成前拒否 | PASS |
| Recovery受入test | 2/2 PASS |
| 既存DB Operations回帰 | 4/4 PASS |
| 既存Staging準備回帰 | 4/4 PASS |
| TypeScript build | PASS |

Migration 037〜041のSQL本文は変更していない。

### 17.4 次回の一括実行承認案

次のGCP変更は未実行であり、具体的差分に対する経営者承認後だけ実施する。

1. 本節のRecovery CLIを含む`db-operations` imageを承認済みcommitからbuild/pushし、新しいdigestを固定する。
2. 既存Bootstrap Jobのmain image digestとcommandをRecovery CLIへ限定更新する。SA、6 Secret、Proxy、Direct VPC、retry 0、task/parallelism 1は維持する。
3. `describe`で正本一致とExecution追加なしを確認する。
4. 既存role属性とdatabase不存在を再確認後、Recovery Jobを1回だけ実行する。
5. owner=`postgres`、PUBLIC権限撤回、固定5 role CONNECT、Migration CREATE/USAGEを検証する。
6. Migration Jobを固定manifestで作成・照合し、037〜041だけを1回適用する。
7. ledger、Positive/Negative SQL、監査保護、保持preview、接続容量、既存service無影響を受入検証する。

現在の固定Artifact digestにはRecovery CLIが含まれないため、そのdigestのままRecoveryを実行してはならない。role再作成、password/Secret変更、membership追加、Secure Guard DB操作、Production変更は不要かつ承認対象外である。

Production公開No-Goを維持する。

## 17A. OTP／PIRA Staging配備準備 Fit/Gap（2026-11-08）

### 17A.1 正本と再利用する受入証跡

本節はPR #46 commit `62dbf867c6e39028e3040866c7f9b99bb9d64b9a`を基準とする。Acceptance Execution `secumie-db-acceptance-staging-gpgxz`は`SUCCEEDED`（1/1、retry 0）であり、Migration 037〜041、固定5 roleの権限分離、監査保護、保持preview、接続容量Gateは再実行していない。アプリケーション配備によって新たに生じる接続、runtime IAM、Secret参照、Host/Path、SMTP、Turnstile、JWT/JWKSだけを後続検証対象とする。

Git ancestryとblobを照合した結果、PR #36、#43、#45は現行HEADの祖先である。OTP/PIRA runtime、HA承認済み公開画面、専用DB pool分離は現行ツリーへ含まれる。`runtimeConfig.ts`、`pool.ts`、`server.ts`はPR #43のblobと一致し、OTP/PIRA poolは既定最大2、idle 10秒、SIGTERM時close、SECU管理第2pool、GENERAL fail-closedを維持する。

### 17A.2 GCP現物（Read-only）

確認対象はproject `msp-zabbix`、region `asia-northeast1`である。Secret値、業務行、認証情報は取得していない。

| 項目 | FACT | 判定 |
| --- | --- | --- |
| Cloud SQL | `secumie-sg-shared-staging-db`はRUNNABLE、PostgreSQL 16、Private IP `172.20.0.3`のみ、PSA `google-managed-services-default`、backup/PITR/deletion protection有効 | Fit |
| Backup | 最新3件はいずれもSUCCESSFUL。最新ID `1794074400000` | Fit |
| DB Secret | `secumie-stg-db-otp-password:1`と`secumie-stg-db-pira-password:1`はenabled | 再利用可能 |
| Cloud Run | 既存7 serviceはReady。`secumie-otp-staging`、`secumie-pira-staging`は不存在 | 新規差分 |
| runtime SA | Bootstrap/Migration SAは存在するが、OTP/PIRA runtime SAは不存在 | 新規差分。既存SAを流用しない |
| Artifact | Registryには`secumie-db-operations`だけが存在し、OTP/PIRA runtime imageは未登録 | 新規差分 |
| VPC | `default` VPC、PSA peering ACTIVE。既存connector `msp-portal-connector`はREADY | Direct VPCを新規serviceだけへ設定 |
| LB/NEG | 既存URL map/NEGはSECU用ではない。SECU用LB、serverless NEGは不存在 | 新規差分 |
| DNS | GCP Cloud DNS zoneなし。`pira-staging.atlib.jp`と`pira.atlib.jp`は未登録、`www.atlib.jp`は既存Apache系統 | Staging専用DNS管理主体の確認が必要 |

既存Cloud Run、Sales Tools、PPAP、Portal、Cloud SQL、Revision、traffic、IAMには変更を加えていない。

### 17A.3 そのまま利用できる資産

- Docker target `otp-runtime`、`pira-runtime`とentry point `publicOtpServer`、`piraPublicServer`。
- `/v1/otp/*`、`/.well-known/jwks.json`、`/api/public/pira/v1/*`、`/healthz`。
- RS256、`kid`、issuer/audience、JWKS、受付側jti一回消費、UNION Host/initiative context。
- Direct VPC `default/default`、`private-ranges-only`とCloud SQL Auth Proxy v2 sidecarの接続方式。
- database `secumie_insight_staging`と既存OTP/PIRA role/password Secret。
- `PIRA_GENERAL_ENABLED=false`時の画面、route、OTP brand登録のfail-closed。
- HA承認済み画面、8問、C方式、v7レポート。回答・結果・PDFはサーバーへ保存しない。

### 17A.4 配備前の最小差分

| 差分 | 固定内容 | 承認・検証条件 |
| --- | --- | --- |
| runtime SA | `secumie-otp-staging`、`secumie-pira-staging` | 各SAへCloud SQL Clientと、自身が参照するSecret単位のAccessorだけを付与。Bootstrap/Migration SAは流用しない |
| runtime image | 現行commitから`otp-runtime`と`pira-runtime`をbuildし、別image名でpush、digest固定 | source commit、SBOM/依存監査、digestを記録 |
| Cloud Run | 同名2 service、min 0/max 1、concurrency 20、DB pool max 2、Direct VPC、Proxy sidecar、private-ranges-only | ingress/IAM、sidecar digest、startup、SIGTERM closeを照合 |
| DB | `DB_HOST=127.0.0.1`、`DB_PORT=5432`、`DB_NAME=secumie_insight_staging`、runtimeごとの既存role/Secret | 新しい接続成功、上限2、相互schema拒否を確認。Migration/保持/監査の再実行はしない |
| OTP Secret | Staging専用SMTP password、Turnstile secret、OTP HMAC、RS256 key set | 秘密鍵はOTPだけ。PIRAへ秘密鍵を付与しない。既存DB Secretと分離 |
| 非Secret設定 | SMTP host/port/user/from、active kid、issuer、UNION origin/host、site key、initiative code | `GENERAL=false`を両runtimeで固定し、欠落時起動拒否を確認 |
| 公開経路 | Staging専用hostのLBで`/v1/otp/*`と`/.well-known/jwks.json`をOTP、その他をPIRAへ送る | PIRA画面が相対`/v1/otp`を使うためsame-origin LBは必須。既存LB/Apacheへ混在させない |
| initiative | `pira-union`、kind `UNION`、active `true`のmetadata | Migrationはseedしない。現物は未照会のため、配備前Read-only確認後、不存在時だけ承認済みの冪等INSERTを1回実行。GENERAL rowは作成・有効化しない |

現行MailerにはStaging宛先allowlistがない。実SMTP検証では、外部配送しないSMTP sandboxまたはサーバー側で強制するStaging recipient allowlistのどちらかを配備前に固定する。任意の入力先へ配送できる状態ではE2Eを開始しない。これは認証方式や固定メール文言を変更せず、Stagingの配送境界だけを狭める最小差分である。

次回承認に提示するリソース名は以下へ固定する。既存名との競合は配備直前に再確認する。

| 種別 | 名称・参照 |
| --- | --- |
| Service / SA | `secumie-otp-staging`、`secumie-pira-staging` |
| Artifact image | `secumie-otp-runtime`、`secumie-pira-runtime`（いずれもdigest固定） |
| 既存DB Secret | `secumie-stg-db-otp-password:1`、`secumie-stg-db-pira-password:1` |
| 新規OTP Secret | `secumie-stg-smtp-password`、`secumie-stg-turnstile-secret`、`secumie-stg-otp-hmac-key`、`secumie-stg-otp-jwt-keys` |
| Staging host候補 | `pira-staging.atlib.jp`（現在未登録。DNS管理主体と使用承認が必要） |
| JWT/JWKS | issuer `https://pira-staging.atlib.jp`、JWKS `https://pira-staging.atlib.jp/.well-known/jwks.json` |
| LB関連 | `secumie-staging-ip`、`secumie-staging-cert`、`secumie-otp-staging-neg`、`secumie-pira-staging-neg`、対応backend、URL map、HTTPS proxy、forwarding rule |

公開serviceは`internal-and-cloud-load-balancing` ingressとし、匿名ブラウザのLB経由アクセスに必要なCloud Run Invoker IAM check設定は2026-11-09追補の実行前Gateに従う。run.app直アクセスを検証経路にせず、LB経由だけでHost/Origin/IP判定を確認する。既存LB、Apache、既存serviceのIAMは変更しない。

### 17A.5 Staging一括実行計画

1. runtime SA、Secret名、Secret単位IAM、Artifact image名、Staging host、費用/cleanup担当を承認する。
2. OTP/PIRA imageをbuild・検証・pushし、digestを固定する。
3. runtime SAを作成し、Cloud SQL Clientと対応Secretだけを付与する。鍵ファイル、Cloud SQL Admin、Secret Admin、Network Adminは付与しない。
4. Staging用秘密値を非表示経路でversion登録する。RS256公開鍵だけをJWKSで公開し、秘密鍵はOTP SAだけが参照する。
5. OTP/PIRA Cloud Run serviceをtraffic切替なしで作成し、Direct VPC、Proxy sidecar、max 1、concurrency 20、pool 2、GENERAL falseをdescribeで照合する。
6. private service URLからhealth、DB接続、JWT/JWKS、Host拒否を検証する。DBの既受入項目は再実行しない。
7. `pira-union` metadataをRead-only確認し、不存在時だけ承認済みINSERTを行う。
8. Staging専用LB/NEG/証明書/DNSを作成し、same-origin path routing、CORS/CSP、`trust proxy=1`、Turnstile hostnameを確認する。
9. 制限SMTPとSynthetic dataでOTP→JWT→UNION受付→ANSWERING→8問→レポート→COMPLETEDを実行し、JWT再利用、異常Host、GENERALを拒否する。
10. Synthetic submission/jti等のcleanupは対象IDを固定して別途確認し、runtime Revision/Secret/IAM/DBへの想定外差分がないことを確認する。

正常工程は上記差分を一括承認後に連続実行できる。digest、IAM、Secret参照、接続先、Host/issuer/JWKS、initiative、SMTP制限の不一致、既存serviceへの影響、Secret露出で即時STOPし、無断修復・権限拡大・別経路への変更を行わない。

### 17A.6 ローカル確認

| 確認 | 結果 |
| --- | --- |
| TypeScript build | PASS |
| 専用DB設定の非DB回帰 | 2 PASS / 0 FAIL / 1 SKIP（実PostgreSQL項目はPR #46証跡を再利用） |
| `otp-runtime` Docker target | PASS |
| `pira-runtime` Docker target | PASS |
| Git ancestry/blob | PR #36/#43/#45を包含、runtime資産と専用pool差分一致 |
| Migration/role/audit/retention/capacity | 再実行せず、PR #46 Acceptance正本を採用 |

### 17A.7 次回のGCP変更承認対象

- runtime Service Account 2件と限定IAM。
- OTP/PIRA runtime Secret作成・version登録・Secret単位IAM（既存DB Secretは再作成しない）。
- OTP/PIRA Artifact 2件のpush。
- Cloud Run service 2件、Proxy sidecar、Direct VPC設定、2 service限定の匿名LBアクセス・ingress（実行前Gate適用）。
- Staging専用serverless NEG 2件、backend、URL map、HTTPS proxy、専用IP、証明書、DNS record。
- Turnstile Staging hostname/site設定と制限SMTP設定。
- `pira-union` metadataが不存在だった場合の1件だけのINSERT。
- Synthetic E2Eデータの投入と対象限定cleanup。

Staging host名、DNS管理主体、Cloud Run ingress/IAM、Proxy image digest、SMTP sandbox/allowlist、Turnstile Staging key、JWT `kid`、runtime image digest、initiative現物は未確定であり、次回承認前のGateである。Staging削除期限`2026-11-20 10:12 JST`、GENERAL無効、Production公開No-Goを維持する。

### 17A.8 最終Fit/Gap追補（2026-11-08）

#### DNS・証明書

`atlib.jp`の権威NSは`nse1`〜`nse4.squarespacedns.com`であり、project `msp-zabbix`にはCloud DNS managed zoneがない。したがってDNS変更先はGCPではなくSquarespace DNS系統である。管理アカウントと変更実行者はGCPから確認できないため、atLIBのSquarespace DNS管理者を次回承認時に指名する。`pira-staging.atlib.jp`と`pira.atlib.jp`はNXDOMAIN、`www.atlib.jp`は既存`atlib.jp`、`sales.atlib.jp`は既存`ghs.googlehosted.com`を参照している。新規Staging A recordだけを追加し、これら既存3経路は変更しない。

採用手順は次のとおりとする。

1. global Premium IPv4 `secumie-staging-ip`を予約する。
2. OTP/PIRA serverless NEG、backend、URL map、HTTPS proxy、port 443 forwarding ruleを新規名だけで作成する。
3. Google-managed certificate `secumie-staging-cert`をdomain `pira-staging.atlib.jp`で作成し、target HTTPS proxyへ関連付ける。
4. Squarespace DNSへ`pira-staging.atlib.jp A <secumie-staging-ip>`を1件追加する。既存recordの上書き、wildcard、CNAMEは使用しない。
5. 権威NSと複数public resolverでA recordが同じ固定IPを返すこと、certificateの`managed.status=ACTIVE`と`managed.domainStatus=ACTIVE`、proxyへのcertificate関連付けを確認する。
6. `PROVISIONING`中は公開E2Eへ進まない。DNS伝播後の証明書発行は通常60分以内が目安だが、DNS伝播自体は最大72時間の可能性がある。`FAILED_NOT_VISIBLE`、`PROVISIONING_FAILED`、異なるIP応答ではSTOPし、既存DNSへ変更を波及させない。`ACTIVE`後もLB反映へ最大30分を見込み、TLS/SANを実測してからPASSとする。

これは新規subdomainであり、本番`pira.atlib.jp`、既存`www.atlib.jp`、`sales.atlib.jp`、Apache、既存LBへの切替や停止を伴わない。

#### SMTP送信先制限

GCP現物には既存Sales Tools StagingのSMTP設定（host/user/fromとpassword Secret）があるが、外部配送しないsandboxである証跡はなく、SECU runtimeへの流用も承認されていない。SECU用SMTP sandbox/Secretは不存在である。

| 観点 | A: 外部配送しないSMTP sandbox | B: Staging recipient allowlist |
| --- | --- | --- |
| OTP確認 | sandbox inbox UI/APIで6桁本文を取得 | allowlist済み実メールboxで受信 |
| 誤送信防止 | sandboxが外部配送しないため強い | アプリ側拒否に依存 |
| コード差分 | Mailer変更なし | allowlist env、正規化、拒否、test追加が必要 |
| Secret | sandbox SMTP password。API自動化時はinbox API tokenも別Secret | SMTP passwordとallowlist設定。実mailbox認証は別管理 |
| 自動E2E | inbox APIがあれば容易 | mailbox API/IMAP等の追加が必要 |
| 運用・費用 | sandbox契約/保存期限/費用の承認が必要 | 小規模だがProductionと異なるコード経路を維持 |

第一候補は**A: 外部配送しないSMTP sandbox**とする。既存Mailer、固定文言、SENT/FAILED/UNKNOWN分類を変更せず、任意の入力アドレスでも外部配送されないため最小かつ安全である。次回承認前にsandbox provider/account、外部配送無効、inbox API、保持期間、費用、`secumie-stg-smtp-password`と必要時`secumie-stg-smtp-inbox-token`のSecret範囲を確定する。承認済みsandboxを用意できない場合だけBを選び、その場合は配備前に別commitでfail-closed allowlistを実装・検証する。既存Sales Tools Staging SMTPやProduction Mailerは変更・流用しない。

#### Cloud Run検証経路

OTP/PIRA serviceは`internal-and-cloud-load-balancing` ingressとする。この設定では外部Internetから`run.app`へ直接到達できず、外部公開は専用Application Load Balancerだけを通る。既存GCPの`run.allowedIngress`は`ALLOW`で設定自体を妨げない。

LB完成前に、operator PCから正規のHTTP検証経路はない。Cloud Run内/VPC内の呼出元に専用InvokerとGoogle-signed ID tokenを与えれば`run.app`へ内部到達できるが、PIRAは確定Hostを検証し、DB poolはlazy接続で、静的`/healthz`だけではHost/Origin/DB/JWT E2Eを証明できない。検証専用Job/SAを増やす利益が小さいため、新規内部検証Jobは作らない。

LB前はCloud Run `Ready`、revision設定、container startup、Secret参照、Direct VPC/Proxy sidecar、ingress/IAM、min/max/concurrencyだけをRead-only照合する。HTTP health、実DB接続、Host/Origin、Turnstile、OTP、JWT/JWKS、PIRA受付はLBと証明書がACTIVEになった後へ移す。run.appを一時的に`all` ingressへ変更しない。

LB完成後の検証順序を次へ固定する。

1. PIRA backend `/healthz`とOTP backendのhealth route（URL mapでOTP backend `/healthz`へrewrite）をLB host経由で確認する。
2. `/.well-known/jwks.json`をOTP backendから取得し、公開鍵だけ、固定`kid`、TLS、CSP/CORSを確認する。
3. 異常Host、直接run.app、GENERAL pathが拒否されることを確認する。
4. Turnstile Staging hostnameでOTP送信を行い、OTP roleの新規DB接続、sandbox配送、6桁認証、2時間session、5分JWTを確認する。
5. PIRAがsame-origin JWKSを取得し、issuer/audience/kidを検証してUNION受付を作成する。これによりPIRA roleの新規DB接続も確認する。
6. `RECEIVED → ANSWERING → COMPLETED`、8問、v7 report、JWT再利用拒否を確認する。
7. `run.app` default URLは外部直接到達不可を維持する。LB受入後にdefault URL無効化を採用する場合は、serverless NEG影響をRead-only照合して別の明示差分とする。

#### Cloud Run匿名ブラウザアクセスとInvoker IAM（2026-11-09統括追補）

2026-11-09に共通OTP Contractへ追加した「心理的抑止・会員登録なし・無料診断の気軽さ優先」（commit `95c4eb50032025cbcaab028e858ebb2d6f860837`）を配備方針へ適用する。メールOTP（利用者体験）とCloud Run IAM（基盤到達制御）は別境界である。メールOTP、JWT/JWKS、PIRA受付、8問、同意、固定文は変更しない。

**確定するアクセス要件:**

- 利用者はStaging専用LB `https://pira-staging.atlib.jp` 経由でメールOTP画面をブラウザから開ける。Googleログイン、IAP、Basic認証、会員登録、会社メール限定、追加の本人確認を求めない。
- 新規OTP/PIRA Cloud Runは `ingress=internal-and-cloud-load-balancing` を維持し、外部Internetからの `run.app` 直アクセスを拒否する。
- 従前記載の「サービス単位の限定Invokerだけ」では、匿名ブラウザからのLB経由アクセスにCloud Run IAM認証が残り、403となり得る。**限定runtime SAへの `roles/run.invoker` 付与だけで一般公開が成立したと判定しない。**
- 第一候補は、新規2 serviceだけCloud Run Invoker IAM checkを無効化（`--no-invoker-iam-check`）し、IngressでLB経由に到達範囲を限定する構成とする。既存serviceやproject全体のIAMは変更しない。代替のservice単位 `allUsers` Invoker付与は採用前に別途組織ポリシーと影響を確認する。
- これはLBからの匿名リクエスト到達を許す**インフラ設定**であり、利用者向けのメールOTPを撤廃・強化する意味ではない。

**実行前Read-only Gate:** `constraints/run.managed.requireInvokerIam` 等のeffective Organization Policy、`run.allowedIngress`、2 serviceだけのInvoker IAM check設定可否、現行projectの公開制約を確認する。禁止ポリシーや権限不足があればSTOPし、無断の組織ポリシー変更・`allUsers` 付与・Ingress `all` への緩和を行わない。

**LB完成後受入Gate:** (1) LB hostからOTP画面、PIRA画面、health/JWKSが正常応答、(2) 外部から `run.app` 直アクセス拒否、(3) Host/Origin/GENERAL拒否、(4) OTP→診断開始→会社情報・同意→8問→v7レポートが既存仕様どおりで追加ログインなし、(5) 既存service IAM/trafficに差分なし。Production公開No-Goは維持する。

公式一次資料: https://cloud.google.com/run/docs/securing/ingress / https://cloud.google.com/run/docs/authenticating/public

#### 一括承認用の確定状態

| 項目 | 状態 | 承認値・残条件 |
| --- | --- | --- |
| Staging hostname | 確定 | `pira-staging.atlib.jp`。record作成は承認待ち |
| DNS管理主体 | 一部確定 | 権威DNSはSquarespace。実行アカウント/担当者は承認待ち |
| LB/証明書 | 承認待ち | 新規global external Application LB、固定IPv4、2 NEG/backend、Google-managed certificate。既存LBは変更しない |
| runtime SA/IAM | 確定・作成承認待ち | `secumie-otp-staging`、`secumie-pira-staging`。Cloud SQL Client、対応Secret Accessor。匿名LBアクセスは新規2 serviceに限定したInvoker IAM check無効化を第一候補（Organization Policy確認後に承認） |
| SMTP | 方針確定・契約承認待ち | 外部配送しないsandboxを第一候補。provider/account/費用/inbox APIは未確定 |
| Turnstile | 承認待ち | Staging専用site/secret、許可hostname `pira-staging.atlib.jp` |
| JWT | 設定確定・鍵生成承認待ち | issuer `https://pira-staging.atlib.jp`、JWKS同origin、初期kid `secumie-stg-202611-01`、秘密鍵はOTPだけ |
| runtime image | 未確定 | 次回承認後に現行commitから2 targetをbuild/pushしdigest固定 |
| Proxy image | 確定 | `gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c` |
| `pira-union` | 未確定 | 実DB Read-only照会後、active UNIONが不存在の場合だけ1件の冪等INSERTを承認対象とする |
| E2E主体/データ | 確定 | WorkがLB経由Playwrightを実行。Synthetic企業・sandbox emailだけを使用 |
| 費用/cleanup | 一部確定 | Workが停止・原状復帰担当、期限`2026-11-20 10:12 JST`。Cloud SQL `$75`上限を維持。LB/Cloud Run/sandbox追加費用上限は経営者承認待ち |

一括実行は、sandbox、DNS担当、追加費用上限、Turnstile、runtime image digest、initiative現物がGateを満たした後に、17A.5の順序で連続実行する。想定外のIAM、接続不能、証明書失敗、Secret露出、既存service/DNSへの影響だけをSTOP条件とする。

Synthetic submission/jtiは保持Contractの対象であり、試験直後の直接DELETEは行わない。識別可能なSynthetic値で記録し、2年保持または承認済み保持処理に従う。追記専用のexport auditは作成せず、作成された場合もUPDATE/DELETEしない。cleanupはCloud Run/LB/DNS/Secret/IAM等のStagingリソースと、Contractで許される一時資産に限定する。

参照したGoogle Cloud正本:

- Cloud Run ingress: https://cloud.google.com/run/docs/securing/ingress
- Cloud Run service-to-service authentication: https://cloud.google.com/run/docs/authenticating/service-to-service
- Serverless NEG external Application Load Balancer: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless
- Google-managed certificate: https://cloud.google.com/load-balancing/docs/ssl-certificates/google-managed-certs

GENERAL無効、Secure Guard変更対象外、Production公開No-Goを維持する。

### 17A.9 Work指示に対する残Gate Read-only確定（2026-11-09）

2026-11-09のWork指示コメントとPR #46最新HEAD `fbc5a34d083c7cb3a4a250cdebdc474858760baf`を照合した。Acceptance Execution `secumie-db-acceptance-staging-gpgxz`の成功結果を正本とし、Migration 037〜041、DB権限分離、監査保護、保持preview、接続容量Gateは再実行していない。

#### Cloud Run公開Gate

Read-only現物確認では、effective `constraints/run.managed.requireInvokerIam` は未強制（空のboolean policy）、`constraints/run.allowedIngress` は`ALLOW`である。現行Cloud SDKは`--no-invoker-iam-check`をサポートし、実行予定者`yoshihisa.hagisaka@atlib.jp`のproject Owner権限には`run.services.create`、`run.services.update`、`run.services.setIamPolicy`、`iam.serviceAccounts.actAs`が含まれる。新規`secumie-otp-staging`／`secumie-pira-staging` service、同名runtime SA、runtime用Secretはいずれも未作成であり、既存serviceへの変更は不要である。

したがって第一候補を、新規2 serviceだけ`ingress=internal-and-cloud-load-balancing`かつInvoker IAM check無効とする。`allUsers`付与、Ingress `all`、既存service IAM変更は行わない。外部Application Load Balancer経由の匿名ブラウザ到達と、外部からの`run.app`直接到達拒否を配備後Gateとする。

#### DNS・証明書と管理主体

`atlib.jp`の権威DNSはSquarespace DNS系統であり、GCP Cloud DNS管理対象ではない。`pira-staging.atlib.jp`用A record追加は技術的差分を固定済みだが、Squarespace DNSの実行アカウントと担当者はGCP/Gitから特定できない。**atLIBのSquarespace DNS管理者を経営者が指名することが一括承認前Gate**である。 **2026-11-09統括追補：萩坂さんご本人をSquarespace DNS変更の実行担当者に指名済み。担当指名Gateは解消したが、管理画面での操作権限と対象recordの最終照合は実行時Gateとし、Aレコード作成は一括実行承認後に限る。** 既存`www.atlib.jp`、`sales.atlib.jp`、本番`pira.atlib.jp`は変更しない。

#### SMTP sandbox確定案

第一候補をMailtrap Email Sandbox Freeとする。Sandboxは実宛先へ配送せず、既存MailerのSMTP接続と固定本文を変更せずにOTPをinbox UI/APIで確認できる。Freeの現行公称条件は1 user、1 sandbox、月50 test emails、送信間隔10秒、同時保持10通であり、forwardingは含まれない。固定日数の保持保証は確認できず、上限超過時はFIFOで古いmessageが除去されるため、証跡取得後にSandbox APIで削除し、E2E全体を30通以内に制限する。forwardingは設定しない。

Free Terms上、無料利用は1 entityの1 authorized userであるため、Work単独運用ならFreeを採用候補とし、複数担当者が共有する場合はBasic以上を別承認とする。作成主体はatLIB、日常operatorはWork、SecretはSMTP passwordと自動E2E用API tokenを分離する。Production SMTP、既存Sales Tools Staging SMTPは変更・流用しない。

#### Turnstile確定案

Staging専用Turnstile widgetを作成し、許可hostnameを`pira-staging.atlib.jp`だけに固定する。site keyは公開設定、secretはOTP runtime専用Secretとし、PIRAへ付与しない。Free planは最大20 widget、1 widget最大10 hostname、challenge数無制限で今回の検証範囲を満たす。server-side Siteverifyを必須とし、tokenの5分期限・一回性は既存実装どおり維持する。

Cloudflare accountの現行管理者はGCP/Gitから特定できないため、**atLIB Cloudflare管理者または作成担当者の経営者指名が一括承認前Gate**である。 **2026-11-09統括追補：萩坂さんご本人をCloudflare Turnstile Staging widget作成の実行担当者に指名済み。担当指名Gateは解消したが、管理画面での操作権限とProduction widget非変更の最終照合は実行時Gateとし、widget作成は一括実行承認後に限る。** Production widget/secretは変更しない。

#### `pira-union` metadata

既存の承認済みRead-only実行経路は、固定Acceptance Jobを再実行または変更せずにinitiativeだけを照会できない。今回の禁止範囲を守り、DB照会・Job実行・INSERTは行っていない。この項目は未確認のまま後続一括実行へ含める。

後続ではPIRA roleによるINSERT前にMigration接続で`initiative_code='pira-union'`を行ロックして確認し、(a) `initiative_kind='UNION'`かつactiveならno-op、(b) 不存在なら承認済み固定値を1件だけINSERT、(c) 同codeで属性不一致ならSTOPして更新しない、という冪等手順を採用する。GENERAL rowは作成・有効化しない。

#### Runtime imageと費用Gate

承認対象ソースをPR #46 HEAD `fbc5a34d083c7cb3a4a250cdebdc474858760baf`のclean checkoutに固定する。次回一括承認後にOTP/PIRAの2 targetを各1回buildし、`npm audit --omit=dev`、既存回帰、SBOM/manifest、Critical/High 0を確認してからArtifact Registryへpushし、digestをCloud Run定義へ固定する。scan結果を取得できない場合は配備へ進まずSTOPする。

現物ではglobal forwarding ruleが既に2件あり、Google Cloud料金は同一projectのglobal forwarding rule最初の5件を**各ルール`$0.025/hour`**としており、5件合計の定額ではない。新規HTTPS forwarding ruleは1件だけを計画し、既存課金への限界増分を0と断定せず、Staging専用LBのgross費用として期限まで最大約`$6.60`を計上する。HTTP用の追加forwarding ruleやHTTP→HTTPS redirectの新設は今回の費用・変更承認に含めず、必要なら別途影響と費用を再確認する。forwarding ruleに割り当てる固定外部IPは追加料金なし、東京のLB data processingはin/out各`$0.008/GiB`、Google-managed RSA-2048証明書は接続単価なしである。Cloud Runはmin instances 0の従量課金、Artifact Registryはbilling account合計0.5 GiBまで無料・超過分約`$0.10/GiB-month`、Mailtrap Freeは`$0`である。

Cloud SQL既承認上限`$75`とは別に、2026-11-20 10:12 JSTまでの新規LB、Cloud Run、Artifact、Secret、少量通信を含む**追加費用上限`$15`**を一括承認値とする。Mailtrap paid planが必要になった場合はこの上限外として再承認する。Workが日次Billingとresource状態を確認し、上限超過見込み、既存service異常、証明書/DNS不成立でSTOPする。cleanup責任者はWork、Cloud SQLのdeletion protection解除・削除は別承認とする。

#### 一括承認が必要な変更（残Gate）

1. 新規OTP/PIRA runtime SA、SecretとSecret単位IAM、2 Cloud Run service（Invoker IAM check無効、Ingress限定）、2 runtime image build/push。
2. 新規Staging LB一式、固定IP、2 serverless NEG/backend、URL map、Google-managed certificate、Squarespace DNS A record 1件。
3. atLIB管理のMailtrap Sandbox account/inbox、SMTP/API credential Secret、外部forwarding無効での運用。
4. Staging専用Turnstile widget/site key/secret、hostname `pira-staging.atlib.jp`。
5. `pira-union`の事前照合と、不存在時だけの固定1 row INSERT。属性不一致時はSTOP。
6. 上記の追加費用上限`$15`、DNS/Cloudflare実行担当者、Workの実行・停止・cleanup責任。

以上6項目以外に、既存DB受入、既存service、Production、Secure Guard、GENERALを変更する承認は含めない。

追加参照正本:

- Cloud Run public access: https://cloud.google.com/run/docs/authenticating/public
- Organization Policy constraints: https://cloud.google.com/organization-policy/reference/org-policy-constraints
- Cloud Load Balancing pricing: https://cloud.google.com/load-balancing/pricing
- External IP pricing: https://cloud.google.com/vpc/pricing
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Artifact Registry pricing: https://cloud.google.com/artifact-registry/pricing
- Mailtrap Sandbox overview/limits/pricing/terms: https://docs.mailtrap.io/email-sandbox/overview / https://docs.mailtrap.io/email-sandbox/help/features-and-limits / https://mailtrap.io/pricing/ / https://mailtrap.io/terms/
- Turnstile setup/hostname/plans: https://developers.cloudflare.com/turnstile/get-started/ / https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/ / https://developers.cloudflare.com/turnstile/plans/


### 17A.10 経営者によるStagingアプリ一括実行承認（2026-11-09）

**承認済み（Staging限定）／Production No-Go継続。** 萩坂さんは本チャットにて、17A.9の残Gateに基づく次の6項目について「承認します」と明示した。承認前の判断基準はPR #46 HEAD `85d0726a7cdc039cbfabb85cc999283269788fc6`および本書17A.9であり、今後の文書更新自体を実行対象の拡大とみなさない。

1. **GCP runtime**：Staging専用OTP/PIRA runtime imageのbuild・scan・push・digest固定、新規runtime SA 2件、Secret/Secret単位IAM、新規Cloud Run service 2件、Direct VPCと固定Proxy、max instances 1／DB pool 2、`internal-and-cloud-load-balancing` ingress＋新規2 serviceだけのInvoker IAM check無効化。
2. **検証経路**：Staging専用global外部HTTPS LB、固定IP、serverless NEG/backend、URL map、Google-managed証明書。HTTPS forwarding rule新設は1件のみ。既存LB、既存Cloud Run Revision/traffic、既存IAMと本番DNSを変更しない。
3. **DNS**：萩坂さん本人がSquarespace DNSで `pira-staging.atlib.jp` の**新規A record 1件だけ**を登録。Workは固定IP確定とrecord差分・TLS/証明書状態の検証を担当する。認証情報をWorkのログ・Git・チャットへ記載しない。
4. **メール・Bot検証**：atLIB管理のMailtrap Email Sandbox **Freeだけ**を使用し、SMTP/API credentialをStaging Secretへ設定、外部配送・forwardingなし、E2E OTP計30通以内。萩坂さん本人がCloudflareに `pira-staging.atlib.jp` 専用Turnstile Free widgetを作成し、site key/secretの適切な分離を行う。Productionキーと既存Sales Tools Staging SMTPは変更しない。課金プランが必要ならSTOPして別承認。
5. **施策metadata**：`pira.pira_initiative` の `initiative_code='pira-union'` を承認済み最小権限経路で読み取り、一致（UNION/active）ならno-op、不存在なら事前に既存Canonicalで `display_name`を含む固定INSERT値を照合したうえで1件だけ登録、属性不一致・固定値未確定・予期しない一意制約衝突はSTOP。GENERAL rowは作成・有効化しない。
6. **受入・費用・cleanup**：Synthetic E2E（OTP→診断開始→会社情報・同意→8問→レポート、JWT/JWKS・jti再利用拒否・異常Host/GENERAL拒否・権限境界）を実施。追加費用は既存Cloud SQL承認額`$75`と別に**`$15`を運用上限**としてWorkが日次Billing/予測で監視し、超過見込みでSTOPする。Staging削除期限は**2026-11-20 10:12 JST**。Workが承認範囲の一時runtime/LB/DNS/Secret/IAM等のcleanupを管理する。

**実行方式：** Workは各工程の実行直前に対象、source commit/image digest、Secret参照、接続先、権限、コスト、既存稼働をRead-onlyで照合し、正常な既承認工程は個別再承認なしで連続実行する。萩坂さんのDNS/Turnstile手動操作は実施順序上の必須handoffであり、別の新規GCP承認を要求しない。操作可否やDNS伝播・証明書ACTIVEは実測Gateとする。

**STOP：** Critical/High scan未解決、変更対象逸脱、IAM緩和、追加forwarding rule、既存サービス影響、Secret露出、SMTP外部配送、想定外DB/施策データ、不一致/未確定値、予算超過見込み、期限内の検証・cleanup不能。停止時の無断修復・権限拡大・再実行は禁止し、残Gateを報告する。

**非承認：** Production公開、GENERAL有効化、Secure Guardの操作、受入済みMigration 037〜041の再実行、既存DB権限変更、既存service/DNS/IAM変更、課金Mailtrap、Cloud SQL instance/database/role削除、deletion protection解除。Cloud SQL本体の最終削除は別の明示的な経営者承認を要する。

### 17A.11 Staging一括配備の直前Gate STOP（2026-11-09）

第17A.10節およびPR #46実行指示コメントに従い、承認済み正常工程を開始した。Gitを正本commit `20e03c9618b904bd2c33dd382299a499333544e2`へfast-forwardし、GCP変更前のruntime image Gateを実施した。

実施結果:

- Docker Engine: `29.7.2`
- `npm audit --omit=dev`: Critical 0 / High 0 / Moderate 7 / Low 0
- OTP target local build: PASS、local image ID `sha256:4ca3e7c8b7b581b2463b6ce0c5e33d68fed2881faf60ce3ef1de770ef6dd9817`
- PIRA target local build: PASS、local image ID `sha256:5145be36c89e59ecedeabb63ca1cf462bc0a67f22fac755e9100f2ce9d3683dd`
- 両imageのOCI revision label: `20e03c9618b904bd2c33dd382299a499333544e2`
- base image: `node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0`

OTP imageをDocker Scout v1.24.0でコンテナ全体（OS packageと同梱npm packageを含む）スキャンしたところ、16 vulnerable packages、Critical 6件、High 52件を検出した。CriticalにはDebian bookwormの`perl 5.36.0-7+deb12u3`（修正版`5.36.0-7+deb12u4`）5件と、runtime image内の`npm tar 6.2.1`（CVE-2026-59873、修正版`7.5.19`）1件が含まれる。アプリのproduction dependencyだけを対象とする`npm audit`の0件と、コンテナ全体の結果は区別する。

これは第17A.10節のSTOP条件「Critical/High scan未解決」に該当するため、最初の不一致で直ちに停止した。PIRA imageの重複スキャン、再build、base image更新、package更新、Artifact Registry push、SA/Secret/IAM、Cloud Run、LB/NEG/IP/証明書、DNS、Turnstile、Mailtrap、DB metadata照会/INSERTは実施していない。既存GCP、DB、DNS、Production、GENERAL、Secure Guardに変更はない。追加費用は発生していない。

再開には、runtime final stageから不要なnpm/toolchainを除くこと、修正版OS packageを含むbase digestへ更新すること等の最小image hardening差分を別途確定し、OTP/PIRA両imageでCritical/High 0を再確認する必要がある。現承認は無断修復・再buildを禁止しているため、この差分は実施していない。


### 17A.12 Runtime image hardeningの追加承認（2026-11-09）

**萩坂さんが本チャットで「承認します」と明示。** 第17A.11節のコンテナ全体scan STOP（OTP image Critical 6 / High 52）を受け、以下の**Docker image最小修正とローカル再検証のみ**を追加承認する。第17A.10節のStaging配備全体の承認を取り消すものではないが、image Gate PASSが記録されるまで配備実行は再開しない。

1. **対象**：`Dockerfile.secumie` の`otp-runtime`／`pira-runtime`と、両者を整合してbuildするために不可欠な専用build/production-deps stage。修正する場合も、受入済み`db-operations` targetの内容・動作・既存Migration 037〜041およびDB受入証跡を変更しない。共通stage変更がDB operationsへ波及する場合は分離またはSTOP。
2. **ベース**：Node.js 20は2026-03-24にEOLのため継続利用を修正完了とはしない。サポート中のNode.js LTSを採用し、第一候補を`node:24-bookworm-slim`とする。必要なOS security fixesを含む候補を選定し、承認対象の実際のbase image digest・Node version・OS package versionを証跡化する。builderとruntimeのNode major/ABI整合を検証し、互換性差異があればSTOP。
3. **実行時最小化**：runtime final stageからHTTP処理に不要なnpm/npx・開発toolchain等を除外する。アプリのproduction `node_modules`、Node実行ファイル、CA証明書等の必要物は残し、従来の`USER node`、`NODE_ENV=production`、エントリポイント、公開port、サービス機能を維持する。
4. **Gate**：修正後のOTP/PIRA両imageをローカルbuildし、コンテナ全体のOS＋npmのscanで**Critical 0 / High 0**を実証する。`npm audit --omit=dev`のCritical/High 0、TypeScript build・関連テスト・コンテナ起動・OTP/PIRAの機能非退行、実際のrevision labelとdigest/SBOMを記録する。High/Criticalが残る、例外・ignore・検査範囲縮小を要する、互換性不明の場合はSTOP。
5. **境界**：この追加承認ではDockerfile中心の最小code差分、ローカルbuild/scan/testとPR #46の証跡保全まで。Artifact Registry push、Cloud Run/SA/Secret/IAM、LB/DNS、SMTP/Turnstile、DB操作はimage Gateの統括確認まで実施しない。アプリ仕様、認証強化、依存ライブラリの広範囲更新、既存GCPの構成変更は含めない。差分をPR #46 Draftへcommitし、未解決Gateを明示する。

**継続条件**：統括による結果照合後、Critical/High 0かつ互換性PASSなら、追加の設計変更を行わず第17A.10節の既承認Staging工程へ復帰する。Production No-Go、GENERAL無効、Secure Guard対象外、既存DB受入再実行禁止、追加費用運用上限$15（Cloud SQLの既承認$75とは別）、削除期限`2026-11-20 10:12 JST`を継続する。

### 17A.13 Runtime image hardeningローカル検証結果（2026-11-09）

追加承認に基づき、`Dockerfile.secumie`のOTP/PIRA runtime専用stageだけをhardeningした。`db-operations`は従来のNode 20 build/production-deps stageを継続し、target buildとMigration 037〜041 manifest検証がPASSしたため受入済みDB operationsへの波及はない。

hardening code commit:

```text
7656c6cf777a710a7d518967d0a5ee4c10c9e668
```

構成:

- build/production-deps: `node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9`
- final runtime: `gcr.io/distroless/nodejs24-debian13@sha256:088a01637f22908632ba09018be2e0b516f2fa6f7869c191d29491139db43c78`
- Node: `v24.22.2`
- final runtime user: `nonroot`
- npm/npx/shell/development toolchain: final runtimeに不存在
- `NODE_ENV=production`、port 8080、Node entrypoint、OTP/PIRA server script、CA/production dependenciesを維持

最終ローカルimage（OCI revision labelは上記hardening commit）:

| target | local image ID | SBOM SHA-256 | Critical | High |
|---|---|---|---:|---:|
| OTP | `sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322` | `da300378a91904aadba1389f3767b36a0d409e2abc40a9f2ece889eb9d807c1a` | 0 | 0 |
| PIRA | `sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2` | `029b208b9d2898951685485a8b4ee960fdc6eed13101d132f66b56963da4e409` | 0 | 0 |

Docker Scout v1.24.0で両imageのOS＋npmを全件対象として検査し、ignore、suppression、検査範囲縮小なしでCritical 0 / High 0を確認した。`npm audit --omit=dev`はCritical 0 / High 0 / Moderate 7 / Low 0である。

互換性検証:

| 項目 | 結果 |
|---|---|
| TypeScript build | PASS |
| production readiness security | 5/5 PASS |
| dedicated DB設定 | 2/2 PASS、実DB項目1件は当該単体実行ではskip |
| PostgreSQL 16＋Playwright runtime E2E | 2/2 PASS（OTP→受付→8問→report→COMPLETED、unknown Host／GENERAL無効／不正JWT拒否） |
| OTP/PIRA container startup・`/healthz` | 両方200、PASS |
| SIGTERM | 両方exit 0、PASS |
| `db-operations` target build／manifest | PASS、037〜041の5件一致 |
| diff check | PASS |

最初のruntime E2E単体実行はローカルPostgreSQL未起動により`ECONNREFUSED 127.0.0.1:55437`となった。コード不具合ではなく、専用の一時PostgreSQL 16を起動して同一testを再実行し2/2 PASS、終了後は当該一時containerだけを削除した。既存container/volumeは変更していない。

Artifact Registry push、GCP、Cloud Run、SA、Secret、IAM、LB、DNS、SMTP、Turnstile、DBは変更していない。image GateはローカルでPASSしたが、第17A.12節どおり統括照合前に配備へ自動復帰せず停止する。


### 17A.14 Runtime hardening Gate統括照合・Staging配備STOP解除（2026-11-09）

**判定：PASS。第17A.11節のimage scan STOPを解除し、第17A.10節の既承認Staging限定配備工程への復帰を認める。追加経営者承認は不要。**

統括照合対象は、hardening commit `7656c6cf777a710a7d518967d0a5ee4c10c9e668`、evidence commit `9b97848d50386304c4d55ad531698eaa2446b0c1`、Work検証コメント https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/46#issuecomment-6731380106、`Dockerfile.secumie` の実diff。

- 修正code差分はDockerfileのみ。OTP/PIRA runtime専用のNode 24 build/deps stageとdigest固定のDistroless Node 24 final stageを採用。非root、不要なnpm/npx/shell/toolchain非同梱、両serviceのentrypoint・health・SIGTERMを確認。
- WorkのDocker Scoutローカル証跡ではOTP/PIRAともコンテナ全体 Critical 0／High 0、ignore・suppressionなし。`npm audit --omit=dev` Critical/High 0、Moderate 7は既記録。TypeScript・readiness・PostgreSQL 16＋Playwright runtime E2E 2/2・両image起動／終了PASS。
- `db-operations` targetとMigration manifestの既承認範囲へのcode差分なし。既存DB acceptance再実行は不要。
- 初回runtime E2Eの一時DB未起動による`ECONNREFUSED`は、専用一時PostgreSQL 16を起動した同一テスト2/2 PASSで解消。実GCP acceptanceを実施したとはみなさない。
- 本判定はGitHub上の差分・Workローカルscan/test証跡に基づく統括照合であり、統括が同じDocker検査を別環境で再実行したものではない。

**配備再開の直前Gate：** Workは現行PR HEAD・hardening source・実際にpushする各imageのrevision label/SBOM/scan結果を照合し、Artifact Registryへpush後に返る**Registryの不変digest**でCloud Runを固定する。再build等でimage内容が変化した場合は対象imageの全体scanを再確認する。Critical/High残存、digest/source不一致、既承認構成との不整合は再STOP。ローカルimage IDとRegistry digestを混同しない。

上記Gate通過後は第17A.10節の既承認範囲（新規OTP/PIRA Cloud Run 2件、SA/Secret/IAM、LB/NEG/新規HTTPS forwarding rule 1件、Mailtrap Sandbox Free、萩坂さんのSquarespace DNS A 1件およびTurnstile専用widget、条件付き`pira-union` metadata、Synthetic E2E）を追加の設計変更なく順次実行する。萩坂さん手動工程の具体値確定時はhandoffする。

Production No-Go、GENERAL無効、Secure Guard対象外、既存service/DNS/IAM非変更、Migration 037〜041受入再実行禁止、追加費用運用上限`$15`（Cloud SQL既承認`$75`とは別）、Staging削除期限`2026-11-20 10:12 JST`をすべて維持。Cloud SQL instance/database/role削除とdeletion protection解除は別承認。

### 17A.15 Staging配備再開・Artifact／runtime基盤（2026-11-09）

統括PASS後、hardening commit `7656c6cf777a710a7d518967d0a5ee4c10c9e668`の検証済みlocal imageを既存Artifact Registryへpushした。再buildは行っていない。Registryが返したdigestはlocal image IDと一致した。

```text
OTP:  asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-otp-runtime@sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322
PIRA: asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-pira-runtime@sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2
```

両imageは第17A.13節のCritical 0／High 0、SBOM、revision labelを維持する。Cloud Runでは上記digestだけを使用し、tagを使用しない。

作成したruntime基盤:

- SA `secumie-otp-staging@msp-zabbix.iam.gserviceaccount.com`
- SA `secumie-pira-staging@msp-zabbix.iam.gserviceaccount.com`
- 両SAへ`roles/cloudsql.client`
- OTP SA: `secumie-stg-db-otp-password`と新規OTP Secret 4件だけにSecret Accessor
- PIRA SA: `secumie-stg-db-pira-password`だけにSecret Accessor
- 新規Secret: `secumie-stg-smtp-password`、`secumie-stg-turnstile-secret`、`secumie-stg-otp-hmac-key`、`secumie-stg-otp-jwt-keys`
- HMAC/JWT SecretはCSPRNG／RSA-3072で非表示生成しversion 1を登録。JWT `kid=secumie-stg-202611-01`
- SMTP passwordとTurnstile secretは手動設定待ちでenabled version 0

Bootstrap/Migration SAの流用、runtime SAへのArtifact Writer／Secret Admin／Cloud SQL Admin、既存principalの権限変更は行っていない。秘密値はCLI引数、標準出力、ログ、Git、チャットへ出していない。

Cloud Run 2 serviceは、必須SMTP/Turnstile Secretのversion 1および公開site key/SMTP接続識別子が未確定のため作成前Gateで待機する。placeholder、無効なSecret、認証迂回でserviceを作成しない。

### 17A.16 Registry manifest／config digest再照合（2026-11-10）

統括指示コメント #6755482813 に従い、再build・再pushなしでローカルDocker image、Artifact RegistryのOCI index、linux/amd64 platform manifest、config objectを階層別に照合した。取得時点は2026-11-10 JSTである。

| image | local Docker `.Id` / Registry OCI index | linux/amd64 manifest | local / remote config digest | 判定 |
|---|---|---|---|---|
| OTP | `sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322` | `sha256:a9ffd8f87411c4497a34aa31990cc6c3168bc28d7c849127eac8dc95354b8e83` | `sha256:60cdc085d4bcf01a48ce2f515a0c63f1f8aae017ed80dd4c674774b12f47aafe` | PASS |
| PIRA | `sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2` | `sha256:37344174b112f98f1458e235f7d8b900f31a7b2ca0b2cb677c0057e2bed89743` | `sha256:276a4a26af17d7c25bb7d8e597c10bc492bc7963151b49092612e445a0c9b9c8` | PASS |

各Registry objectは`application/vnd.oci.image.index.v1+json`で、linux/amd64の実行manifestとunknown/unknownのattestation manifestを含む。ローカルDocker Desktopのcontainerd image storeにおける`.Id`はこのOCI index digestを返しており、config digestではない。`docker image save`の`manifest.json`が参照するconfig JSON digestと、Registryのlinux/amd64 manifestに含まれる`config.digest`を比較し、両imageで完全一致した。

Cloud Runへ固定する不変参照はconfig digestやplatform manifestではなく、検証済みOCI indexの次の参照とする。

```text
asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-otp-runtime@sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322
asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-pira-runtime@sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2
```

第17A.15節の「local image IDとRegistry digest一致」は上記OCI index同士の一致を意味し、config digestの一致を意味する記載ではない。本節で階層と同一性を訂正・補完し、Registry GateをPASSとする。

## 18. Recovery・Migration最終承認実行結果（2026-11-08）

### 18.1 Recovery

固定Job定義をoverrideなしで1回実行した。

- Execution: `secumie-db-bootstrap-staging-jm2cm`
- 結果: SUCCEEDED、succeeded 1、failed 0、retry 0
- 完了: `2026-11-08T11:06:39.118896Z`
- Recovery image: `sha256:beb7c6d22586e1f157f142fd535eedff9cf9a9aafba08731f8398a5b919eda36`
- database: `secumie_insight_staging`作成済み

Recovery CLIの事後条件（owner=`postgres`、PUBLIC database/schema権限撤回、固定5 role CONNECT、Migration roleのDB CREATEと`public` schema USAGE/CREATE）がPASSしてExecutionは正常終了した。既存5 role、6 Secret、password、membershipは変更していない。

### 18.2 Migration 037〜041

承認済み固定定義で`secumie-db-migrate-staging`を新規作成し、実行前に次を照合した。

- 固定image digest、Migration CLI、専用Migration SA
- `secumie_insight_staging`、Migration role、Migration Secret version 1
- manifestとdirectoryは037〜041だけ
- Direct VPC、Proxy固定digest、task/parallelism 1、retry 0、timeout 15分
- Job作成直後Execution 0

照合後、1回実行した。

- Execution: `secumie-db-migrate-staging-2pdmh`
- 結果: SUCCEEDED、succeeded 1、failed 0、retry 0
- 完了: `2026-11-08T11:08:10.845781Z`

Migration CLIはmanifestの5件を検証・適用し、ledgerが037〜041の5件だけであることを確認して正常終了した。001〜036、Secure Guard Migration、他databaseは対象外である。

### 18.3 受入検証とSTOP

実環境のrole Positive/Negative、owner、ledger、容量、監査保護、保持previewを一度の固定Jobで検証するため、`validateSecumieStagingCli.ts`を追加した。

- code commit: `fef044cd37bc6b6b635f36c4f1ddd71c6777e7bd`
- TypeScript build: PASS
- acceptance image digest: `sha256:97de86aef0914b499a380be0d75b27ed4e0eabad557b05dcc7816dc35842a2c5`
- Job: `secumie-db-acceptance-staging`
- task/parallelism 1、retry 0、Bootstrap SA、既存6 Secret、Direct VPC、固定Proxy

Execution `secumie-db-acceptance-staging-72dp6`はFAILED、failed 1、retry 0で終了した。再実行していない。

Cloud SQLログで原因を確定した。

```text
db=secumie_insight_staging,user=postgres
ERROR: permission denied for table schema_migrations
STATEMENT: SELECT filename FROM schema_migrations ORDER BY filename
```

受入CLIがBootstrap主体`postgres`からMigration role所有のledgerを直接読めると仮定していたことが原因である。これは既存role/Secret/Recovery/Migrationの失敗ではなく、最小権限により拒否された受入検証コード側の不適合である。ただし、承認済みSTOP条件「受入工程の失敗」に従い、CLI修正、Job再実行、追加GRANT、権限拡大は行っていない。

失敗は最初のledger読取りで発生したため、Synthetic INSERT、Positive/Negative SQL、保持previewには到達しておらず、受入Jobによる永続データ変更はない。Secret値はJob定義・ログ・Gitへ露出していない。

### 18.4 STOP時点の現物

- `secumie_insight_staging`: 存在
- Recovery: PASS
- Migration 037〜041: PASS
- ledger最終照合: Migration CLI内でPASS
- 受入のowner/role/監査/保持preview総合確認: 未完了
- Cloud SQL 3件: RUNNABLE
- Cloud Run 7サービス: Ready
- Secure Guard/Production/GENERAL: 変更なし
- 残存Job: Bootstrap、Migration、Acceptance（failed Execution各証跡を含む）

再開には、Bootstrap主体でMigration所有tableを読まないよう受入検証をrole別接続へ修正する具体的差分の承認が必要である。Migration roleでledgerを確認し、Bootstrap接続はpg_catalogのowner/ACL検証だけに限定する。既存DBへ新たなGRANTを追加する必要はない。

### 18.5 受入CLI最小修正・ローカル検証

統括判断に基づき、DB権限を変更せず受入CLIだけを修正した。

- `schema_migrations`の完全一致照合をMigration role接続へ移動した。
- Bootstrap接続はdatabase owner、容量、role属性/membership、schema/table/function ownerのpg_catalog確認に限定した。
- Ledgerは件数だけでなく、037〜041のfilename配列と順序が完全一致することを必須とした。
- OTP/AdminのSynthetic INSERTは同一PoolClientでBEGINし、finallyでROLLBACKしてから接続を解放する。
- OTP/PIRA/Admin/MaintenanceのPositive/Negative検証はrole別接続を維持した。

使い捨てPostgreSQL 16でRecovery、Migration、修正版Acceptanceを連続検証した結果:

| 項目 | 結果 |
|---|---|
| TypeScript build / diff check | PASS |
| Recovery・Migration・Acceptance test | 2/2 PASS |
| Ledger 037〜041 filename完全一致 | PASS |
| schema/table/function owner | 3/3 schema、10/10 table、7/7 function PASS |
| OTP/PIRA/Admin/Maintenance Positive/Negative | PASS |
| 監査UPDATE/DELETE拒否 | PASS |
| 保持preview（executeなし） | PASS |
| Synthetic OTP lock / export audit残存 | 0 / 0 |
| 禁止public table残存 | なし |

GCP Acceptance Jobのimage/command更新と再実行は未実施である。既存RecoveryとMigrationの成功結果を維持し、GCP再実行は修正版commit、image digest、Job差分の経営者承認後に1回だけ行う。

### 18.6 Acceptance最終準備・容量Gate統一

受入CLIの接続容量判定を承認済みCanonicalへ統一した。

```text
R = max(10, ceil(M × 0.20), superuser_reserved + reserved + 5, observed_connections + 5)
available = M - R
PASS: available >= 78
```

ローカルPostgreSQL 16では`M=100`、`superuser_reserved=3`、`reserved=0`、`observed=6`、`R=20`、`available=80`となりPASSした。

検証結果:

- Recovery/Migration/Acceptance: 2/2 PASS
- DB Operations: 4/4 PASS
- Staging preparation: 4/4 PASS
- Ledger 037〜041完全一致、role別Positive/Negative、監査保護、保持preview: PASS
- Synthetic data残存: 0件
- TypeScript build / diff check: PASS

修正版commitとArtifact:

```text
commit: e5013103ee7866800bd6d9992d01d69e627d9459
image: asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations@sha256:e516625862078a12b02d6428f9a3721a2f170d29d2ca08abefb57d21d2ddc9f2
```

既存Acceptance Jobとの差分はmain image digestの1項目だけである。

```text
current: sha256:97de86aef0914b499a380be0d75b27ed4e0eabad557b05dcc7816dc35842a2c5
approved candidate: sha256:e516625862078a12b02d6428f9a3721a2f170d29d2ca08abefb57d21d2ddc9f2
```

command=`node`、args=`dist/db/validateSecumieStagingCli.js`、Bootstrap SA、6 Secret、Proxy digest、Direct VPC `private-ranges-only`、task/parallelism 1、retry 0は維持する。Acceptance Jobの更新・実行は未実施である。

### 18.7 Acceptance最終実行結果

経営者の最終承認に基づき、Acceptance Jobのmain image digestだけを承認済み候補へ更新した。command/args、Bootstrap SA、6 Secret version 1、Proxy digest、Direct VPC、task/parallelism 1、retry 0は変更していない。

```text
job: secumie-db-acceptance-staging
generation: 2
image: sha256:e516625862078a12b02d6428f9a3721a2f170d29d2ca08abefb57d21d2ddc9f2
execution: secumie-db-acceptance-staging-gpgxz
result: SUCCEEDED (succeeded=1, failed=0, retry=0)
completed: 2026-11-08T11:53:35.172114Z
```

実環境受入結果:

| 項目 | 結果 |
|---|---|
| Database owner | `postgres`、PASS |
| Migration ledger | 037〜041の5 filename完全一致、PASS |
| schema owner | 3/3 PASS |
| table owner | 10/10 PASS |
| function owner | 7/7 PASS |
| 固定5 role属性・connection limit・membership | PASS |
| OTP/PIRA/Admin/Maintenance Positive/Negative | PASS |
| 監査UPDATE/DELETE拒否 | PASS |
| 保持preview | PASS、全候補0、削除executeなし |
| Synthetic transaction | ROLLBACK完了、永続残存なし |
| Secret露出 | なし |

接続容量Gate:

```text
M=400
superuser_reserved=3
reserved=0
observed_connections=10
R=max(10,80,8,15)=80
available=320
required=78
result=PASS
```

実行後、既存Cloud SQL 3件はRUNNABLE、既存Cloud Run 7サービスはすべてReadyであり、既存サービスへの影響は確認されなかった。Recovery/Migrationの再実行、DB/role/Secret/IAM変更、Secure Guard/Production/GENERAL操作は行っていない。

以上により、**SECU:MIE Insight共用Staging DBの初期化・Migration・受入検証は完了**と判定する。Staging削除期限`2026-11-20 10:12 JST`を維持する。

Production公開No-Goを維持する。

## 19. OTP／PIRA Staging配備開始（2026-11-10）

統括PASS・配備再開指示および経営者一括承認に基づき、Registry digest照合PASS後、新規Cloud Run 2サービスとStaging専用固定IPv4の作成までを実施した。既存Cloud Run、既存DB、既存DNS、Production、Secure Guardには変更していない。

### 19.1 Runtime配備結果

| 項目 | OTP | PIRA |
|---|---|---|
| Service | `secumie-otp-staging` | `secumie-pira-staging` |
| Ready revision | `secumie-otp-staging-00001-rxg` | `secumie-pira-staging-00001-vhd` |
| Traffic | 100%（新規サービス内） | 100%（新規サービス内） |
| Immutable image | OCI index `sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322` | OCI index `sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2` |
| Runtime SA | `secumie-otp-staging@msp-zabbix.iam.gserviceaccount.com` | `secumie-pira-staging@msp-zabbix.iam.gserviceaccount.com` |
| DB role / pool | `secumie_otp_staging` / max 2 | `secumie_pira_staging` / max 2 |

両サービスで次を確認した。

- `internal-and-cloud-load-balancing` ingress、Invoker IAM check無効化は新規2サービスだけに限定。
- Direct VPC `default/default`、egress `private-ranges-only`。
- Cloud SQL Auth Proxy v2 sidecarは固定digest `sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c`。
- max instances 1、DB pool max 2、main containerはProxy startup後に起動。
- Secretはversion 1参照。Secret値はCLI出力、ログ、Gitへ記録していない。
- `PIRA_GENERAL_ENABLED=false`を維持。
- SMTPはMailtrap Email Sandbox、TurnstileはStaging専用Widget。SMTP認証情報は非公開設定のみとし、本証跡へ記録しない。
- 両revisionはReady。作成直後のERRORログは0件。

### 19.2 Staging専用固定IP

名称競合がないことを確認後、専用HTTPS LB用の固定IPv4を新規作成した。

```text
name: secumie-staging-ip
address: 136.69.38.50
scope: global
network tier: PREMIUM
status: RESERVED
created: 2026-11-10 10:16 JST
```

次の工程は、Squarespace DNSへ`pira-staging.atlib.jp`のAレコードを1件だけ追加する人間操作である。DNS操作完了までは、serverless NEG、backend、URL map、Google-managed証明書、HTTPS proxy、forwarding ruleの作成を停止する。本番用`pira.atlib.jp`、`www.atlib.jp`、既存DNSレコードには触れない。

Staging削除期限`2026-11-20 10:12 JST`、追加費用上限15 USD、Production公開No-Goを維持する。

### 19.3 DNS反映・専用HTTPS LB・証明書

CEOによるSquarespace DNS操作完了報告後、公開DNSを独立確認し、`pira-staging.atlib.jp`のAレコードが固定IP `136.69.38.50`へ解決されることを確認した。その後、承認済みの新規Staging専用リソースだけを作成した。

| 種別 | リソース |
|---|---|
| Serverless NEG | `secumie-otp-staging-neg`、`secumie-pira-staging-neg` |
| Global backend | `secumie-otp-staging-backend`、`secumie-pira-staging-backend` |
| URL map | `secumie-staging-url-map` |
| Managed certificate | `secumie-staging-cert` |
| HTTPS proxy | `secumie-staging-https-proxy` |
| Forwarding rule | `secumie-staging-https`（新規1件、TCP 443） |

URL mapは`pira-staging.atlib.jp`に限定し、`/v1/otp/*`、`/v1/auth/*`、`/.well-known/jwks.json`をOTP backendへ、それ以外をPIRA backendへ送るsame-origin構成とした。既存LB、既存backend、既存DNSレコードには変更していない。

Google-managed証明書は次のとおり発行完了した。

```text
certificate: secumie-staging-cert
domain: pira-staging.atlib.jp
status: ACTIVE
domain status: ACTIVE
active confirmed: 2026-11-10 11:43 JST
expire time: 2027-02-08 11:36 JST
```

HTTPS経路のRead-only smoke結果:

```text
GET /healthz                    -> 200 (PIRA backend)
GET /.well-known/jwks.json      -> 200 (OTP backend)
GET /                           -> 200 (PIRA static UI)
remote IP                       -> 136.69.38.50
TLS verification               -> PASS
```

既存Cloud Run 7サービスと新規2サービスはすべてReadyであり、既存サービスへの影響は確認されなかった。DB受入済み項目、Migration、保持処理は再実行していない。次工程は`pira-union` metadata Gateと、Mailtrap Sandbox／Turnstileを用いたSynthetic E2Eおよび境界試験である。

Production公開No-Go、`PIRA_GENERAL_ENABLED=false`、Secure Guard対象外、追加費用上限15 USD、Staging削除期限`2026-11-20 10:12 JST`を維持する。

### 19.4 `pira-union` metadata Gateの実行前STOP

統括Gate PASS後、公開API `GET /api/public/pira/v1/intake-contract`をRead-only照会し、`INITIATIVE_NOT_FOUND`（HTTP 404）を確認した。これはMigrationが施策seedを持たない既知の「不存在」分岐である。

既存HA-2承認seedの固定値を照合し、Migration主体・retry 0・task/parallelism 1・固定Proxy/Direct VPCを使う一時Job `secumie-pira-metadata-staging`を作成した。ただし実行前の`describe`照合で、承認済み表示名`国連協 情報セキュリティ診断`がJob定義上`??? ??????????`へ変換されていることを検出した。Windows PowerShellからYAMLを渡す過程の文字コード変換と判断できるが、固定metadataの不一致であるため、承認済みSTOP条件に従い実行しなかった。

確認結果:

- metadata Job Execution: 0件。
- `pira-union` INSERT、GENERAL操作、その他DB書込み: 未実施。
- 公開intake contract: HTTP 404を維持。
- 既存Cloud Run 7サービスと新規OTP/PIRA 2サービス: 全件Ready。
- Secret値のログ/Git出力: なし。
- Synthetic E2E: metadata Gate未通過のため未実施。
- 自動再試行、Job定義修復、権限変更、DB削除: 未実施。

再開時は、固定表示名をASCIIのUnicode escapeとしてJob定義へ埋め込む、または既存Artifactへ固定allowlist CLIを収録するなど、実行前`describe`で文字列の完全一致を証明できる方式が必要である。既存の誤ったJobは未実行のまま残存し、削除・更新は次の統括指示まで行わない。

Production公開No-Go、GENERAL無効、Secure Guard対象外、追加費用上限15 USD、削除期限`2026-11-20 10:12 JST`を維持する。

### 19.5 `pira-union` metadata文字コード修正・Gate PASS

経営者追加承認・統括再開指示に従い、未実行Job `secumie-pira-metadata-staging`の日本語文字列輸送だけを最小修正した。表示名はWindows PowerShellを通過するJob定義ではASCII Unicode escapeとし、Node実行時に日本語へ復号する方式とした。DB、role、Migration、業務仕様には変更していない。

実行前Gateでは、次を確認した。

- 復号後表示名: `国連協 情報セキュリティ診断`
- Unicode code point: `56fd 9023 5354 20 60c5 5831 30bb 30ad 30e5 30ea 30c6 30a3 8a3a 65ad`
- UTF-8 hex: `e59bbde980a3e58d9420e68385e5a0b1e382bbe382ade383a5e383aae38386e382a3e8a8bae696ad`
- INSERT対象: `pira-union` 1行だけ、`initiative_kind=UNION`、`active=true`
- 接続先: `secumie_insight_staging`、Migration role
- task/parallelism 1、retry 0、固定image/Proxy、Direct VPC、Secret参照: 正本一致
- 実行前Execution: 0件、既存Cloud Run 9サービス: Ready

Gate PASS後に1回だけ実行した。

```text
Job: secumie-pira-metadata-staging
Execution: secumie-pira-metadata-staging-crslh
Result: SUCCEEDED (1/1, retry 0)
Action: inserted
```

実行後ログのcode pointおよびUTF-8 byte列は上記固定値と完全一致した。公開API `GET /api/public/pira/v1/intake-contract`はHTTP 404 `INITIATIVE_NOT_FOUND`からHTTP 200へ変わり、UNION施策、承認済み同意版、F01〜F07を返した。`???`、未復号escape、代替文字は保存されていない。GENERALおよび想定外のDB変更はない。

### 19.6 Synthetic E2E結果

metadata Gate PASS後、`https://pira-staging.atlib.jp/`でSynthetic dataだけを用いて実ブラウザE2Eを実施した。

| 項目 | 結果 | 根拠 |
|---|---|---|
| Turnstileサーバー側検証 | PASS | OTP challenge作成がHTTP 201。クライアント表示だけではなく、サーバー検証を通過した |
| Mailtrap Sandbox OTP | PASS | Sandbox受信メールの6桁コードで検証。外部配送・forwardingなし |
| OTP検証 | PASS | `/v1/otp/challenges/{id}/verify` HTTP 200 |
| JWT発行／JWKS | PASS | session token発行HTTP 200、JWKS HTTP 200、PIRA側検証を経て受付成功 |
| PIRA受付 | PASS | `/api/public/pira/v1/submissions` HTTP 201 |
| 状態遷移 | PASS | ANSWERING、COMPLETEDのstate APIが順にHTTP 200 |
| 8問／v7レポート | PASS | 8問回答後に承認済みv7レポートと印刷ボタンを実ブラウザで確認 |
| 異常Host | PASS | 不正Host headerでHTTP 404 |
| GENERAL無効 | PASS | `/security-check/` HTTP 404、`PIRA_GENERAL_ENABLED=false`を維持 |
| DB通信・権限境界 | PASS | OTP/PIRA双方が専用roleでDB処理を完了し、権限エラーなし。受入済みDB権限試験は再実行していない |
| jti再利用拒否 | 未再実行 | ブラウザは操作ごとに新JWTを発行し、tokenを永続化しない。実環境で同一JWTを抽出・再送する追加経路は今回作成していない。既存実DB受入結果を維持 |

最初のブラウザ状態消失後に再送したため、今回のOTP送信は2通（累計2/30）。いずれもMailtrap Sandbox内に限定され、実顧客アドレス・Production SMTPは使用していない。OTPコード、JWT、メールアドレス、SMTP/Turnstile Secretは本証跡、Git、ログへ記録していない。

Cloud Run request logでは、OTP challenge作成201、OTP verify 200、token発行200、PIRA submission 201、ANSWERING/COMPLETED 200、JWKS 200を確認した。E2E時間帯のOTP/PIRA ERRORログは0件。既存7サービスと新規2サービスは全件Readyであり、既存サービスへの影響は確認されなかった。

回答・結果・レポートはブラウザ内だけで処理され、サーバーへ永続保存していない。受付情報・jti・監査はContractの保持対象であり、無断DELETEは行わない。Synthetic受付は保持・cleanup対象として識別し、追記専用監査制約を維持する。

追加リソースは承認済み範囲内で、費用上限15 USD超過を示す事象はない。Cleanup対象はStaging専用Cloud Run 2サービス、SA/Secret、LB/NEG/backend/IP/証明書、metadata一時Job等。Cloud SQL本体のdeletion protection解除・削除は別承認とする。削除期限`2026-11-20 10:12 JST`を維持する。

残存確認は、実環境での同一JWT再利用拒否の独立試験と、サービスイン前の全体image security確認である。Production公開No-Go、GENERAL無効、Secure Guard対象外を維持する。

### 19.7 同一JWT再利用拒否・OTP送信前STOP（2026-11-10）

統括コメント #6759597180 の既存`publicAuthIntakeAdapter`経路を採用し、OTP送信前にソースと実ページを照合した。専用の一時Chromeセッション内だけで標準adapterを保存・差し替え、終了時に復元する方式とした。handlerは正規Turnstile／OTP／JWT経路を維持し、同一JWTをページメモリ内だけで初回受付（idempotency key A）と再利用受付（別key B）へ使用する。token、OTP、Synthetic email、Secretをconsole、標準出力、ファイル、Gitへ出さないことを事前レビューした。

実ページpreflight:

```text
origin: https://pira-staging.atlib.jp (match)
standard publicAuthIntakeAdapter: present
serviceId: pira-union
intakeApiBase: /api/public/pira/v1
temporary adapter: installed in browser memory only
```

ただし、一時試験プロセスがTurnstile tokenの準備完了を明示的に待たず、送信ボタンのenabled状態だけを待ってクリックしたため、画面側はchallenge APIを呼び出さず、30秒でresponse待機がtimeoutした。Cloud Run request logをRead-only確認した結果、当該時間帯のOTP runtime requestは0件であり、OTP送信、challenge作成、JWT発行、PIRA受付、jti消費は発生していない。

判定:

- 同一JWT再利用拒否の独立試験: **未実施／STOP（PASS扱い禁止）**
- OTP送信追加: 0通（累計2/30を維持）
- DB／IAM／Cloud Run／LB／DNS／Secret変更: なし
- Synthetic submission／jti／監査の追加副作用: なし
- 既存9 Cloud Run: 実行前全件Ready
- 一時プロセス／ブラウザ: 終了、一時ファイル: 削除

承認済み「途中FAIL時は再試行しない」に従い、その場で再実行していない。再開する場合の最小差分は、OTP送信ボタンを押す前に`publicAuthTurnstileToken()`の**戻り値そのものを外部へ取り出さず、booleanの準備完了だけ**をページ内で待つことである。新規backend route、Turnstile bypass、恒久保存、権限追加は不要であるが、再実行は次の統括指示まで行わない。

同一JWT GateがPASSしていないため、後段のサービスイン前全体image security Gateの追加実測は本工程では開始していない。既存のOTP/PIRA runtime Critical 0／High 0、digest照合PASSと、Proxy sidecar／最新advisory DBの残存Fit/Gap（統括コメント #6759374518）を維持する。

Production公開No-Go、GENERAL無効、Secure Guard対象外、追加費用上限15 USD、削除期限`2026-11-20 10:12 JST`を維持する。

### 19.8 Turnstile有限待機による再開結果（2026-11-10）

統括再開指示 #6759919669 に従い、前回STOP原因だけを修正した。正規JSと同じ`window.turnstile?.getResponse?.() || window.publicAuthTurnstileToken?.()`について、token値を検証プロセスへ返さず、ページ内booleanだけを最大120秒待つ一時処理とした。標準adapterの保存／復元、同一JWT・異なるidempotency key A/B、秘密値非出力等の19.7の安全境界は維持した。

実行前Gateは次のとおりPASSした。

```text
HEAD: 19b589c8737e912aebedd8f2ea46bfc6db981f56
origin: https://pira-staging.atlib.jp (match)
standard publicAuthIntakeAdapter: present
serviceId: pira-union
intakeApiBase: /api/public/pira/v1
Cloud Run: 既存7 + Staging OTP/PIRA 2、全9サービスReady
```

専用Chromeセッションでadapterをページメモリ内へ一時設定し、Turnstile booleanを120秒待機したが、準備完了は成立しなかった。承認済み条件に従い送信ボタンを押さず、OTP／JWT／受付試験へ進まずSTOPした。Cloud Run request logをRead-only確認し、当該10分間のOTP runtime requestが0件であることを確認した。

- OTP追加送信: 0通（累計2/30維持）
- challenge／session／JWT／PIRA submission／jti消費: 0件
- 同一JWT再利用拒否試験: **未実施／STOP（PASS扱い禁止）**
- DB／Cloud Run／IAM／LB／DNS／Secret変更: なし
- 既存9 Cloud Run: STOP後も全件Ready
- 一時プロセス／Chrome: 終了、一時script: 削除

原因は、Work管理の自動化ChromeセッションでStaging Turnstile tokenが有限時間内に発行されなかったことである。正規認証ロジックの不具合やjti拒否の合否を示すものではない。CAPTCHA／Turnstileを迂回せず、同一実行の自動再試行も行っていない。

JWT Gateが未PASSのため、後段のimage security追加実測は開始していない。既存runtime Critical 0／High 0・digest照合PASS、およびProxy sidecar／最新advisory DBの残存Fit/Gapを維持する。

Production公開No-Go、GENERAL無効、Secure Guard対象外、追加費用上限15 USD、削除期限`2026-11-20 10:12 JST`を維持する。

### 19.9 Turnstile DOM応答判定による再開結果（2026-11-10）

統括指示 #6760215749 に従い、Turnstile準備判定を次のDOM内booleanへ限定して再開した。response値、長さ、ハッシュ等は検証プロセスへ転送・出力・保存していない。

```javascript
Boolean(document.querySelector('#turnstile input[name="cf-turnstile-response"]')?.value)
```

最新HEAD、固定Origin、`pira-union`、標準`publicAuthIntakeAdapter`、API base、一時メモリ内handler、9サービスReadyは実行前GateでPASSした。しかしWork管理の自動化Chromeでは、DOM response booleanが120秒以内にtrueにならなかった。指示どおり待機延長や再試行をせず、送信ボタンを押す前にSTOPした。

- OTP runtime request: 0件（当該10分間のCloud Run request logで確認）
- OTP追加送信: 0通（累計2/30維持）
- challenge／JWT／PIRA submission／jti消費: 0件
- 同一JWT再利用拒否試験: **未実施／STOP**
- DB／Cloud Run／IAM／LB／DNS／Secret変更: なし
- 既存9 Cloud Run: STOP後も全件Ready
- 一時Chrome／process／script: 終了・削除

統括指示にある通常ユーザー操作ブラウザへの切替は、次の1回限りのhandoffを候補とする。

1. 利用者が通常Chromeで`https://pira-staging.atlib.jp/`を開き、画面上のTurnstile成功を確認する。
2. OTP送信前に、レビュー済みの一時snippetを当該ページのDevTools Sources > Snippetsで1回だけ実行し、標準`publicAuthIntakeAdapter`をページメモリ内だけで保存／差替えする。snippetはtoken／OTP／emailをconsole、Network共有ログ、ファイル、storageへ出さず、終了時に元adapterへ復元する。
3. 利用者が正規UIでOTP送信、Mailtrapコード入力、「診断を開始する」を操作する。
4. snippetが同一JWTでkey Aの初回201、別key Bの409 `JWT_REPLAYED`だけを画面へ非機密表示し、token参照を破棄する。
5. WorkはCloud Run status／理由コード、受付1件・二重受付なしをRead-only照合する。

このhandoff用snippetはまだ作成・実行していない。ユーザー操作ブラウザのTurnstile成功をWork管理Chromeへ流用せず、認証迂回やAPI直呼びも行わない。実行には統括の次の具体的指示と利用者の操作が必要である。

JWT Gate未PASSのため、image security追加実測は開始していない。既存runtime Critical 0／High 0・digest照合PASS、およびProxy sidecar／最新advisory DBの残存Fit/Gapを維持する。

Production公開No-Go、GENERAL無効、Secure Guard対象外、追加費用上限15 USD、削除期限`2026-11-20 10:12 JST`を維持する。

### 19.10 通常Chrome handoff用Snippetレビュー資料（2026-11-10）

統括コメント #6760678508 に基づき、実行せず静的レビュー用のDevTools Sources > Snippetsコードを次へ保全した。

```text
scripts/readiness/secumie-staging-jti-replay.snippet.js
```

Snippetは固定Origin `https://pira-staging.atlib.jp`、`serviceId=pira-union`、既存intake API、既存`publicAuthIntakeAdapter`だけを使用する。元adapterを保存し、一時adapterは1回だけ起動する。同一JWTをページclosure内だけで、異なるUUIDのidempotency key A/Bによる2回の受付へ使用する。期待結果は初回HTTP 201、再利用HTTP 409 `JWT_REPLAYED`である。

安全性:

- JWT、OTP、email、Turnstile／SMTP Secretをconsole、DOM、storage、cookie、file、Git、PRへ出力・保存しない。
- 結果表示はHTTP status、公開可能な機械コード、API判定だけ。受付件数はSnippetで断定せず、実行後にWorkがRead-only DB照合する。
- `intake-contract`／`submissions`の両fetchは`redirect: 'error'`を指定し、別Originへのredirectを拒否する。
- `RUNNING`中は解除ボタンをdisabledとし、処理終了／STOP後だけ解除可能にする。
- 通信先は同一Originのintake-contract／submissionsだけ。OTP challenge直呼び、認証迂回、別Origin通信はない。
- 結果確定または例外時にtoken参照をnull化し、元adapterを自動復元する。
- 画面の解除ボタンでadapter復元と結果panel削除が可能。タブ再読込／終了で既存OTP一時状態も破棄される。
- 初回失敗、期待外status、2回目受理、通信例外ではSTOP表示し、Snippet内の自動retryはない。

統括レビュー後の手動操作は次の5ステップに限定する。

1. 通常Chromeで`https://pira-staging.atlib.jp/`を開き、Turnstileの成功表示を確認する。
2. DevToolsのSources > Snippetsで上記ファイル全文を新規Snippetへ貼り付け、1回実行する。画面右上の`READY`表示を確認する。
3. 承認済みSyntheticメールを正規UIへ入力してOTPを1通送信し、Mailtrap Sandboxのコードで認証する。コードをconsole／チャットへ貼らない。
4. `診断を開始する`を押し、右上の結果が`PASS: 初回 HTTP 201、同一JWT再利用 HTTP 409 JWT_REPLAYED。API判定PASS、受付件数はDB照合待ちです。`と完全一致することを確認する。それ以外はSTOPし、再実行しない。受付1件・二重受付なしは実行後にWorkがRead-onlyで確定する。
5. `Snippetを解除して表示を消す`を押し、ページを再読込または閉じる。DevToolsのSnippetを右クリックしてDeleteし、Network HAR／console出力を保存・共有しない。

本節は準備・レビュー資料のみであり、Snippet実行、OTP送信、JWT発行、受付、GCP／DB変更は行っていない。JWT Gateは未実施のまま、統括レビュー待ちとする。

Production公開No-Go、GENERAL無効、Secure Guard対象外、追加費用上限15 USD、Mailtrap上限30通、削除期限`2026-11-20 10:12 JST`を維持する。

### 19.11 同一JWT再利用拒否の実測照合・Image Security残存Gate（2026-11-10）

萩坂が通常Chromeでレビュー済みSnippetを1回だけ実行し、初回HTTP 201、同一JWT・異なるidempotency keyによる2回目HTTP 409 `JWT_REPLAYED`を確認した。実行後は一時adapter解除、Stagingページ終了、Snippet削除まで完了している。JWT、OTP、email、認証header等は証跡へ取得・記録していない。

WorkのRead-only照合結果は次のとおりである。

- Cloud Run request log: `2026-11-10T07:08:14.503357Z`に`POST /api/public/pira/v1/submissions`が201、同`07:08:14.656889Z`に同endpointが409。順序は201→409で一致した。
- Cloud SQL log: 同`07:08:14.689Z`に`secumie_pira_staging`による`pira.pira_consumed_jti` INSERTが主キー重複で拒否された。これはAPIの`JWT_REPLAYED`と整合する。PIRA Cloud Runのseverity ERRORは当該時間帯を含む直近1日で0件であり、上記409以外の想定外アプリケーション異常は確認されなかった。
- DB直接件数照会: 既存IAP/VPC経路のTCP到達性と`psql`は確認できたが、Secret値を表示しないstdin輸送ではDB認証が成立しなかった。認証情報、role、Secret、IAMは変更していない。したがって`pira_submission=1`および対応する`pira_consumed_jti=1`の直接COUNTは未確認であり、推測でPASSにしない。
- OTP challenge作成API: Staging配備後の累計3回（今回1回を含む、上限30回以内）。追加送信・JWT発行・再受付試験は実施していない。
- Cloud Run: `atlib-cashflow`、`msp-customer-portal`、PPAP 3サービス、`sales-tools`、`sales-tools-staging`、Staging OTP/PIRAの全9サービスがReady=True。

以上により、ブラウザ/API/DB一意制約による再利用拒否経路はPASSしたが、統括指示が要求する受付1件・jti消費1件の直接COUNTが未確認であるため、**同一JWT Gateの最終判定は未確認／STOP**とする。無断の再試験、追加OTP送信、追加JWT発行、DB/IAM変更は行っていない。

配備中imageのdigestをCloud Run定義、ローカルimage、検査対象で照合し、Docker Scout CLI v1.24.0の最新取得可能advisory dataで再検査した（2026-11-10 JST）。再build、再push、再deployは行っていない。

| 対象 | 配備／検査digest | 最新追加実測 | 判定 |
|---|---|---|---|
| OTP runtime | `sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322` | Critical 0 / High 0 / Medium 6 / Low 0、373 packages | Critical/High Gate PASS |
| PIRA runtime | `sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2` | Critical 0 / High 0 / Medium 6 / Low 0、373 packages | Critical/High Gate PASS |
| Cloud SQL Auth Proxy sidecar | `sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c` | Critical 0 / **High 1** / Medium 1 / Low 0、88 packages。`golang.org/x/net 0.61.0`のCVE-2026-78661（fix 0.62.0）がHigh | **STOP** |

第17A.13節の過去検査（2026-11-09、OTP/PIRA Critical 0 / High 0）と、本節の2026-11-10追加実測を区別する。OTP/PIRA本体はCritical/High 0を維持したが、同じRevisionで稼働する固定Proxy sidecarにHigh 1件を確認したため、既定のCritical/High STOP条件に従い**Image Security GateはSTOP**とする。無断のProxy更新、runtime再配備、IAM/DB/network変更は行わない。

GCP、DB、IAM、LB、DNS、Secretへの変更は0件。ローカルには検査目的で固定Proxy digestをpullしただけで、Stagingリソースへの変更はない。追加費用上限15 USDと削除期限`2026-11-20 10:12 JST`への変更はない。Production公開No-Go、GENERAL無効、Secure Guard対象外を維持する。

### 19.12 JWT直接COUNT・Proxy公式修正状況の最終確認（2026-11-10）

基準Commit `6ac6c2874d2dc314659e70a2259071e7b9d724cf`、§19.11、PR #46の記録を照合し、残存する2 Gateだけを独立して確認した。Migration、DB Acceptance、OTP、JWT発行、受付、通常E2Eは再実行していない。

#### 19.12.1 JWT GateのDB直接件数照合

対象はCloud SQL `secumie-sg-shared-staging-db`（Private IP `172.20.0.3`）、database `secumie_insight_staging`、Migration 041でSELECTを許可済みの既存role `secumie_admin_staging`、既存Secret `secumie-stg-db-admin-password:1`である。Secret version 1はenabled、instanceはRUNNABLEであることを値非表示で確認した。

前回は`secumie_pira_staging`とSSH stdin輸送を使用し、DB認証が成立しなかった。今回は権限拡大を行わず、既存IAP経路で`msp-frontend-server`からPrivate IPへのTCP到達性を使った。ローカルの一時SSH port forwardを介し、Secret値をPowerShell環境変数からPostgreSQL 16 `psql` processへだけ渡した。値はSSH command、CLI引数、標準出力、Git、PR、ログへ出していない。終了時に環境変数を破棄し、一時tunnelを停止した。

指定されたSQLを`BEGIN TRANSACTION READ ONLY`から`ROLLBACK`まで1回だけ実行し、次を実測した（2026-11-10 17:01 JSTまでに完了）。

```text
accepted_submissions = 1
consumed_create_jti  = 1
transaction end      = ROLLBACK
```

対象時間帯は`2026-11-10 07:08:00+00`以上`07:09:00+00`未満であり、受付は1件だけなので一意に特定できる。§19.11のCloud Run 201→409、Cloud SQLの`pira_consumed_jti`主キー重複ログと矛盾しない。データ変更、追加OTP、追加JWT、再受付、role/Secret/IAM変更は0件である。

以上により、**同一JWT再利用拒否Gateは最終PASS**とする。

#### 19.12.2 Cloud SQL Auth Proxy公式修正状況

2026-11-10 17:01 JST時点で、Google公式GitHub release API、v2.27.0 tagの`go.mod`、main branchの`go.mod`、公式container tagをRead-only照合した。

- 公式最新Release: `v2.27.0`、公開日時`2026-10-29T21:53:35Z`。Release: https://github.com/GoogleCloudPlatform/cloud-sql-proxy/releases/tag/v2.27.0
- 公式`v2.27.0` container tagのdigest: `sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c`。現在Stagingで稼働・検査したdigestと完全一致する。
- v2.27.0 tagの依存関係: `golang.org/x/net v0.61.0`。Source: https://github.com/GoogleCloudPlatform/cloud-sql-proxy/blob/v2.27.0/go.mod
- main branchも`golang.org/x/net v0.61.0`。Source: https://github.com/GoogleCloudPlatform/cloud-sql-proxy/blob/main/go.mod
- CVE-2026-78661の修正版`golang.org/x/net v0.62.0`を取り込んだ、v2.27.0より新しい公式Release／公式修正imageは確認できない。

§19.11の最新追加実測（Proxy Critical 0 / High 1 / Medium 1）を維持する。公式修正版が未提供であり、独自build、image差替え、再push、Cloud Run再配備は行っていない。したがって、**Image Security Gateは公式修正待ちのSTOP**を維持する。

次の承認対象は、Google公式が`golang.org/x/net v0.62.0`以降を含むRelease/imageを公開した後の、公式digest照合・脆弱性再検査・Proxy更新差分のレビューである。本工程ではGCP、DB、IAM、Cloud Run、LB、DNS、Secret、Production、Secure Guardに変更を加えていない。

Production No-Go、`PIRA_GENERAL_ENABLED=false`、OTP累計3/30、Cloud Run 9/9 Ready、OTP/PIRA追加費用上限15 USD、Cloud SQL既承認上限75 USD、cleanup期限`2026-11-20 10:12 JST`を維持する。

### 19.13 Staging cleanup Read-only Preflight（2026-11-10）

#### 19.13.1 調査条件と判定境界

2026-11-10 17:19 JST、基準commit `689467dfc2306ca5292f32ac97ccc3f73f0916ef`、Project `msp-zabbix`、Region `asia-northeast1`を対象に、Git、PR #46、§17A.10、§19.1〜19.6、§19.11〜19.12およびGCP現物をRead-onlyで照合した。Secret payload、JWT、OTP、メールアドレス、業務レコードは取得していない。GCP、DB、IAM、Secret、DNS、外部サービスの変更件数はすべて0件である。

cleanup区分は次の3区分とする。

- **既承認**：§17A.10および§19.6のStaging一時runtime／公開経路cleanup範囲で、依存解除と直前GateのPASS後に削除可能。
- **別承認必要**：共用Cloud SQL、DB初期化資産、DB Secretなど、runtime cleanupだけでは削除できないもの。
- **対象外**：既存7サービス、Production、GENERAL、Secure Guardおよび既存共有基盤。

#### 19.13.2 GCP現物とcleanup区分

| Resource | 作成目的 | 現在状態・依存先 | cleanup区分 | 削除順序案／停止条件 | 費用Gate |
| --- | --- | --- | --- | --- | --- |
| Cloud Run `secumie-otp-staging` / `asia-northeast1` | Staging専用OTP | Ready revision `secumie-otp-staging-00001-rxg`。runtime digest `sha256:3cfb4e5e07cce3810153c8ac1b7b829f042ec052c67d7c687ff9457866051322`、Proxy digest `sha256:7d156a5c466e31596afd6c8ed134f19c207a297418392fdad2686524ca4e7a3c`。専用SA、4 runtime Secret、OTP DB Secret、Direct VPC、Cloud SQL、OTP NEGから参照。Ingressは`internal-and-cloud-load-balancing`、maxScale 1、DB pool 2。 | 既承認 | DNS停止・LB切離し後に削除。別用途のrevision／image参照、追加試験予定、既存サービス異常があればSTOP。 | min instanceなし。低トラフィックの従量課金のみ。 |
| Cloud Run `secumie-pira-staging` / `asia-northeast1` | Staging専用PIRA | Ready revision `secumie-pira-staging-00001-vhd`。runtime digest `sha256:4892fd38b9374da0c025cd01b5b7f6baa2abdee46fc65f81217c955227ab88b2`、同じProxy digest。専用SA、PIRA DB Secret、Direct VPC、Cloud SQL、PIRA NEGから参照。`PIRA_GENERAL_ENABLED=false`、maxScale 1、DB pool 2。 | 既承認 | OTPと同じ。 | 同上。 |
| Runtime SA `secumie-otp-staging@...`、`secumie-pira-staging@...` | Staging runtime専用 | 各SAのProject roleは`roles/cloudsql.client`のみ。各Cloud Run serviceでのみ使用。OTP SAは4 runtime SecretとOTP DB Secret、PIRA SAはPIRA DB SecretのAccessor。 | 既承認 | Cloud Run削除・利用先0確認後、Project IAMとSecret単位IAMを解除してSA削除。予期しない利用先・roleがあればSTOP。 | 固定費なし。 |
| Runtime Secret `secumie-stg-smtp-password`、`secumie-stg-turnstile-secret`、`secumie-stg-otp-hmac-key`、`secumie-stg-otp-jwt-keys` | Staging runtime専用 | 各Version 1はENABLED。AccessorはOTP runtime SAだけ。値は未取得。 | 既承認 | OTP serviceとSA削除後に4 Secretを削除。想定外principal／利用先があればSTOP。 | active version 4件の名目最大は月額約0.24 USD（free tier適用前、日割り）。 |
| DB Secret `secumie-stg-db-otp-password`、`secumie-stg-db-pira-password` | DB接続共有境界 | runtime SAに加えBootstrap SAも参照。DB初期化・運用資産と共有。 | 別承認必要 | runtime SAのAccessorだけ解除し、Secret本体は削除しない。 | Cloud SQL費用枠側。 |
| Global IP `secumie-staging-ip` (`136.69.38.50`) | Staging専用LB | IN_USE。利用先は`secumie-staging-https`だけ。 | 既承認 | forwarding rule削除直後に解放。別参照があればSTOP。 | forwarding接続中はIP追加料金なし。未接続で残すと約0.01 USD/時。 |
| Forwarding rule `secumie-staging-https` | Staging専用HTTPS入口 | TCP 443、`secumie-staging-https-proxy`だけを参照。 | 既承認 | DNS停止・TTL経過後、LBの最初に削除。 | Global forwarding ruleは約0.025 USD/時（最初の5件帯）。 |
| Target proxy `secumie-staging-https-proxy`、certificate `secumie-staging-cert`、URL map `secumie-staging-url-map` | Staging専用TLS・routing | Proxyは専用certとURL mapだけを参照。cert/domainはACTIVE。URL mapのhostは`pira-staging.atlib.jp`のみ。OTP pathだけOTP backend、defaultはPIRA backend。 | 既承認 | forwarding切離し後、proxy、cert／URL mapの順。既存LBとの共有が見つかればSTOP。 | 上記LB費用に包含。 |
| Backend `secumie-otp-staging-backend`、`secumie-pira-staging-backend` | Staging専用routing | 専用URL mapだけから参照し、各専用NEGだけを参照。 | 既承認 | URL map削除後に削除。別URL map参照があればSTOP。 | serverless NEG経由の処理・通信は従量。 |
| NEG `secumie-otp-staging-neg`、`secumie-pira-staging-neg` | Staging専用Cloud Run接続 | 各Staging Cloud Run 1サービスだけを参照。 | 既承認 | Backend削除後に削除。 | 固定費なし。 |
| Job `secumie-pira-metadata-staging` | `pira-union`の条件付き登録 | Ready。Migration SA／Secret、DB operations image、Proxyを使用。成功Execution `secumie-pira-metadata-staging-crslh`。 | 既承認 | 非機密Execution証跡保全後、active execution 0を確認して削除。SA／Secret／image本体は共有のため削除しない。 | 非実行時の固定費なし。 |
| Jobs `secumie-db-bootstrap-staging`、`secumie-db-migrate-staging`、`secumie-db-acceptance-staging` | DB初期化・Migration・受入 | Ready。Bootstrap／Migration SA、6 DB Secret、DB operations image、Proxy、Cloud SQLに依存。成功・過去失敗Executionを保持。 | 別承認必要 | runtime cleanupに含めない。DB cleanup承認で証跡・再利用要否を確認して扱う。 | 非実行時の固定費なし。 |
| Runtime Artifact OTP/PIRA image | Staging runtime専用artifact | 各専用image名・digestは上記2サービスに配備。`db-operations` imageとは別。 | 既承認 | Cloud Run削除後、他revision／service参照0を再確認して対象digest／versionを削除。参照不明ならSTOP。 | Artifact Registryは0.5 GiB-month free tier後に容量課金。 |
| Cloud SQL `secumie-sg-shared-staging-db` / `secumie_insight_staging` | SECU:MIE／Secure Guard共用Staging基盤／Insight DB | RUNNABLE、PostgreSQL 16、Private IP `172.20.0.3`、Backup/PITR有効、直近automated backupはSUCCESSFUL、Deletion Protection有効。現DBは`postgres`と`secumie_insight_staging`。 | 別承認必要 | Instance／database／5 role／Deletion Protectionを変更・削除しない。Synthetic submission、jti、監査もDELETEしない。 | 既承認75 USD枠。runtime cleanup後も別承認まで課金継続。 |
| PSA／`default` VPC／Service Networking | 共用private接続基盤 | Cloud SQL、runtime、DB jobsが使用。 | 対象外 | 削除・変更しない。 | 共用基盤。 |
| 既存Cloud Run 7サービス | 既存業務 | 7/7 Ready。新規2サービスを含め全9サービスReady。 | 対象外 | 変更しない。1件でも異常ならcleanup操作をSTOPし影響を再確認。 | 既存費用。 |

GCP LB現物の参照関係は、`IP → forwarding rule → target HTTPS proxy → URL map/certificate → 2 backend → 2 NEG → 2 Staging Cloud Run services`として専用チェーン内で閉じている。既存LBとの共有参照は検出していない。

#### 19.13.3 外部設定と手動操作

- Squarespace DNS：`atlib.jp`の権威DNSはSquarespaceで、`pira-staging.atlib.jp A 136.69.38.50`（TTL 3600）が公開されている。萩坂がAレコード1件だけを削除し、少なくともTTL経過後に名前解決不能を確認する。`pira.atlib.jp`、`www.atlib.jp`および他レコードは変更しない。
- Cloudflare Turnstile：Staging専用Widgetの無効化／削除は萩坂の手動操作とする。共有アカウントやProduction Widgetは変更しない。GCPからWidgetの共有有無を証明できない場合は手動確認までUNKNOWNとしてSTOPする。
- Mailtrap：Staging Email Sandbox／資格情報のarchiveまたは削除は萩坂の手動操作とする。外部forwardingは行わず、共有アカウントや他Sandboxは変更しない。OTP累計は3/30のまま追加送信しない。

#### 19.13.4 承認済みcleanup順序案

実削除は本Preflightの統括レビュー後に限る。正常時の順序は次とする。

1. PR証跡を確定し、追加試験・active Job Executionがないこと、既存7サービスがReadyであること、費用上限内であることを再確認する。
2. 萩坂がSquarespaceのStaging Aレコードだけを削除する。TTL 3600経過と公開DNSの停止を確認する。
3. GCPの専用公開経路を外側から解除する：forwarding rule → target proxy → certificate／URL map → 2 backend → 2 NEG → global IP。forwarding削除後にIPを放置しない。
4. Cloud Run 2サービスを削除し、revision／artifactが他から参照されていないことを再確認する。
5. OTP/PIRA runtime artifactの専用digest／versionを削除する。`db-operations` artifactは削除しない。
6. Runtime SAのProject IAMとSecret単位IAMを解除する。共有DB Secretからはruntime SA bindingだけを解除し、Secret本体を維持する。その後、runtime SA 2件を削除する。
7. Runtime専用Secret 4件を削除する。
8. metadata Jobの非機密証跡とactive execution 0を確認し、Jobだけを削除する。Migration SA、DB Secret、DB operations imageは維持する。
9. 萩坂がTurnstile Staging WidgetとMailtrap Staging Sandbox／資格情報を手動整理する。
10. 全対象不存在、共有資産残存、既存7サービスReady、DNS停止、想定外IAM差分0をRead-onlyで最終確認する。

DB関連3 Job、Bootstrap／Migration SA、6 DB Secret、Cloud SQL instance／database／role、PSA、Syntheticデータはこの順序へ含めず、別承認へ送る。

#### 19.13.5 期限・費用・STOP判定

2026-11-10からcleanup期限`2026-11-20 10:12 JST`までは約10日あり、手動DNS操作とTTL待機を含めても実行可能である。Global forwarding ruleの残存固定費は最大でも概算約6 USD（0.025 USD/時×約240時間）で、低トラフィックのCloud Run／LB従量費、Secret 4 version、Artifact容量を加えても、現時点の利用形態ではOTP/PIRA追加費用上限15 USD内に収まる見込みである。ただし、Billing実績値そのものは本調査で取得していないため、実削除直前にBudget／Billingを確認し、15 USD超過見込みならSTOPする。Cloud SQLは別の75 USD枠であり、別承認まで課金が続く。

料金根拠：Cloud Load Balancing pricing https://cloud.google.com/load-balancing/pricing 、External IP pricing https://cloud.google.com/vpc/network-pricing 、Cloud Run pricing https://cloud.google.com/run/pricing 、Secret Manager pricing https://cloud.google.com/security/products/secret-manager 、Artifact Registry pricing https://cloud.google.com/artifact-registry/pricing 。

次の場合は削除前または途中でSTOPし、推測で継続しない。

- 専用と判定したresourceに別service、revision、URL map、principal、Secret利用先またはartifact参照が存在する。
- active Execution、追加試験予定、DNS残存、既存7サービスの非Ready、関連5xx／latency異常がある。
- cleanup対象外のCloud SQL、DB、role、DB Job／SA／Secret、PSA、既存サービスに変更が必要になる。
- Billing上限超過見込み、証跡欠落、外部設定の共有範囲不明、削除結果不明がある。

以上により、runtime／専用公開経路／runtime SA・Secret／metadata Job／専用artifactは**統括レビュー後に既承認範囲でcleanup可能**、Cloud SQLおよびDB初期化資産は**別承認必要**と判定する。Image Security GateのSTOP、Production No-Go、`PIRA_GENERAL_ENABLED=false`、Secure Guard対象外を維持する。

### 19.14 Staging cleanup実行前GateのSTOP（2026-11-11）

#### 19.14.1 実行承認とDNS初回確認

基準commit `8fe283d7d7710315425a038ed574e590f2a407cc`、統括cleanup承認コメント `#6786419366`、Squarespace Aレコード削除報告コメント `#6786501686`を照合した。削除報告は`2026-11-11 12:52:58 JST`に受領した。

`2026-11-11 13:01:56 JST`に次をRead-only照会した。

- 権威DNS：`nse1.squarespacedns.com`〜`nse4.squarespacedns.com`の4系統すべてで、`pira-staging.atlib.jp`のA／AAAAはNXDOMAIN。
- 公開DNS：Cloudflare `1.1.1.1`、Google `8.8.8.8`、Quad9 `9.9.9.9`の3系統すべてでA／AAAAはNXDOMAIN。
- `atlib.jp`のNS TTLは3600秒。

旧IP `136.69.38.50`への解決は検出しなかった。ただし、削除時刻を独立に取得できないため、指示どおり削除報告受領時刻を保守的な起点とすると、初回照会時点ではTTL 3600秒が未経過である。したがってDNS Gateはこの時点で未確定とした。

#### 19.14.2 GCP現物の削除直前確認

`2026-11-11 13:01〜13:07 JST`に次をRead-only確認した。

- Cloud Runは既存7サービスと対象2サービスの全9件がReady。対象revisionはOTP `secumie-otp-staging-00001-rxg`、PIRA `secumie-pira-staging-00001-vhd`。
- Active Cloud Run Job Executionは0件。metadata Jobの既存Executionは完了済み。
- LB参照は§19.13どおり、専用IP `136.69.38.50` → forwarding rule → HTTPS proxy → certificate／URL map → 2 backend → 2 NEG → 対象2サービスで閉じている。
- runtime SA 2件のProject roleは各`roles/cloudsql.client`だけ。runtime専用Secret 4件のAccessorはOTP runtime SAだけ。
- DB OTP／PIRA SecretはBootstrap SAとruntime SAの共有であり、Secret本体はcleanup対象外。runtime SA bindingだけが将来の解除対象である。
- OTP／PIRA artifactの配備digestは§19.13記録と一致する。
- Cloud SQL `secumie-sg-shared-staging-db`はRUNNABLE、Private IPのみ、Backup／PITR／Deletion Protection有効。既存3 Cloud SQL instanceはすべてRUNNABLE。

#### 19.14.3 Billing Gate不成立とSTOP

Project `msp-zabbix`はCloud Billing accountへ紐付き、billingはenabledである。一方、削除直前Gateが要求するOTP/PIRA追加費用の**実績値**は、次の理由によりRead-onlyで取得できなかった。

- Cloud Billing Budget APIはProjectで無効。
- Active accountにはBilling accountのBudget参照権限がない。
- Project内に参照可能なBigQuery Billing export datasetは確認できない。

API有効化、Billing IAM変更、export設定は今回の承認範囲外であるため実施していない。§19.13の上限見積りでは期限まで追加15 USD枠内だが、見積りを実績値の代用にはしない。

以上により、DNSの保守的TTL Gateが未経過であり、かつBilling実績Gateを確認不能であるため、指示されたSTOP条件に従い**GCP cleanupは未着手のままSTOP**した。LB、Cloud Run、Artifact、IAM、SA、Secret、Jobの削除・変更は0件である。DB、Cloud SQL、DNS、外部サービスにも追加変更を加えていない。自動再試行、代替権限付与、API有効化は行っていない。

再開には、(1) `2026-11-11 13:52:58 JST`以降の権威DNS／公開DNS再照会PASS、(2) Billing Console等の既存承認済み経路で追加費用実績が15 USD枠内であることの確認、または経営者による実績取得不能時の代替Gate明示、が必要である。Image Security Gate STOP、Production No-Go、`PIRA_GENERAL_ENABLED=false`、Secure Guard対象外、cleanup期限`2026-11-20 10:12 JST`を維持する。

### 19.15 Staging一時runtime／公開経路cleanup実行結果（2026-11-11）

#### 19.15.1 代替Gateと最終Preflight

基準commit `9f929dfe4706444a120e807dbd9dcb7c2e0f852b`、経営者代替Gate承認コメント `#6787311917`を照合した。代替Gateに従い、Cloud Billing実績は**UNKNOWN**のまま記録し、これだけを理由にSTOPしなかった。15 USD以内の§19.13見積りは参考として維持し、Budget API有効化、Billing IAM変更、BigQuery Billing export追加、新規有料resource作成は行っていない。

DNS削除報告`2026-11-11 12:52:58 JST`からTTL 3600秒以上経過した`14:03:26 JST`に、次を再照会した。

- Squarespace権威DNS `nse1`〜`nse4.squarespacedns.com`：A／AAAAすべてNXDOMAIN。
- 公開DNS `1.1.1.1`、`8.8.8.8`、`9.9.9.9`：A／AAAAすべてNXDOMAIN。
- cleanup後の最終確認でも同じ結果を維持。

削除直前に、既存7 Cloud Runサービス7/7 Ready、対象2サービスReady、Active Job Execution 0、専用LB参照チェーン、runtime SA／Secret／artifactの専用性、共有DB Secret境界を確認した。Cloud SQL `secumie-sg-shared-staging-db`はRUNNABLE、最新automated backupはSUCCESSFUL、Backup／PITR／Deletion Protection有効であった。全安全GateをPASSとした。

#### 19.15.2 実行したcleanup

`2026-11-11 14:05〜14:15 JST`に、§19.13.4の承認済み範囲だけを実行した。

| 区分 | 削除結果 |
| --- | --- |
| HTTPS LB | `secumie-staging-https`、`secumie-staging-https-proxy`、`secumie-staging-cert`、`secumie-staging-url-map`、`secumie-otp-staging-backend`、`secumie-pira-staging-backend`、`secumie-otp-staging-neg`、`secumie-pira-staging-neg`、`secumie-staging-ip`を削除。最終照合で9件とも不存在。 |
| Cloud Run | `secumie-otp-staging`、`secumie-pira-staging`を削除。対象revisionもservice一覧から消失。 |
| Artifact Registry | 専用package `secumie-otp-runtime`、`secumie-pira-runtime`を、他revision／Job参照0確認後に削除。`db-operations` packageは維持。 |
| Runtime IAM／SA | runtime SA 2件からProject `roles/cloudsql.client` 2 binding、runtime専用Secret 4件と共有DB Secret 2件のAccessor計6 bindingを解除。`secumie-otp-staging@...`、`secumie-pira-staging@...`を削除。共有DB SecretにはBootstrap SAだけが残存。 |
| Runtime Secret | `secumie-stg-smtp-password`、`secumie-stg-turnstile-secret`、`secumie-stg-otp-hmac-key`、`secumie-stg-otp-jwt-keys`を削除。 |
| Cloud Run Job | Active Execution 0を確認後、`secumie-pira-metadata-staging`だけを削除。DB関連3 Jobは維持。 |

最初のLB削除処理でPIRA backendのlong-running operationが継続中に呼出し側が先に戻り、その後のRead-only照合時点ではLB 9件すべてが削除済みであった。重複確認でOTP NEGがNOT_FOUNDを返したため、その削除を再実行せず、全9件の不存在とoperation DONEを確認して次工程へ進んだ。予期しない参照、権限拡大、既存service影響はなかった。

#### 19.15.3 最終Read-only検証と残存資産

- 削除対象のLB 9件、Cloud Run 2件、Artifact package 2件、runtime SA 2件、runtime Secret 4件、metadata Job 1件はすべて不存在。
- 既存Cloud Run 7サービスは7/7 Ready。
- DB関連Job `secumie-db-bootstrap-staging`、`secumie-db-migrate-staging`、`secumie-db-acceptance-staging`はReadyで残存。Active Job Executionは0件。
- DB Secret 6件（Bootstrap／OTP／PIRA／Admin／Migration／Maintenance）は残存。runtime SA bindingだけを除去し、Secret値／Versionは変更していない。
- Cloud SQL `secumie-sg-shared-staging-db`はRUNNABLE、Private IPのみ、Backup／PITR／Deletion Protection有効。database `postgres`、`secumie_insight_staging`は残存。
- Cloud SQL instance／database／5 role、Synthetic受付／jti／監査データ、PSA／VPC、Bootstrap／Migration SAには変更していない。
- GCP削除resourceは20件（LB 9、Cloud Run 2、Artifact package 2、runtime SA 2、runtime Secret 4、metadata Job 1）。IAM binding解除は8件。DB変更は0件。

Squarespace Aレコードは萩坂による手動削除と公開DNS停止まで完了した。Cloudflare Staging Turnstile WidgetとMailtrap Staging Sandbox／資格情報の手動整理は、共有アカウント／Production設定へ影響しないことを萩坂が確認して行う残件である。

費用実績は経営者代替GateどおりUNKNOWNのまま。新規resourceは作成せず、OTP/PIRA runtime、専用LB／IP、runtime Secret／artifactを削除したため、これらの継続課金要因は停止した。Cloud SQLは別承認まで残存し、既承認75 USD枠の対象である。

以上により、**承認済みGCP Staging一時runtime／公開経路cleanupはPASS**とする。Cloud SQLおよびDB初期化資産のcleanupは別承認、外部Turnstile／Mailtrapは手動Handoffとする。Image Security Gate STOP、Production No-Go、`PIRA_GENERAL_ENABLED=false`、Secure Guard対象外を維持する。

## Appendix A. 初回Staging Recovery preflightのSTOP記録（2026-11-08）

### A.1 ArtifactとJob更新

基準commit `a76d1c99308c8c6f1ac2edf002c2978695b90822`からRecovery CLI入り`db-operations` imageをbuild/pushし、Migration manifest 037〜041の5件とimage内Recovery artifactを確認した。最初のJob設定照合で、既存Jobの確認変数が`SECU_BOOTSTRAP_TARGET_CONFIRMATION`、Recovery CLIの要求名が`SECU_RECOVERY_TARGET_CONFIRMATION`で不一致と判明した。この状態ではDB書込み前に失敗するため、Jobの環境設定を変更せず、CLI側を既存変数名へ合わせる最小修正を行った。

- 修正commit: `0b2f2f31396228aa595149b6f26699d0881c9a8e`
- ローカルPostgreSQL 16 Recovery/Migration受入: 2/2 PASS
- TypeScript build、diff check: PASS
- 最終Registry digest: `sha256:beb7c6d22586e1f157f142fd535eedff9cf9a9aafba08731f8398a5b919eda36`
- RegistryがCloud Run実行時に解決したplatform manifest: `sha256:6173b8b124ddbb271cabcb23bcc1fe81efb2e4fd639e816c7c50c007fe37de10`

既存Bootstrap Jobはmain imageとcommandだけを次へ更新した。SA、6 Secret version、Proxy、Direct VPC、task/parallelism 1、retry 0、timeout 15分は維持している。

```text
image: asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-db-operations@sha256:beb7c6d22586e1f157f142fd535eedff9cf9a9aafba08731f8398a5b919eda36
command: node
args: dist/db/recoverSecumieInsightStagingCli.js
```

### A.2 実行前Gate

次を確認した。

- Cloud SQLはRUNNABLE、PostgreSQL 16、Private IPのみ。
- 最新automated backup `1794074400000`はSUCCESSFUL。
- 既存JobのSA、Secret参照、Proxy、Direct VPC、retry 0は正本一致。
- Migration manifest 037〜041は5件、SHA-256一致。
- Cloud SQL Admin API上のdatabaseは`postgres`だけで、`secumie_insight_staging`は不存在。

role属性、`current_user`、接続容量を同じJob接続経路で再取得するため、DB書込みを含まない一時Execution overrideを1回作成した。

### A.3 Read-only preflight失敗とSTOP

Execution `secumie-db-bootstrap-staging-dhlw2`はFAILED。PowerShellから渡したgcloudの複数args delimiterが意図どおり解釈されず、Nodeの`-e` scriptが2引数へ誤分割された。Execution specで誤分割を確認した。NodeはDB接続処理へ到達しておらず、role/容量の再測定結果は取得できなかった。

確認結果:

- Recovery CLI本実行: **未実行**
- `CREATE DATABASE`、GRANT、REVOKE: **未実行**
- `secumie_insight_staging`: 不存在
- Migration Job作成・037〜041: **未実行**
- Secret値のログ・Execution specへの露出: なし
- 既存Cloud SQL 3件: RUNNABLE
- 既存Cloud Run 7サービス: Ready
- Bootstrap Jobの永続定義: Recovery用の正本設定を維持
- 自動retry: 0、再実行なし

想定外のpreflight Execution失敗に該当するため、承認済みSTOP条件に従い、別方式による再試行、Recovery、Migration、権限拡大、database削除は行っていない。

再開には、複雑な実行時args overrideを使用せず、固定allowlistのRead-only preflight CLIをimageへ収録してJob commandを明示的に切り替える等、引数分割を事前にローカル検証できる具体的な差分の承認が必要である。preflight PASS後だけRecoveryを1回実行し、その後Migration 037〜041へ進む。

Production公開No-Goを維持する。
