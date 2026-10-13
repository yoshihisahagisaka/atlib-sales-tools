# Test Case Management v1 migration 035 production release package

Preparation only. This package does not authorize Migration 035 execution, runtime deployment, Production allowlist configuration, traffic changes, or any other Production write.

## Fixed identity

- Application source: `db5107396374761ff777b991ae38accfe687e750`
- Database: `sales_tools` (PostgreSQL 16)
- SQL: `035_it_management_test_case_designation.sql`
- Git blob: `8c6e86bcd807281bf1995fee0f7bcb61b9501112`
- Bytes: `1703`
- SHA-256: `e93cc59066dbb6f19a02e4b80a7493ab519606c15b871e8f80a4d11620d2e6b7`
- Manifest: `migration-allowlists/production-test-case-management-v1-035.json`

Migration 027–034 SQL and their release packages are not changed or rebuilt.

## Artifact and rehearsal

Build the application and create a clean 035-only context. The reviewed SHA must be a clean descendant of the application source with identical Migration 035 bytes.

```powershell
npm run build
node scripts/migration/buildTestCaseManagementReleaseArtifact.cjs --root . --reviewed-sha <reviewed-sha> --output <new-empty-directory>
```

The PostgreSQL 16 rehearsal starts from migrations through 034 and proves one-time application, rerun skip, append-only audit, runtime SELECT/INSERT-only privileges, existing Case preservation, KPI exclusion/restoration, and transaction rollback after a rejected audit mutation.

## Production read-only preflight

The preflight requires a byte-identical artifact, `BEGIN READ ONLY`, PostgreSQL 16, database `sales_tools`, migrations 027–034 exactly once, 035 absent, no migration above 034, baseline tables/constraints/ownership, and absence of the target table. Case, Report, Sales Activity, and Marketing Initiative counts are evidence only.

Backup and PITR are verified separately through the Cloud SQL control plane. Neither the script nor this package changes the database.

## Dedicated Cloud Run Job

Use `release/cloud-run-jobs/sales-tools-prod-test-case-management-v1-035.yaml` with the immutable migration image digest. Before any separately approved execution, describe and verify task 1, parallelism 1, retries 0, timeout 600 seconds, formal migration service account, Cloud SQL socket, migration role, Secret Manager reference, and `/app/migrations`. The artifact must contain only 035.

Job creation does not authorize execution. Unknown execution state must be resolved from Job history and the migration ledger; never retry speculatively.

## Post-apply verification

The read-only verifier requires migrations 027–035 exactly once, no 036+, migration ownership, six audit columns, enabled append-only trigger, both indexes, and SELECT/INSERT without UPDATE/DELETE for the required runtime role. It reports current Case, Report, Sales Activity, and Marketing Initiative counts without modifying them.

## Runtime allowlist and ordering

`TEST_CASE_ADMIN_EMAILS` is a comma-separated Production environment setting derived from an independently approved administrator list. The approved initial value is one administrator only: `yoshihisa.hagisaka@atlib.jp`. Existing Staff OAuth supplies the actor. Missing or empty configuration fails closed. The address is release configuration, not application code. Configure it only under separate approval, after Migration 035 succeeds and before runtime Human Acceptance.

Do not route the new runtime before Migration 035 post-verification passes. Existing Production runtime remains compatible with the additive schema. There is no automatic down migration; Cloud Run rollback and Cloud SQL recovery remain separate decisions.
