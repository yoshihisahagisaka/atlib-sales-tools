# IT経営KAIZEN 無料診断 Design v2 — Package B Source Review Contract

Status: READ-ONLY REVIEW CONTRACT
Date: 2026-10-11

## 1. Purpose

Package Bのlocal implementationを、Package B Architecture Decision / Implementation Contractとactual sourceで照合する。

対象:

- migration 033
- Design v2 persistence repo/service
- Package B persistence tests
- Package A regression
- HA6 independence

レビューでコード変更はしない。

## 2. Expected source state

- branch: `feat/free-diagnosis-design-v2-package-b`
- code commit: `3edcce3bc3028adc67c5968c4477b61c103f02b8`
- worktree: clean

## 3. Required review areas

### A. Scope boundary

Package B code commitがmigration 033 / Design v2 persistence / testsに限定され、existing routes/UI/Final Rule/Structured Hearing/Report wiringを変更していないこと。

### B. Migration 033 integrity

Verify actual DDL for these five canonical objects:

1. `it_management_diagnosis_original_survey_snapshot_v2`
2. `it_management_diagnosis_current_state_revision_v2`
3. `it_management_diagnosis_analysis_result_v2`
4. `it_management_diagnosis_generated_narrative_v2`
5. `it_management_diagnosis_human_edited_narrative_v2`

Confirm:

- Case ownership
- PK / unique constraints
- exact revision provenance
- same-case integrity
- append-only behavior
- UPDATE/DELETE guards
- runtime privilege boundary
- `ON DELETE RESTRICT`
- migration 027–032 untouched

### C. Original Survey invariants

Confirm:

- max one Original snapshot per Case
- immutable after creation
- Q1–Q7 structured answers stored as Design v2 source record
- not reusing mutable intake as canonical Original

### D. Current State revision model

Confirm:

- append-only revision_no
- previous history retained
- expectedRevision conflict check
- concurrent same expectedRevision cannot both succeed
- Case lifecycle version is not substituted for Current State revision

### E. Analysis provenance

Confirm each Analysis Result is bound to an exact Current State revision, not Hearing memo / structured hearing direct input.

Analyzer input must be Current Structured State only.

### F. Generated Narrative provenance

Confirm Generated Narrative is immutable and tied to the exact Analysis Result / Current State generation.

### G. Human Edited Narrative

Confirm:

- Human Edit is separate append-only object
- `generated_narrative_id` is mandatory
- cross-case edit is rejected
- new edit against non-latest generated narrative is rejected
- old edits are never overwritten/deleted
- CURRENT / STALE_REVIEW_REQUIRED is derived, not mutably stored as source of truth

### H. Transaction atomicity

Confirm actual transaction boundaries for:

- `initializeDesignV2FromCompletedSurvey()`
- `appendDesignV2CurrentStateAndReanalyze()`
- `appendDesignV2HumanEditedNarrative()`

Artifact + audit must commit/rollback together.

### I. Audit

Confirm audit events and detail provenance:

- `CompleteDesignV2OriginalSurvey`
- `CreateDesignV2CurrentStateRevision`
- `SaveDesignV2HumanEditedNarrative`

### J. Read model

Confirm `getPostHearingAnalysisView()` returns sufficient separation of:

- Original Survey
- latest Current State
- diff from Original
- latest Analysis
- latest Generated Narrative
- Human Edited Narrative
- derived stale status

Hearing Record may be read separately, but must not be rule input.

### K. Tests

Review the Package B acceptance tests for real assertions, not only success-path smoke.

At minimum prove:

- Original uniqueness/immutability
- Current revision 1→2 and old revision remains
- expectedRevision conflict
- real concurrency conflict
- same-case FK integrity
- exact State→Analysis→Generated chain
- Human Edit append/history
- stale derivation
- cross-case rejection
- old generated edit rejection
- rollback on audit failure
- rollback on analysis failure
- Hearing memo/operator note/structured hearing not Analyzer input

## 4. Broad V1 golden failures

Two existing `currentDesignV1.golden.test.ts` failures were reported outside formal Package B regression.

Review must determine read-only whether:

- Package B changed any V1 implementation or V1 golden test related to those failures; and
- the failures reproduce at Package A pre-B commit / are otherwise demonstrably pre-existing.

If the failures cannot be proven pre-existing from available evidence, final status must be PARTIAL / HOLD rather than silently ignoring them.

Do not fix them during review.

## 5. Final verdict

Return one of:

`PACKAGE B SOURCE REVIEW: PASS`

`PACKAGE B SOURCE REVIEW: PARTIAL / HOLD`

`PACKAGE B SOURCE REVIEW: FAIL / FIX REQUIRED`

PASS requires:

- migration 033 matches Package B contract
- all five canonical layers have correct provenance/immutability/integrity
- no direct Hearing→Analyzer path in Package B
- concurrency and transaction semantics are real
- stale derivation is source-ID-based
- acceptance tests substantively verify the contract
- HA6 runtime remains unwired
- reported V1 golden failures are demonstrably unrelated/pre-existing

After verdict, STOP. No migration execution, API/UI wiring, deploy, HA7, or Production changes.
