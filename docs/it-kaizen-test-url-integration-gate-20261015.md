# IT経営KAIZEN — Test URL and KPI integration gate
Date: 2026-10-15
Status: FIT/GAP RESOLUTION PLAN; NO PRODUCTION APPROVAL
Source branch: feat/it-anonymous-survey-kpi-vs1-20261014

## Canonical decisions preserved
- Test entry is the fixed public questionnaire URL with ?test=1, followed by existing staff authentication.
- Repeated survey starts/completions count as repeated valid use; KPI persists aggregate month x initiative counts only.
- Staff tests do not enter normal KPI.
- Test Case is created with is_internal_test=true from creation, with staff actor and append-only designation audit.
- No new general CRM, identity tracking, or event ledger.

## Schema review
- Migration 031 requires real customer consent provenance CUSTOMER_SELF. It must not be reused to assert staff simulated customer consent.
- Migration 033 allows original survey entry_channel CUSTOMER_SELF or STAFF_PROXY; a simulated customer-self UI must carry a separate, explicit staff-test marker, not be reported as a genuine customer-self response.
- Migration 035 provides append-only test designation audit; Migration 036 addresses runtime permissions.
- Draft SQL exists for the separate test receipt and monthly numeric counters. Both are unnumbered and not deployed.

## Minimal integration order
1. Confirm Business KAIZEN migration/deploy coordination and reserve a non-conflicting number.
2. Rehearse additive test receipt and monthly counter migrations on disposable PostgreSQL; explicitly verify runtime grants.
3. Extend the trusted test service to write test receipt, Case and audit in one transaction without writing a CUSTOMER_SELF consent row. Preserve original survey answers as simulated and audit the staff actor.
4. Coordinate public/test idempotency locks across both paths before either receipt is written.
5. Mount admin-authenticated test endpoint with TEST_CASE_ADMIN_EMAILS allowlist, and public count endpoint with existing limiter.
6. Complete the /admin/ launcher roundtrip for ?test=1; never treat the query parameter as authorization.
7. Run build, unit tests, database concurrency tests, browser E2E, public-flow regression, test KPI exclusion and staging smoke.
8. Require explicit release approval before Production migration/deploy.

## Explicit unresolved contract choice
A separate staff-test receipt is proposed to avoid falsifying real customer consent, but the exact Design v2 snapshot provenance representation and downstream reporting behavior still require approval. Do not change entry_channel or consent schema speculatively.

## Verification baseline
GitHub Actions run 38673377139 passed at SHA f51a10fdfa31b8a2d0978f86f8aa3009ea5200d3. Later checkpoint-only commit is not itself an additional CI validation.
