# P2-12 staging migration release preflight

This is an approval proposal and a runbook, not an executable migration artifact. The only manifest remains `migration-allowlists/staging-p2-10.candidate.json` and is deliberately DRAFT with artifact generation forbidden.

## Verified local inputs

| Input | Verified value | Result |
| --- | --- | --- |
| Branch / HEAD | `feat/free-diagnosis-sales-launch` / `87bc5620151cd1cc46ef5ca95cf26b2134aa37f6` | HEAD matches the recorded source commit, but the working tree is not clean and therefore is not a reviewed release checkout. |
| Staging ledger evidence | `migration-allowlists/evidence/staging-ledger-hdjd6.json`, 20 entries, 1,839 bytes | SHA-256 `0d0997d1d849987d6240c3862b72d35cb8ccc30550c760841ee61db3f57f9ca3` |
| Unapplied set | six formal filenames below | Exact set equality with the tree's ledger-unapplied SQL files. |
| Draft generation | `artifact_generation.permitted: false` | `buildAllowlistArtifact.cjs` rejects it before any context is created. |

| Filename | SHA-256 |
| --- | --- |
| `019_diagnosis_hearing_records.sql` | `c475f50fedc946e588cc8fba64d2674c623f77ea03ebe2c78a1ec593d863a507` |
| `019_web_development_partner_leads.sql` | `50ccdf3664d6fb372b7493bb337257d3f3366a7481deb487037b1b82c9b05621` |
| `020_diagnosis_hearing_source_references.sql` | `81963de6c2e98b13d5f478216983c5d92530f1eeb6ad618ef5fa7c55d873c133` |
| `021_diagnosis_report_pdf_artifacts.sql` | `934ef483f8862eb2b1ecde56b7dee2e973e27c636dad9f35f44f889b7a890f21` |
| `022_diagnosis_report_pdf_generation_lease.sql` | `32a080800fe331b2edecf4e0795f98c3ab1d4c3cb5579ca5e4d23440337a1ace` |
| `023_diagnosis_report_pdf_source_content_hash.sql` | `8e71b2af904c209e1c9ce3a5e22d85c21971d4e620efa2a10397d24e8519a13b` |

`019_diagnosis_hearing_records.sql` sorts before `019_web_development_partner_leads.sql`; numeric prefix collisions are never used as an identity. Ledger-only `017_customer_fit_checks.sql` is evidence only and is neither restored nor included.

## Isolated rehearsal evidence

No PostgreSQL 16 rehearsal has run on this workstation: Docker Engine access is denied and no local `psql` command exists. This is **NO-GO** evidence, not a successful rehearsal.

The manual GitHub Actions workflow `.github/workflows/migration-allowlist-rehearsal.yml` is the approved isolated execution path. It uses a GitHub-hosted `postgres:16-alpine` service on loopback only, starts from tree `001`–`018`, seeds the second database from the raw 20-row JSON, and proves application order, exact-filename skip, transaction rollback, 26-row final ledger, and migration/runtime-role separation. Its sole retained output is a non-sensitive result JSON artifact. It has not been dispatched.

## Approval proposal

Do not edit the candidate manifest until all of these are attached to the change request:

1. A reviewed, committed, clean checkout SHA replacing the current provisional `source_commit` value.
2. A successful isolated workflow artifact whose `ledger_entries` is 20 and whose allowlist exactly matches this document.
3. DB and release-owner approval of the raw-ledger hash, six SQL hashes, target database name, and migration-role identity.
4. A new read-only staging ledger snapshot taken immediately before execution, with the same filename set and approved hash; otherwise start a new review.

Only then may an authorized release owner change the manifest to `APPROVED_FOR_ARTIFACT_GENERATION` and set `artifact_generation.permitted` to `true`. That action is outside this preparation task and must be reviewed as a distinct diff.

## Dedicated image procedure after approval

1. Check out the approved clean SHA and run `npm ci` and `npm run build`.
2. Recompute the raw ledger and SQL hashes, then generate an empty output context with `buildAllowlistArtifact.cjs`, supplying the exact approved SHA.
3. Inspect the generated `migrations/` directory: it must contain exactly the six filenames in this document and no other `*.sql` files.
4. Build only the generated context using its copied `Dockerfile`, passing `SOURCE_REVISION` equal to the approved SHA. Record the immutable image digest and OCI revision label.
5. Inspect the image before any Job exists: `/app/migrations` must contain exactly the six files and the image command must be `node dist/db/migrateCli.js`.
6. Configure the migration Job with `MIGRATIONS_DIR=/app/migrations`, the staging database `sales_tools_staging_f4`, and the separately approved migration role. Do not provide a runtime role or a full migration directory.

## Staging execution and post-run ledger procedure

This section requires separate execution approval. Before running, compare the Job's target database, Cloud SQL target, service account, migration role, `MIGRATIONS_DIR`, image digest, and revision label with the approved record. Any mismatch is a hard stop.

After a successful Job, obtain a new read-only ledger JSON and verify that the original 20 entries remain and exactly the six formal filenames were added. Verify no `006`–`016` or other diagnosis SQL was newly applied, then run the approved synthetic Partner, diagnosis, Scheduler, and PDF smoke tests. On Job failure, stop further deployments; retain logs and ledger evidence. Do not retry with a different image or broader migration directory.

## GO / NO-GO matrix

| Gate | Current state | Decision |
| --- | --- | --- |
| DRAFT artifact fail-closed | Verified | PASS |
| Ledger and SQL hash equality | Verified | PASS |
| Dedicated Dockerfile/context design | Verified statically | PASS |
| Reviewed release commit | `1c701923d2551012627c67d58b974f2b8ebff2a9` pushed; only protected local backup remains untracked | PASS |
| PostgreSQL 16 isolated rehearsal | Run `36279786839` passed; evidence SHA-256 `5e828ccc6760fdadcbae46e07ed9618c0075c9c87e35f401a3d22d40ddcd7d3e` | PASS |
| Immediate staging ledger confirmation | P2-17 verifier execution `sales-tools-staging-migration-018-ledger-verifier-62knr` returned the approved 20-entry, 1,839-byte ledger evidence | PASS |
| Dedicated image inspection | Digest-fixed registry image contains exactly six allowlisted SQL files with matching SHA-256 values | PASS |
| Staging Job DB target/role/image inspection | P2-19 Job configuration read back and matched this record; it has not been executed | PASS |
| Manifest authorization | `APPROVED_FOR_ARTIFACT_GENERATION`; this is not migration-execution approval | PASS |
| Staging migration execution | Not authorized or executed | NO-GO |

## P2-17 staging ledger revalidation (2026-09-27)

The existing read-only verifier Job `sales-tools-staging-migration-018-ledger-verifier` was executed once as `sales-tools-staging-migration-018-ledger-verifier-62knr` and completed successfully. Its immutable image digest was `sha256:0c0ed3020c2ec52db00e869992dfb6ab1df4db06f0d878c8825cd04ca9787c59`; command was `node dist/db/migrationLedgerVerifierCli.js`; target database was `sales_tools_staging_f4` through Cloud SQL instance `msp-zabbix:asia-northeast1:sales-tools-staging-db`, using `sales_tools_migration` and the named Secret reference `sales-tools-migration-db-password`. The verifier begins a read-only transaction, selects only `schema_migrations`, and rolls back.

The returned ledger JSON was byte-for-byte identical to `migration-allowlists/evidence/staging-ledger-hdjd6.json`: 20 entries, 1,839 bytes, SHA-256 `0d0997d1d849987d6240c3862b72d35cb8ccc30550c760841ee61db3f57f9ca3`. All filenames and `applied_at` values matched. Against Git commit `45f3b3eae4c7c520b9144fcf9a6991cf1459ec1f`, the ledger-unapplied SQL set remained exactly the six formal filenames in the draft manifest.

At the completion of P2-17, this revalidation did not authorize artifact generation or migration. P2-18 records the separately reviewed artifact-only approval below; staging migration remains unapproved.

## P2-18 artifact-only approval and Job proposal

The manifest approval is restricted to generation and inspection of a dedicated six-SQL image. Its source commit is `45f3b3eae4c7c520b9144fcf9a6991cf1459ec1f`; release-record commit and image digest must be recorded separately. Build from a Linux clean checkout so Git blob bytes, rather than a Windows CRLF-converted working tree, are hashed. The image must expose only `/app/migrations` with the six allowlisted SQL files, use `node dist/db/migrateCli.js`, and run with `MIGRATIONS_DIR=/app/migrations`.

Proposed Staging migration Job is a new immutable-digest Job, not an update to `sales-tools-staging-migration-018-ledger-verifier`. It must use database `sales_tools_staging_f4`, migration user `sales_tools_migration`, Cloud SQL socket `msp-zabbix:asia-northeast1:sales-tools-staging-db`, and the named Secret reference `sales-tools-migration-db-password`; it must not use the runtime role. Its image URI/digest, service account, command, and environment names require a separate execution approval after image inspection. No Job creation, update, execution, or migration is authorized by this record.

## P2-19 registry image and unexecuted Job verification (2026-09-27)

The approved image was pushed to `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging-migration-allowlist@sha256:61082b6961220afa93902fc098a38296138ae95cbded0c5e3324eac0daf6b864`. Registry re-pull confirmed OCI revision label `1c701923d2551012627c67d58b974f2b8ebff2a9`, default command `node dist/db/migrateCli.js`, and exactly the six manifest SQL files with their recorded SHA-256 values.

New Job `sales-tools-staging-migration-allowlist-p2-18` was created without execution. Read-back configuration is image digest above; command `node dist/db/migrateCli.js`; `MIGRATIONS_DIR=/app/migrations`; `DB_NAME=sales_tools_staging_f4`; `DB_MIGRATION_USER=sales_tools_migration`; `DB_SOCKET_PATH=/cloudsql/msp-zabbix:asia-northeast1:sales-tools-staging-db`; `DB_MIGRATION_PASSWORD` from the named Secret reference `sales-tools-migration-db-password`; service account `sales-tools-staging-sa@msp-zabbix.iam.gserviceaccount.com`; Cloud SQL instance `msp-zabbix:asia-northeast1:sales-tools-staging-db`; retry count zero; and 600-second timeout. No Secret value was read. Existing migration and verifier Jobs were not modified.

The Job's use of `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` is required by `loadDatabaseConfig('migration')`; `DB_USER` and `DB_PASSWORD` are not used by the migration CLI. At the end of P2-19 the Job was ready and unexecuted. A separate execution approval, immediately followed by post-run read-only ledger verification, was required before a staging migration could proceed.

## P2-20 failed execution and P2-21 local remediation evidence (2026-09-27)

The sole authorized execution `sales-tools-staging-migration-allowlist-p2-18-4w7vv` failed before opening a database connection with `MODULE_NOT_FOUND` for `/app/dist/db/migrateCli.js`. No retry was performed and the read-only post-run verifier was not run. The image artifact generator had copied an unchecked prebuilt `dist/` directory; its six-SQL checks did not establish that the migration CLI existed or was loadable.

P2-21 adds fail-closed runtime checks to the artifact generator for `dist/db/migrateCli.js`, `dist/db/migrate.js`, `dist/db/pool.js`, and `dist/config.js`, and loads the CLI before context creation. The dedicated Dockerfile independently checks and loads `dist/db/migrateCli.js` during image build. A Docker-backed test loads the CLI from the built image and confirms that `/app/migrations` contains exactly the six approved SQL files. A Linux clean checkout built the corrected local-only image successfully, and a disposable PostgreSQL 16 rehearsal passed from the 20-entry fixture through the six-file application, 26-entry ledger, repeat skip, rollback, and runtime-role DDL denial checks. This evidence does not authorize a new registry image, Job update, Job execution, or staging retry.

## P2-22 corrected registry image and unexecuted Job (2026-09-27)

Release commit `f96e874486b9f9fef44f256a57d874e62d0b969a` was built from a Linux clean checkout without reusing a prior `dist/`. The corrected image is `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging-migration-allowlist@sha256:110085769b7bb973babb2ab9105129c2ce96b38177f7e3affe92696451547b4d`. Registry re-pull confirmed OCI revision label `f96e874486b9f9fef44f256a57d874e62d0b969a`, command `node dist/db/migrateCli.js`, loadable CLI and runtime dependencies, and exactly the six approved SQL files with their manifest SHA-256 values.

New unexecuted Job `sales-tools-staging-migration-allowlist-p2-22` references that immutable digest. Read-back configuration is `MIGRATIONS_DIR=/app/migrations`, `DB_NAME=sales_tools_staging_f4`, `DB_MIGRATION_USER=sales_tools_migration`, `DB_SOCKET_PATH=/cloudsql/msp-zabbix:asia-northeast1:sales-tools-staging-db`, and `DB_MIGRATION_PASSWORD` from named Secret reference `sales-tools-migration-db-password`; it uses service account `sales-tools-staging-sa@msp-zabbix.iam.gserviceaccount.com`, the matching Cloud SQL instance, zero retries, and a 600-second timeout. No Secret value was read. The failed P2-20 Job and its prior digest remain unchanged and must not be retried. This record does not authorize Job execution or any database operation.

## P2-23 staging migration and post-run ledger verification (2026-09-27)

Pre-run read-only verifier execution `sales-tools-staging-migration-018-ledger-verifier-knjm6` succeeded. Its returned JSON was byte-for-byte identical to the established 20-entry evidence: 1,839 bytes and SHA-256 `0d0997d1d849987d6240c3862b72d35cb8ccc30550c760841ee61db3f57f9ca3`.

The sole P2-22 migration execution `sales-tools-staging-migration-allowlist-p2-22-fxtvs` succeeded with retry count zero. The resolved platform manifest was `sha256:49612e5f126c1c07d62e680d396e6761cb9a7108740a5c209d57b8e97b113594`, derived from the approved registry manifest-list digest. Execution completed in 13.61 seconds. No error output was present in its logs.

Post-run read-only verifier execution `sales-tools-staging-migration-018-ledger-verifier-l6tc2` succeeded. Its raw JSON contains 26 entries, is 2,419 bytes, and has SHA-256 `07211cd6fa26f3335a39afd6baee141aa53ab6941ede711ad4587bc1a372451b`. The original 20 filename and `applied_at` pairs are unchanged. The only added filenames are the six approved entries `019_diagnosis_hearing_records.sql`, `019_web_development_partner_leads.sql`, `020_diagnosis_hearing_source_references.sql`, `021_diagnosis_report_pdf_artifacts.sql`, `022_diagnosis_report_pdf_generation_lease.sql`, and `023_diagnosis_report_pdf_source_content_hash.sql`, each exactly once. No unexpected filename is present.

## P2-24 staging application regression preflight (2026-09-27)

The Staging database migration is complete, but the active Cloud Run service remains `sales-tools-staging-00023-8md`, with 100% traffic on `sales-tools-staging:infravision-integrated-59535e5` and service Git label `84e5980ba9c7ca4e1734b079d2fa0ab551e8a456`. It is not the integrated Release `f96e874486b9f9fef44f256a57d874e62d0b969a`; therefore Staging API, administration UI, worker, and PDF endpoint coverage for the new diagnosis/PDF/Partner integration is not claimed. Cloud Run control-plane readiness is true. Anonymous `/healthz` requests through the published service URLs returned a Google front-end 404, so they are not accepted as an application health signal.

Local non-live regression passed: typecheck and build; 72 diagnosis/workspace/review/report/management-analysis tests passed with two explicit live-AI skips; 8 Partner Funnel/Scheduler tests passed; 34 PDF tests passed; and 11 migration artifact/image/ledger tests passed. Scheduler configuration was read-only inspected only; no worker tick, mail, PDF generation, external notification, or customer-data API request was made. Deployment of an immutable application image built from `f96e874486b9f9fef44f256a57d874e62d0b969a` is required before Staging can validate the integrated HTTP surface.

## P2-25 zero-traffic integrated runtime revision (2026-09-27)

The normal application runtime image, not the migration image, was built from Linux clean checkout of `f96e874486b9f9fef44f256a57d874e62d0b969a` and pushed as `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging@sha256:e13daf48c3dc5e75c8d4de940f3ea47d00ce4e396fa910b9e521ac76c62a099a`. OCI revision label and entrypoint are the release SHA and `node dist/server.js`.

Revision `sales-tools-staging-p225` is Ready and tagged `p2-25-smoke` at zero traffic. The prior revision `sales-tools-staging-00023-8md` retains 100% traffic. Existing service account, Cloud SQL attachment, runtime DB/Secret references, ingress, timeout, concurrency, memory, and Scheduler configuration were preserved. The tagged root route returned the existing management UI HTML. Anonymous `/healthz` remained a Google front-end 404 and is not treated as application-health failure. No traffic promotion, migration Job, verifier Job, external notification, PDF generation, or Scheduler route invocation occurred.

The runtime source includes in-process worker polling on application startup. Although no Scheduler HTTP tick was invoked and no task output was observed during the tagged-route smoke request, post-deploy smoke must explicitly review worker logs and confirm no queued work was processed before traffic promotion.

## P2-26 zero-traffic worker and read-only API smoke (2026-09-27)

**NO-GO for traffic promotion.** Control-plane inspection found that the deployed revision `sales-tools-staging-p225` is Ready and its Service template names the intended runtime image digest `sha256:e13daf48c3dc5e75c8d4de940f3ea47d00ce4e396fa910b9e521ac76c62a099a`, but the immutable Revision specification and resolved revision image digest are `sha256:d44a64fde73393909ab9a17dd5a6d206e5208e45a5ff2714ecc0988a09602a58`. The service/revision Git label also remains the prior value `84e5980ba9c7ca4e1734b079d2fa0ab551e8a456`, rather than serving as provenance for Release `f96e874486b9f9fef44f256a57d874e62d0b969a`. Artifact Registry confirms that both digests exist, but this inspection did not establish why Cloud Run resolved the unexpected digest. Do not promote this revision until the deployed image identity is reconciled and independently rechecked.

The source starts four in-process AI pollers immediately after `app.listen`, then every five seconds: pre-diagnosis, interview assistant, post-diagnosis structurer, and report draft. Each claims a `PENDING` `ai_executions` row by process type with `FOR UPDATE SKIP LOCKED`, changes it to `RUNNING`, and sets a two-minute lease. This prevents two workers from claiming the same row concurrently, but it does **not** prevent a zero-traffic tagged revision from claiming queued work or reaching an external AI provider. It also marks expired `RUNNING` work failed before a claim. Therefore the old and new revisions concurrently polling the same DB have a bounded duplicate-claim control, but remain an operational side-effect risk.

Revision logs confirm the risk is active, rather than hypothetical: immediately after startup, `report_worker_failed`, `post_diagnosis_worker_failed`, `preparation_worker_failed`, and `interview_worker_failed` were emitted; later `preparation_worker_failed`, `interview_worker_failed`, and `report_worker_failed` recurred. The current worker error handlers log only the event name, not the causal exception, so the cause and whether any queue row changed state cannot be determined from these logs without a separately authorized, non-customer-data investigation. No Scheduler HTTP tick or deletion worker route was invoked in this check.

Static review also found an independent Scheduler accounting defect: `createInternalAiWorkerRouter` casts each worker `tick()` to `Promise<boolean>`, but all four concrete `tick()` methods return `Promise<void>`. A Scheduler tick can therefore run workers while reporting `processed: 0` and stopping its outer loop based on `undefined`. This does not remove the database claim lease protection, but means the existing endpoint does not provide reliable execution accounting. It is a required minimal-code-review/fix item before using Scheduler behavior as promotion evidence.

Only unauthenticated, non-writing GET requests were issued to the tagged revision. `/` returned `200`. The protected administration routes for diagnosis, InfraVision Partner, Web Development Partner, and the PDF status path each returned `401`, which matches the server's shared staff-auth gate and demonstrates that authentication executes before those data reads. No authenticated customer-data request was made. Public Partner submission routes are POST-only; they were not called. Internal Scheduler routes are authenticated POST-only under `requireSchedulerIdentity`; they were not called.

`GET` and `HEAD` to tagged `/healthz` returned a Google front-end `404` HTML response (not the Express `ok` response); the response headers did not identify the application. Ingress is `all` and the tagged root reaches the revision with `200`, so this is a tagged-route/front-end path discrepancy, not proof that the Express health handler is absent. It remains unresolved and is not used as a readiness signal; Cloud Run TCP startup readiness is true.

Traffic is unchanged: `sales-tools-staging-00023-8md` remains at 100%; `sales-tools-staging-p225` remains tagged `p2-25-smoke` with 0%. Before any promotion, the release owner must reconcile the unexpected revision digest, identify and address the startup polling/failure behavior without processing queued work, and define a safe authenticated non-writing health/API smoke path. No Cloud Run setting, Scheduler, Job, database, Secret, traffic allocation, or application source was changed by P2-26.

## P2-27 worker isolation and image-identity correction (2026-09-27)

The P2-26 digest difference is **explained and verified**. Artifact Registry identifies `sha256:e13daf48c3dc5e75c8d4de940f3ea47d00ce4e396fa910b9e521ac76c62a099a` as an OCI image index tagged `f96e874`; its `linux/amd64` child manifest is exactly `sha256:d44a64fde73393909ab9a17dd5a6d206e5208e45a5ff2714ecc0988a09602a58`. Cloud Run resolves the OCI index to that amd64 child, so the Revision spec and status correctly name `d44a64…`. The second index member is an `unknown/unknown` attestation manifest referring to the same child. This is a parent/child relation, not an unrelated image. The inherited Cloud Run `git-sha` label remains historic metadata and is not used as release provenance; the immutable registry index/child relation is the release identity evidence.

`/healthz` without a trailing slash is intercepted by the Google front end, but tagged `GET /healthz/` returns `200`, `x-powered-by: Express`, and the two-byte application body. This is the approved non-writing tagged health smoke path. The service IAM policy grants `roles/run.invoker` to `allUsers`, and ingress remains `all`; therefore this endpoint is intentionally public in the existing service policy, not an authenticated endpoint. No IAM or ingress change was made. Protected application API smoke remains independently covered by the `401` results recorded in P2-26.

Application code now introduces `ENABLE_IN_PROCESS_AI_WORKERS`. It defaults fail-closed (`false` unless exactly `true`) and logs either `in_process_ai_workers_disabled` or `in_process_ai_workers_enabled` without configuration values or credentials. When disabled, no in-process poll is invoked, so no queue claim, provider request, PDF work, or notification can originate from runtime polling. Scheduler HTTP routes remain separately mounted and authenticated by their existing service-account identity checks; the new setting does not disable or invoke them. A future runtime deployment must explicitly set the variable to `false` for a tagged smoke revision. Enabling polling is an explicit operating decision (`true`) and must be accompanied by the worker/queue safety approval.

The four AI worker `tick()` methods now return `Promise<boolean>`: `false` only when no claim is made (including an already-running local tick), and `true` after a durable execution is claimed and processed or failed. `createInternalAiWorkerRouter` consumes that real contract directly, so its bounded drain count cannot silently report `processed: 0` for a claimed execution. Poller failure logging now adds only non-secret `error_name` and, when available, a database/provider error code; P2-26's historical generic failures remain causally unconfirmed because no Staging DB query was authorized.

Local verification after the change passed: TypeScript typecheck; 10 worker/Scheduler tests (including disabled polling, enabled polling, and claimed-count accounting); 56 diagnosis/workspace/review/report tests with 53 pass and 3 explicit live-AI skips; 34 PDF tests; 3 Management Analysis tests; TypeScript build; and `git diff --check`. `npm run test:pdf` is not a package script; the seven PDF golden files were run directly. No Cloud Run deployment, traffic change, Scheduler tick, Job execution, direct DB access, external AI request, mail, PDF generation, or Secret read was performed.

The release remains **NO-GO for traffic promotion** until this worker-isolation change is reviewed, committed, built as a new immutable runtime image, and deployed as a new 0% tagged revision with `ENABLE_IN_PROCESS_AI_WORKERS=false`. Then verify `/healthz/`, protected-route auth boundaries, and the disabled-worker startup log on that new revision. The existing `sales-tools-staging-p225` remains 0% and must not be promoted because it was started with unguarded in-process polling and recorded worker failures.
