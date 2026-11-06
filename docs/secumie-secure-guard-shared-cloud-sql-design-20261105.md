# SECU:MIE / Secure Guard shared Cloud SQL design

- Date: 2026-11-05 JST
- Status: Staging build specification ready for review; no GCP resources created; Production No-Go
- Supersedes for future execution: the SECU-only instance creation section in PR #44
- Preserves: PR #42 connection design, PR #43 separate SECU pool implementation, and PR #44 evidence/stop/cleanup controls

## 1. Decision and verified facts

The approved direction is one new Cloud SQL instance per environment, shared by SECU:MIE and Secure Guard at the infrastructure level only. Databases, login roles, Secrets, migration ledgers and service responsibilities remain separate. Existing `msp-customer-portal-db` and `sales-tools-staging-db` are not changed. SECU:MIE Web is not provisioned until its Canonical approves its database boundary.

Verified on 2026-11-05 (project `msp-zabbix`, region `asia-northeast1`):

- The proposed shared instance names below do not currently exist. Existing Cloud SQL instances are only `msp-customer-portal-db` and `sales-tools-staging-db`.
- The region exposes zones `asia-northeast1-a`, `-b`, and `-c`. General regional CPU quota was 100 with usage 4; SSD quota was 500 GB with usage 40 GB. Cloud SQL-specific quota and actual tier availability must still pass at creation preflight.
- The `default` VPC and READY connector `msp-portal-connector` exist. No Private Service Access peering/range was returned for `servicenetworking.googleapis.com`; Private IP therefore requires a separately approved network change before instance creation.
- `msp-customer-portal` has max instances 5, concurrency 80, 1 vCPU/512 MiB, and a fixed application pool maximum of 5 in the Secure Guard source. It currently uses the old portal database. The existing portal database and customer portal remain in place.
- Secure Guard source of record is `yoshihisahagisaka/atlib-msp-customer-portal`, Draft PR #4, HEAD `7cad208d100ba04080657a72fa15c985e4901531`. Its approved boundary requires a separate database, role, Secret and migration ledger on the shared SECU:MIE instance.
- A read-only Cloud Run inspection showed notification webhook URLs stored as plaintext environment values. Their values are not reproduced here. Rotation and Secret Manager migration are a pre-production STOP condition.

Secure Guard evidence reviewed at that HEAD: `docs/DECISION_ATLIB_SERVICE_PLATFORM_BOUNDARIES_20261104.md`, `docs/SECURE_GUARD_SECUMIE_SHARED_SQL_FITGAP_20261104.md`, `docs/SECURE_GUARD_SHARED_SQL_MIGRATION_PREP_20261104.md`, `src/db/pool.ts`, `src/config.ts`, `src/server.ts`, and `src/jobs/secureGuardOverageOnce.ts`. GCP facts were read at 2026-11-05 12:22–12:27 JST; Secret values and business rows were not queried.

## 2. Instance specification

| Setting | Staging | Production |
|---|---|---|
| Instance ID | `secumie-sg-shared-staging-db` | `secumie-sg-shared-prod-db` |
| Engine / edition | PostgreSQL 16 / Enterprise | PostgreSQL 16 / Enterprise |
| Region / availability | `asia-northeast1`, ZONAL; zone selected at preflight | `asia-northeast1`, REGIONAL HA |
| Machine | dedicated core custom 2 vCPU / 7.5 GiB | dedicated core custom 2 vCPU / 7.5 GiB |
| Storage | SSD 20 GiB, auto increase on, initial cap 100 GiB | SSD 30 GiB, auto increase on, initial cap 200 GiB |
| Backup / PITR | daily backup, PITR 7 days, deletion protection on | daily backup, PITR 7 days, deletion protection on, retained final backup required |
| Network | Private IP only after approved Private Service Access; public IP off | same |
| TLS | encrypted connector path; no password or token in command arguments/logs | same |
| Maintenance | non-business window; Staging earlier than Production | stable production window after Staging evidence |
| Cleanup | maximum 14 calendar days unless review extends it | retained production resource |

ZONAL is appropriate for synthetic Staging because loss is recoverable and it avoids HA duplication cost. Production is REGIONAL HA because a single instance failure otherwise simultaneously removes Insight authentication/intake and Secure Guard management/overage monitoring. Google recommends regional HA for production; it synchronously maintains a standby in another zone.

The 2 vCPU / 7.5 GiB choice replaces the old SECU-only 1 vCPU / 3.75 GiB proposal. It is the smallest reviewed shared starting point that provides headroom for two workloads and at least 100 configured PostgreSQL connections. Actual `SHOW max_connections`, memory, CPU and connection peaks are mandatory Staging gates; scale up rather than raising connection limits when memory headroom is insufficient.

## 3. Database, role and migration boundary

### 3.1 Databases

| Environment | SECU:MIE Insight | Secure Guard |
|---|---|---|
| Staging | `secumie_insight_staging` | `secure_guard_staging` |
| Production | `secumie_insight` | `secure_guard` |

No cross-database grants, shared application login, cross-database foreign keys or unconditional personal/consent data sharing are permitted.

### 3.2 Login roles and Secrets

SECU:MIE keeps five separate roles per environment: `otp`, `pira`, `admin`, `migration`, and `maintenance`. Secure Guard uses three: `runtime`, `overage`, and `migration`. Deployment assigns environment-qualified physical names; applications receive only their own database name, user and password Secret. Secret values are never recorded in Git, output or command arguments.

| Owner | Runtime grants | Forbidden grants |
|---|---|---|
| SECU OTP | required `public_auth` operations only | `pira`, Secure Guard DB, role/database creation |
| SECU PIRA | required `pira` intake operations only | OTP secrets, Secure Guard DB, admin audit deletion |
| SECU admin | PIRA list/detail/export/audit operations only | OTP and Secure Guard DB |
| SECU migration | DDL only in Insight DB for an approved migration run | other databases, instance administration |
| SECU maintenance | approved retention functions only | direct table deletion and other databases |
| Secure Guard runtime | approved final Secure Guard tables only | SECU DB and portal business DB writes |
| Secure Guard overage | organization/mapping/audit/overage operations required by the Job | SECU DB, migration DDL |
| Secure Guard migration | DDL/data migration only in Secure Guard DB for an approved run | SECU DB and instance administration |

Cloud SQL instance administration/bootstrap is a separate operator identity and is not an application role. Each runtime Service Account receives Cloud SQL Client and only the matching Secret versions.

### 3.3 Migration ledgers

- Insight applies existing migrations 037–041 only to the Insight database, using its existing ledger contract.
- Secure Guard owns a separate ledger and baseline. The current portal migrations 011/012/015 cannot be replayed blindly into an empty database: 011 references the old portal `customers` table, while 012 changes that dependency. Secure Guard must approve an independent baseline representing the final schema before its database is initialized.
- Secure Guard auth, Organization, audit and overage monitoring move as one consistency unit. No partial functional migration is allowed.
- Secure Guard owns source inventory, data transfer, reconciliation and production cutover. The shared-platform owner provides the destination, grants, backup/PITR, capacity and migration execution contract.

## 4. Connection budget

### 4.1 Existing implementation without correction (not deployable)

SECU role limits total 54. Secure Guard currently has max 5 Cloud Run instances and pool max 5; old/new revision coexistence can require up to 50 application connections. Adding the current overage Job pool 5 and two migration/cutover connections gives 57. Shared theoretical demand would therefore be **111**, before Cloud SQL internal/reserved connections. This is not an accepted production configuration.

### 4.2 Approved target envelope

Before shared Staging runtime deployment, Secure Guard must add a separate lazy pool for its new database, set the web pool to maximum 2, set the one-shot overage Job pool to maximum 2, and fail closed when its dedicated settings are missing. The existing portal business pool is unchanged.

| Workload | Calculation | Limit |
|---|---:|---:|
| SECU OTP | 2 instances × pool 2 plus role burst | 6 |
| SECU PIRA | 2 instances × pool 2 plus role burst | 6 |
| Sales Tools SECU admin | 20 instances × lazy pool 2 | 40 |
| SECU migration | one operator | 1 |
| SECU retention | one Job | 1 |
| Secure Guard web/API | 5 instances × pool 2 × two revision envelopes | 20 |
| Secure Guard overage Job | one Job × pool 2 | 2 |
| Secure Guard migration/cutover | two target sessions | 2 |
| Application role limits total |  | **78** |

Capacity gate:

```text
M = SHOW max_connections
R = max(10, ceil(M * 0.20), measured internal/reserved peak + 5)
A = M - R
required: A >= 78
```

The initial target is `M >= 100`, which leaves at least 20 connections reserved and 80 application-available. This is a Staging measurement, not an assumed Cloud SQL default. Cloud SQL determines defaults from memory; raising `max_connections` without memory/load evidence is prohibited. Alert at 70% sustained, stop load at 80%, and treat connection rejection, OOM, 5xx or existing-service degradation as immediate STOP.

Staging runtime max instances are initially 1 per new SECU service and one Secure Guard test revision. Production limits above remain the capacity test envelope. Tagged old/new Secure Guard revisions must not both receive uncontrolled review traffic.

## 5. Secure Guard migration prerequisites

Secure Guard must provide and approve all of the following before its database/roles are created:

1. Independent baseline for the eight confirmed tables: `portal_users`, `customer_organizations`, `customer_memberships`, `msp_role_grants`, `dnsfilter_organization_mappings`, `secure_guard_receipts`, `secure_guard_audit_events`, and `secure_guard_overage_alerts`.
2. Read-only source inventory, row counts by table (aggregate only), FK/orphan checks, ledger state and owner/grant inventory.
3. A second pool implementation that routes only Secure Guard repositories and overage storage to the new DB; portal business functions remain on the current DB.
4. Environment-specific DB/Secret settings, no fallback to the portal DB, pool maximum 2, shutdown close, and tests for missing configuration.
5. Full migration/reconciliation/rollback plan for auth, Organization, audit and overage together.
6. Synthetic Staging tests for login, organization authorization, admin/audit and overage idempotency/advisory-lock behavior.

The infrastructure instance and Insight database may be built first. **The Secure Guard database, roles and Secrets must not be finalized or created until items 1–4 are approved.** This preserves the shared foundation without inventing Secure Guard-owned DDL or permissions.

## 6. Staging build changes and sequence

This section replaces the executable resource list in PR #44; its evidence, stop and cleanup rules continue to apply.

1. Approve and create a Private Service Access range/peering on the `default` VPC. Record exact CIDR, owner and rollback. This is a new network change and a precondition, not part of this document-only phase.
2. Create `secumie-sg-shared-staging-db` with the fixed Staging settings in section 2. Verify no public IP, backup/PITR, deletion protection, tier, zone and connection name.
3. Create only `secumie_insight_staging` and its five roles/Secrets/Service Accounts; apply 037–041 with the Insight migration identity and verify the role/retention suite.
4. Deploy isolated OTP/PIRA Staging runtimes with max instance 1 and synthetic data. Existing Sales Tools/Portal revisions and traffic remain unchanged.
5. Exercise the Sales Tools SECU admin feature using a review-only revision or local harness connected to the shared Staging DB. Do not move production/staging traffic.
6. After Secure Guard prerequisites pass, create `secure_guard_staging` and its approved roles/Secrets; apply its own baseline and deploy a tagged/test-only Secure Guard revision and overage Job.
7. Run cross-service isolation, connection envelope, failover/backup/restore, retention, audit, CSV/XLSX and regression tests. Neither database may access the other.
8. Save evidence, export approved logical backups, revoke temporary operator access and delete Staging within 14 days unless extension is approved. Deletion protection is removed only in the approved cleanup step.

The existing `msp-customer-portal-db`, `sales-tools-staging-db`, Portal/PPAP/Sales Tools revisions and traffic remain unchanged throughout.

## 7. Cost and monitoring

Pricing is an estimate using the Tokyo unit rates already verified in PR #42 (`$0.0537/vCPU-hour`, `$0.0091/GiB-hour`, SSD `$0.221/GiB-month`) and 730 hours/month. Billing is usage-based; backup storage, PITR logs beyond included allowance, logging, egress and connector/LB use vary with usage.

| Item | ZONAL Staging | REGIONAL HA Production |
|---|---:|---:|
| 2 vCPU + 7.5 GiB compute | about `$128.2/month` | about `$256.4/month` |
| SSD | 20 GiB about `$4.4/month` | 30 GiB mirrored about `$13.3/month` |
| Baseline | about **`$133/month`** | about **`$270/month`** |
| Usage-dependent | backups over allowance, logs, egress, monitoring, connector | same |

Fourteen days of ZONAL Staging is approximately `$62` baseline. The execution cap is **$75 and 14 days**; exceeding either requires approval. A 72-hour validation slice is approximately `$13–15`, but cleanup is tied to completion/evidence rather than assuming the shorter duration.

Monitor connection count/utilization, CPU, memory, disk/autogrowth, query latency, deadlocks, 5xx, pool wait/timeout, backup/PITR status and failed migration/retention Jobs. Page/stop thresholds: connections 80%, CPU 80% for 5 minutes, memory 90%, unexpected storage growth, backup failure, or cross-service authorization anomaly.

## 8. GCP resources and permission changes requiring approval

- Two eventual Cloud SQL instances: `secumie-sg-shared-staging-db` and `secumie-sg-shared-prod-db` (Production remains unapproved).
- Private Service Access allocated range and Service Networking peering on `default` VPC.
- Environment-specific databases, login roles and migration ledgers described above.
- Runtime/migration/maintenance Service Accounts and narrowly scoped IAM bindings.
- Per-role DB password Secrets and existing notification webhook rotation into Secret Manager.
- Cloud Monitoring dashboards/alerts and approved notification recipients.
- Staging-only runtime revisions/Jobs; no existing traffic change.

No resource in this list is created by this design change.

## 9. Go / No-Go

### Staging foundation

**Conditional Go** for creating only the shared Staging instance and Insight portion after separate approval, provided that Private Service Access CIDR/impact, Cloud SQL tier availability/quota, final price cap, operators/cleanup owner and backup/PITR settings are confirmed immediately before execution.

### Secure Guard on Staging

**No-Go** until its independent baseline, second pool max-2 implementation, source inventory and migration/reconciliation plan are approved. The infrastructure may precede it; its database/roles may not.

### Production

**No-Go.** It additionally requires complete Staging evidence, load/connection proof, restore rehearsal, Secret rotation, Production network/LB/DNS/Cloud Run approvals, Secure Guard data-migration approval, and explicit change/rollback authorization.

## 10. Responsibility matrix

| Area | Shared platform / Insight owner | Secure Guard owner |
|---|---|---|
| Instance/network/backup/PITR/capacity | design, provision after approval, monitor, restore contract | consume within approved envelope |
| Insight database | DDL 037–041, roles, runtime and retention | no access |
| Secure Guard database | provide empty destination and approved grant mechanism | baseline/DDL, runtime SQL, data migration, reconciliation |
| Existing portal DB | no change | remains source/current portal DB until approved cutover |
| Cutover/rollback | infrastructure readiness and DB recovery support | application revisions, data freeze/copy/verify and rollback decision |
| Secure Send | excluded; separate phase | excluded |

## 11. External references used for sizing

- Google Cloud, Cloud SQL PostgreSQL instance settings: dedicated-core memory limits, automatic storage increase, backups/PITR and ZONAL/REGIONAL behavior.
- Google Cloud, Cloud SQL PostgreSQL quotas and limits: determine actual `max_connections` from the created instance rather than assuming a machine-type value.
- Google Cloud, PostgreSQL memory guidance: each idle connection consumes memory; connection limits must be tested with workload and memory headroom.
- Google Cloud, PostgreSQL high availability: REGIONAL uses a primary and standby across zones with synchronous disk replication.

## 12. Staging作成直前ネットワーク・接続Preflight（2026-11-05）

この節は第2〜9節の構成を変更せず、`secumie-sg-shared-staging-db`作成前に必要な具体的差分を固定する。以下のコマンドは承認資料であり、この確認工程では実行していない。

### 12.1 Private Service Access

Read-only確認結果:

- `default`はauto-mode VPCで、東京subnetは`10.146.0.0/20`、既存Serverless VPC Access connectorは`10.8.0.0/28`である。
- subnet、route、global internal allocation、VPC peering、VPNを照合した時点で`172.20.0.0/16`との重複はなかった。
- Service Networking peeringおよびPrivate Service Access用allocated rangeは未作成だった。
- Compute Engine、Cloud Run、Cloud SQL Admin、Service Networking APIは有効だった。Organization Policy APIは未有効で、`run.allowedVPCEgress`のeffective policyをRead-only取得できなかった。API有効化または組織管理者による照合をDirect VPC配備前Gateとする。
- `/16`はGoogle管理サービスの推奨サイズであり、東京PostgreSQLだけなら最小`/24`でも成立するが、共用基盤の将来拡張とrange再割当回避のため`172.20.0.0/16`を採用候補とする。

承認が必要な具体的差分:

```powershell
gcloud compute addresses create google-managed-services-default `
  --project=msp-zabbix `
  --global `
  --purpose=VPC_PEERING `
  --addresses=172.20.0.0 `
  --prefix-length=16 `
  --network=default

gcloud services vpc-peerings connect `
  --project=msp-zabbix `
  --service=servicenetworking.googleapis.com `
  --ranges=google-managed-services-default `
  --network=default
```

これは`default` VPC全体へGoogle service producer networkとのpeeringを1件追加する。既存subnet、route、Cloud Run trafficは変更しないが、接続作成後は同VPC上の対応Googleサービスから利用可能になる。将来このpeeringを削除すると、そのrangeを利用する全サービスのprivate connectivityを失うため、Staging cleanupではinstanceを削除してもallocated range/peeringは自動削除しない。削除は利用者ゼロを別途確認して承認する。

実行直前に同じCIDR、route、peering、VPN/NCC接続を再取得し、重複または新しい接続があればSTOPする。

### 12.2 Cloud Run / Job接続経路

| 主体 | VPC到達 | DB接続/TLS | 備考 |
|---|---|---|---|
| 新規OTP/PIRA Staging service | Direct VPC egress、`default`/東京subnet、`private-ranges-only` | Cloud SQL Auth Proxy v2 sidecarを`--private-ip --address=127.0.0.1 --port=5432`で起動 | 新規revisionだけに設定し、既存connectorを共有しない |
| Migration/bootstrap/maintenance Job | 同じDirect VPC egress | 同じProxy sidecar、task 1、parallelism 1、retry 0 | main containerはProxy readiness後に開始 |
| 管理画面接続試験 | VPC内の専用review Job/harness | 同じProxy sidecar | ローカルPCからprivate IPへ直接接続しない |
| Secure Guard（将来） | 現在の`msp-portal-connector`は同project/region/VPCのため到達可能 | 第2pool実装後にprivate-IP Proxy経路を追加 | baseline/pool承認まで変更・接続しない |

Direct VPC egressは新規サービス/Jobだけに設定する。既存connectorの性能・障害領域を新規SECU runtimeと共有せず、connector VM費用も増やさない。Cloud Run resourceのService Accountとserverless service agentに必要なNetwork User、各runtime Service Accountに対象instance限定のCloud SQL Clientを付与する差分はIAM工程で個別承認する。

Cloud SQL Auth Proxyはprivate IPへの到達経路自体を作らないため、sidecarにもDirect VPC egressが必要である。ProxyがIAMで接続を認証し、DB区間をTLS暗号化してclient/server identityを検証する。アプリからProxyのloopback区間は同一Cloud Run instanceのnetwork namespace内に限定する。

### 12.3 PR #43接続コードFit/Gap

| 対象 | 現状 | 判定 |
|---|---|---|
| `src/db/pool.ts` | Unix socketまたはhost/portを受け取り、max/idle/connect timeoutを設定可能 | Proxy sidecarへ`127.0.0.1:5432`接続できるため変更不要 |
| `src/runtime/runtimeConfig.ts` | `DB_HOST`/`DB_PORT`、pool最大2、idle timeoutを環境設定可能 | OTP/PIRAとも環境設定だけで対応可能 |
| `src/config.ts` | Sales Tools管理は独立した`SECUMIE_DB_*`を必須化し、業務DBへfallbackしない | review harnessおよび将来管理runtimeで環境設定だけで対応可能 |
| Migration/role CLI | `loadDatabaseConfig('migration')`とpool 1を使用 | Jobのloopback Proxyへ環境設定だけで対応可能 |
| TLS | node-postgres自身にはSSL optionを持たない | Proxy sidecarでTLSを終端する採用経路ならコード変更不要。Proxyを使わずprivate IPへ直結する場合だけ別途SSLコード/証明書設計が必要で、今回は採用しない |

設定例（値はSecret参照から注入し、平文をGit/CLIへ書かない）:

```text
DB_HOST=127.0.0.1
DB_PORT=5432
DB_SOCKET_PATH=<unset>
DB_NAME=secumie_insight_staging
DB_USER=<runtime role>
DB_PASSWORD=<Secret reference>
DB_POOL_MAX=2
DB_POOL_IDLE_TIMEOUT_MS=10000
```

したがってStaging instance作成段階ではコード修正ゼロ、runtime定義（multi-container、Direct VPC、IAM、Secret）の追加だけが必要である。sidecarのimageはdigest固定し、`latest`を使わない。

### 12.4 DB初期化・管理試験

ローカルPCからprivate IPへの直接到達、passwordのコマンド引数渡し、public IP/authorized networkの一時追加は禁止する。

1. bootstrap専用Cloud Run JobをVPC内に作り、Proxy sidecarと同一network namespaceで実行する。
2. bootstrap SecretはJobのService Accountだけが参照し、database/role作成後に無効化または削除する。Jobはtask 1、parallelism 1、retry 0、timeoutを固定する。
3. database/role作成結果をmetadataだけで照合し、次にMigration Jobで037〜041を適用する。Migrationは別承認でありinstance作成承認には含めない。
4. 管理試験は専用review Job/harnessから`PiraAdminRepo`を実行し、既存Sales Tools revision/traffic/業務DBを変更しない。
5. 各Jobは終了時にpoolをcloseし、実行後の接続数ゼロ、ログへのSecret/受付情報非出力を確認する。

### 12.5 Staging instance作成コマンド（未実行）

Zoneは既存2instanceが`asia-northeast1-b`にあるため、検証用の障害領域を分ける`asia-northeast1-c`に固定する。2026-11-05確認時点で東京regionは`a/b/c`を提供し、一般CPU quotaは100中4、SSD quotaは500 GiB中40 GiBだった。Cloud SQL固有quotaとcustom tier作成可否はoperation直前に再確認する。

PSA作成・接続が成功し、別途instance作成承認を得た後だけ実行する:

```powershell
gcloud beta sql instances create secumie-sg-shared-staging-db `
  --project=msp-zabbix `
  --database-version=POSTGRES_16 `
  --edition=ENTERPRISE `
  --tier=db-custom-2-7680 `
  --region=asia-northeast1 `
  --zone=asia-northeast1-c `
  --availability-type=ZONAL `
  --storage-type=SSD `
  --storage-size=20 `
  --storage-auto-increase `
  --storage-auto-increase-limit=100 `
  --network=projects/msp-zabbix/global/networks/default `
  --allocated-ip-range-name=google-managed-services-default `
  --enforce-new-sql-network-architecture `
  --no-assign-ip `
  --backup-start-time=18:00 `
  --enable-point-in-time-recovery `
  --retained-backups-count=7 `
  --labels=environment=staging,platform=secumie-secure-guard,temporary=true `
  --deletion-protection
```

`18:00 UTC`は日本時間03:00であり、検証時間帯と重ならない候補である。作成後はengine/edition/tier/zone/storage/private IP/public IPなし/backup/PITR/deletion protection/connection nameをRead-onlyで照合する。不一致が1つでもあればDB作成へ進まない。

### 12.6 費用・停止・cleanup

- 固定見積りは第7節どおり約`$133/month`、14日約`$62`。backup/log/network/monitoringは従量で、総額上限`$75`を維持する。
- Cloud Billing Budget APIはprojectで未有効かつ現在の実行accountにbilling account参照権限がなく、予算通知をRead-only確認できなかった。API有効化/予算作成は別承認である。それまでは毎日Billing reportとinstance稼働日数を実行者が確認する。
- cleanup期限は作成完了から14 calendar days。責任者は技術実行・一次停止・原状復帰を担うWork、最終削除承認はatLIB経営者、証跡レビューは設計統括ChatGPTとする。
- 即時STOP: 累計見込み`$75`超過、14日超過、接続80%、CPU 80%が5分、memory 90%、予期しないstorage増加、backup失敗、5xx/latency悪化、既存サービス差分、Secret露出、承認外IAM/network変更。
- cleanupではCloud Run/Job/revision、synthetic data、database/role/Secrets/Service Accounts、instanceを承認順に撤去する。deletion protection解除とinstance削除は最終承認後のみ。PSA range/peeringは他利用者がないことを別途証明するまで残し、instance cleanupへ連動して削除しない。

### 12.7 実行承認単位

次の操作はまとめて暗黙承認せず、順に個別承認する。

1. Service Networking API/必要APIが未有効の場合の有効化。
2. `172.20.0.0/16` global allocated range作成と`default` VPCのPSA peering接続。
3. Staging Cloud SQL instance 1件の作成（第12.5節の固定値）。
4. bootstrap/migration/runtime用Service Account、IAM、Secret、Cloud Run Job/serviceの作成。
5. Insight database/5 role作成とMigration 037〜041。
6. synthetic data、E2E、保持、backup/restore、cleanupの各書込み操作。

Secure Guard database、role、Secret、Migration、runtime接続は第5節の前提が承認されるまで全てNo-Go。Productionは引き続きNo-Goである。

### 12.8 PSA限定実行結果（2026-11-05 15:02 JST）

経営者承認に基づき、第12.1節の2操作だけを実行した。Cloud SQL、DB/role/Migration、Cloud Run、Secret、IAM、Firewall、VPN、DNS、LBには変更していない。

| 操作 | 結果 | 確認値 |
|---|---|---|
| global allocated range作成 | SUCCESS、command exit 0 | `google-managed-services-default` / `172.20.0.0/16` / `INTERNAL` / `VPC_PEERING` / `RESERVED` / network `default` |
| Service Networking PSA接続 | SUCCESS、command exit 0 | service `servicenetworking.googleapis.com` / peering `servicenetworking-googleapis-com` / range `google-managed-services-default` / state `ACTIVE` |

実行直前に同名rangeおよび既存PSAが存在しないこと、subnet/route/peering/VPNに`172.20.0.0/16`との重複がないことを再確認した。実行後のnetwork差分はallocated range 1件とService Networking peering 1件である。subnet、Firewall、VPN、既存route設定は変更していない。

実行後確認:

- `sales-tools`、`msp-customer-portal`、`sales-tools-staging`は全てReadyだった。Traffic操作は実施していない。
- 既存Cloud SQLは`msp-customer-portal-db`と`sales-tools-staging-db`の2件のままRUNNABLEで、新規instanceはない。
- PSA接続はACTIVEであり、次工程のprivate IP Cloud SQL作成に必要なnetwork前提は成立した。

次工程へ進む前の残条件は、Cloud SQL固有quota/custom tierの直前確認、Organization PolicyのDirect VPC許可確認、費用/cleanup担当の再確認、および第12.5節のinstance作成に対する個別承認である。PSAは共有network資産として残し、instance cleanupに連動して削除しない。

### 12.9 Staging Cloud SQL作成前最終Gate（2026-11-06 09:55 JST）

Read-only最終確認を実施し、instance作成そのものは経営者の明示的な最終承認待ちとして実行していない。

| Gate | 結果 | 根拠・扱い |
|---|---|---|
| 対象instance未作成 | PASS | `secumie-sg-shared-staging-db`はABSENT。既存は2instanceのみで両方RUNNABLE |
| Instance数limit | PASS | 既存2件。新SQL network architectureの公式project limit 1,000件を大幅に下回る |
| 東京region/tier | PASS | `asia-northeast1`でEnterprise/PostgreSQL 16と2 vCPU/7.5 GiB dedicated-core構成がサポートされ、tier一覧にも同等の`db-n1-standard-2`が存在。`db-custom-2-7680`は公式の有効なcustom tier例 |
| 物理capacity | CONDITIONAL PASS | quotaはcapacityを保証しない。create operationでcapacity不足なら無断再試行・zone/tier変更をせずSTOP |
| Cloud SQL Admin API quota | PASS | Cloud Quotasで20 metricを取得可能。今回の単発mutateはrate quota上の異常を示さない。429時は再試行せずSTOP |
| PSA | PASS | `google-managed-services-default`、`172.20.0.0/16`、`VPC_PEERING`、`RESERVED`。peering `servicenetworking-googleapis-com`はACTIVE |
| CLI整合 | PASS | Cloud SDK 575.0.0 / beta 2026.06.26で第12.5節の全19 flagをhelp照合済み |
| 費用管理 | PASS（手動） | Billing Budget APIは未有効。作成時刻・日次Billing見込み・累計を実行者が記録し、`$75`到達見込みで停止 |
| cleanup | PASS | 作成完了時刻+14 calendar daysを期限として即時記録。2026-11-06中に作成した場合は2026-11-20同時刻まで |
| 責任者 | PASS | 技術実行・一次停止・原状復帰: Work、最終承認・リスク受容・削除承認: atLIB経営者、証跡レビュー: 設計統括ChatGPT |

Cloud SQL作成operationの前後で対象instance名、PSA ACTIVE、既存2instanceのRUNNABLEを再確認する。operation失敗時は修復、再試行、zone/tier/CIDR変更、部分resource削除を行わず、operation IDとerrorだけを報告する。

**判定: instance作成は最終承認後に限り実行可能。現時点では承認待ちのため未実行。** Organization Policyのeffective値はAPI未有効で未確認だが、これは後続Direct VPC Cloud Run/Job配備のGateであり、network/IAMを変更しないprivate-IP Cloud SQL instance単体の作成を妨げない。Direct VPC配備前には必ず解消する。
