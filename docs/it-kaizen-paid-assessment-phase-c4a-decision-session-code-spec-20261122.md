# IT経営KAIZEN 設計Assessment Phase C4a — Human Decision session review projection

Date: 2026-11-22
Status: CODE-LEVEL SPEC / NOT AN AUTHORIZED DECISION RECORD OR FACTACT COMMAND
Source baseline: C3b Draft PR #67 HEAD `e8fd05cc207a6628de20f94aefbcbc948fff53c2`.
Canonical: git_KAIZEN `docs/74-it-management-kaizen-design-decision-investment-method-v1.md` (CANONICAL), `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` (pilot output proposal), `docs/73-it-management-kaizen-design-assessment-standard-offer-v1.md`, `docs/87-design-assessment-analysis-and-initial-fact-import-business-decisions-20261117.md`; Assessment responsibility boundary `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
Code source: `src/domain/paidAssessmentActOptionReview.ts`, `src/domain/paidAssessmentScenarioComparison.ts` at C3b head; no actual decision persistence/authorization established.

## FIT/GAP
- C3a supplies human-authored ACT options with review states, not approved execution decisions.
- C3b supplies human-authored scenarios with review states, not selected winners.
- Canonical: management decides **ACT**, not CHANGE; Stop/Hold/Additional Evidence are valid outcomes. Actor allocation occurs **after** ACT choice; Expected Change is not Actual Change.
- Gap: a deterministic, non-persistent **decision-session review projection** that checks explicit human-entered selections and exposes unresolved evidence. It must not claim the decision is authenticated, approved, committed, or an executable Work order.
- Decision ownership/authorization/audit must later use Product-approved scoped authority and Change→Verify→Commit; no invented API.

## Allowed implementation files ONLY
- `src/domain/paidAssessmentDecisionSessionReview.ts`
- `test/paidAssessmentDecisionSessionReview.test.ts`

## Types
```ts
import type { ActOptionReviewResult } from './paidAssessmentActOptionReview';
import type { ManagementScenarioReview } from './paidAssessmentScenarioComparison';
import type { PreparationSourceRef } from './paidAssessmentPreparation';

export type DecisionSessionDisposition = 'ACT_SELECTION' | 'ADDITIONAL_EVIDENCE' | 'HOLD' | 'STOP';
export type DecisionSessionReviewState = 'REVIEWABLE' | 'NEEDS_CONFIRMATION' | 'BLOCKED_BY_OPTION_EVIDENCE';
export interface DecisionSessionCandidate {
  id: string;
  disposition: DecisionSessionDisposition;
  decisionOwnerRef: string; // claimed identity for presentation only, NOT an authenticated Actor
  managementPriority: { statement: string; source: PreparationSourceRef };
  selectedScenarioId?: string; // optional, no winner inferred
  selectedActIds: readonly string[]; // explicit human selection order
  heldActIds: readonly string[]; // explicitly deferred options
  rationale: string;
  additionalEvidenceNeeded: readonly string[];
  nextDecisionTiming?: string; // human text, no scheduled automation
  enteredBy?: string; // attribution only
}
export interface DecisionSessionReviewResult {
  decisions: Array<DecisionSessionCandidate & { state: DecisionSessionReviewState; reviewReasons: string[] }>;
  counts: Record<DecisionSessionReviewState, number>;
}
export function reviewPaidAssessmentDecisionSessions(
  options: ActOptionReviewResult,
  scenarios: ManagementScenarioReview,
  candidates: readonly DecisionSessionCandidate[],
): DecisionSessionReviewResult;
```

## Deterministic review rules
1. Validate input arrays, unique nonblank upstream option/scenario IDs, exact upstream state enums. Validate candidate ID unique/nonblank, disposition enum, decisionOwnerRef, managementPriority statement/source, rationale and optional nextDecisionTiming/enteredBy. Source kind/id/positive version/optional 64-lowercase-hex hash. All strings arrays nonblank entries, no duplicate IDs, no intersection between selectedActIds and heldActIds.
2. `ACT_SELECTION` requires >=1 selectedActId; `ADDITIONAL_EVIDENCE`, `HOLD`, `STOP` require zero selectedActIds. `ADDITIONAL_EVIDENCE` requires nonempty additionalEvidenceNeeded; HOLD/STOP require a nonblank rationale (as for all dispositions). No auto-select, default ACT or required scenario.
3. Every selected/held ACT ID must exist in C3a. Optional selectedScenarioId must exist in C3b; if present, every selectedActId must be listed in that scenario's optionIds. Do not require all scenario options to be selected. Do not require a selected scenario for ACT_SELECTION.
4. For `ACT_SELECTION`, any selected ACT `BLOCKED_BY_GAP_EVIDENCE` → `BLOCKED_BY_OPTION_EVIDENCE` with `ACT_BLOCKED:<id>` for each blocked ACT in selection order. If linked scenario is `BLOCKED_BY_OPTION_EVIDENCE`, also add `SCENARIO_BLOCKED:<id>`; blocked state wins.
5. Otherwise, any selected ACT `NEEDS_CONFIRMATION` → `NEEDS_CONFIRMATION` with `ACT_NEEDS_CONFIRMATION:<id>`; linked scenario `NEEDS_CONFIRMATION` → `SCENARIO_NEEDS_CONFIRMATION:<id>`. For `ACT_SELECTION` with nonempty additionalEvidenceNeeded append `ADDITIONAL_EVIDENCE_REMAINS`. If no reasons, state `REVIEWABLE`. This means structurally reviewable **only**, not approved.
6. For `ADDITIONAL_EVIDENCE`, `HOLD`, `STOP`: always `REVIEWABLE` if structurally valid, even when referenced held ACTs are blocked; do not penalize legitimate hold/stop. The result remains a *candidate*, not a persisted decision.
7. Preserve source, scenario/ACT references, explicit order and human text. Deep-copy, deterministic, no mutation. Empty candidates valid, no auto-created decisions.
8. Do not infer priority, assign actor, create Work, schedule dates, mark actual Change, generate roadmap or persist approval. No DB/API/AI/FACTACT authorization.
9. Explicitly exclude actor allocation from this phase. A future separate contract may handle it only **after** a verified human ACT decision.

## Tests
- ACT_SELECTION with one REVIEWABLE ACT, no scenario → REVIEWABLE, no approval claim.
- ACT_SELECTION with selected scenario and subset of its ACTs → REVIEWABLE.
- Selected ACT blocked → BLOCKED_BY_OPTION_EVIDENCE; selected ACT needing confirmation → NEEDS_CONFIRMATION; scenario states propagate.
- ADDITIONAL_EVIDENCE, HOLD and STOP valid with no selected ACT, no forced action; evidence-required disposition requires evidence list.
- Dangling/duplicate ACT or scenario IDs, mismatched scenario selection, selected/held overlap, invalid disposition/source/version/hash fail closed.
- Zero candidates valid; source provenance, order, deep copy and determinism.
- Regression C3b 9, C3a 9, C2 10, C1 11, B1 8, A 9, eligibility 10; TypeScript build and diff check.

## Git and STOP
New branch from exact C3b HEAD `e8fd05cc207a6628de20f94aefbcbc948fff53c2`; Draft PR base `feat/paid-assessment-scenarios-phase-c3b-20261122`.
Do not modify #48/#56/#59/#61/#63/#65/#67.
STOP if source contracts mismatch, if genuine identity/approval must be asserted, if another code file must change, or if new Business/Product decision required.
No merge, migration, GCP, production, price, Work or FACTACT persistence.
