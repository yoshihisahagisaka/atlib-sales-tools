# Business KAIZEN Package D1 source evidence (2026-11-23)

## Baselines

- Package D1 base: PR #87 HEAD `13d281e01dc749630b66be9e14bd673cb6f846c0`.
- Package A persistence and initial SELF `ACCEPTED`: PR #78 lineage.
- Package B1/B2 diagnosis and Staff Proxy: PR #80/#82 lineage.
- Package C1/C2 read APIs and UI: PR #86/#87 lineage.
- Business KAIZEN Implementation Contract v1: previously supplied source referenced by the Package B1–C2 evidence records.
- Production ACL evidence: `docs/production-release-test-case-audit-acl-036.md`; Production-like default CRUD ACL must be reproduced before testing explicit UPDATE/DELETE revocation.

## Confirmed semantics

- Stage, schedule, and Outcome changes are explicit Staff operations. Diagnosis draft/save/complete does not create `ACCEPTED` for Staff Proxy.
- A Stage change writes one current value and one append-only history row in the same transaction. Repeating the current Stage writes neither.
- `scheduled_at` is the planned meeting start and is not copied to `SCHEDULED.reached_at`.
- `closed_at` records the first non-NULL Outcome confirmation and is not inferred from existing timestamps or overwritten by later Outcome changes.
- Commercial Events are explicit facts independent of Stage and Outcome. No mapping, automatic creation, or forced transition is implemented.
- Unknown proposal/award amounts remain SQL `NULL`, never zero.
- Commercial idempotency uses an explicit UUID key and a payload hash. Same-key/same-payload replay returns the existing row; changed reuse returns 409.

## Protection evidence

- Stage History, Diagnosis Audit, and Commercial Events are append-only through triggers and explicit runtime/app UPDATE/DELETE revocation.
- The isolated PostgreSQL 16 test recreates the historical Production default table CRUD ACL before applying the unnumbered draft, then verifies effective privileges and actual denied writes under `sales_tools_app`.
- Audit metadata contains only operation deltas, revisions, consent/event identifiers, actor, and actual operation time. Answers and Snapshot are not duplicated.

## Release boundary

- SQL remains `UNNUMBERED`; no Production migration number is assigned or applied.
- No common CRM, IT KAIZEN Case, Public Lead, diagnosis calculation, UI, deploy, traffic, DNS, or merge change is included.
