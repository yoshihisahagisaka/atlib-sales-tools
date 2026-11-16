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

## 13. Gate B2 condition-file resume record (2026-11-15 JST)

PR #47 comment `6896380565` authorized reuse of the two existing SAs and required `--condition-from-file` only after an official IAM Condition lint PASS. The exact previously approved title, description and CEL expression were serialized to a local temporary JSON file. JSON parsing and exact field read-back passed; the temporary file contained no Secret and was removed after the check.

The mandatory official lint could not run. The installed gcloud SDK does not include the alpha component, its installation directory under Program Files is not writable by the current execution context, and neither the installed GA nor beta track exposes `iam policies lint-condition`. No SDK component was installed, no substitute linter was treated as authoritative, and no live IAM command was issued.

**Gate B2 condition-file resume result: STOP (pre-write).** GCP writes in this attempt were zero. The two existing SAs remain the only Gate B2 resources; IAM bindings, Secrets, Secret versions and password changes remain zero. Resumption requires an approved environment where the documented official linter can execute, or explicit approval of another authoritative lint mechanism. B3 remains unstarted, Production remains No-Go, and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 14. Gate B2 official REST lint and identity foundation (2026-11-16 JST)

PR #47 comment `6902520479` authorized Google's official `iamPolicies.lintPolicy` REST endpoint as the authoritative lint mechanism. Preflight at HEAD `2845d722755ab1dfc52709ce8d22f028e9263793` reconfirmed the two existing SAs enabled, zero relevant IAM bindings, all six target Secrets absent, IAM API enabled, Production Cloud SQL `RUNNABLE` as PostgreSQL 16 REGIONAL with no public IPv4, and all seven protected Cloud Run services Ready.

The exact approved Condition JSON was recreated and read back byte-for-byte for title, description and CEL expression. The REST request used the existing authenticated gcloud access token in memory only. The API returned HTTP success with no `lintResults` property: ERROR, WARNING and NOTICE counts were all zero. No SDK component or API was enabled.

Using the linted file and `--condition-from-file`, the exact conditional `roles/cloudsql.client` binding was applied separately to the existing Bootstrap and Migration SAs. Read-back proved one exact binding per SA with the approved member, role, title, description, CEL and Production instance restriction. Six approved Production DB Secrets were then created with automatic replication. Bootstrap received Secret Accessor on all six; Migration received it only on the Migration Secret. Per-Secret read-back found no missing or excess approved principal and every Secret still had zero versions. All seven protected Cloud Run services remained Ready; database, PostgreSQL roles, Jobs, Migration, Staging and Secure Guard were unchanged.

The local Condition file was deleted. The remaining Gate B2 step is the approved non-logging human Cloud Console operation: set the built-in `postgres` password and Bootstrap Secret version 1 to the same >=32-byte CSPRNG value, and add five independent >=32-byte CSPRNG values as version 1 of the OTP, PIRA, Admin, Migration and Maintenance Secrets. Values must not enter CLI arguments, shell history, logs, Git, PR comments, chat or screen sharing.

**Gate B2 current result: awaiting human Secret entry.** B3 remains unstarted. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 15. Gate B2 Secret metadata acceptance (2026-11-16 JST)

The owner reported completion of the approved non-logging Cloud Console password and Secret entry in PR #47 comment `6906011303`. Authenticated read-only inspection retrieved metadata only and never accessed, printed, hashed, compared or exported a Secret payload.

Read-back confirmed:

- all six approved Production DB Secrets retain automatic replication and the approved Production/SECU:MIE DB credential labels;
- each Secret has exactly one version, version `1`, in `ENABLED` state;
- Bootstrap has Secret Accessor on all six and Migration has it only on the Migration Secret, with no additional Secret-level principal;
- both existing SAs retain exactly one approved conditional Cloud SQL Client binding restricted to `secumie-sg-shared-prod-db`;
- the Production Cloud SQL instance remains `RUNNABLE`, PostgreSQL 16, REGIONAL, Private IP only, PITR enabled and deletion protected;
- built-in user metadata contains exactly one `postgres` user;
- only the default `postgres` database exists; `secumie_insight` and the five roles remain uncreated;
- no Production Gate Job exists and all seven protected Cloud Run services remain Ready;
- Staging, Secure Guard, existing services, database data and migrations were unchanged.

Metadata inspection cannot prove byte-for-byte equality between the built-in `postgres` password and Bootstrap Secret version 1. That equality remains owner-attested and must be demonstrated through the separately approved non-logging authentication and capacity preflight before any B3 DDL. `SHOW max_connections`, reserved connections, observed connections and `M - R >= 78` also remain mandatory B3 pre-DDL checks.

**Gate B2 result: Conditional PASS (identity, Secret metadata and IAM accepted; authentication/capacity deferred to B3 pre-DDL).** B3 was not started. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 16. Gate B3 resumed preflight and image security STOP (2026-11-16 JST)

PR #47 comment `6906526886` superseded the earlier blanket PostgreSQL 16 compatibility hold using the actual Staging Cloud SQL PG16 Recovery/Acceptance evidence while preserving the zero-membership contract and all original B3 gates. Gate B3 resumed from release HEAD `1dc64e2d8598fccfa3c1ed93d51b8a06c14c1bbd`.

Read-only preflight confirmed the Production instance `RUNNABLE`, PostgreSQL 16 REGIONAL/Private IP, PITR/deletion protection, two successful backups, only the default `postgres` database, no Production Bootstrap Job, Direct VPC egress allowed, all six Secret version 1 entries enabled, the unique Artifact tag absent, and all seven protected Cloud Run services Ready.

The `db-operations-production` target was built locally for `linux/amd64` with the approved revision label. In-image verification passed for exactly migrations 037-041 and the Production manifest. Starting the default Production Migration CLI with the Staging instance identifier was rejected before DB connection with `SECU_PRODUCTION_INSTANCE_MISMATCH`. Local image evidence was manifest `sha256:a475c80206751b22a17ee16a58c498b6b7533ca22069649c7b3706a12b84485c` and config `sha256:7815697008ffb229f1e76525cd46fbf94ee0997f55ea48bffa914dcbb4577429`.

The current Docker Scout advisory database rejected the image: Critical 0, High 7. All seven High findings affect bundled Node `24.22.2`, with fixed version `24.22.3`:

- `CVE-2026-123863`
- `CVE-2026-123864`
- `CVE-2026-123865`
- `CVE-2026-123866`
- `CVE-2026-123872`
- `CVE-2026-123874`
- `CVE-2026-126051`

The approved Critical/High STOP condition was applied without an exception, exclusion or threshold change. The image was not pushed, no Bootstrap Job was created or executed, authentication/capacity/DDL was not attempted, and `secumie_insight` plus the five roles remain absent. Read-back found the Artifact tag absent, only the default `postgres` database and all seven protected services Ready.

**Gate B3 result: STOP before Artifact push and DDL.** Resumption requires a separately reviewed minimal base-image update to a Node version containing the fixes, followed by rebuild and the unchanged Critical/High gate. B4 remains unstarted. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 17. Gate B3 Node 24.22.3 minimal remediation evidence (2026-11-16 JST)

PR #47 comment `6906895110` authorized only the minimum immutable Node 24 base-image pin update and local/CI verification. Official image metadata resolved Node `24.22.3-bookworm-slim` to index digest `sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54` and Distroless `nodejs24-debian13` to index digest `sha256:24bc0fe0225c7518f202a822587dad74fe143b96326b81fe5cc08c1df8bed03e`. Both were executed on linux/amd64 and reported `v24.22.3` before source modification.

Only six Node 24 `FROM` references in `Dockerfile.secumie` changed: three builder/dependency stage references and the unchanged distroless/nonroot final bases for OTP, PIRA and Production DB Operations. Node 20 Staging stages, packages, application code, DB logic, manifests and security thresholds were unchanged. Implementation revision is `a00b01f0f2c144e72a4240554f4b06c0e2878f1b`.

Local linux/amd64 verification:

| Image | Local image ID | Node | User | Critical | High |
| --- | --- | --- | --- | --- | --- |
| OTP | `sha256:a0fc5e44cb3a0e82bde0be11dbd8a658ee3c6784d6886d4557e693b53e68045b` | 24.22.3 | nonroot | 0 | 0 |
| PIRA | `sha256:d7c294544b3233630d40b79eeab7345b0091ab6d80a35ec047c210d75feb20fd` | 24.22.3 | nonroot | 0 | 0 |
| Production DB Operations | `sha256:fc794e1cf5a9f60b654c2b5fe553d04cb846cf6b718a652c30b29fae3f36b9f3` | 24.22.3 | nonroot | 0 | 0 |

Production DB Operations again verified exactly migrations 037-041 in-image and rejected the Staging instance before a DB connection. TypeScript build and both manifests passed. Contract regression was 24 PASS / 1 environment-dependent PostgreSQL SKIP. An isolated PostgreSQL 16 run passed 32 OTP/PIRA/admin/DB-privilege tests and 2 Production lifecycle tests; the temporary container was removed.

No image was pushed, no Artifact Registry tag was changed, and no GCP/DB/IAM/Secret/Job resource was accessed or modified by this remediation. Gate B3 remains stopped at code/image security review pending acceptance of the new source SHA and immutable local image evidence. B4 remains unstarted. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 18. Gate B3 Artifact and Production Bootstrap result (2026-11-16 JST)

Owner comment `6907994885` explicitly authorized Gate B3 from release SHA `35b86f5d2bac676762281e9b6aff1e552a672b35`. A fresh read-only preflight confirmed PostgreSQL 16 REGIONAL HA, Private IP only, successful automated backups, PITR 7 days, deletion protection, only the default `postgres` database and built-in user, all six Secret version 1 entries enabled with the approved Secret-scoped IAM, no Production Bootstrap Job or execution, no approved-SHA Artifact tag, Direct VPC allowed, and all seven protected Cloud Run services Ready.

The existing IAP/VPC route authenticated with the Bootstrap Secret without printing or persisting its value. A read-only transaction confirmed `current_user=postgres`, no `secumie_insight` database, no five application roles, and no unexpected application-role memberships. Capacity was measured as `M=400`, superuser reserved `3`, reserved `0`, observed connections `10`, canonical reserve `R=80`, and `M-R=320 >= 78`.

The `db-operations-production` image was rebuilt once for `linux/amd64` from the approved SHA with Node `24.22.3`. In-image verification again passed for exactly migrations 037-041 and the Production manifest, the revision label matched the approved SHA, and a Staging instance was rejected before DB connection. Current local and remote scans both returned Critical 0 / High 0. The image was pushed once to the approved existing repository. Registry identity was read back as index digest `sha256:70b9f6aa3621db0275fabb5287137a3cd01a32866cfb5a9110af556cc4845ee0`, linux/amd64 manifest `sha256:856b0cae94a2672b465655f8be3a87571677d5689390e8e574aa986003218c3d`, and config `sha256:f011374a198a06c518e6314bc54f7d2eb7a60e86792688228f598d7921eb0928`. Registry provenance identifies the approved repository and SHA.

Cloud Run Job `secumie-db-bootstrap-prod` was created with the immutable registry digest, approved Bootstrap SA, six Secret version 1 references, Direct VPC `default/default` with `private-ranges-only`, Cloud SQL Auth Proxy v2.28.0 fixed index digest, Production target confirmation, task/parallelism 1, retry 0 and timeout 900 seconds. Pre-execution read-back matched the manifest and showed zero executions. The single approved execution `secumie-db-bootstrap-prod-4gxvf` completed successfully with one succeeded task and no retry.

Post-execution read-only acceptance confirmed:

- database `secumie_insight`, owner `postgres`, and PUBLIC database CONNECT/TEMPORARY revoked;
- exactly five LOGIN roles with limits OTP 6, PIRA 6, Admin 40, Migration 1 and Maintenance 1;
- all five roles are NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION and NOBYPASSRLS;
- zero memberships involving the five application roles;
- all five roles can CONNECT, only Migration can CREATE on the database and use/create in `public`, and PUBLIC schema privileges are revoked;
- each role authenticated through its own Secret, with non-Migration CREATE checks false;
- capacity remained `M=400`, `R=80`, available 320, required 78, PASS;
- structured logs contained only the capacity and completion metadata, no Secret value, password, OTP, JWT or personal data;
- all seven protected Cloud Run services remained Ready.

**Gate B3 result: PASS for Artifact and Bootstrap only.** Gate B4 Migration/Acceptance was not started. No OTP/PIRA or Sales Tools deployment, GENERAL enablement, public release, Secure Guard or Staging change was performed. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.

## 19. Gate B4 Migration success and Acceptance STOP (2026-11-16 JST)

Owner comment `6908545953` authorized Gate B4 only from evidence HEAD `e57b0474dc32ef84f72fdefd7e111c468db99bc3`. Preflight confirmed the approved Git/manifest state, exact ordered SHA-256 manifest for migrations 037-041, B3 database owner `postgres`, five bounded roles and zero application-role memberships, Migration-only CREATE, PUBLIC revocation, an absent migration ledger, `M=400`, `R=80`, 320 available connections against 78 required, six enabled Secret version 1 entries with approved scoped IAM, immutable Artifact provenance and Critical 0 / High 0, Direct VPC, successful backups/PITR/deletion protection, absent Migration/Acceptance Jobs and all seven protected services Ready.

Jobs `secumie-db-migrate-prod` and `secumie-db-acceptance-prod` were created with the approved immutable image and Proxy digests, Production target, Direct VPC `default/default` and `private-ranges-only`, correct SA/Secret boundaries, task/parallelism 1, retry 0 and timeout 900 seconds. Both showed zero executions before use.

Migration execution `secumie-db-migrate-prod-wfzff` completed successfully once with no retry. Read-only verification found the ledger exactly equal to 037, 038, 039, 040 and 041 in order. All 3 target schemas, 10 tables and 7 functions were owned by `secumie_migration_prod`.

Acceptance execution `secumie-db-acceptance-prod-cs6kz` was executed once and failed with exit code 1; retry remained zero. Cloud SQL error evidence identifies the final failure as `permission denied for schema public_auth` for user `postgres`. The Acceptance CLI's final synthetic-residue query uses the bootstrap owner connection, but the Cloud SQL built-in `postgres` role has no `USAGE` on the hardened `public_auth` schema. Earlier denial logs for OTP/PIRA/Admin/Maintenance are the expected negative tests, but the full Acceptance result cannot be marked PASS because the CLI did not reach its completion event.

No rerun, ACL repair, GRANT, Job update or permission widening was performed. Separate read-only queries using the owning OTP and Admin runtime roles confirmed zero synthetic residue in `public_auth.otp_send_locks` and `pira.pira_export_audit`. The migration ledger and ownership remained intact, both Jobs have exactly one execution, all seven protected Cloud Run services remained Ready, and no Secret value was logged.

**Gate B4 result: STOP after successful Migration and failed Acceptance.** Migration 037-041 must not be rerun. Acceptance must not be rerun or modified without a new review and explicit approval. Gate B5, runtime deployment, GENERAL enablement and Production publication were not started. Production remains No-Go and `PIRA_GENERAL_ENABLED=false` remains unchanged.
