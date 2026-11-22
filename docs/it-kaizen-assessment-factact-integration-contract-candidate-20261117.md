# IT経営KAIZEN 設計Assessment × FACTACT — Integration Contract Candidate v0.1

Date: 2026-11-17
Status: DRAFT — FIT/GAP REQUEST; NOT APPROVED API/DB CONTRACT
Owners: IT経営KAIZEN Assessment (business/application consumer) / FACTACT Product (provider and Core authority)
Runtime: local/offline only pending Google Billing quota increase 5→8 and pj-factact billing; no Production changes.

## 1. Grounded Canonical
- git_KAIZEN docs/23-assessment-factact-reporting-consistency-v1.md: FACT / UNKNOWN / Observation / Hypothesis / Proposal / Decision semantics; Assessment report is decision support, FACTACT report follows ACT/CHANGE/NEW FACT.
- git_KAIZEN docs/73-it-management-kaizen-design-assessment-standard-offer-v1.md: Route C only, standard ¥1,200,000 excl tax, material decision, Evidence, multiple ACT options, management decision.
- git_KAIZEN docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md: ACT Option Portfolio, Scenario Comparison, Multi-year Roadmap, Human Decision; Expected Change ≠ actual change.
- git_KAIZEN docs/78-design-assessment-word-report-and-executive-slides-delivery-standard-v1.md: Word-type improvement plan → PDF, executive slides, Evidence Book.
- git_KAIZEN docs/84-assessment-scope-recommendation-human-decision-business-requirements-v1.md: COMPACT/STANDARD/REVIEW/EXPANDED scope recommendation, no automatic final decision, no duplicate customer questionnaire, historical decisions immutable.
- git_KAIZEN docs/86-business-product-lane-responsibility-and-handoff-principles-v1.md: Business WHAT/WHY, FACTACT Product HOW; FIT/GAP/CONFLICT/UNKNOWN.
- git_KAIZEN docs/99-ai-development-context.md: one fact/multiple views, no giant EAV, source/provenance, Change→Verify→Commit.
- git_KAIZEN docs/assessment-connection-architecture-validation.md: PARTIAL FIT, no new generic Core objects, Assessment→Operational Context inheritance contract and external Evidence ingestion remain gaps.
- atlib-sales-tools src/domain/diagnosisAssessment.ts, src/services/assessmentHandoffSnapshot.ts, migrations/012, migrations/016: existing diagnosis handoff boundary. Compatibility with Design v2 is unverified.

## 2. System boundary (business meaning, not invented API)
| Concern | Accountable system | Rule |
|---|---|---|
| Free diagnosis customer entry, survey, management feedback, assessment sales state | Sales Tools | Reuse approved records; preserve original version and source |
| Paid Assessment engagement scope, decision agenda, improvement options, scenario/roadmap and customer deliverables | IT経営KAIZEN Assessment application | Store decision artifacts and version references, not a duplicate FACT truth |
| Operational/domain FACT, Evidence, provenance, verification and change history | FACTACT | Product lane determines object/API model, authority and storage |
| AI analysis suggestions | FACTACT analysis capability (contract to validate) | Suggestion/hypothesis only; never promote to FACT or human decision |
| Human final decision on scope, price, ACT and report | Authorized human in applicable business workflow | Record actor, time, rationale, input versions and approval |

## 3. Candidate cross-system operations (semantic requests, NOT endpoint definitions)
A. Intake context: consume immutable, approved free-diagnosis snapshot (case id, report version/hash, Future, approved insights, confirmation items, evidence references, origin/time). Preserve distinction between source statement and verified FACT.
B. Establish Assessment context: associate customer/organization, paid engagement, approved scope, decision owner, material question and reference to original diagnosis snapshot. Repeated delivery/retry must not create duplicated evidence.
C. Add/associate Evidence: source reference, origin system, observed/received time, effective time when known, confidentiality, access authority and validation status. Existing vendor/operational systems may remain source.
D. Verify: differentiate FACT / OBSERVATION / HYPOTHESIS / UNKNOWN / DECISION, retain contradiction, authority, verification actor/time, and superseded versions; no direct Work-close→Registry mutation.
E. Analysis read/proposal: fetch scoped verified FACT and explicit UNKNOWN with source/version; return hypothesis/impact/option suggestions labelled as suggestions and their supporting references; human reviews.
F. Assessment output: bind GAP/root-cause hypothesis, options, scenarios, expected changes, roadmap and human decisions to exact input snapshot/version and Evidence refs; later changes do not silently rewrite a delivered report.
G. Continuity: after decision, FACTACT may link ACT→CHANGE→VERIFY→NEW FACT, preserving expected vs actual; future operational-context inheritance requires Product lane contract.

## 4. Minimum candidate acceptance scenarios
1. Existing approved free diagnosis handoff enters Assessment without re-asking already confirmed customer questions.
2. Interview statement remains OBSERVATION/STATEMENT until verified; no automatic promotion to FACT.
3. Evidence from external vendor report retains provenance; duplicate retry does not duplicate a verified assertion.
4. Missing source yields UNKNOWN and an explicit confirmation task; AI cannot fill it.
5. Contradictory sources remain traceable and trigger human review.
6. Human-approved ACT option includes supporting FACT, remaining UNKNOWN, expected change and verification approach; investment estimates only with evidence.
7. Report version captures the exact Evidence/FACT/Decision references used; later FACT update does not change the prior approved report.
8. Existing vendors and systems can remain; no forced vendor migration.
9. Permission boundaries prevent cross-tenant leakage; no secret or raw sensitive evidence is copied unnecessarily.
10. Local test runs without GCP; hosted E2E remains STOP until billing and release gates.

## 5. Required FACTACT Product-lane FIT/GAP response
- Which existing Core objects / API operations represent items A–G? Provide paths and current tests, distinguish implemented from designed.
- What are the minimal read/write, idempotency, versioning, tenancy, authorization and audit contracts? Avoid speculative new Core objects.
- Is AI analysis an existing executable capability or a future slice? Identify the deterministic/no-AI fallback for evidence listing and human analysis.
- How is FUTURE represented without prematurely creating a new Core object?
- What is the smallest local executable Assessment slice and its fixtures that can be run before GCP quota approval?
- Classify each point FIT / GAP / CONFLICT / UNKNOWN and return only true Business decision requests.

## 6. IT経営KAIZEN lane immediate actions
1. Inspect Sales Tools Design v2 case, Handoff snapshot and management feedback contracts; produce source-level compatibility matrix.
2. Implement a pure, versioned adapter for approved context mapping only after FACTACT confirms the target contract. No duplicate fact store.
3. Prepare Assessment decision artifact schemas and human-review tests grounded in Business Canonical.
4. Build Word-type report, Executive Summary slides and Evidence Book from approved decisions/evidence references; keep immutable output versions.
5. Run offline unit/browser/PostgreSQL16 rehearsal; no GCP project creation, API enablement, migration or Production deployment.

## 7. STOP / No-Go
- No FACTACT Core schema/API decisions in this lane.
- No automatic fact promotion, investment ROI fabrication, ACT decision or report approval.
- No assumption that legacy Sales Tools assessment handoff already matches Design v2.
- No new generic CRM, KPI dashboard or parallel evidence registry.
- No GCP billing or Production execution pending approval.


## 8. Source-level compatibility matrix — Design v2 / legacy Handoff (2026-11-17 verification)

Status: READ-ONLY SOURCE REVIEW / DRAFT; this matrix is evidence for an implementation decision, **not** approval of a FACTACT target API, DB schema or release. Files read at the current Assessment development branch and `git_KAIZEN/main`.

| Boundary | Existing implementation (verified) | Fit/Gap | Integration implication |
|---|---|---|---|
| Case identity | Legacy `DiagnosisAssessmentRepo.lock` and `buildAssessmentHandoffSnapshot` query `diagnosis_cases`; Design v2 uses `it_management_diagnosis_case_v2` via `FreeDiagnosisRuleBasedCaseRepo` / `FreeDiagnosisDesignV2PersistenceRepo`. | **GAP** | Never pass a Design v2 case id to the legacy Handoff or silently create a legacy case. Explicit source kind + source case id required. |
| Customer/tenant mapping | Legacy snapshot joins `organizations` and emits `organization.id`; Design v2 case references `company_id` (and `contact_id`). FACTACT uses `tenantId` in its existing application/domain ports. | **GAP** | `company_id` is not a FACTACT `tenantId`; establish authorized mapping in the target contract. No implicit cross-system id equivalence. |
| Entry channel | Legacy schema allows `WEB` / `SALES_VISIT`; Design v2 `OriginalSurveySnapshotV2.entryChannel` is `CUSTOMER_SELF` / `STAFF_PROXY`. | **GAP** | No string passthrough or unreviewed enum coercion; retain original channel/provenance. |
| Offer / engagement gate | Legacy `assessment_status='ACCEPTED'` and `assessment_handoffs READY→TRANSFERRED` are staff-controlled. Design v2 management feedback `route='DESIGN_ASSESSMENT'` is a decision route in `Vs1ReviewReportFeedbackRepo.decide`, then the diagnosis case closes. | **GAP** | Route C selection alone does **not** prove a paid engagement accepted/contracted or Handoff transferred. Define distinct Assessment start authorization on the Assessment side. |
| FUTURE | Legacy Handoff requires a current row in `diagnosis_futures` with `intent_status`. Design v2 stores `q2Future` codes in revisioned survey/current state and generated/human-edited narrative. | **PARTIAL FIT** | Future meaning is reusable; old `future.id/version/intent_status` cannot be fabricated. Carry source reference + statement type, with confirmation state preserved. FACTACT Core mapping remains Product-lane UNKNOWN. |
| FACT/UNKNOWN/Evidence | Legacy snapshot selects `diagnosis_insights` with `review_status='HUMAN_APPROVED'` and `insight_sources` references. Design v2 owns immutable original survey, revisioned state, rule analysis, narrative and proposed `factCandidates`; shared VS1 `diagnosis_insights` can use a v2 FK, but the Design v2 report's candidate list is not verified FACT. | **PARTIAL FIT / GAP** | Map source semantics explicitly. A candidate / report sentence cannot be promoted to FACT by import; original ref, version/hash and human verification are needed. General external Evidence ingestion still requires FACTACT Product contract. |
| Approved Report | Both flows use `diagnosis_reports`, but migration 029 enforces **exactly one** of legacy `diagnosis_case_id` and `it_management_diagnosis_case_v2_id`. Design v2 `policy_version='design-v2'` drafts are approved through `FreeDiagnosisDesignV2ApiService.approveReportDraft` / `Vs1ReviewReportFeedbackRepo.approve`, with snapshot hash. | **PARTIAL FIT / GAP** | Reuse exact approved report id/version/content/snapshot hashes and source case FK; never call legacy Handoff FK or its fresh-check against a Design v2 report. |
| Handoff immutability | Legacy `assessment_handoffs` (migration 012) freezes READY snapshots and tests enforce latest-only transfer; this FK targets `diagnosis_cases`. No equivalent Design v2→paid Assessment Handoff contract verified. | **GAP** | Draft a versioned, immutable Design v2 source projection separately **after** the source/target contracts are approved. Do not repurpose migration 012 or mutate old Handoffs. |
| FACTACT inheritance/analysis | `git_KAIZEN/docs/99-ai-development-context.md` describes Fact/Evidence/Change→Verify→Commit; `packages/application/src/support-ports.ts` exposes service-specific `SupportRepository`, not a generic Assessment ingestion API. Architecture validation marks external Evidence ingestion and Assessment operational inheritance open. | **GAP / UNKNOWN** | Await FACTACT Product FIT/GAP on actual supported read/write interface, tenant binding, audit, idempotency, AI capability and deterministic no-AI path. No direct DB writes or guessed endpoints. |
| Deliverables and later operations | Canonical docs/23,73,78 give Assessment ownership of decision options/roadmap/Word-type PDF/slides/Evidence Book; FACTACT continues ACT→CHANGE→Verified Fact. | **FIT (responsibility)** | Link immutable approved Assessment artifacts and Decision basis; do not duplicate report generation in FACTACT or mistake Expected Change for actual state. |

### Source evidence (bounded)
- Legacy: `src/domain/diagnosisAssessment.ts`, `src/services/assessmentHandoffSnapshot.ts`, `src/services/diagnosisAssessmentRepo.ts`, `migrations/012_it_management_diagnosis_assessment_handoff.sql`, `test/diagnosisAssessment.golden.test.ts`.
- Design v2: `src/domain/freeDiagnosisDesignV2.ts`, `src/services/freeDiagnosisRuleBasedCaseRepo.ts`, `src/services/freeDiagnosisDesignV2EntryAdapter.ts`, `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`, `src/services/freeDiagnosisDesignV2ApiService.ts`, `src/services/vs1ReviewReportFeedbackRepo.ts`, `migrations/029_vs1_report_feedback_shared_artifacts.sql`, `migrations/033_free_diagnosis_design_v2_persistence.sql`, `test/freeDiagnosisDesignV2Report.integration.test.ts`.
- FACTACT: `git_KAIZEN/docs/23-assessment-factact-reporting-consistency-v1.md`, `docs/99-ai-development-context.md`, `docs/assessment-connection-architecture-validation.md`, `packages/application/src/support-ports.ts`, `packages/domain/src/support.ts`.

### Contract freeze and next locally executable step
1. **No direct legacy Handoff reuse for Design v2.** Freeze integration implementation until Design v2 source projection inputs, paid-acceptance gate and FACTACT Product target mapping are signed off. Do not assume same database (Sales Tools PostgreSQL 16 / FACTACT PostgreSQL 17 validation context).
2. FACTACT Product lane to answer, against exact existing paths: receiving boundary or no supported API, authenticated tenant/company mapping, candidate vs verified assertion handling, provenance, review, idempotency, revision, authorization and audit. Any missing capability remains a named GAP; no new generic Core Object by default.
3. Meanwhile Assessment lane can write a **pure, offline read-only source-projection specification and tests** for Design v2: accepted source types, exact version/hash references, explicit `UNKNOWN`, invalid/stale report rejection, non-promotion of candidates, duplicate-replay deterministic hash and cross-case rejection. This is preparatory validation only, not a FACTACT write adapter.
4. Subsequent implementation task is bounded to an approved typed source projection + local tests; no schema migration, new paid engagement state, FACTACT API client or cloud resources under this draft.

**STOP triggers:** source Design v2 report not human-approved; mismatched case FK; missing content/snapshot hash; absent paid engagement authorization; unknown company→tenant binding; unapproved target ingestion/analysis semantics; mismatch with FACTACT Canonical. On any trigger report exact FIT/GAP and halt without migration/deploy.


## 9. 2026-11-22 narrow source checkpoint — Design v2 approval and paid Assessment boundary

**Scope:** This is an append-only bounded source verification against Sales Tools main `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`, not a new business decision or FACTACT API authorization. Earlier matrix and Candidate v0.1 remain in force.

### Verified source-level behavior

| Source | Observed contract | Integration implication |
|---|---|---|
| `src/services/freeDiagnosisDesignV2ApiService.ts`, `approveReportDraft` (lines 252–284) | Requires the draft to be `REVIEW_REQUIRED`; checks its adopted narrative matches the latest generated or human-edited narrative ID and content hash; then delegates approval through existing `approvals.approve`. | The current source approval path is reusable as a **source gate**, not a new paid Assessment approval. Do not copy a stale narrative or claim that a draft is human-approved. |
| `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`, `getLatestDesignV2ReportReference` (lines 584–601) | Filters `diagnosis_reports` by v2 case ID and `policy_version='design-v2'`, returning report ID and adopted human-edit reference only. Its own contract says “Provenance only”; it does not verify report content, approval or delivery. | **Do not** use this method alone as the Handoff approval/eligibility check. A later typed source read must verify exact report ID, status, content/snapshot hashes and case binding. |
| `src/services/vs1ReviewReportFeedbackRepo.ts`, `approve`, `deliver`, `decide` (lines 72–75) | Existing v2-case workflow records approval snapshot, then delivery; `decide` requires FEEDBACK_PENDING, feedback started and delivered report; it inserts a versioned `management_feedback_decisions` row with route, material decision, report id/version/content hash/approval snapshot hash and then closes the case for `DESIGN_ASSESSMENT`. | A `DESIGN_ASSESSMENT` feedback decision is a versioned **intent to proceed** and report-reference source; it does **not** prove paid contract acceptance or authorize Core writes. A source-read adapter must select and bind the exact feedback-decision record instead of inferring from the case's CLOSED state. |
| `src/domain/assessmentStructureRule.ts` (lines 24–68) and `assessment_structure_suggestion` use in the v2 feedback repository (lines 43–48) | Calculates/surfaces suggested scope and base price only. | Never infer human-final scope/price approval from a suggestion. Existing human-final commercial decision persistence remains **UNKNOWN** until a specifically verified record/contract is identified. |
| `migrations/012_it_management_diagnosis_assessment_handoff.sql` and `src/services/diagnosisAssessmentRepo.ts` (lines 17–25) | Existing handoff FK targets legacy `diagnosis_cases` and `diagnosis_reports(id,diagnosis_case_id)`; READY/TRANSFERRED/ACCEPTED and its freshness guard are legacy-context-specific. | **Do not** reuse, cast or mutate this legacy Handoff as the Design v2 Handoff. Case IDs, entry semantics and status gates are incompatible. |

### Minimal next code-level work permitted only after source/target gate approval

1. **No immediate adapter implementation.** The existing D1/D2/D3/D4 deliverable chain is independent of a FACTACT write integration. Work on it must not add a parallel FACT registry or use an unapproved target API.
2. To create a future **read-only, deterministic source projection**, first freeze source record types and the authority of the exact approved report, delivery marker and feedback decision (IDs, versions, content/snapshot hashes). Reject mismatched case linkage, stale source content, unpublished/undelivered reports and unapproved scope; never fill unknown fields by guessing.
3. The source projection, if approved, is reference-only: original case ID / source type, report ID/version/hashes, decision ID/version/context hash, original entry channel, and explicit human-approval state. It must not label customer statements, AI-generated narrative or suggested scope as verified FACT.
4. FACTACT Product lane must identify its existing authorized tenant/company mapping and typed Evidence/FACT read/write interfaces before any connection/client or schema work. Absence of evidence is **UNKNOWN**, not an invitation to build a generic Assessment ingestion API.

### STOP / release gate

No changes to FACTACT Core, Sales Tools migrations, DB schema, Cloud resources, Production or customer delivery. Do not infer live availability from source alone. Preserve the original versioned evidence and Human Decision semantics. A future Codex task must include the exact source contracts and target FIT/GAP; it cannot decide these on its own.
