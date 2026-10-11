# IT経営KAIZEN 無料診断 Design v2 — Package B Execution Record

Status: IMPLEMENTED LOCALLY / SOURCE REVIEW GATE
Date: 2026-10-11

## 1. Migration / Canonical gate

Package B implementation開始前にMigration Gateを確認し、PASSした。

- `origin/main`: `f04c80e37e38ca66a2f56c666ff4bc360da7aed6`
- Package A base: `7915887288b086127228be731144ec33fb44cbad`
- main側未取り込みcommit: 0
- Package A側最大migration: 032
- Production DB: PostgreSQL 16.14
- Production ledger: migrations 027〜032 各exactly once
- Production最大migration: 032
- migration 033適用件数: 0

Production DBへの変更は行っていない。

## 2. Local implementation

- Branch: `feat/free-diagnosis-design-v2-package-b`
- Docs commit: `43c2b6abe1efb13697f0539e96fd02687cd5447c`
- Code commit: `3edcce3bc3028adc67c5968c4477b61c103f02b8`
- Worktree: clean
- Push: not performed

## 3. Migration 033

File:

`migrations/033_free_diagnosis_design_v2_persistence.sql`

027〜032は変更していない。

追加したDesign v2正本table:

1. `it_management_diagnosis_original_survey_snapshot_v2`
2. `it_management_diagnosis_current_state_revision_v2`
3. `it_management_diagnosis_analysis_result_v2`
4. `it_management_diagnosis_generated_narrative_v2`
5. `it_management_diagnosis_human_edited_narrative_v2`

Reported DB invariants:

- Original Survey SnapshotはCaseあたり1件
- Current StateはCase内revision番号でappend
- same-case composite FK
- Analysisはexact Current State revisionへ固定
- Generated Narrativeはexact Analysis + Current Stateへ固定
- Human Edited NarrativeはGenerated Narrativeへ固定
- 5層すべてUPDATE/DELETEをDB triggerで拒否
- runtime roleはSELECT/INSERTのみ
- Case FKは`ON DELETE RESTRICT`

## 4. Persistence module

Added:

`src/services/freeDiagnosisDesignV2PersistenceRepo.ts`

Main operations:

- `initializeDesignV2FromCompletedSurvey()`
- `appendDesignV2CurrentStateAndReanalyze()`
- `appendDesignV2HumanEditedNarrative()`
- `getPostHearingAnalysisView()`
- Original / Current revision read
- Current State diff
- exact Analysis / Generated read model
- Human Edit stale derivation

Artifact creation and audit are reported to be committed in the same transaction.

## 5. Human Edit stale model

Mutable CURRENT/STALE status is not stored.

Derived read-model state:

- Human Edit `generated_narrative_id` == latest Generated ID → `CURRENT`
- mismatch → `STALE_REVIEW_REQUIRED`
- no Human Edit → `NONE`

Old Human Edit rows remain immutable after Current State changes. New edits against an old Generated Narrative are rejected.

## 6. Concurrency / transaction

Current State uses `revision_no` + `expectedRevision`, separate from Case lifecycle version.

Reported behavior:

- latest revision mismatch → conflict
- same expectedRevision concurrent writes → only one succeeds
- no silent last-write-wins
- audit failure rolls back Original initialization
- reanalysis failure rolls back Current State and related Analysis / Generated / audit

## 7. Audit

Existing `it_management_diagnosis_case_v2_audit` is reused.

Added commands:

- `CompleteDesignV2OriginalSurvey`
- `CreateDesignV2CurrentStateRevision`
- `SaveDesignV2HumanEditedNarrative`

## 8. Tests reported

- TypeScript build: PASS
- Package A Golden: 21/21 PASS
- Package B persistence acceptance: 27/27 PASS
- HA6 Vertical Slice integration: 15/15 PASS
- HA6 Browser desktop/mobile: 24/24 PASS

Acceptance includes Original uniqueness/immutability, revision append/history, expectedRevision conflict, real concurrent save conflict, same-case FK integrity, exact State→Analysis→Generated provenance, Human Edit append, CURRENT/STALE derivation, rollback/audit atomicity, and exclusion of Hearing memo/operator note/structured hearing answers from Analyzer input.

A broader test batch still has two failures in existing `currentDesignV1.golden.test.ts`, reported as stale expectations predating M05 OPPORTUNITY. Package B did not modify the V1 domain/test. Formal HA6 integration/browser regression is green.

## 9. Scope boundary

Package B remains additive and not wired into the HA6 runtime flow.

No changes/connections to:

- existing routes
- Public/Admin UI
- `freeDiagnosisRuleBasedCaseRepo.ts`
- `rule_analysis_execution`
- Structured Hearing / Final Rule wiring
- Report / Approval / Delivery / Feedback
- Cloud configuration

No Production migration, deploy, HA7, traffic change, or Package C work has been performed.

## 10. Gate

Package B is **IMPLEMENTED LOCALLY / TEST PASS / SOURCE REVIEW REQUIRED**.

Before migration 033 is applied anywhere or Package C/API/UI wiring begins, perform one bounded read-only source review of migration 033, the persistence repo, and the Package B acceptance tests against the Architecture Decision and Package B Implementation Contract.
