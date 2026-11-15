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
| Image | Docker target `db-operations-production` | Contains the Production CLI and Production manifest only; migration directory is exactly 037-041. Build labels bind the source revision. |

Staging target confirmations and `secumie_*_staging` names are rejected by the Production tools. Secret values are environment/Secret mounts only and are never accepted as CLI arguments or written to structured output. Job execution must remain task 1, parallelism 1, retry 0; failures require manual review and never trigger automatic rerun or deletion.

## 3. Proposed resources and IAM delta

The authoritative candidate list is the JSON manifest. Bootstrap SA requires Cloud SQL Client plus Secret Accessor on all six Production DB Secrets. Migration SA requires Cloud SQL Client and Accessor only for the Migration Secret. Acceptance reuses the Bootstrap SA and six read-only Secret references, matching the proven Staging boundary. No project-wide Secret accessor is permitted. Job identities receive no Cloud Run service invocation role, resource administration, database IAM authentication or unrelated Secret access.

Human/bootstrap administration sets the built-in database administrator password and its Secret version using a non-logging Console flow. Five runtime passwords must be independently generated (at least 32 bytes), entered directly into their individual Secret versions, and never copied into Git, command arguments, Job specs, tickets or review comments.

## 4. Ordered execution and approval boundaries

1. **Approval B1 – Cloud SQL foundation:** confirm final REGIONAL sizing/cost; create `secumie-sg-shared-prod-db`; enable backup/PITR/deletion protection and Private IP; record successful backup and restore conditions. Stop if PostgreSQL is not 16, capacity cannot support 78 application connections plus reserve, networking differs, or the name already exists unexpectedly.
2. **Approval B2 – identity and Secrets:** create the two SAs and six empty Secrets; apply Secret-scoped IAM; perform the human password operation and verify only metadata/version state. Stop on any broader binding.
3. **Approval B3 – artifact and Bootstrap:** build `db-operations-production` from the approved release commit, pass Critical/High gate, push once, pin immutable digest, create/describe the Bootstrap Job, then execute once. Stop on digest/spec/target/capacity/existing-object mismatch or partial failure.
4. **Approval B4 – Migration and Acceptance:** after complete Bootstrap PASS, create/describe Migration and Acceptance Jobs; apply 037-041 once, then execute Acceptance once. Stop on partial migration, ledger/owner/ACL mismatch, residue, or any unauthorized access.
5. **Approval B5 – runtime and publication:** handled separately. Gate B-0 does not deploy OTP/PIRA/Sales Tools, create LB/DNS, enable GENERAL, or publish Production.

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
