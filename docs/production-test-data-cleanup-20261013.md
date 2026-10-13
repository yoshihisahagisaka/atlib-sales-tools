# Production test data cleanup package — 2026-10-13

Phase 1 only. This package is **not authorization to execute Production cleanup**. It contains no migration and does not change normal runtime behavior.

## Fixed scope

The sole target source is `cleanup-manifests/production-test-data-cleanup-20261013.json`: one Historical V1 Case and fifteen VS1 Cases. Runtime selection by timestamp, company name, contact name, UTM, or wildcard is forbidden. The manifest remains `PREPARED_NOT_AUTHORIZED` even after an executive approval; authorization is supplied separately to the immutable Job execution and recorded in Cloud Audit Logs / Cloud Logging.

The Marketing Initiative `1a1f0d34-2ffa-421c-a375-a2a13e35bbcf`, migration ledger, all non-allowlisted Cases, other services and Production configuration are preserved.

## Governance decision

Design v2 Canonical defines immutability as protection from normal business mutation, while retention/deletion is a separate governance operation. The current application has no deletion endpoint or V2 deletion executor. Anonymization alone is insufficient because report/narrative JSON remains and the Sales Launcher/KPI dynamically count Sales Activity. `is_internal_test` alone is also insufficient because current list/KPI queries do not exclude it.

The package therefore performs complete graph deletion through a dedicated migration-owner Job. It temporarily disables only eight named immutability triggers, never `ALL`, inside the same transaction that performs the deletion. PostgreSQL transactional DDL guarantees rollback restores trigger state. The runner re-enables every trigger before commit and the post-verifier requires all eight to be enabled. Normal application roles, schema, triggers and APIs are not permanently changed.

Safer-looking alternatives were rejected:

- Permanently weaken triggers: violates normal immutability.
- Add a broad trigger bypass flag: creates a reusable Production escape hatch.
- Hide/anonymize only: leaves source content and inflates KPI.
- Manual SQL: lacks immutable scope, assertions, double-run protection and evidence.

## Execution contract

Before a separately approved execution:

1. Build an immutable image from a clean reviewed SHA using `buildProductionTestDataCleanupArtifact.cjs`.
2. Run `preflightProductionTestDataCleanup.cjs` through the established Production migration connection. It uses `BEGIN READ ONLY` and verifies PostgreSQL 16, migrations 027–034 exactly once, no 035+, exact Case/count topology, no shared Company/Contact/Activity/Organization, no retention hold/deletion request/unsupported artifact, and the preserved initiative.
3. Confirm Cloud SQL automated backup and PITR; record their verification timestamps. Record a separate approval ID, approver and executor.
4. Describe the dedicated Job: immutable digest, task 1, parallelism 1, retries 0, 600-second timeout, migration service account/role, Cloud SQL socket and Secret Manager reference. Job creation and execution each require separate approval. The checked-in template deliberately has `CLEANUP_EXECUTION_AUTHORIZED=false` and placeholders.

At execution the runner:

- verifies the manifest SHA supplied by the approval;
- requires `sales_tools_migration` and takes advisory transaction lock `731013183706`;
- uses `SERIALIZABLE`, `lock_timeout=5s`, `statement_timeout=120s`;
- re-runs all preconditions under the lock;
- disables only the named triggers and deletes children before parents;
- asserts all target Cases are absent, the initiative remains, and ledger is unchanged;
- re-enables triggers and commits once;
- emits a structured evidence event containing manifest hash, approval/executor identities, backup/PITR timestamps, before counts and deleted counts. It never logs customer content, contact details, secrets or report text.

Any mismatch, lock wait, SQL error or assertion rolls back the whole transaction. Cloud Run Job retry is zero. A second execution fails because all sixteen required Cases must exist with the exact preflight counts.

## Lock and recovery

The named `ALTER TABLE ... DISABLE/ENABLE TRIGGER` statements acquire short `ACCESS EXCLUSIVE` locks. Schedule a maintenance window; the five-second lock timeout fails closed rather than waiting behind live traffic. Expected transaction time is seconds for the reviewed counts, with a hard 120-second statement timeout.

On failure or unknown Job status: do not retry. Inspect Job execution, structured event, target Case presence and ledger read-only. A rolled-back transaction requires no trigger repair. If commit is confirmed but post-verification fails, keep evidence, stop application writes if required, and request a separate Cloud SQL PITR/restore decision. There is no automatic down operation.

## Post-verification

Run `verifyProductionTestDataCleanup.cjs` read-only and confirm:

- all 16 target Cases and their graph are absent;
- the preserved initiative exists and exact UTM KPI is 0;
- all eight normal immutability triggers are enabled;
- migrations 027–034 remain exactly once and no 035+ exists;
- preflight-recorded non-target totals are unchanged;
- Sales Launcher no longer returns the target activities.

Production execution, Job creation, image build/push, DB writes and traffic changes are outside Phase 1.
