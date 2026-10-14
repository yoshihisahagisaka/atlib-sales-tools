# IT経営KAIZEN Anonymous Survey KPI Implementation Contract v1

Status: IMPLEMENTATION DESIGN / NOT PRODUCTION APPROVAL
Date: 2026-10-14
Canonical reference: docs/it-management-lightweight-sales-common-kpi-decision-20261014.md on docs/lightweight-sales-kpi-decision-20261014; Common KPI Foundation at 4d433028a354f8a3c468c62d4308e6a0f7a37a29.

## Goal
Measure anonymous survey STARTED and COMPLETED independently of personally identifiable applicant registration, then display service-owned KPI counts and period-volume ratios on the read-only Sales Tools information page. No link from anonymous survey identity to company/contact/Case, and no double input.

## Existing source verified at main d35581c
- public/it-management-kaizen/free-diagnosis/app.js: start-questions click transitions to questions; successful saveAnswer on last question transitions to conversion; submitForm POSTs full answers and personal data only when applicant submits.
- src/routes/publicCustomerSelfFreeDiagnosis.ts: GET /survey-contract, POST /submissions; existing submission endpoint rate-limited and gated by publicIntakeEnabled.
- src/services/publicCustomerSelfSubmissionService.ts: successful applicant submission transaction creates Sales Activity, diagnosis Case, original survey snapshot and idempotency record.
- No independent anonymous start/completion event endpoint was observed in these inspected files.

## Event semantics
- SURVEY_STARTED: first valid user action on '事前アンケートを始める' that transitions into first question.
- SURVEY_COMPLETED: first successful saveAnswer on the final question that transitions to conversion screen.
- These are separate from APPLICATION_ACCEPTED, which comes only from the committed applicant submission / Case record.
- Client navigation backwards/forwards must not generate extra counts. Reload/retry of a single temporary anonymous survey should be idempotent within an agreed lifecycle.
- Count events, not unique real persons. Do not describe as distinct people or identity-level conversion.

## Minimal payload / privacy boundary
- event type: SURVEY_STARTED or SURVEY_COMPLETED
- opaque random survey-instance token (not company/contact/case ID; not reused as submission idempotency key)
- timestamp: server-generated occurred_at
- optional UTM source, medium, campaign, content, term captured from landing URL, only after privacy review
- no names, email, corporate number, answers, respondent role, contact details, IP-derived identity or applicant id
- exact event retention, token lifecycle (including refresh), bot filtering, attribution normalization and data minimization require approval before schema/API implementation.

## Invariants
1. One event of each type per anonymous survey instance (unique event_type + instance token), with server-side idempotency.
2. No user-visible blocking if telemetry fails; applicant submission must remain independent.
3. Count confirmed persisted events only, never client-local counters or page views.
4. No anonymous-to-applicant join; no retroactive reconstruction before instrumentation.
5. Anonymous event source not used as the accepted Case cohort.
6. Current month / trailing three calendar months / cumulative since measurement start; Asia/Tokyo reporting boundaries, common as-of timestamp.
7. Survey completion rate = period completed / period started; application ratio = period accepted applications / period completed. These are **period-volume ratios**, not true per-person conversion rates; may exceed 100%, especially across period boundaries. Denominator zero => em dash.
8. Service-owned read-only KPI summary endpoint; shared portal only renders data and labels. Independent panel errors are isolated.
9. Existing test-case exclusion applies to Case KPIs; anonymous events have no Case and cannot be retroactively classified as test by Case status. Explicit QA/test traffic exclusion policy required before production metrics.

## Proposed minimal delivery sequence (not yet authorized)
A. Approve privacy/retention and QA exclusion choices.
B. Add additive event persistence + narrow public ingestion route with payload validation, rate limits and idempotency; no respondent identity link.
C. Instrument start and completion UI transitions, preserving all current public survey and application behavior.
D. Service-owned read-only summary API returns metrics with window, asOf, coverageStart and data-quality states.
E. Contract/integration tests: start once, completion once, backwards, retries, reload, invalid event, telemetry outage, API auth, no PII, no duplicate application, time boundary, UTM capture.
F. Human Acceptance on non-production revision; coordinate migration/deploy with Business KAIZEN lane and obtain separate approvals.

## Separate pending scope
- Exact 'diagnosis performed' milestone requires source review and business definition; not automatically inferred from submission or booking.
- IT経営KAIZEN lightweight commercial ledger is a separate service-specific work package.
- 業務KAIZEN owns its own KPI source/API and portal link.
- No production migration, runtime deploy or traffic switch is approved by this contract.
