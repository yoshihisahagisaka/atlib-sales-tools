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
