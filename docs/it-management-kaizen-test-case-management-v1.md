# IT経営KAIZEN テスト案件管理 v1

## Scope and Fit/Gap

The existing `it_management_diagnosis_case_v2.is_internal_test` flag is reused as the current designation state. It must not be set by Public Customer Self or Staff Proxy entry; both continue to create normal cases. Migration 035 adds an append-only designation audit because the existing boolean cannot record actor, time, reason, or release history.

Marketing Initiative continues to match Sales Activity from the five UTM fields. Its six normal KPIs exclude a Case while `is_internal_test=true`; releasing the designation restores it dynamically without rewriting Sales Activity or attribution.

The one-time Production Cleanup package is reusable as the dependency and lock reference, but it is not a safe runtime delete API. It requires a migration-owner Job, temporary handling of named append-only triggers, a fixed reviewed manifest, independent approval, backup/PITR evidence, and a post-verifier. The runtime role intentionally cannot perform those operations. Therefore v1 implements designation/release and KPI exclusion only. No delete endpoint or self-approval path is added.

## Authorization and audit

`TEST_CASE_ADMIN_EMAILS` is a comma-separated, lower-case-normalized allowlist. Empty or absent values fail closed. Every mutation also requires staff authentication, a same-origin `Origin` header, exact Case ID/company/received-at confirmation, and a 5–1000 character reason. The server derives the actor from the signed staff session.

The audit table `it_management_diagnosis_test_case_designation_audit` is append-only and records `DESIGNATED` or `RELEASED`, actor, reason, and server timestamp. Case status and entry channel are unchanged.

## Deletion gate

Deleting a designated test Case requires a later, independent package that:

1. exports the exact designated Case and related-ID graph into an immutable manifest;
2. proves no shared Company, Contact, Sales Activity, retention hold, or deletion-request conflict;
3. records a separate approver and executor (self-approval is forbidden);
4. rehearses against PostgreSQL 16, including locks, rollback, trigger restoration, and rerun rejection;
5. runs as a one-use migration-owner Job with backup/PITR evidence and a read-only post-verifier.

Designation alone is never deletion authorization.

## Production release sequence

1. Source review migration 035 and runtime changes.
2. Build a 035-only immutable migration artifact and rehearse on PostgreSQL 16.
3. Run Production read-only preflight; apply migration 035 once; run post-verifier.
4. Configure `TEST_CASE_ADMIN_EMAILS` through the approved Cloud Run environment-change process.
5. Build the runtime from the resulting canonical SHA and deploy at 0% traffic.
6. Verify staff authorization, same-origin rejection, designation/release, KPI exclusion/restoration, and existing Product regressions using non-Production data.
7. Obtain separate traffic approval. Runtime deletion remains unavailable.
