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
