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
