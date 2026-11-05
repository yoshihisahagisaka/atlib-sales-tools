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
