# Test Case Designation Audit Runtime ACL Correction (Migration 036)

## Decision

Use a numbered additive Migration 036, not an untracked one-time privilege Job. The correction is part of the reproducible database state, must be recorded exactly once in `schema_migrations`, and must be applied by the established immutable migration artifact and Cloud Run Job process. Migration 035 remains byte-for-byte unchanged.

The correction is deliberately limited to `it_management_diagnosis_test_case_designation_audit`:

```sql
REVOKE UPDATE, DELETE
ON TABLE it_management_diagnosis_test_case_designation_audit
FROM sales_tools_app;
```

The canonical runtime contract for this append-only table is SELECT and INSERT only. Its enabled append-only trigger remains defense in depth; it is not a substitute for least privilege. The migration owner retains administrative control.

## Why the explicit REVOKE is required

Production historically applied the environment-aware Migration 018 represented by commits `c275141f327904c4c570fde8f67b9287697b5bbc` and `f486f9e47058346b6381d3df122cc62046f78774`. It established default table privileges SELECT, INSERT, UPDATE, and DELETE from owner `sales_tools_migration` to `sales_tools_app`. The normalized Migration 018 currently present on main does not reproduce that historical environment state. Migration 035 granted SELECT and INSERT but a GRANT does not remove privileges inherited from the Production default ACL, so UPDATE and DELETE remained effective.

Rehearsal baselines for append-only tables must therefore reproduce the Production default ACL before applying their creation migration. Future append-only migrations must explicitly revoke UPDATE and DELETE after creation/grants and verify effective privileges, rather than assuming a narrow GRANT narrows an existing ACL. Changing global default privileges is outside this package because mutable application tables may rely on them.

## Fixed source identity

- Source commit containing the immutable SQL: `1fc6acbdddfa54ba0f3eb06f3ae51ca4a0b79c03`
- SQL: `036_test_case_designation_audit_runtime_acl.sql`
- Git blob: `9fb00371108f77a30b4f3e3053000034228829dd`
- Bytes: `204`
- SHA-256: `4cd771dbc4909fb34253ad30164c836c6aa77fa15303db46bff3bf33d9fac597`
- Manifest: `migration-allowlists/production-test-case-audit-acl-036.json`

## Gates and execution order

1. Build and test the application at a clean reviewed descendant of the fixed source commit.
2. Build a 036-only context with `buildTestCaseAuditAclReleaseArtifact.cjs`; reject any other SQL or byte mismatch.
3. Rehearse on isolated PostgreSQL 16 with the Production Migration 018 default ACL reproduced. Verify rollback and a safe second migration run (ledger skip).
4. Run the dedicated read-only preflight. It requires Migration 035 exactly once, 036 absent, no 037+, correct owner and trigger, current Production CRUD ACL on the target, and the historical default ACL. Any mismatch stops the release.
5. Under separate explicit approval, create/inspect the dedicated Job from `sales-tools-prod-test-case-audit-acl-036.yaml`, pin its immutable digest, and execute it once only.
6. Run the read-only post-verifier. It requires 027–036 exactly once, no 037+, SELECT/INSERT present, UPDATE/DELETE absent, and the trigger enabled.

Unknown Job state must be resolved from execution history and the migration ledger. Never rerun speculatively. Production REVOKE, Job execution, runtime deploy, traffic, secrets, and unrelated table ACLs are not authorized by this preparation package.
