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

## Implementation checkpoint — 2026-10-14
Status: PARTIAL CODE IMPLEMENTED / NOT INTEGRATED / TESTS NOT EXECUTED

- Added src/domain/anonymousSurveyKpi.ts: pure JST reporting windows, per-window event counts with test exclusion and anonymous instance deduplication, period volume ratio with null on zero denominator.
- Added src/domain/anonymousSurveyEventContract.ts: strict input validation, no applicant identity or answers, and trusted server-side PUBLIC / STAFF_TEST designation.
- Added test/anonymousSurveyKpi.golden.test.ts and test/anonymousSurveyEventContract.test.ts: source tests written, not yet executed in a fully installed repository.
- No route, migration, database write, public survey UI instrumentation, test-mode login bridge, or summary API has been implemented. A caller cannot yet record events in Production.
- The event contract is a code-level validation boundary, **not** a completed privacy guarantee: UTM values require sanitization/data minimization review and the ingestion route must separately apply rate limiting, same-origin/CSRF policy, staff authentication and bot/test treatment.
- Before event persistence: approve raw event retention and deletion, anonymous token lifetime, QA traffic exclusion, and migration sequencing with the Business KAIZEN lane. No Production change authorization is implied.

## Implementation review — 2026-10-14: reporting coverage and retention dependency
Status: CODE ADJUSTED / TESTS WRITTEN BUT NOT EXECUTED / PERSISTENCE BLOCKED ON DECISION

- Fixed src/domain/anonymousSurveyKpi.ts so current-month and trailing-three-month windows cannot begin before a metric's instrumentation coverageStart. The previous implementation labeled the calendar window even when early days were unmeasured.
- Added a regression test for instrumentation starting mid-month. The shared information page must visibly label incomplete coverage rather than present partial data as a full-month trend.
- **Retention design dependency:** a one-year raw-event retention proposal and a cumulative KPI are not simultaneously sufficient without a retained aggregate or other approved long-term count source. Deleting raw events after one year would cause cumulative figures to shrink. Before any migration, choose and approve the raw retention duration, long-lived aggregate policy (including whether counts are keyed by month and UTM), and retention/deletion mechanism. No retention choice is implied by this code.
- For cumulative rates, disclose each metric's measurement start and ensure numerator/denominator coverage is comparable; otherwise show unavailable/partial coverage rather than a misleading rate.
- Existing Case test designation cannot retroactively classify anonymous pre-application events. The approved authenticated test URL remains the source of server-validated anonymous test designation.
- No API, DB schema, migration or production deployment is created by this checkpoint.

## Superseding Decision — 2026-10-14: monthly numeric counters only
Status: APPROVED BUSINESS DESIGN / IMPLEMENTATION PENDING
This section takes precedence over earlier proposals in this document requiring a durable per-survey anonymous event ledger, one-year raw-event retention, or persistent survey-instance identifiers.

- The sole long-lived KPI source for pre-application survey activity is **aggregated numeric counts**, not individual event records: calendar month, service, marketing initiative / attribution bucket, survey started count, survey completed count.
- Increment counts at the existing start-questions and successful final-answer transitions. No identity link to a company, contact, Case, or later application. Do not persist survey answers as part of KPI counting.
- The existing application, diagnosis, commercial and test-Case KPIs remain service-owned and use their own canonical sources and retention policies.
- Staff-authenticated test URL ?test=1 must not increment normal counts. Test traffic may be excluded from the normal aggregate without creating a second customer/test-Case system.
- Keep counts over fiscal years; atLIB fiscal year runs February 1 to January 31. Rates and prior-year comparisons derive from stored period counts; do not average monthly rates.
- Duplicate requests and abuse controls are **technical ingestion concerns**, not additional business KPI objects. Reuse existing security infrastructure where applicable; ensure atomic increment and acceptable counting semantics without a long-lived event ledger. Do not claim that existing submission rate limiting already protects a new telemetry endpoint.
- Detailed technical safeguards (retry handling, token lifetime if needed, rate limiting, concurrency, CSRF, monitoring) remain implementation decisions, not permission to expand the data model.
- Month-end reconciliation and retention of aggregated numeric counts must be deterministic and non-destructive.
- Prior code src/domain/anonymousSurveyEventContract.ts and countAnonymousEvents helper were built against the now-superseded event-ledger concept. They are not approved persistence architecture and must be reviewed/replaced before merging.
- No migration, deployment or Production traffic change is authorized by this decision.

## Approved clarification — 2026-10-14: attempts, not unique persons
Status: APPROVED / IMPLEMENTATION PENDING
- The business metric is **アンケート開始回数** and **アンケート完了回数**, not unique respondent count.
- The same person intentionally starting and completing another new survey attempt counts again; that is a valid use, not a duplicate to be deduplicated by identity.
- Count a deliberate start-button transition as one start and the first successful final-answer completion within that attempt as one completion. Returning to revise answers in the same attempt is not another completion; an explicitly new attempt may count again.
- No persistent anonymous respondent identity, person-level deduplication, applicant linkage or long-lived event ledger is required. Store monthly numeric counters by service and attribution bucket; exclude server-authenticated test mode from normal counts.
- Technical HTTP retry/abuse protection is distinct from business-level person deduplication and must not change the approved metric semantics. Earlier contract/code language requiring a unique person or one count per long-lived survey-instance identity is superseded.
- Display conversion ratios as period-volume reference ratios, not individual conversion probabilities.

## Approved security reuse — 2026-10-14
Status: APPROVED / IMPLEMENTATION PENDING
- For the new survey STARTED / COMPLETED counting API, reuse the existing src/middleware/rateLimit.ts createIpRateLimiter and its IP-based fixed-window, in-memory approach. Do not introduce CAPTCHA, a new bot product, unique-person detection, or a durable per-attempt event ledger solely for KPI.
- Existing public submission route currently uses 5 requests/hour/IP, but that limit is specific to the submission endpoint. Choose and test a telemetry-appropriate threshold separately because one ordinary survey attempt makes at least two telemetry calls. The **middleware implementation** is approved for reuse, not an unreviewed copy of its numerical threshold.
- A request blocked with HTTP 429 or failing payload validation must not increment counters. Valid accepted requests increment atomic monthly/service/initiative started or completed counters. Multiple intentional attempts count as multiple uses.
- Existing limiter's in-memory counters are per Cloud Run instance and do not provide a global distributed guarantee; this is an accepted limitation of reusing the current lightweight approach. Do not claim comprehensive bot prevention.
- Confirm route-specific limiter attachment, trust proxy handling, publicIntakeEnabled applicability, staff test authentication, and no regression to the existing /submissions endpoint before release.
- This approval does not authorize Production schema changes or deploy.

## Business rationale confirmed — 2026-10-14: repeated use is meaningful
Status: APPROVED / IMPLEMENTATION PENDING
- A person may try the questionnaire, defer the application, and return days or weeks later to try it again before eventually applying. These are meaningful separate usage actions, not necessarily duplicate or abusive traffic.
- KPI measures accepted **start actions and completed attempts**, not distinct people. Do not suppress later valid attempts by IP, browser identity or long-lived token.
- The existing IP fixed-window limiter is a technical safeguard against bursts, not a business-level uniqueness rule. Accepted valid counting requests increment monthly totals; rejected requests do not.
- A browser navigating backward within the same attempt and re-displaying the completion screen is not a new completed attempt. Starting a genuinely new attempt counts again.
- No respondent identity, applicant linkage, survey answers or persistent per-attempt event ledger in the KPI storage. The authoritative business data is aggregated counts.
- The previous deduplication-oriented event-domain code is exploratory and **not** the approved counter implementation. Remove or replace it before production integration, rather than silently shipping a contradictory architecture.

## Implementation checkpoint — 2026-10-14: aggregate-only counter domain
Status: PARTIAL CODE / NOT INTEGRATED / TESTS NOT EXECUTED
- Added src/domain/surveyMonthlyCounter.ts: server-side JST year-month, STARTED/COMPLETED counter mapping, normal/test decision boundary, aggregate-only count combination.
- Added test/surveyMonthlyCounter.golden.test.ts: JST month rollover, limiter/test behavior, distinct counter kinds, aggregate counts.
- No event persistence, survey-instance identity, personal data or respondent linkage in the new counter contract.
- Prior src/domain/anonymousSurveyEventContract.ts and test remain in branch as superseded experimental code; they must be removed or excluded before merge. They do not authorize an event ledger.
- Still missing: schema with atomic upsert, attribution normalization, route with existing limiter and authenticated staff test path, public UI transitions, summary API, automated test execution, migration conflict check with Business KAIZEN.
- No Production changes.
