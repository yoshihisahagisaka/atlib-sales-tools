# IT経営KAIZEN 設計Assessment — 提案資料を到達目標とした実装Fit/Gap

Date: 2026-11-21
Status: SOURCE-BASED DEVELOPMENT FIT/GAP / NOT A RELEASE APPROVAL
Customer-value reference: user-provided `IT経営KAIZEN.pdf` (4 pages, 9-page proposal outline). This document is a **goal and acceptance reference**, not an automatically approved new API or DB schema.
Architecture: `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.

## Outcome and acceptance target
Assessment is **not an IT inventory/audit product**. It must let management decide *what to improve, why, in which order, by whom and when*, based on checked reality and its relation to the desired Future.

Customer-facing proposal sections P3–P7 imply the following deliverable-oriented acceptance:
- P3: reuse the free diagnosis without treating survey statements/AI output as verified FACT.
- P4: assess relevant Technology / Operation / Management domains, not a blanket all-systems audit.
- P5: preparation → interview/evidence collection → source/verification review → specialist analysis → management review.
- P6: three deliverables: (1) IT経営KAIZEN改善計画書, (2) 経営判断用の要約資料, (3) 調査・分析資料. Canonical docs/78 remains authoritative for Word-type plan → PDF, executive slides and Evidence Book.
- P7: priority, first 90-day actions, 12-month roadmap, investment/roles/timing and management decisions; expected effects must remain distinct from actual outcomes.
- P8/P9: scope/period/price and proposal→contract→delivery are business workflows, **not** permission to implement a pricing/approval engine.

## Verified code-level baseline
| Capability | Evidence | Fit/Gap and interpretation |
|---|---|---|
| Design v2 free-diagnosis route/approved source | `src/services/designV2AssessmentEligibility.ts` `readDesignV2AssessmentEligibility` checks closed case, latest `DESIGN_ASSESSMENT` decision, delivered `design-v2` report, decision/report hashes and approval references. | **FIT as read-only source gate**; does not prove paid contract, complete source handoff or FACT verification |
| Legacy Assessment handoff | `src/services/assessmentHandoffSnapshot.ts`, `src/services/diagnosisAssessmentRepo.ts`, migration 012; prior source review in `docs/it-kaizen-assessment-design-v2-handoff-fit-gap-20261117.md`. | **GAP for Design v2**: old `diagnosis_cases` and v2 case are not interchangeable; do not cast FKs |
| Existing `kaizenAssessment` | `src/domain/kaizenAssessment.ts` describes a 60-minute free 情シスKAIZEN diagnostic, with its own question catalog and AI extraction. | **PARTIAL REUSE ONLY**: do not rename it into paid Design Assessment or use its catalog as paid product's definitive evaluation standard |
| Assessment scope suggestion | `src/domain/assessmentStructureRule.ts` suggests COMPACT/STANDARD/EXPANDED/REVIEW from four structure gates. | **FIT for suggestion**; no automatic final commercial decision, no maturity assessment |
| Initial Device Excel/CSV | Assessment Draft PR #48, shared offline preview core, 13 Node/21 Chromium tests at accepted head `0c64e2d78d09ddef26ded6a9975837cdf19bd24a`. | **FIT for local preparation only**; not Core Device write/verification |
| Source/Evidence/Work/Registry | FACTACT Core/Product responsibility, Device S0 in Draft PR #69. | **DEPENDENCY** for authoritative storage, authorization, verification and scoped reuse; no duplicate Assessment tables |
| Paid Assessment preparation/hearing workflow | Existing free hearing and legacy assessment modules are not proof of a paid Design v2 case workflow. | **GAP / implementation to verify**, bounded to Assessment-specific orchestration |
| IT-management maturity/gap/root-cause/priority analysis | No corresponding paid Assessment specialist engine established by inspected modules. | **GAP / not yet verified**; own in Assessment, deterministic no-AI baseline |
| ACT alternatives, 90-day actions, 12-month roadmap | Business Canonical and proposal specify outcomes; legacy/free modules cannot prove paid delivery. | **GAP / not yet verified**; explicit sources, options, expected effects, decision authority |
| Word-type plan/PDF, executive slides, Evidence Book | Business Canonical docs/78; existing free-diagnosis PDF service is not evidence of paid Assessment outputs. | **GAP / not yet verified**; human-approved versioned output and evidence traceability |

## Minimal independent development order
1. **Assessment source-context and preparation projection**: read the exact approved Design v2 report/decision refs; assemble the human-facing list of existing confirmed inputs, unverified statements and unanswered preparation questions. No FACTACT write or duplicated evidence store.
2. **Assessment specialist analysis contract**: a pure function over an explicit source/version snapshot + Future intention + verified/current state + UNKNOWN, yielding reviewable gaps, causal hypotheses, alternative improvements and questions. No arbitrary numerical maturity score or auto-priority from UNKNOWN. Keep Technology/Operation/Management classification in Assessment.
3. **Human review and planning contract**: decision alternatives, justification, 90-day actions, 12-month roadmap, owner, expected effect, dependencies and remaining unknowns; no AI-only approval.
4. **Three output projections**: Word-type improvement plan/PDF, executive summary slides, evidence book; consistent source/decision version hashes and no invented ROI.
5. **FACTACT integration E2E** only after Product-approved organization identity, grants, scoped read, typed commands, audit and persistence are executable.

## Bounded next implementation specification
- **First task**: source-only paid Assessment preparation/analysis input projection with synthetic fixture tests; do not create a second Work/Evidence/FACT registry.
- Inspect only current v2 eligibility/report/feedback sources and existing analysis types to define input refs. Require case/decision/report IDs, versions and hashes. Preserve Future as management intent and report narratives as statements, not FACT.
- For each required confirmation, show *why needed*, *source reference*, *current verification state*, *who/what to check*, with no fixed blanket questionnaire.
- No network/API, migration, production or new authorization framework. STOP if a Product identity or approved source semantic cannot be established.

## Explicit non-goals
- Re-deciding settled Assessment pricing, scope, deliverables or methodology.
- Implementing IT maturity scoring in FACTACT Core.
- Building a generic AI analysis engine, CRM, customer/device registry or new source-of-truth database.
- Treating the 9-page sales proposal itself as the final Assessment improvement report template.
