# IT経営KAIZEN 設計Assessment Phase C4c — 12-month staged roadmap review, code-level specification

Date: 2026-11-22
Status: CODE-LEVEL SPEC / NO AUTHORIZATION TO EXECUTE OR MERGE
Baseline: C4b Draft PR #73 HEAD `f43c5132cf96f42b3640c77f902f1f8ea26e4245`.
Authority: git_KAIZEN `docs/74-it-management-kaizen-design-decision-investment-method-v1.md` (CANONICAL) and `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` (PILOT OUTPUT PROPOSAL); `docs/87-design-assessment-analysis-and-initial-fact-import-business-decisions-20261117.md`.
Related: C3a ACT option, C3b scenario, C4a human decision candidate, C4b initial action draft. C4b is NOT a committed work order.

## FIT/GAP
- Canonical describes multi-year, staged investment, with Year 1 ACTs and future-year candidates revisited after NEW FACT. 12 months is a useful first-year planning horizon, NOT a promise of completion, irreversible authorization, or a replacement for multi-year direction.
- C4b has optional 1–30/31–60/61–90/LATER/TO_BE_DECIDED human-entered initial actions; it does not define a 12-month roadmap.
- No system-authenticated Human Decision, actor allocation, actual Work, change, or verified NEW FACT yet. C4c must remain a human-authored, non-persistent planning projection.

## Allowed code files only
- `src/domain/paidAssessmentRoadmapReview.ts`
- `test/paidAssessmentRoadmapReview.test.ts`

## Contract
```ts
import type { ActOptionReviewResult } from './paidAssessmentActOptionReview';
import type { DecisionSessionReviewResult } from './paidAssessmentDecisionSessionReview';
import type { InitialActionPlanReview } from './paidAssessmentInitialActionPlan';

export type RoadmapHorizon = 'MONTHS_1_3' | 'MONTHS_4_6' | 'MONTHS_7_9' | 'MONTHS_10_12' | 'BEYOND_12_MONTHS' | 'TO_BE_DECIDED';
export type RoadmapCommitment = 'SELECTED_ACT_DRAFT' | 'FUTURE_CANDIDATE';
export interface RoadmapItemDraft {
 id:string;
 actId:string;
 decisionSessionId?:string;
 initialActionIds:readonly string[];
 horizon:RoadmapHorizon;
 commitment:RoadmapCommitment;
 sequence:number;
 purpose:string;
 expectedChange:string;
 verificationApproach:string;
 prerequisites:readonly string[];
 dependencies:readonly string[];
 risks:readonly string[];
 reassessmentTrigger:string; // when to revisit using NEW FACT, not a scheduled job
 openQuestions:readonly string[];
 authoredBy?:string;
}
export type RoadmapReviewState = 'REVIEWABLE_DRAFT' | 'NEEDS_CONFIRMATION' | 'BLOCKED_BY_EVIDENCE';
export interface RoadmapReviewResult {
 items:Array<RoadmapItemDraft & {state:RoadmapReviewState;reviewReasons:string[]}>;
 counts:Record<RoadmapReviewState,number>;
}
export function reviewPaidAssessmentRoadmap(
 options:ActOptionReviewResult,
 decisions:DecisionSessionReviewResult,
 initialActions:InitialActionPlanReview,
 drafts:readonly RoadmapItemDraft[],
):RoadmapReviewResult;
```

## Deterministic rules
1. Validate all input arrays, unique nonblank upstream IDs, exact upstream state enums; validate every roadmap item unique nonblank id, existing ACT, positive integer sequence, exact horizon and commitment enums, nonblank purpose/expectedChange/verificationApproach/reassessmentTrigger, optional authoredBy nonblank, nonblank string-array entries. Preserve order and deep-copy. No automatic dates.
2. `SELECTED_ACT_DRAFT` requires decisionSessionId pointing to a C4a `ACT_SELECTION` candidate whose selectedActIds contains actId; it is not approved/committed despite the name. `FUTURE_CANDIDATE` MUST NOT have decisionSessionId; it is not a selected ACT. Both may appear in any horizon, including BEYOND_12_MONTHS and TO_BE_DECIDED. Never auto-promote candidate to selected.
3. Every initialActionId must exist in C4b, must have matching actId, and for SELECTED_ACT_DRAFT must match decisionSessionId. FUTURE_CANDIDATE requires empty initialActionIds (avoid treating future idea as execution). Duplicate initialActionIds in a roadmap item fail. Allow no initial actions for selected ACT.
4. For SELECTED_ACT_DRAFT, linked decision `BLOCKED_BY_OPTION_EVIDENCE`, ACT `BLOCKED_BY_GAP_EVIDENCE`, or linked action `BLOCKED_BY_DECISION_EVIDENCE` yields `BLOCKED_BY_EVIDENCE`; reasons `DECISION_BLOCKED:<id>`, `ACT_BLOCKED:<id>`, `ACTION_BLOCKED:<id>` in this order, stable by linked action order. For FUTURE_CANDIDATE, blocked ACT yields `BLOCKED_BY_EVIDENCE` (cannot represent confirmed future execution).
5. Otherwise, linked decision `NEEDS_CONFIRMATION`, ACT `NEEDS_CONFIRMATION`, linked action `NEEDS_CONFIRMATION`, or openQuestions nonempty yields `NEEDS_CONFIRMATION`, with deterministic codes `DECISION_NEEDS_CONFIRMATION:<id>`, `ACT_NEEDS_CONFIRMATION:<id>`, `ACTION_NEEDS_CONFIRMATION:<id>`, `ROADMAP_QUESTIONS_REMAIN`. FUTURE_CANDIDATE always yields `NEEDS_CONFIRMATION` (reason `FUTURE_ACT_REQUIRES_NEW_DECISION`) even if structurally complete: Year 2/3 candidates are not preapproved.
6. Otherwise `REVIEWABLE_DRAFT` means only a structurally reviewable **draft**. Never label as authenticated Human Decision, execution commitment, schedule, Work or measured CHANGE. Do not rank or score.
7. No requirement to fill all four quarterly windows, no forced 12-month horizon, no fixed count of ACTs, no generated milestones, no investment amounts or actor assignment. Empty drafts valid. This 12-month slice does not replace multi-year roadmap standard; BEYOND_12_MONTHS is a directional candidate only.
8. Validate C4a disposition enum and selected ACT IDs; validate upstream action's actId/decisionSessionId references when linked. Do not re-authenticate Core or invent authorization.

## Tests
- Selected ACT with matching decision, optional initial action, MONTHS_1_3 → REVIEWABLE_DRAFT.
- Selected ACT in later horizon and no initial actions valid; no forced 90-day completion.
- Future candidate in BEYOND_12_MONTHS → NEEDS_CONFIRMATION / FUTURE_ACT_REQUIRES_NEW_DECISION.
- Blocked and confirmation-needed propagation from ACT, decision and initial action; precedence deterministic.
- HOLD/STOP/ADDITIONAL_EVIDENCE cannot be used as selected decision; dangling/mismatched ACT/action references fail closed.
- Invalid horizon/commitment/sequence, duplicate IDs, blank text, invalid states fail closed.
- Zero items, stable ordering, provenance, no input mutation, detached output, repeated deterministic results.
- Build and regression C4b 9 + C4a 9 + C3b 9 + C3a 9 + C2 10 + C1 11 + B1 8 + A 9 + eligibility 10 = 84, plus new C4c tests, diff check.

## Execution
Branch from exact C4b PR #73 HEAD `f43c5132cf96f42b3640c77f902f1f8ea26e4245`, Draft PR base `feat/paid-assessment-initial-actions-phase-c4b-20261122`.
No changes to previous PRs. STOP on upstream mismatch, need for third code file, authorization assumptions or business decision. No merge, DB, API, Work, GCP, AI, migration, production, report generation or financial estimation.
After C4c: prioritize D customer deliverables, E workflow integration, F pilot E2E; do not continue endless domain-only features.
