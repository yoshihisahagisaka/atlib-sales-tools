# Marketing Initiative v1 migration 034 production release package

Preparation only. This package does not authorize artifact push, Job creation/execution, Production writes, runtime deployment, or traffic changes.

## Fixed identity

- Application source: `694988aaa03683676226f504c53a06108d625f31`
- Database: `sales_tools` (PostgreSQL 16)
- SQL: `034_marketing_initiative_v1.sql`
- Git blob: `716cff317599de60c7dd0220ca5510a4c066327c`
- Bytes: `2020`
- SHA-256: `2cbca86347a36b5a06f2372ff7d3c88f1ed29fd2f2f52df1ac03b3175d34715d`
- Manifest: `migration-allowlists/production-marketing-initiative-v1-034.json`

Migration 033 files and its release package are not inputs and must not be changed or rebuilt.

## Artifact preparation

Build the application, then create a clean 034-only context. `<reviewed-sha>` must be the clean reviewed HEAD containing the unchanged application commit above.

```powershell
npm run build
node scripts/migration/buildMarketingInitiativeReleaseArtifact.cjs --root . --reviewed-sha <reviewed-sha> --output <new-empty-directory>
```

Inspect that the artifact has exactly one SQL file. A separately approved Cloud Build may build its Dockerfile and push it to the existing Artifact Registry. Record Build ID, source SHA, image URI and digest. Tags are not release identity.

## Production read-only preflight

Use only the established IAP/read-only connection path and migration role. The script starts `BEGIN READ ONLY` and requires PostgreSQL 16, database `sales_tools`, 027–033 exactly once, 034 absent, no migration above 033, prerequisite ownership and an exact artifact.

```powershell
$env:PREFLIGHT_READ_ONLY='true'
node scripts/migration/preflightMarketingInitiativeProduction.cjs --root . --artifact <artifact-directory>
```

## Dedicated Cloud Run Job

The reviewed template is `release/cloud-run-jobs/sales-tools-prod-marketing-initiative-v1-034.yaml`. Replace the image placeholder only with the separately built immutable digest. Before execution, describe and verify: task 1, parallelism 1, retries 0, timeout 600s, the existing migration service account, Cloud SQL instance/socket, migration role, Secret Manager reference and `/app/migrations`. The artifact must contain only 034.

Job creation and execution require separate approvals. Issue the execute command once only. An unknown result must be resolved from execution history and the ledger; never retry speculatively.

## Post-apply read-only verification

```powershell
$env:VERIFY_READ_ONLY='true'
node scripts/migration/verifyMarketingInitiativeProduction.cjs
```

The verifier requires 027–034 exactly once, no 035+, the full table/column/constraint contract, `indnullsnotdistinct`, migration-role ownership, and SELECT/INSERT/UPDATE for both runtime roles. It reports but never changes the Sales Activity count.

## Runtime ordering and recovery

The Marketing Initiative runtime queries `marketing_initiative` from the Sales Launcher list. Therefore do not send traffic to that runtime before 034 post-verification passes. Existing runtime revisions do not reference the new table and remain compatible after this additive migration.

There is no automatic down migration. Cloud Run traffic rollback and Cloud SQL recovery are separate decisions. On any mismatch or failed/unknown execution: keep existing traffic, do not rerun or hand-edit SQL, inspect the ledger read-only, and request a separate Cloud SQL backup/PITR decision if recovery is required.
