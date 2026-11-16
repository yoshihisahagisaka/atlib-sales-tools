# Design v2 → 設計Assessment Handoff: source-level compatibility checkpoint

Date: 2026-11-17
Status: VERIFIED SOURCE FIT/GAP (main as inspected); NO IMPLEMENTATION / NO PRODUCTION CHANGE

## Evidence inspected
- migrations/033_free_diagnosis_design_v2_persistence.sql
- src/services/freeDiagnosisDesignV2PersistenceRepo.ts
- src/services/freeDiagnosisDesignV2ApiService.ts
- src/routes/adminFreeDiagnosisDesignV2.ts
- src/domain/diagnosisAssessment.ts
- src/services/diagnosisAssessmentRepo.ts
- src/services/assessmentHandoffSnapshot.ts
- src/routes/diagnosisAssessment.ts
- migrations/012_it_management_diagnosis_assessment_handoff.sql
- git_KAIZEN docs/23, docs/73, docs/75, docs/78, docs/84, docs/86, docs/99 and docs/assessment-connection-architecture-validation.md

## Confirmed mapping and incompatibilities
| Concern | Design v2 source | Existing Assessment handoff source | Assessment-lane classification |
|---|---|---|---|
| Case identity | `it_management_diagnosis_case_v2` is referenced by migration 033 | `diagnosis_cases` in DiagnosisAssessmentRepo and HandoffSnapshot | **GAP**: no demonstrated cross-model mapping; never assume same case ID or FK |
| Entry channel | `CUSTOMER_SELF` / `STAFF_PROXY` in original survey snapshot | `WEB` / `SALES_VISIT` in handoffSnapshotSchema | **CONFLICT** if cast directly; no silent semantic conversion |
| Survey provenance | immutable original survey snapshot, survey version, submit time, content hash | handoff schema has no original survey provenance field | **GAP**: versioned source reference needed |
| Current state | revision_no, previous_state_id, original snapshot FK, human update | old handoff has one Future and approved insights | **PARTIAL FIT**: different models; no automatic flattening |
| Analysis | analysis result references current_state_id, analyzer/rule version and hashes | old handoff uses approved insight records | **GAP**: deterministic analysis ≠ verified FACT; preserve semantics |
| Narrative | generated and human-edited narrative with source/version | old handoff includes old diagnosis insights | **GAP**: reviewed narrative ≠ FACT evidence |
| Report | Design v2 report draft/approval path via Vs1ReviewReportFeedbackRepo | old handoff reads diagnosis_reports and approved report hashes | **UNKNOWN**: report persistence may share VS1 table, but compatibility of snapshot, report version and handoff gate must be verified explicitly |
| Sales status | Design v2 source does not itself establish paid Assessment lifecycle | old repo supports NOT_PROPOSED→PROPOSED/PENDING→ACCEPTED/DECLINED | **PARTIAL FIT**: existing logic, but bound to old case and FEEDBACK_COMPLETED |
| Scope recommendation | Business Canonical COMPACT/STANDARD/REVIEW/EXPANDED, Human Decision | old handoff only open confirmation items; no verified scope decision | **GAP** |
| FACTACT target | Product canonical FACT/OBSERVATION/UNKNOWN/Evidence/Decision | no verified callable FACTACT interface in inspected Sales Tools files | **UNKNOWN**: await Product lane exact interface FIT/GAP |

## Immediate design implications
1. **Do not reuse the old handoff endpoint against Design v2 by simply replacing table names.** Its schema assumes a different entry-channel vocabulary and old approved insight model.
2. **Do not write a second FACT store** in Sales Tools. Define a versioned *reference-only* source projection after the target contract is approved.
3. **Do not treat free-diagnosis answers or AI analysis as verified FACT**. Carry source, verification state and provenance.
4. **Do not implement a FACTACT API adapter yet**: exact target API, tenancy, identity, idempotency and versioning are still Product-lane unknowns.
5. Before any implementation, perform only bounded source verification for (a) v2 case/VS1 linkage, (b) report approval/feedback gates and exact stored snapshot, (c) scope-decision persistence, using the already-known files and their direct callees. Avoid broad repo sweeps.

## Candidate next Codex task (read-only only; not yet issued)
Baseline main SHA 850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae.
- Inspect direct definitions/references of `it_management_diagnosis_case_v2`, `diagnosis_cases`, `getLatestDesignV2ReportReference`, `Vs1ReviewReportFeedbackRepo.approve`, `assessment_handoffs`, and scope decision persistence.
- Return a table of exact file:line and observed behavior, not new architecture.
- No code edits, migration, deployment, cloud actions or broad exploratory refactor.
- STOP if mapping cannot be proven; classify UNKNOWN.

## Narrow follow-up: verified common artifacts and exact remaining boundary (2026-11-17)
Inspected main `migrations/027_free_diagnosis_rule_based_v1.sql`, `029_vs1_report_feedback_shared_artifacts.sql`, `src/services/vs1ReviewReportFeedbackRepo.ts`, and `src/domain/assessmentStructureRule.ts`.

### Confirmed reuse
- Migration 029 adds `it_management_diagnosis_case_v2_id` to existing `diagnosis_insights`, `insight_sources`, `human_reviews`, `diagnosis_reports`, `management_feedback_decisions`, enforcing exactly one old or v2 owner for each record. **Shared tables are FIT, not proof that old Handoff can run for v2.**
- `Vs1ReviewReportFeedbackRepo.approve` stores approval snapshot and marks v2 case `REPORT_APPROVED`; `deliver` marks report `DELIVERED` and v2 case `FEEDBACK_PENDING`; `startFeedback` records the beginning.
- `Vs1ReviewReportFeedbackRepo.decide` requires `FEEDBACK_PENDING`, feedback started and a delivered report, writes versioned `management_feedback_decisions` with route `DESIGN_ASSESSMENT` and hashes, then sets case `CLOSED` (except `FOCUSED_CONFIRMATION` goes to `HEARING_IN_PROGRESS`). **Do not require v2 case `FEEDBACK_COMPLETED` to generate a paid Assessment handoff; this is old-case behavior.**
- `assessment_structure_suggestion` and `suggestAssessmentScope` already represent COMPACT/STANDARD/EXPANDED/REVIEW and candidate price. Recommendation is not an approved human commercial decision.

### Remaining bounded questions before code-level design
1. Determine whether the v2 `DESIGN_ASSESSMENT` feedback decision is the latest authoritative decision and whether repeat/revised decisions can occur; identify exactly which record and version to reference.
2. Verify report approval snapshot, content hash and v2 Design v2 narrative adoption/staleness gate from existing `FreeDiagnosisDesignV2ApiService` and direct callees. Do not copy raw survey answers as verified FACT.
3. Identify existing persistence for a **human-final** scope and price decision (not `assessment_structure_suggestion`), if any; if absent, mark GAP.
4. Check exact existing `assessment_handoffs` FK to old `diagnosis_cases` and existing `read/transfer/accept` semantics; do not change existing table or route without approved migration design.
5. Confirm current Product lane FACTACT integration interface separately; until confirmed, no network adapter.

### Candidate safe handoff preconditions (design hypothesis, not yet approved implementation)
- Case owner is `it_management_diagnosis_case_v2`.
- Latest management feedback decision route is `DESIGN_ASSESSMENT`; link immutable decision ID/version/hash.
- Report is `DELIVERED` and its approval snapshot/content hash checks pass; capture report ID/version/hash.
- Preserve source/provenance and explicitly label survey statements, human-edited narrative and unverified analysis.
- Human-approved scope/price record must be separately evidenced; do not infer from candidate suggestion.
- Retry and source updates must not mutate an existing transferred snapshot.

## Codex task candidate — READ-ONLY source inspection only
Baseline: main 850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae; if changed, report current SHA before investigation.
Allowed files: `src/services/vs1ReviewReportFeedbackRepo.ts`, `src/services/freeDiagnosisDesignV2ApiService.ts`, `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`, `src/services/diagnosisAssessmentRepo.ts`, `src/services/assessmentHandoffSnapshot.ts`, `migrations/012_it_management_diagnosis_assessment_handoff.sql`, `migrations/027_free_diagnosis_rule_based_v1.sql`, `migrations/029_vs1_report_feedback_shared_artifacts.sql`, `migrations/033_free_diagnosis_design_v2_persistence.sql`, `src/domain/assessmentStructureRule.ts` and direct callees only if necessary to answer the four questions.
Return: question → exact file:line → observed source behavior → FIT/GAP/UNKNOWN. No architectural recommendations, code, DB, GCP or deployment changes. STOP on source mismatch.
