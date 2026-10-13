# Design v2 migration 033 production release package

This document is a preparation-only runbook. It does not authorize Production execution.

## Release identity

- Source release candidate: `f02cdb213402a48477df1f878cb0dd896f9037b7`
- Database: `sales_tools`
- Target migration: `033_free_diagnosis_design_v2_persistence.sql`
- Manifest: `migration-allowlists/production-free-diagnosis-design-v2-033.json`
- Immutable image identity: record the Artifact Registry **digest** after a separately approved build; never use a tag as the release identity.

## Dedicated artifact

Build the compiled application first, then create an inspectable context without connecting to a database:

```powershell
node scripts/migration/buildDesignV2ReleaseArtifact.cjs --root . --reviewed-sha <final-reviewed-sha> --output <empty-artifact-directory>
```

The builder fails closed unless the source candidate is an ancestor of the reviewed SHA, the current SHA is the reviewed SHA, and the sole SQL file has the manifest's Git blob, byte count, and SHA-256. The resulting context contains only migration 033, `manifest.json`, the compiled migration runtime, and its runtime dependencies.

Build and push that context through the existing approved Artifact Registry workflow. Record the returned immutable digest and the final reviewed SHA in the release record.

## Read-only preflight

Run this only through the established Production IAP/read-only connection path and a `BEGIN READ ONLY` transaction:

```powershell
$env:PREFLIGHT_READ_ONLY='true'
node scripts/migration/preflightDesignV2Production.cjs --root . --artifact <artifact-directory>
```

The formal connection contract is `DB_NAME`, `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD`, and either `DB_SOCKET_PATH` or `DB_HOST`/`DB_PORT`. The preflight requires PostgreSQL 16, database `sales_tools`, migrations 027--032 exactly once, 033 absent, no higher numbered migration, prerequisite tables/constraints, migration-role ownership, and an exact artifact/manifest match. It does not write.

## Dedicated Cloud Run Job definition (do not create or execute under this package)

Use a new 033-only Job; do not alter the historic 028--032 Job. Its finalized definition must use:

- immutable dedicated artifact digest;
- service account `sales-tools-sa@msp-zabbix.iam.gserviceaccount.com`;
- Cloud SQL `msp-zabbix:asia-northeast1:msp-customer-portal-db`;
- `DB_NAME=sales_tools`;
- `DB_MIGRATION_USER=sales_tools_migration`;
- Secret Manager reference `sales-tools-production-migration-db-password:latest` as `DB_MIGRATION_PASSWORD`;
- `DB_SOCKET_PATH=/cloudsql/msp-zabbix:asia-northeast1:msp-customer-portal-db`;
- `MIGRATIONS_DIR=/app/migrations` and command `node dist/db/migrateCli.js`;
- task count `1`, parallelism `1`, max retries `0`, timeout `600s`.

Do not attach runtime-only secrets. Describe and inspect this definition before any separately authorized execution.

## Post-apply read-only verification

After one separately authorized Job execution, use the same established read-only path:

```powershell
$env:VERIFY_READ_ONLY='true'
node scripts/migration/verifyDesignV2Production.cjs
```

It requires 027--033 exactly once, no higher migration, all five Design v2 history tables, all append-only triggers, and `sales_tools_app` SELECT/INSERT on every new table. It never reruns the migration.

## Stop and recovery rules

- Any preflight mismatch, artifact mismatch, Job configuration mismatch, or failed execution: stop. Do not rerun, hand-edit, grant, or apply a new migration.
- Cloud Run traffic rollback is independent of database recovery. A traffic rollback can return to a prior revision only after confirming that revision is schema-compatible with additive migration 033.
- Migration 033 is append-only schema creation. Database recovery must be decided from the approved Cloud SQL backup/PITR procedure; do not treat a runtime rollback as a database rollback.
- Record the execution name, immutable artifact digest, final runtime image digest, ledger before/after, verifier result, and Cloud SQL recovery decision in the release record.
