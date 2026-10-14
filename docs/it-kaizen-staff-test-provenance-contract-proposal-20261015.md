# IT経営KAIZEN — authenticated test submission provenance contract (proposal)
Date: 2026-10-15
Status: DESIGN PROPOSAL, NOT APPROVED FOR MIGRATION OR RELEASE

## Fixed decisions
- The entry remains /it-management-kaizen/free-diagnosis/?test=1 with existing staff authentication.
- Only the existing TEST_CASE_ADMIN_EMAILS allowlist may create a test Case.
- Same public questionnaire and application interaction; test survey starts/completions never affect normal KPI.
- Test Case is created with is_internal_test=true in the same transaction, with actor and designation audit.
- Public customer self-submission remains unchanged.

## Existing schema constraints
- Migration 031 it_management_public_self_submission requires privacy_consent=true, diagnosis_use_consent=true and consent_provenance='CUSTOMER_SELF'.
- Migration 033 original survey supports entry_channel CUSTOMER_SELF or STAFF_PROXY.
- Migration 035 test designation audit is append-only. These are independent facts; test designation does not establish real customer consent.

## Minimal safe proposed model
Do not weaken or overload the customer consent table. Introduce a **separate staff-test submission receipt** for test-mode end-to-end applications, keyed by idempotency UUID and referencing its test Case, with payload hash, authenticated actor, created timestamp and a fixed STAFF_TEST_SIMULATION provenance marker. Do not store customer-consent booleans on this receipt.
- The Design v2 survey snapshot may use CUSTOMER_SELF only to describe the **questionnaire UI being simulated**, but its audit must explicitly state simulation=true and actor, not claim that a real customer answered. If current reporting treats entry_channel=CUSTOMER_SELF as proof of actual customer provenance, introduce an explicit test-simulation channel in a reviewed additive migration instead.
- Public and test receipts must share a coordinated idempotency collision guard. Existing public receipt lookup alone is insufficient if test receipts are stored separately.
- Preserve the existing normal Case/Lead KPI exclusion on is_internal_test. Never infer test from the URL query parameter alone.
- Add dedicated authenticated route behind existing adminAuthGate and allowlist, with no client-controlled test designation.
- Existing authenticated /admin/ launcher must return to the fixed test URL only with a server-verifiable session context. Do not relax global OAuth returnTo.

## Acceptance before activation
- Public application and customer consent unaffected.
- Staff test submission creates Case and test receipt atomically; no false customer consent row.
- Idempotent retries, simultaneous POSTs, cross-mode key collision, rollback, and audit failure.
- Staff not on allowlist gets 403, unauthenticated gets login/401.
- Test starts/completions and applications excluded from normal KPIs; no mistaken customer-facing notification.
- No existing Production migration number assumed; coordinate with Business KAIZEN.

## Release state
The current branch's submitWithTrustedContext STAFF_TEST path remains explicitly disabled by STAFF_TEST_PROVENANCE_NOT_IMPLEMENTED. This document is a proposal, not permission to enable it.
