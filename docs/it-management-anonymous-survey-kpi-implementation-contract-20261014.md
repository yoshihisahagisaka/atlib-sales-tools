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

## Approved decision — 2026-10-14: authenticated test URL
Status: APPROVED DESIGN / NOT IMPLEMENTED

- Test entry URL: /it-management-kaizen/free-diagnosis/?test=1.
- This parameter is a **request for test mode**, not authority to mark an event or Case as test.
- Only an authenticated Sales Tools staff session may activate test mode; unauthenticated visitors are directed to staff login rather than silently using the public form.
- The server must verify the authenticated test context on each anonymous telemetry write and test-mode application submission. Never trust a client-supplied isTest flag, query parameter, or hidden UI control as authorization.
- Clearly display TEST MODE in the survey UI, while preserving the existing questions and workflow.
- Anonymous SURVEY_STARTED and SURVEY_COMPLETED events in authenticated test mode are stored with a server-validated test designation and excluded from normal KPI summaries.
- When a test-mode application is submitted, it must create a Case already marked is_internal_test=true using the existing Case test semantics; do not temporarily create a normal Case then asynchronously flip it. Reuse existing test designation/audit governance without creating a second source of truth. Any special creation/audit pathway requires explicit contract tests.
- Normal public submissions must remain unaffected. Do not allow a malicious or mistaken ?test=1 to exclude real customer events.
- The test-mode auth bridge, callback destination, cookie/CSRF handling, staff eligibility, and interaction with publicIntakeEnabled remain implementation Fit/Gap. Do not assume the existing public submissions endpoint is staff-authenticated.
- Test acceptance: unauthenticated test URL, authenticated test start/complete, forged test flag, session expiry, duplicate event, normal URL regression, test submission case designation, no leakage into normal marketing/KPI metrics.
- This approval does not authorize schema migration, code deploy or Production changes.

## Auth source Fit/Gap — 2026-10-14
Source inspected: src/routes/staffAuth.ts, src/middleware/staffAuth.ts, src/server.ts, src/config.ts at main d35581c.

### FIT
- Staff session is a verified HttpOnly staff_session cookie; production cookie Secure, SameSite=Lax, 24h max age.
- requireStaffAuth middleware already supports authenticated admin routes and returns 401 JSON for /api/* without session, redirects other protected pages to login.
- OAuth login/callback uses existing Google Workspace @atlib.jp identity verification, PKCE and OAuth state; no new identity provider or role framework is needed.
- Existing /admin static routes are staff-auth guarded and the public intake route is separate; reuse these boundaries.

### GAP and bounded resolution
- /auth/login accepts returnTo only when it begins /admin/. The requested public-path test URL /it-management-kaizen/free-diagnosis/?test=1 is therefore not a valid OAuth return destination. Do not relax the global returnTo allowlist to arbitrary paths or add an open redirect.
- Preferred narrow solution: add an authenticated **/admin/ test entry launcher** that verifies staff session and redirects internally to the requested test survey with a server-validated test context, while preserving the existing public route. Alternatively, allowlist only the exact test path with strict origin/path validation, after security review. Do not treat query test=1 as authentication.
- Existing public POST /api/public/it-management-kaizen/free-diagnosis-v1/submissions has publicIntakeEnabled and rate limiting but no staff authentication; it must not accept a client-only isTest flag as authoritative. A dedicated staff-protected test submission endpoint or equivalent server-validated branch is required, with is_internal_test=true in the same transaction.
- Telemetry ingestion must separate authenticated test events from public normal events on the server. Confirm test eligibility policy (all verified staff vs restricted test-case administrators), CSRF/origin, event token/idempotency and expiry before implementation.
- Login return path, 401/302 behavior, expiration, test mode visibility, forged flag, and ordinary public survey regression are mandatory acceptance tests.
- No existing auth code has been modified. No migration or Production deployment authorized.
