# IT経営KAIZEN 設計Assessment Phase D1 — Shared Customer Deliverable Projection, code-level specification

Date: 2026-11-22
Status: CODE-LEVEL SPEC / NO PRODUCTION OR CUSTOMER RELEASE AUTHORIZATION
Base: C4c Draft PR #76 HEAD `9c4ec8431780f11876c8c3ab9f202ce5df961ae6`.

## Canonical and Fit/Gap
- git_KAIZEN `docs/78-design-assessment-word-report-and-executive-slides-delivery-standard-v1.md` is **CANONICAL BUSINESS DELIVERABLE MODEL**: authoritative Word-style detailed report (customer PDF), executive slides derived from it, research/analysis Evidence Book. No separate conclusions between outputs; readable without oral explanation.
- git_KAIZEN `docs/23-assessment-factact-reporting-consistency-v1.md` is **CANONICAL CROSS-SERVICE REPORTING PRINCIPLE**: FACT / UNKNOWN / Observation / Hypothesis / Proposal / Decision remain distinct; Expected Change is not Actual Change; no maturity score.
- git_KAIZEN `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` is **PILOT PROPOSAL**, not an approved fixed 3-scenario/21-chapter/12-month format.
- C1/C2/C3a/C3b/C4a/C4b/C4c are **pure review projections**, not FACTACT-authorized records. Source.kind=CORE_VERIFIED_REFERENCE is an assertion by caller, not live verification.
- Missing D1: one **read-only, provenance-aware presentation model** shared by report/slides/evidence views, without duplicating FACTACT Core, inventing a customer narrative, or generating actual files.
- D1 only: data contract and deterministic projection/validation. D2 report renderer, D3 slides, D4 Evidence Book renderer, E integration and F pilot follow separately.

## Allowed new files ONLY
- `src/domain/paidAssessmentDeliverableProjection.ts`
- `test/paidAssessmentDeliverableProjection.test.ts`

## Contract
```ts
import type { PreparationSourceRef } from './paidAssessmentPreparation';
import type { GapReviewResult } from './paidAssessmentGapReview';
import type { RootCauseReviewResult } from './paidAssessmentRootCauseReview';
import type { ActOptionReviewResult } from './paidAssessmentActOptionReview';
import type { ManagementScenarioReview } from './paidAssessmentScenarioComparison';
import type { DecisionSessionReviewResult } from './paidAssessmentDecisionSessionReview';
import type { InitialActionPlanReview } from './paidAssessmentInitialActionPlan';
import type { RoadmapReviewResult } from './paidAssessmentRoadmapReview';

export type DeliverableStatementKind =
  | 'FUTURE' | 'VERIFIED_FACT_REFERENCE' | 'CUSTOMER_STATEMENT'
  | 'UNKNOWN' | 'OBSERVATION' | 'RISK_IMPACT' | 'HYPOTHESIS'
  | 'PROPOSAL' | 'DECISION_CANDIDATE' | 'EXPECTED_CHANGE';
export interface DeliverableStatement {
  id: string;
  kind: DeliverableStatementKind;
  text: string; // human-authored customer-facing explanation
  sourceRefs: readonly PreparationSourceRef[];
  relatedIds: readonly string[]; // traceability only, no invented facts
}
export interface DeliverableSectionDraft {
  id: string;
  title: string;
  narrative: string; // human-authored explanation, no AI generation
  statementIds: readonly string[];
}
export interface DeliverableProjectionInput {
  reportId: string;
  customerLabel: string;
  purpose: string;
  statements: readonly DeliverableStatement[];
  sections: readonly DeliverableSectionDraft[];
  gaps: GapReviewResult;
  causes: RootCauseReviewResult;
  options: ActOptionReviewResult;
  scenarios: ManagementScenarioReview;
  decisions: DecisionSessionReviewResult;
  initialActions: InitialActionPlanReview;
  roadmap: RoadmapReviewResult;
}
export type DeliverableReadiness = 'REVIEWABLE_DRAFT' | 'NEEDS_CONFIRMATION' | 'BLOCKED_BY_EVIDENCE';
export interface DeliverableProjection {
  reportId: string;
  customerLabel: string;
  purpose: string;
  sections: Array<DeliverableSectionDraft & { statements: DeliverableStatement[] }>;
  evidenceIndex: Array<{ statementId: string; kind: DeliverableStatementKind; sources: PreparationSourceRef[] }>;
  references: {
    gapIds: string[]; causeIds: string[]; optionIds: string[]; scenarioIds: string[];
    decisionIds: string[]; initialActionIds: string[]; roadmapIds: string[];
  };
  readiness: DeliverableReadiness;
  reviewReasons: string[];
}
export function buildPaidAssessmentDeliverableProjection(input: DeliverableProjectionInput): DeliverableProjection;
```

## Rules and safety
1. Validate reportId, customerLabel, purpose, section id/title/narrative, statement id/text, exact statement kind; unique IDs and nonblank text. Sections may be empty for an incomplete draft, but return NEEDS_CONFIRMATION with `NO_SECTIONS`. Statement list may be empty; no fabricated filler.
2. Validate every source kind/id/positive version/optional 64 lowercase hex hash. A `VERIFIED_FACT_REFERENCE` statement requires >=1 source with kind `CORE_VERIFIED_REFERENCE`; **this is still a caller-asserted verified reference**, not an authenticated Core fact. A statement with no source refs is allowed for UNKNOWN/PROPOSAL/HYPOTHESIS/EXPECTED_CHANGE/FUTURE but produces `SOURCE_NOT_PROVIDED:<statementId>` review reason where appropriate; do not silently promote it to FACT. For VERIFIED_FACT_REFERENCE, missing matching source is a hard TypeError. No literal text classifier or fact inference.
3. Section statementIds must resolve to existing unique statement IDs; reject dangling/duplicate section references. Preserve statement and section order, with deep-detached copies.
4. `relatedIds` are traceability references and must resolve to one of the IDs in the 7 upstream projections (gaps/causes/options/scenarios/decisions/initialActions/roadmap), or another statement ID. Reject dangling/duplicate references. Reject ambiguous IDs reused across upstream collections (fail closed rather than silently mislink).
5. Validate all seven upstream result arrays, unique nonblank IDs per array, exact state enums; also reject duplicate IDs across all seven arrays. Do not re-run domain analysis, trust their review state only as review projection.
6. If any referenced upstream item is blocked (`BLOCKED_BY_GAP_EVIDENCE`, `BLOCKED_BY_OPTION_EVIDENCE`, `BLOCKED_BY_DECISION_EVIDENCE`, `BLOCKED_BY_EVIDENCE`) return `BLOCKED_BY_EVIDENCE` and `UPSTREAM_BLOCKED:<id>` for each referenced blocked item in stable first-reference order. Note: C1 `INSUFFICIENT_EVIDENCE` and C2 `BLOCKED_BY_GAP_EVIDENCE` are blocked; C3a etc have their own enums. No assumption that all upstream IDs are referenced.
7. Otherwise, referenced upstream items with states `INSUFFICIENT_EVIDENCE`, `HYPOTHESIS_CONTESTED`, `HYPOTHESIS_UNSUBSTANTIATED`, `NEEDS_CONFIRMATION`, or any human decision *candidate* yield `NEEDS_CONFIRMATION` with `UPSTREAM_REVIEW_NEEDED:<id>`; add `DECISION_NOT_AUTHENTICATED:<id>` for referenced decision candidates regardless of their REVIEWABLE state. Add `SOURCE_NOT_PROVIDED:<statementId>` for any source-free non-UNKNOWN statement; add `NO_SECTIONS` if none.
8. If none of the above, `REVIEWABLE_DRAFT` means a structurally reviewable **draft**. Never call it customer approved, delivered, signed, verified by Core, or publishable.
9. All views share the same statement IDs and sources. Do not generate a separate conclusion for slides. No Word/PDF/PPTX rendering in D1; no customer-ready document claims. No AI/DB/API/Work/FACTACT Core/authorization, no actor assignment, no automatic priority, no maturity score, no prices.
10. Empty/healthy gap lists and zero scenarios are valid. No forced section count, option count, 3 scenarios or chapter template. Evidence Book index is a reference list, not duplicated evidence bytes. The output may omit unreferenced statements from sections but evidenceIndex includes all supplied statements to avoid loss.
11. If the source code exports differ from the declared types, STOP with exact mismatch; do not edit upstream files.

## Tests
- Mixed FUTURE/FACT-reference/UNKNOWN/HYPOTHESIS/PROPOSAL/EXPECTED_CHANGE statements preserve epistemic kind, sources and stable section order.
- Valid source-linked verified reference remains a reference, not new FACTACT authorization.
- Missing verified source fails; source-free non-UNKNOWN gets review reason; UNKNOWN source-free stays UNKNOWN.
- Referenced upstream blocked / needs confirmation / decision candidate produce correct readiness/reasons; unreferenced blocked does not contaminate report.
- Unknown, duplicated and ambiguous IDs rejected; empty scenarios, no sections, empty statements supported.
- Deep-detached output, no input mutation, deterministic repeated runs; no separate slide conclusion.
- Build, new tests, all 93 existing tests, `git diff --check`.

## Execution
Create branch from C4c PR #76 HEAD `9c4ec8431780f11876c8c3ab9f202ce5df961ae6`; Draft PR base `feat/paid-assessment-roadmap-phase-c4c-20261122`.
STOP on third-file need, missing contracts, or customer-facing semantic decision. Do not amend previous PRs. No merge, migration, GCP, production, file rendering, or public delivery.
