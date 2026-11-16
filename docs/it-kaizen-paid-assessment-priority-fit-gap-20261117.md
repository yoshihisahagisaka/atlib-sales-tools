# IT経営KAIZEN 設計Assessment — Priority Shift & Fit/Gap
Date: 2026-11-17
Status: DEVELOPMENT PLANNING / NO PRODUCTION CHANGE
Base: main 850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae

## Priority decision
Finish the paid Design Assessment first. Defer anonymous survey KPI, common dashboard and compact sales management without deleting existing work. Do not merge the separate survey-KPI branch to satisfy this task.

## Preserve established Business decisions
- Product name: IT経営KAIZEN 設計Assessment.
- The customer journey is free diagnosis → human-reviewed report/feedback → paid Assessment where appropriate → improvement execution/continuing support. Assessment is not mandatory for every customer.
- Future → Evidence-based Current FACT/UNKNOWN → Gap/root causes → improvement alternatives → 12-month Expected To-Be and KGI → priority → 90-day actions and roadmap.
- FACTACT principles: facts vs statements vs unknowns, AI suggests, humans decide/approve, system records audit. No automatic scoring or vendor/product upsell.
- Work classification includes eliminate, automate, keep internally, delegate. Expected vs Actual must be distinct; created capacity/time is not automatically a cash saving.
- Existing business product variants historically included COMPACT / STANDARD / EXPANDED, with comparable management decision outputs but different evidence-confirmation effort. Verify the latest Business Canonical before encoding package prices; do not assume a single universal 800,000 JPY quote.
- Later confirmed report direction: A4 portrait PDF + same HTML preview; editor → human approval → immutable report version, 8 chapters, salesperson-entered quoted price; no price scoring engine and no PPTX.
- Implementation/installation/development work is outside Assessment and separately quoted.

## Verified current main code (not proof of end-to-end paid service)
- src/domain/diagnosisAssessment.ts: assessment sales statuses NOT_PROPOSED/PROPOSED/PENDING/ACCEPTED/DECLINED and handoff snapshot contract.
- src/services/diagnosisAssessmentRepo.ts: staff-controlled assessment status lifecycle, human-verified handoff, audit and transaction logic.
- src/services/assessmentHandoffSnapshot.ts: projection from approved diagnosis context, Future, approved report, insights, open confirmation items and themes.
- migrations/012_it_management_diagnosis_assessment_handoff.sql: handoff persistence and immutability.
- migrations/016_assessment_scope_clarifications.sql: scope clarification separate from evidence confirmation.
- The above is a handoff boundary; it does not establish paid Assessment execution, evidence collection, review, 8-chapter report generation or delivery.
- Existing legacy kaizenAssessment and freeHearingAssessment modules must not be relabeled as the paid IT経営KAIZEN Design Assessment without a verified contract match.

## Immediate Fit/Gap and delivery order
1. Locate and read latest Business/Service Canonical and the approved eight-chapter report specification, including pricing variants and approval contract. Record source SHA/path and reconcile any earlier 800k vs 1.2m figures; no speculative redesign.
2. Verify the actual free-diagnosis Design v2 case and handoff integration; distinguish older diagnosis_cases schema from newer it_management_diagnosis_case_v2. Do not assume automatic compatibility.
3. Define the minimal paid Assessment Case/engagement lifecycle, evidence capture and human approvals by reusing FACTACT contracts where actually available.
4. Implement Assessment workbench, FACT/UNKNOWN verification, improvement options, Future/KGI and 90-day/12-month planning; preserve source references and human approval.
5. Implement the approved A4 portrait 8-chapter HTML preview and PDF, salesperson-entered quotation, approval, immutable versions, delivery/audit.
6. Run deterministic unit tests, source/evidence integrity tests, browser workflow tests, PostgreSQL 16 migration rehearsal and regression before release.
7. Coordinate migration numbers and shared server.ts changes with Business KAIZEN at release time only. No Production DB changes or deployment without explicit approval.

## Scope / stop conditions
- KPI, dashboard and generic CRM are out of this priority lane.
- No new paid-service pricing rules, eight-chapter contents or unapproved AI automation inferred from code.
- No Production writes, migration, deploy or traffic change.
