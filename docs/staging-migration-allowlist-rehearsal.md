# Staging migration allowlist rehearsal

The normal runner is unchanged and executes every unapplied `NNN_*.sql` in its directory. Never point it at the full repository migration directory for this staging release.

1. Verify the read-only ledger JSON original and its SHA-256.
2. Review the draft manifest, then change its status and `artifact_generation.permitted` only under DB/release approval. The reviewed checkout must be clean and at the manifest `source_commit`.
3. Run `node scripts/migration/buildAllowlistArtifact.cjs --root . --manifest migration-allowlists/staging-p2-10.candidate.json --reviewed-sha <manifest-source-commit> --output <empty-generated-context>`. It copies the compiled `dist/`, package manifests, the dedicated Dockerfile, manifest, and only approved SQL. It does not run Docker or SQL.
4. Verify that generated `migrations/` has exactly the manifest filenames and hashes. Build its `Dockerfile` with that generated context and pass the same revision as `--build-arg SOURCE_REVISION=...`; do not use the normal migration Dockerfile.
5. In disposable PostgreSQL 16, test an empty database and a fixture containing the staging ledger snapshot. Verify filename ordering, skip behavior, transaction rollback, ledger insert, and runtime/migration-role separation.
6. Before a staging Job, compare reviewed Git SHA, ledger snapshot hash, manifest approval state, generated SQL list/hash, image digest, Job DB target/role, `MIGRATIONS_DIR`, and rehearsal evidence. Any mismatch stops the run.

Generation fails closed unless the manifest is approved, its permit is true, the raw ledger JSON hash/count/shape match, its migration list equals both `expected_unapplied_filenames` and the complete ledger-unapplied SQL set in the checkout, every SQL hash matches, the reviewed SHA equals `source_commit`, and the output path does not exist. The current manifest is intentionally draft and cannot generate a context.

## Disposable PostgreSQL 16 rehearsal contract

This rehearsal is not a staging/production preflight and must use a newly created local container or an equivalent disposable PostgreSQL 16 instance. Its only ledger fixture is `migration-allowlists/evidence/staging-ledger-hdjd6.json`; preserve every `filename` and `applied_at` value when loading `schema_migrations`. Do not fabricate, restore, or execute ledger-only `017_customer_fit_checks.sql`.

Prepare two empty synthetic databases: one with no ledger rows and one seeded from that JSON. Use distinct synthetic runtime and migration roles. The migration role needs the grants required by the six SQL files; the runtime role must be tested only after migration and must not be used by the migration CLI. No Cloud SQL host, socket path, credential, Secret, or customer data is an allowed rehearsal input.

For the empty database, run the approved dedicated image once and assert lexical application order: `019_diagnosis_hearing_records.sql`, `019_web_development_partner_leads.sql`, then `020` through `023`. For the seeded database, assert the 20 source ledger rows are skipped by exact filename and only those same six files are inserted. Add a synthetic failing SQL file only to a separate disposable copy of the generated context; assert that its DDL and its `schema_migrations` insert are both rolled back. Do not alter the reviewed context to conduct this failure test.

## Mechanical staging preflight and stop conditions

Record these values in the release evidence before any Job is created: reviewed clean Git SHA; raw ledger snapshot path, byte count, SHA-256, and execution name; approved manifest SHA-256 and approval; six SQL filenames and SHA-256 values; generated-context file listing; image digest and OCI revision label; Job database name, Cloud SQL target, migration-role identity, and `MIGRATIONS_DIR`; and successful PostgreSQL 16 rehearsal evidence for both fixture states.

Stop without running the Job if any item is unavailable or differs from the approved record, the source checkout is dirty, `MIGRATIONS_DIR` is not `/app/migrations`, the image contains SQL outside the six allowlisted filenames, the Job is configured with the runtime role, the ledger has changed since its snapshot, or the rehearsal did not prove rollback/skip/order behavior. A new ledger snapshot, manifest review, and rehearsal are required after any one of those inputs changes.

## Isolated CI rehearsal

`.github/workflows/migration-allowlist-rehearsal.yml` is manually dispatched only. It starts a GitHub-hosted `postgres:16-alpine` service and runs `scripts/migration/rehearseAllowlistPostgres.cjs` against `127.0.0.1` only. It has no GCP authentication, Cloud SQL socket, deployment, artifact build, or staging manifest approval step.

The rehearsal script verifies that the manifest remains DRAFT with generation forbidden, checks the raw ledger JSON and six source SQL hashes, and creates only temporary migration directories. It first applies the existing tree's `001`–`018` schema baseline, then runs the six files by filename order against both an empty-baseline database and a database whose `schema_migrations` table is seeded from the raw 20-row ledger JSON. It verifies exact-filename skips, 26-row post-apply ledger state, preservation of ledger-only `017_customer_fit_checks.sql`, a synthetic failing file's transaction rollback, and separate temporary runtime/migration roles. Temporary databases, roles, and directories are removed by the workflow script. On success, the workflow stores only its non-sensitive result JSON as a GitHub Actions artifact.

For a local Docker rehearsal, an operator must first create a new container named `sales-tools-p2-12-postgres16`, label it `purpose=sales-tools-p2-12-rehearsal`, and bind PostgreSQL 16 only to `127.0.0.1:55437`. The script refuses to run unless `RUN_ISOLATED_MIGRATION_REHEARSAL=1`, `ISOLATED_PG_REHEARSAL=p2-12`, a loopback host, and that reserved port are all specified. These checks prevent it from using the existing readiness port or an arbitrary local PostgreSQL service.
