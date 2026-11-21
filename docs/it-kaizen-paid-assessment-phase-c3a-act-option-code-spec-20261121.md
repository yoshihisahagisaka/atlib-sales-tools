# IT経営KAIZEN 設計Assessment Phase C3a — ACT Option portfolio review code specification

Date: 2026-11-21
Status: CODE-LEVEL IMPLEMENTATION SPEC / NO MERGE OR PRODUCTION AUTHORIZATION
Starting source: Phase C2 Draft PR #63 HEAD `fdc33776f83fa89360b92d8051da59879a1f7e83`.
Business authority: git_KAIZEN `docs/74-it-management-kaizen-design-decision-investment-method-v1.md` (CANONICAL), `docs/73-it-management-kaizen-design-assessment-standard-offer-v1.md`, `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` (pilot candidate), `docs/87-design-assessment-analysis-and-initial-fact-import-business-decisions-20261117.md`. Responsibility: `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
Code sources: `src/domain/paidAssessmentGapReview.ts`, `src/domain/paidAssessmentRootCauseReview.ts`, `src/domain/assessmentStructureRule.ts`, `src/domain/finalRuleEngine.ts`.

## FIT/GAP and phase boundary
- C1 returns explicit reviewed GAP candidates, including healthy/insufficient cases. It does not certify Core facts.
- C2 returns source-linked causal hypotheses, including support/contradiction/insufficient. `HYPOTHESIS_WITH_VERIFIED_SUPPORT` is NOT proven cause.
- Existing `assessmentStructureRule` is commercial scope suggestion, not ACT design or priority.
- The Canonical Design Space is 3 domains × 6 lenses, **not** an 18-cell questionnaire or maturity score.
- Missing: deterministic review of **human-authored ACT options**, with traceable Future/GAP/cause links, risks, dependencies, expected change, and explicit unresolved assumptions.
- C3a is the option portfolio only. Scenario comparison, human priority, 90-day actions and 12-month roadmap are separate subsequent slices, avoiding an oversized implementation and premature business decisions.

## Allowed files
Add only:
- `src/domain/paidAssessmentActOptionReview.ts`
- `test/paidAssessmentActOptionReview.test.ts`

## Pure input/output contract
```ts
import type { AssessmentArea, PreparationSourceRef } from './paidAssessmentPreparation';
import type { GapReviewResult } from './paidAssessmentGapReview';
import type { RootCauseReviewResult } from './paidAssessmentRootCauseReview';

export type ActDesignLens =
  | 'ELIMINATE' | 'AUTOMATE' | 'STANDARDIZE' | 'DELEGATE' | 'RETAIN' | 'ORGANIZE';
export type ActOptionReviewState = 'REVIEWABLE' | 'NEEDS_CONFIRMATION' | 'BLOCKED_BY_GAP_EVIDENCE';
export interface ActOptionCandidate {
  id: string;
  title: string; // outcome-oriented ACT name, not vendor/product name only
  description: string; // human-authored actual action
  why: string; // human-authored linkage to Future/management decision
  area: AssessmentArea;
  lenses: readonly ActDesignLens[]; // 1..6, distinct
  future: { statement: string; source: PreparationSourceRef };
  gapIds: readonly string[]; // one or more C1 reviewed gaps
  rootCauseHypothesisIds: readonly string[]; // may be empty; never causal confirmation
  expectedChange: { statement: string; verificationApproach: string }; // expectation, never actual result
  assumptions: readonly string[]; // explicit remaining UNKNOWN / dependencies on confirmation
  dependencies: readonly string[]; // human-authored, no auto scheduling
  risks: readonly string[];
  actorCandidates: readonly ('CUSTOMER' | 'EXISTING_VENDOR' | 'OTHER_VENDOR' | 'ATLIB' | 'COMBINATION')[];
  authoredBy?: string; // attribution, not authorization
}
export interface ActOptionReviewResult {
  options: Array<ActOptionCandidate & { state: ActOptionReviewState; reviewReasons: string[] }>;
  counts: Record<ActOptionReviewState, number>;
}
export function reviewPaidAssessmentActOptions(
  gaps: GapReviewResult,
  rootCauses: RootCauseReviewResult,
  candidates: readonly ActOptionCandidate[],
): ActOptionReviewResult;
```

## Deterministic rules
1. Validate input arrays and candidate shape; unique nonblank option IDs; nonblank title/description/why/future statement/expectedChange statement/verificationApproach. Validate source kind/id/positive version/optional lowercase 64-hex hash. Reject invalid area/lenses, repeated lens, empty lens array, invalid actor candidates, blank assumptions/dependencies/risks, duplicate gapIds/rootCauseHypothesisIds. Preserve order and deep-copy.
2. Each `gapId` must exist in C1. A candidate requires >=1 gap ID. Each `rootCauseHypothesisId` must exist in C2 and must point to **one of the option's gapIds**. Reject dangling/mislinked references, rather than guessing.
3. If **any** linked gap state is not `CONFIRMED_DIFFERENCE`, option state is `BLOCKED_BY_GAP_EVIDENCE` with deterministic `reviewReasons` containing `GAP_NOT_CONFIRMED:<gapId>` for each blocked gap.
4. Otherwise, if any linked cause state is `HYPOTHESIS_CONTESTED`, `HYPOTHESIS_UNSUBSTANTIATED`, or `BLOCKED_BY_GAP_EVIDENCE`, option is `NEEDS_CONFIRMATION` with `CAUSE_NOT_ESTABLISHED:<hypothesisId>` for each such cause. If `assumptions` nonempty, also add `ASSUMPTION_REMAINS` once. **No** cause state means causal certainty; even `HYPOTHESIS_WITH_VERIFIED_SUPPORT` is merely supported hypothesis, and a reviewable option does not assert causality.
5. Otherwise, if assumptions nonempty, state `NEEDS_CONFIRMATION`; else `REVIEWABLE`. A `REVIEWABLE` option is only structurally reviewable, **not approved, prioritized, safe to execute or guaranteed to work**. Empty cause references are allowed because not every useful ACT requires a proven cause.
6. `future` remains a goal, `expectedChange` remains an expectation, and `actorCandidates` remain candidates. No automatic ROI, cost, impact, severity, priority, commitment, procurement or actor assignment.
7. Empty candidates returns empty options and zero counts. Do not force 2+ options, all 3 areas or all 6 lenses. No AI/DB/network/API, no mutation.
8. Validate that C1 and C2 states are from exact enums and their IDs unique; validate C2 hypothesis `gapId` exists in C1. This function does not re-authenticate Core provenance or infer real-world evidence.

## Tests
- Valid single ACT with 1 lens and a confirmed gap, no cause → REVIEWABLE, all links preserved.
- Valid option with supported cause → REVIEWABLE but not cause confirmed; expectedChange not actual.
- Unconfirmed C1 gap → BLOCKED_BY_GAP_EVIDENCE.
- Contested/unsubstantiated cause or explicit assumption → NEEDS_CONFIRMATION, exact reviewReasons.
- Invalid/mismatched cause-to-gap link, unknown gap/cause IDs, duplicate IDs, invalid lens/actor/source/version/hash fail closed.
- Zero options, one option, several areas and lens subsets allowed (not 18-item audit).
- Preserve source refs, input order, deep detached outputs and deterministic repeat; no mutation.
- Regression C2 10, C1 11, B1 8, A 9, eligibility 10; build and diff check.

## Execution gate
Create independent branch from exact C2 HEAD `fdc33776f83fa89360b92d8051da59879a1f7e83`, Draft PR base `feat/paid-assessment-root-cause-phase-c2-20261121`. Do not amend PR #48/#56/#59/#61/#63.
STOP on source contract mismatch, need for additional code file, Product authorization semantics or business decisions. No merge, DB, migration, AI integration, UI, GCP, production, billing or pricing engine.

## Subsequent phases
C3b: human-authored management-priority scenario comparison of reviewed ACT options; C4: human decision, 90-day/12-month planning. These are not authorized by C3a.
