# IT経営KAIZEN Survey Monthly Counter — Implementation Checkpoint

Status: PARTIAL IMPLEMENTATION / NO MIGRATION EXECUTED / NO API WIRED
Branch: feat/it-anonymous-survey-kpi-vs1-20261014

## Decisions preserved
- Repeated human survey attempts count again; this is usage frequency, not unique persons.
- Long-lived source is month x IT_KAIZEN x resolved initiative/unmatched x started/completed counts.
- Existing Marketing Initiative v1 exact five-UTM matching is reused. Resolve initiative on acceptance, not retroactively from later active status.
- Existing IP rate limiter is reused at the future public counting route. Valid accepted operations count; staff-authenticated test mode does not affect normal counters.
- Shared Sales Tools information page remains read-only; atLIB fiscal year starts February 1.

## Current files
- docs/sql/it-kaizen-survey-monthly-counter-schema-draft.sql — UNNUMBERED SQL DESIGN ONLY. Not deployable.
- src/services/surveyMonthlyCounterRepo.ts — atomic INSERT ON CONFLICT increment and month reads. Not instantiated or exposed.
- src/domain/surveyMonthlyCounter.ts and src/domain/surveyCounterAttribution.ts — pure helpers.
- Corresponding golden tests are written but not executed.

## Pending gates
1. Coordinate migration number and release timing with the Business KAIZEN lane; compare both latest branch heads to main. Preserve historical ACL lessons from 018/036.
2. Review attribution behavior for inactive initiatives and unmatched UTM. Preserve historical attribution; no accidental remapping.
3. Implement public counting endpoint with existing limiter, payload validation and no PII. Confirm trusted staff test route and publicIntakeEnabled semantics.
4. Instrument actual questionnaire start/final-completion transitions, without impacting application submission. Do not count mere page loads or back-navigation as new attempts.
5. Verify tests and PostgreSQL rehearsal; check count concurrency, error handling, permissions, normal/test exclusion, JST month boundaries and year-over-year rollups.
6. Agree the monthly aggregation and deletion/retention lifecycle. No raw per-attempt ledger.
7. Obtain explicit release approval before Production migration, deploy or traffic change.

## Known limitation
No new count is being recorded in Production yet. The schema draft is not an approved migration. Earlier experimental anonymous-event code remains on branch and must be removed or excluded before merging.

## Checkpoint 2026-10-14 — isolated ingestion route, not mounted
- Added SurveyMonthlyCounterRepo.resolveInitiativeId using existing Marketing Initiative v1 service_key + exact UTM5 equality, active-only lookup at acceptance time. Historical counters retain the resolved initiative_id after deactivation.
- Added src/routes/publicSurveyCounter.ts with strict body schema (kind + optional UTM5 only), publicIntakeEnabled guard, reused createIpRateLimiter, and 204 on successful atomic increment. Test flags are not accepted as public authority. The route is **not mounted in server.ts**; no Production ingestion is active.
- Current route's maxRequestsPerHour=60 is a provisional implementation parameter, not an approved security threshold. Existing submissions retain their separate 5/hour/IP limit. Before mounting, run traffic and security acceptance tests and confirm the threshold.
- Staff test-mode entry and authenticated route are still missing. The current route only covers normal traffic and cannot authorize a test.
- Counter schema remains a non-numbered draft. No DB migration applied, no API wired, no UI instrumented, no automated tests run. Do not merge/release as a complete feature.
- Technical follow-up: verify PostgreSQL privileges and concurrency; make sure failed telemetry does not block questionnaire flow; ensure app startup does not depend on the uncreated table; ensure full source/UTM validation and rate limiter order.

## Checkpoint — 2026-10-14: browser instrumentation (branch only)
- Modified public/it-management-kaizen/free-diagnosis/app.js on the isolated branch. STARTED fires on the valid start-button transition; COMPLETED fires on the first successful final-question transition. Back-navigation in the same page instance does not recount completion. A fresh page attempt may count again; there is no persistent person deduplication.
- Counting uses a non-blocking fetch to /api/public/it-management-kaizen/survey-counter/count, sending kind and UTM5 only. Failure does not block the survey or application. The server route exists in source but is NOT mounted; no count will persist until schema and integration gates pass.
- The ?test=1 URL currently displays an explicit **not yet available** message and does not proceed to a normal application or normal KPI counter. This is a temporary fail-closed branch behavior, NOT completion of authenticated staff test mode. Existing /auth/login returnTo restrictions still require the approved bridge.
- This branch is NOT release-ready: no test route, migration, server wiring, full integration tests or Production release. Do not merge or deploy until staff-test application creation is safe and QA completed.
- The earlier experimental event-ledger code remains to be removed/replaced before merge.

## Checkpoint — 2026-10-14: remove superseded anonymous event design
- Removed src/domain/anonymousSurveyEventContract.ts and test/anonymousSurveyEventContract.test.ts from this branch; they enforced per-survey-instance identity and contradicted the approved monthly numeric counter architecture.
- Removed countAnonymousEvents (surveyInstanceId Set-based deduplication) from src/domain/anonymousSurveyKpi.ts and its corresponding test. Retained JST window and period-volume ratio helpers.
- These deletions apply to the isolated feature branch only, not main or Production.
- No attempt was made to wire a half-built counting route into server.ts: the numbered migration, staff-authenticated test flow, API acceptance tests and coordination with the Business KAIZEN lane remain gates.
- The branch now uses aggregate-only counter domain semantics, but the browser's in-page counted flags still prevent repeated back-navigation within the same attempt, not repeated later visits.
- Tests remain unexecuted because no complete repository build environment was available in this execution context. Do not claim CI pass or Production readiness.

## Checkpoint — 2026-10-15: fiscal KPI summary from aggregate counts
- Added src/domain/surveyMonthlySummary.ts to calculate current month, trailing three calendar months, current atLIB fiscal YTD, same elapsed months in prior fiscal year, and cumulative from instrumentation start. Fiscal year starts February 1.
- Each period exposes count totals and measurement coverage (FULL_MONTHS, PARTIAL_MONTHS, NOT_MEASURED). Missing historical measurement is not represented as a genuine zero. The prior-year comparison is year-to-date vs the same months, not full prior fiscal year vs partial current year.
- Added test/surveyMonthlySummary.golden.test.ts for fiscal boundaries, rolling sums, year-on-year comparison, zero denominator and absent historical coverage. Tests written but not executed.
- This summary is a pure service-owned function; no common KPI input, no person tracking, and no cross-service aggregation. No endpoint, DB migration or Production change was made in this checkpoint.
- Important remaining detail: coverage is currently month-granular. If instrumentation starts mid-month, the UI must disclose the exact start date and mark that first month partial. Do not claim complete-month coverage based on YYYY-MM alone.

## Checkpoint — 2026-10-15: source review and route tests
- Verified main d35581c, feature head, and numbered migrations 030-036 in main. This does not prove that a concurrent Business KAIZEN worktree has not reserved the next number. Keep the SQL as unnumbered draft until explicit coordination.
- Corrected a literal escaped newline in src/domain/surveyMonthlySummary.ts that would have broken TypeScript compilation.
- Corrected publicSurveyCounter malformed UTM handling: invalid UTM is a client 400, not an unavailable-backend 503.
- Added test/publicSurveyCounter.api.test.ts covering repeated accepted attempts, strict payload validation, forged test flag, disabled intake and reuse of the IP limiter. These are source tests; **not executed**.
- The route is still intentionally unmounted. The test URL remains fail-closed and staff authentication/normal-vs-test separation is not complete.
- Before integration, verify origin/CSRF and the actual existing perimeter controls, the effective rate-limit setting, DB privileges and concurrency, missing month coverage and telemetry outage behavior. Production readiness and CI status remain unverified.

## Checkpoint — 2026-10-15: staff test authorization boundary
- Reviewed PublicCustomerSelfSubmissionService on main d35581c: the current public submit path explicitly creates the Case with isInternalTest=false. Reusing it for authenticated test URL would contaminate normal Case KPIs. Do NOT activate the test URL by simply bypassing the client guard.
- Reviewed FreeDiagnosisRuleBasedCaseRepo.createCase(..., isInternalTest=true default) and existing test-case designation governance. A dedicated trusted test submission path must create the Case as test in the same transaction, with auditable staff provenance; preserve public idempotency behavior and do not allow a client flag to choose test status.
- Added unmounted src/routes/adminSurveyTestEligibility.ts and its API tests. It requires req.staffEmail and explicitly returns surveyTestModeAvailable=false while the test submission flow is incomplete. This is a safe integration seam, not a functioning test URL.
- Existing /auth/login only accepts /admin/ returnTo. Authenticated launcher /admin/ is still needed; do not globally relax OAuth redirect validation.
- Tests added but not run. No numbered migration, server mount, DB write or Production change.

## Checkpoint — 2026-10-15: trusted test Case creation (partial)
- Modified PublicCustomerSelfSubmissionService with submitWithTrustedContext, separating the existing PUBLIC entry point from a server-supplied STAFF_TEST context. Case creation now passes is_internal_test=true for trusted staff tests within the existing submission transaction. Existing idempotent submission lookups check the stored Case designation to reject cross-mode reuse.
- This is an **incomplete isolated branch change**: the staff-authenticated route creation was not completed, no route is mounted, and the ?test=1 UI remains disabled. The feature is not usable.
- Before release: verify that the creation actor and audit provenance are consistent throughout Sales Activity, Case, survey completion and submission ledger; review test designation audit requirements and existing role/allowlist policy. The current change does not itself create a designation audit record. Add integration tests for first creation, retry, concurrency, and normal/test mode mismatch.
- No build or tests have been executed. No migration, main merge, or Production change. Do not deploy the partial implementation.
