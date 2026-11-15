# SECU:MIE Insight Production Gate B-0 approval package

Date: 2026-11-15 JST

Release branch: `release/secumie-insight-production`

Gate A basis: `9b1861a7915caec2362e3a5423d44c79eaafb568`
Status: **Production No-Go / approval package only**

## 1. Inherited decisions and scope

Gate B-0 inherits PR #47, the shared SECU:MIE/Secure Guard Cloud SQL design, Staging Recovery/Migration/Acceptance evidence, and Canonical §19.22. It prepares Production-only tooling without changing Staging artifacts. Production is fixed to project `msp-zabbix`, instance `secumie-sg-shared-prod-db`, database `secumie_insight`, PostgreSQL 16, Private IP/Direct VPC/Cloud SQL Auth Proxy, and `PIRA_GENERAL_ENABLED=false`.

Secure Guard database creation, migrations and services are outside this package. The five Production physical role names, six Secret names, two Service Accounts and three Job names are candidates fixed for approval in `release/secumie-production-gate-b-manifest.json`; they do not yet exist by virtue of this document.

## 2. Production-only execution contract

| Stage | Tool | Fail-closed boundary |
| --- | --- | --- |
| Bootstrap | `bootstrapSecumieInsightProductionCli` | Exact project/instance/database confirmation, PostgreSQL 16, capacity `M - R >= 78`, and absence of the database/all five roles are checked before DDL. Creates bounded non-elevated roles and a bootstrap-owned database; PUBLIC access is revoked and only Migration receives database/schema CREATE. |
| Migration | `runSecumieProductionMigrationCli` | Exact target, database and Migration role; Production manifest contains only 037-041 with fixed order/SHA-256. An existing ledger is rejected, so application is one-time only. |
| Acceptance | `validateSecumieProductionCli` | Exact target; database/owner, PostgreSQL 16, role attributes/membership, object owners, ledger, capacity, Positive/Negative grants, audit immutability, retention preview, and rollback-only synthetic writes. |
| Image | Docker target `db-operations-production` | Contains the Production CLI, verifier, and Production manifest only; migration directory is exactly 037-041. Build labels bind the source revision. CI executes the verifier inside the final distroless image and proves a Staging instance is rejected before any DB connection or DDL. |

Staging target confirmations and `secumie_*_staging` names are rejected by the Production tools. Secret values are environment/Secret mounts only and are never accepted as CLI arguments or written to structured output. Job execution must remain task 1, parallelism 1, retry 0; failures require manual review and never trigger automatic rerun or deletion.

## 3. Proposed resources and IAM delta

The authoritative candidate list is the JSON manifest. Bootstrap SA requires Cloud SQL Client plus Secret Accessor on all six Production DB Secrets. Migration SA requires Cloud SQL Client and Accessor only for the Migration Secret. Acceptance reuses the Bootstrap SA and six read-only Secret references, matching the proven Staging boundary. No project-wide Secret accessor is permitted. Job identities receive no Cloud Run service invocation role, resource administration, database IAM authentication or unrelated Secret access.

Human/bootstrap administration sets the built-in database administrator password and its Secret version using a non-logging Console flow. Five runtime passwords must be independently generated (at least 32 bytes), entered directly into their individual Secret versions, and never copied into Git, command arguments, Job specs, tickets or review comments.

## 4. Ordered execution and approval boundaries

1. **Approval B1 – Cloud SQL foundation:** create `secumie-sg-shared-prod-db` as PostgreSQL 16 Enterprise, dedicated core 2 vCPU / 7.5 GiB, REGIONAL HA, SSD 30 GiB with automatic increase enabled and a 200 GiB initial cap, Private IP only, daily backup, PITR 7 days, deletion protection and retained final backup. Direct VPC is fixed to network/subnet `default/default` in `asia-northeast1` with `private-ranges-only` egress. Record successful backup and restore conditions. Stop if capacity cannot support 78 application connections plus reserve, networking differs, or the name already exists unexpectedly.
2. **Approval B2 – identity and Secrets:** create the two SAs and six empty Secrets; apply Secret-scoped IAM; perform the human password operation and verify only metadata/version state. Stop on any broader binding.
3. **Approval B3 – artifact and Bootstrap:** build `db-operations-production` from the approved release commit, pass Critical/High gate, push once, pin immutable digest, create/describe the Bootstrap Job, then execute once. Stop on digest/spec/target/capacity/existing-object mismatch or partial failure.
4. **Approval B4 – Migration and Acceptance:** after complete Bootstrap PASS, create/describe Migration and Acceptance Jobs; apply 037-041 once, then execute Acceptance once. Stop on partial migration, ledger/owner/ACL mismatch, residue, or any unauthorized access.
5. **Approval B5 – runtime and publication:** handled separately. Gate B-0 does not deploy OTP/PIRA/Sales Tools, create LB/DNS, enable GENERAL, or publish Production.

After Bootstrap and Acceptance evidence is preserved, remove temporary Bootstrap Secret accessor and temporary IAM bindings. Runtime/Migration Secrets and the five database roles remain; database/role deletion or broader Secret/IAM cleanup requires separate approval.

Each approval unit begins and ends with Read-only inventory of Cloud SQL, databases, roles, Job specs/executions, SAs, Secret metadata/IAM, existing seven Cloud Run services and the protected Sales Tools/PPAP routes. Progression is allowed only on complete PASS; no automatic repair, rerun, cleanup or privilege expansion is authorized.

## 5. Backup, recovery and rollback

Before Bootstrap, require a successful automated backup, PITR coverage, deletion protection, a documented temporary-instance/PITR restore procedure, execution owner, stop authority and rollback owner. Bootstrap partial failure preserves evidence and stops; role/database removal is a separately approved destructive operation. Migration failure rolls back the current migration transaction, retains earlier ledger entries and stops; it is not rerun automatically. Application rollback uses immutable prior Cloud Run revisions and does not reverse schema 037-041. Publication remains a later approval.

## 6. Cost and protected boundaries

The approved planning baseline for the shared REGIONAL Production Cloud SQL is approximately **USD 270/month**, subject to the final Pricing Calculator export, storage/backups/PITR, network and tax. Gate B Jobs are scale-to-zero and incur execution/registry/logging usage; final estimates must be captured before B1/B3. OTP/PIRA Cloud Run, HTTPS LB, certificate, DNS, SMTP, Turnstile and monitoring costs remain later runtime/publication items.

Existing Sales Tools, Secure Send, PPAP, `www.atlib.jp`, Secure Guard data/services, Staging database/roles/jobs and Production resources outside the manifest are protected and unchanged.

## 7. Acceptance and STOP conditions

Acceptance requires the exact five-entry ledger, Migration ownership of schemas/tables/functions, non-elevated bounded roles, no memberships, runtime Positive/Negative SQL PASS, audit UPDATE/DELETE denial, retention preview without delete, `M - R >= 78`, zero synthetic residue, no Secret disclosure and no impact to existing services.

STOP on target/engine/digest/manifest mismatch, pre-existing objects, capacity failure, unexpected IAM/Secret access, partial DDL/migration, owner/ACL difference, Critical/High detection, Production/Staging cross-connection, GENERAL enablement, Secure Guard impact, or any need to widen the approved change. Production remains No-Go until B1-B4 receive explicit management approval and pass, followed by separate runtime and publication approvals.

## 8. Gate B-0 local evidence

The following was executed only against an ephemeral local PostgreSQL 16 container; the container was removed after the run. No GCP, Staging or Production resource was accessed.

| Check | Result |
| --- | --- |
| TypeScript build | PASS |
| Staging and Production 037-041 manifests | PASS; same approved order and SHA-256, separate database targets |
| Production contract/unit tests | 2 PASS |
| Production PostgreSQL lifecycle | 2 PASS: wrong-instance and Staging confirmation rejection, capacity-failure before DDL, Bootstrap, exact 037-041 ledger, owner/role/Positive-Negative/retention Acceptance, synthetic rollback residue 0, duplicate Bootstrap/Migration rejection |
| Existing Staging preparation and dedicated-pool regression | 7 PASS / 1 environment-dependent PostgreSQL test SKIP; no regression |
| `db-operations-production` linux/amd64 build | PASS; manifest verified inside image and revision label matched the Gate A basis |
| Local dependency audit | Not counted: the sandboxed npm audit endpoint was unavailable. The GitHub Actions dependency gate remains authoritative. |

The release workflow now builds and scans the Production DB Operations image in addition to OTP/PIRA, verifies both manifests, and runs the Production PostgreSQL lifecycle. No image was pushed and no Job was created or executed.

The first CI execution (run `43682853519`) exposed two portability issues in this newly added gate, without changing any accepted business behavior. The Production lifecycle test had been placed in the same Node test process as the existing DB suites, allowing concurrent files to rotate the shared local `otp_test` password. It is now a separate sequential workflow step. The initial Production DB Operations final layer also retained the Node/npm toolchain; Trivy correctly rejected Critical/High findings in npm's bundled archive dependencies. Manifest verification now remains in a pinned Node 24 build stage, while the final image uses the same pinned distroless Node 24 base already accepted for OTP/PIRA. No vulnerability exception or threshold relaxation was added. CI must prove Critical/High 0 for the corrected final image before Gate B-0 can pass.

Final-image inspection then found that the verifier used by `runSecumieProductionMigrationCli` had only existed in the build stage. The verifier is now copied to its fixed runtime path `/app/scripts/readiness/verifySecumieMigrationManifest.cjs`. Local execution inside the final distroless image verified the Production manifest and exactly five files (037-041); starting the default Production Migration CLI with the Staging instance identifier failed before DB connection with `SECU_PRODUCTION_INSTANCE_MISMATCH`. CI repeats both checks against the final image before its unchanged Critical/High gate.

## 9. Gate B1 execution record (2026-11-15 JST)

Management approved Gate B1 at release HEAD `ec7c320713776e024a75651a47079d9d15f45d3f`. Read-only preflight passed: the Git/PR/manifest matched; billing and Cloud SQL Admin API were enabled; `secumie-sg-shared-prod-db` did not exist; the existing `default` VPC Service Networking peering was `ACTIVE`; allocated range `google-managed-services-default` was `172.20.0.0/16`; the three existing Cloud SQL instances were `RUNNABLE`; and the seven protected Cloud Run services were Ready. Existing Staging also proves PostgreSQL 16 and the approved 2 vCPU / 7.5 GiB custom configuration in `asia-northeast1`. No database, role, Secret, IAM or application resource was changed.

The single approved create attempt stopped in local gcloud argument validation before an API request because the GA `gcloud sql instances create` track does not recognize `--storage-auto-increase-limit`; the installed CLI reports that this flag is available only through `gcloud beta sql instances create`. In accordance with the no-retry/no-substitution condition, Work did not switch release tracks or issue another create command. Read-back returned HTTP 404 for the target instance, the Cloud SQL inventory remained the original three instances, and all seven protected Cloud Run services remained Ready. There is no partial Production Cloud SQL resource to clean up and no Production cost began.

**Gate B1 result: STOP (safe, no resource created).** Resumption requires explicit management approval for one `gcloud beta sql instances create` invocation using the identical approved manifest and flags. B2 remains unstarted. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 10. Gate B1 approved resume and acceptance (2026-11-15 JST)

Management approved changing only the CLI release track from `gcloud sql instances create` to `gcloud beta sql instances create`; every manifest parameter and safety condition remained unchanged. Preflight at HEAD `db7204b09eabcb94ed6403b158963fda4d5e3a11` reconfirmed that the target was absent, all required beta flags were available, PSA was `ACTIVE`, the existing three Cloud SQL instances were `RUNNABLE`, and all seven protected Cloud Run services were Ready.

The single approved beta create operation completed `DONE` without error. Instance `secumie-sg-shared-prod-db` became `RUNNABLE` at connection name `msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db`. Read-back matched the approved manifest:

- PostgreSQL 16 Enterprise, custom 2 vCPU / 7.5 GiB, REGIONAL HA with primary `asia-northeast1-b` and available failover in `asia-northeast1-c`.
- SSD 30 GiB; automatic increase enabled with 200 GiB limit.
- `default` VPC Private IP only; no public IP.
- Daily automated backup enabled with 7 retained backups; PITR and transaction log retention 7 days enabled.
- Deletion protection, backup retention on delete, and retained final backup enabled.
- Initial automated backup completed `SUCCESSFUL` from 2026-11-15 22:02:53 JST through 22:03:07 JST.
- The Cloud SQL inventory changed only by this one approved instance. All seven protected Cloud Run services remained Ready. No database, PostgreSQL role/password, Secret, IAM, Job, Migration, runtime, Staging or Secure Guard resource was changed.

No authenticated SQL connection exists in Gate B1, so `SHOW max_connections` and the canonical `M - R >= 78` calculation were not measured or inferred. They remain a mandatory B2/B3 pre-DDL gate. **Gate B1 result: Conditional PASS** (instance and required settings accepted; SQL capacity remains pending). B2 is unstarted, Production remains No-Go, and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 11. Gate B2 execution record (2026-11-15 JST)

Management approved Gate B2 at release HEAD `f098826ab95b973bcdbb65d74cc2cceb8e0bd691`. Read-only preflight passed: Git, PR #47 and the manifest matched; the Production Cloud SQL instance remained `RUNNABLE` with the accepted B1 configuration and successful initial backup; both target Service Accounts and all six target Secrets were absent; neither target principal had an existing project IAM binding; and all seven protected Cloud Run services were Ready.

Execution created the two approved Service Accounts:

- `secumie-db-bootstrap-prod@msp-zabbix.iam.gserviceaccount.com`
- `secumie-db-migration-prod@msp-zabbix.iam.gserviceaccount.com`

The first Cloud SQL Client binding command was then rejected by the local `gcloud` argument parser because the PowerShell-composed `--member` value crossed an argument boundary. The IAM policy write did not succeed. This was the first error, so the approved partial-construction STOP rule was applied immediately: there was no retry, repair, deletion or privilege expansion.

Read-back after STOP confirmed:

- the two Service Accounts exist and are enabled;
- their project IAM bindings are empty;
- zero Production DB Secrets were created and therefore no Secret versions or Secret-level IAM bindings exist;
- the built-in `postgres` password was not changed;
- no authenticated SQL connection or capacity measurement was attempted;
- all seven protected Cloud Run services remained Ready;
- no Cloud SQL, database, PostgreSQL role, Staging, Secure Guard or application resource was changed.

**Gate B2 result: STOP (safe partial state).** Resumption requires explicit approval to continue from the two existing Service Accounts, using a corrected single-argument `--member` invocation. The existing Service Accounts must not be recreated. B3 remains unstarted, Production remains No-Go, and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 12. Gate B2 controlled resume record (2026-11-15 JST)

Management authorized controlled resumption from the safe partial state in PR #47 comment `6896043513`. The two existing Service Accounts were reused. A local argv probe confirmed that each exact `--member=serviceAccount:<approved-email>` value was passed as one argument. Read-only preflight reconfirmed both SAs enabled, zero IAM bindings for them, and all six target Secrets absent.

The first authorized IAM operation did not apply. Although `--member` was correct, the string literal quotes inside the IAM Condition were removed at the PowerShell-to-`gcloud.cmd` boundary. The IAM API rejected the malformed expression during condition compilation. No policy write occurred. In accordance with the explicit no-retry condition, no corrected invocation was attempted.

Read-back after the failure confirmed:

- both approved Production SAs remain present and enabled;
- IAM bindings for both SAs remain zero;
- Production DB Secrets and Secret versions remain zero;
- the built-in `postgres` password remains unchanged;
- database, roles, Jobs and Migration remain uncreated/unexecuted;
- all seven protected Cloud Run services remain Ready;
- Staging and Secure Guard remain unchanged.

**Gate B2 controlled resume result: STOP (safe, no new GCP write in this attempt).** A further explicit approval is required for a condition transport method that preserves the quoted CEL string literals, such as a policy-file or properly escaped single argument. B3 remains unstarted, Production remains No-Go, and `PIRA_GENERAL_ENABLED=false` remains unchanged.
