# Controlled Pilot Policy Closure — Branch Status

2026-09-14. **NO-GO — EXTERNAL EVIDENCE / REMAINING CLASSIFICATION CLOSURE REMAINS.**

## Verified baseline and SSOT

- Branch: `feat/controlled-pilot-policy-closure`.
- PR #2: OPEN / DRAFT, base `main`. No merge/deployment performed.
- Implementation code head validated by CI: `1d8158da6636ebcfca4487e91822bdfebc362eff`.
- Full CI run `34766054643`: **SUCCESS**.
- SSOT: `git_KAIZEN` `dev/controlled-pilot-closure-v2`, docs/66–70.
- Business Canonical: `docs/66-customer-data-ai-continuity-business-policy-v1.md`.

## Fit / Gap

| Slice | Verified fit | Remaining status |
|---|---|---|
| A | Acknowledgement, atomic WEB creation, separate Transcript consent/DB guard | Technical PASS; approved Legal/Privacy copy/link and deployed enablement BLOCKED_EXTERNAL |
| B | Human deletion scope/decision, Transcript purpose completion, Holds, retention preview, Human-approved anonymization worker | Major execution path PASS; Approved Evidence 5-year destructive semantics and ambiguous application/customer identifiers remain fail-closed / classification OPEN |
| C | External-manifest replay foundation; ANONYMIZE replay; RESTRICT_RETAIN non-destructive provenance | Application PASS; durable external export/storage and real Cloud SQL restore BLOCKED_EXTERNAL |
| D | AI-01–04 authority boundaries; AI-02/03 Transcript default-deny | Application PASS; real provider + provider retention/privacy BLOCKED_EXTERNAL |
| E | Existing Human Gates; CI with real PostgreSQL + browser | Five-block management view, Pilot Evidence Capture, A–F acceptance and real staging E2E OPEN/BLOCKED_EXTERNAL |

## Retention / Deletion execution added

A `RetentionDeletionWorker` now executes only an already Human-approved `diagnosis_deletion_requests` record. It does not create, approve or widen deletion scope.

Current exact destructive mapping is deliberately limited to data whose semantics are already clear:

- `GENERAL_RAW_DIAGNOSIS`
  - `survey_responses.raw_value_json` → JSON null while preserving row/id/reference integrity.
  - non-Transcript `source_records` raw content → `[REDACTED]`; speaker/external raw references removed.
  - `participants` contact identity → irreversible application-level pseudonymous replacement (`削除済み`, non-routable unique email, phone/job title removed) while preserving relational IDs.
- `TRANSCRIPT_RECORDING`
  - Transcript `source_records` raw content → `[REDACTED]` with identifying source fields cleared.
- `RAW_AI_IO`
  - `ai_executions.input_snapshot_json` → `{}` and `raw_output_json` → NULL while preserving provider/model/status/run metadata needed for accountability.
- `APPROVED_DECISION_EVIDENCE`
  - **not destructively modified by this worker**. It is fail-safe `RESTRICT_RETAIN` because the Business Policy assigns Approved Report / Handoff / Decision / Audit a separate 5-year accountability purpose.

Active Retention Holds override destructive execution for the held data class. Human-specified restricted-retention classes also override destructive execution. The request completes as `PARTIALLY_RETAINED` when any scoped class is retained.

Execution is transactionally audited and idempotent. A completed request cannot be executed twice as a second destructive event.

An explicit operator CLI was added. Execution requires Case ID, approved request ID, actor ID and the literal confirmation `EXECUTE_APPROVED_DELETION`. It does not print customer raw content or stack traces.

## Retention clock handling

Policy-expiry preview uses PostgreSQL calendar intervals rather than fixed-day approximations:

- General Raw: Case Close + `interval '1 year'`.
- Raw AI I/O: Case Close + `interval '90 days'`.
- Approved Decision Evidence: Case Close + `interval '5 years'`.
- Transcript: each `purpose_completed_at + interval '90 days'`.

This preview does not automatically authorize destruction. Controlled Pilot execution remains Human-controlled.

## Restore consistency

Every anonymized target writes a durable deletion tombstone. Restore reconciliation can replay the ANONYMIZE action idempotently after an older backup restores raw data.

`RESTRICT_RETAIN` tombstones are now treated as non-destructive provenance during VERIFY/APPLY and do not fail reconciliation simply because they are class-level retention decisions rather than a physical erase target.

Physical row `DELETE` remains fail-closed. The current approach intentionally favors tested field anonymization that preserves referential/provenance IDs rather than deleting relational rows without complete dependency semantics.

## Validation evidence

Latest full GitHub Actions run: `34766054643` at code head `1d8158da6636ebcfca4487e91822bdfebc362eff` — **SUCCESS**.

Successful steps:
- npm ci / TypeScript build.
- diagnosis / preparation / workspace / review / report / handoff suites.
- readiness security suite.
- policy closure suite.
- restore / AI closure suite.
- new retention-deletion Golden suite.
- real PostgreSQL 17 readiness suite.
- Chromium desktop/mobile browser suite.

The retention-deletion suite verifies:
- non-approved request rejection.
- approved request execution only.
- General Raw + Transcript anonymization while preserving IDs.
- Approved Decision Evidence restricted retention.
- active Hold precedence.
- Human execution audit.
- idempotent replay of an already completed request.
- calendar retention intervals.
- deletion-reconciliation VERIFY remains successful in the presence of `RESTRICT_RETAIN` provenance.

Existing real AI checks remain opt-in / not executed in CI and are **not** counted as provider evidence.

## Important remaining classification boundary

Do not widen destructive mapping by guesswork.

The current worker does not claim that every customer-associated field is already classified. In particular, customer/application identifiers or derived records whose status between Raw and Approved Decision Evidence is not explicit must remain unchanged until their classification and retention purpose are confirmed. This is a deliberate FACT FIRST / fail-closed boundary, not a hidden workaround.

Likewise, the 5-year Approved Report / Handoff / Decision / Audit expiry execution path requires exact table-level semantics before any destructive action is enabled.

## Remaining Critical Path

1. **B remaining classification:** close exact handling for ambiguous customer/application identifiers and the 5-year Approved Decision Evidence expiry path; keep fail-closed until reviewed.
2. **C external continuity:** durable external reconciliation-manifest export/storage with access/integrity/completeness controls; isolated Cloud SQL backup/PITR/restore/reconciliation/smoke; measure internal RPO/RTO <=24h and verify 30-day backup retention.
3. **D / platform:** real Anthropic AI-01–04 plus provider retention/privacy evidence; Secret Manager/IAM; real Google allowed/disallowed OAuth; Cloud Run worker/scale/lease; proxy/rate-limit; Monitoring alert delivery; deployed Node runtime; remaining moderate dependency review.
4. **E / Business operation:** Legal/Privacy-approved customer copy/link; named operational owners; five-block Management Feedback translation; minimal Pilot Evidence Capture; docs/65 A–F execution; real WEB + SALES_VISIT staging E2E.
5. Re-run `docs/32` Production Readiness Gate using current external evidence and return Controlled Customer Pilot GO / CONDITIONAL GO / NO-GO.

## Current Gate

Controlled Customer Pilot: **NO-GO — EXTERNAL / OPERATIONAL CLOSURE REMAINS**.

Business Decision BD-01〜05: **RESOLVED**.
Human-approved Raw/Transcript/AI deletion/anonymization execution: **IMPLEMENTED / CI PASS**.
Approved Decision Evidence 5-year destructive execution: **FAIL-CLOSED / OPEN**.
External Cloud / Provider evidence: **OPEN**.

No new FACT Core Object, no AI authority, no automatic atLIB Actor selection, no external 24h SLA promise, and no main merge were introduced.

Development implementation PASS ≠ Controlled Customer Pilot GO.
