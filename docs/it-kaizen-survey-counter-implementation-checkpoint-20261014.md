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
