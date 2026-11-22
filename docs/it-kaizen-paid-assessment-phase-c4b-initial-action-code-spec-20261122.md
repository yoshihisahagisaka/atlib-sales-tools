# IT経営KAIZEN 設計Assessment Phase C4b — Initial Action Plan (up to 90 days), code-level specification

Date: 2026-11-22
Status: PREPARED / BLOCKED UNTIL C4a DRAFT PR REVIEW AND HEAD FIXED
Authority: git_KAIZEN `docs/74-it-management-kaizen-design-decision-investment-method-v1.md` (CANONICAL), `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` (PILOT OUTPUT PROPOSAL), `docs/87-design-assessment-analysis-and-initial-fact-import-business-decisions-20261117.md`; Assessment FACTACT boundary.
Predecessors: C3a PR #65, C3b PR #67, C4a Issue #69 and `docs/it-kaizen-paid-assessment-phase-c4a-decision-session-code-spec-20261122.md`.

## FIT/GAP
- C3a ACT Options carry expectedChange, verificationApproach, dependencies, risks and **actor candidates**, not assigned actors.
- C3b scenarios are comparison projections, not selected/approved.
- C4a planned decision-session review is a **non-persistent candidate projection**, NOT an authenticated/approved decision.
- Canonical: Human decides ACT before Actor Allocation; ACT execution is not CHANGE; actual CHANGE requires new verified FACT. A 90-day plan is an optional initial implementation detail, NOT a mandatory universal fixed period, contract, work order, or completed task.
- Missing: human-authored, read-only *draft initial action plan* with action sequencing, prerequisites, actor **proposal**, milestones, verification and links to ACT. No automatic scheduling or approval.

## Scope gate
Do not start code or create a stacked branch until C4a Draft PR exists, its exact HEAD and exported TypeScript contract are checked, and the parent implementation is accepted. At that point set new branch from C4a exact HEAD; base the Draft PR on the C4a branch. Do not assume C4a is complete merely because its issue exists.

Allowed new files after gate:
- `src/domain/paidAssessmentInitialActionPlan.ts`
- `test/paidAssessmentInitialActionPlan.test.ts`

## Intended contract (verify against actual C4a exports before implementation)
```ts
import type { ActOptionReviewResult } from './paidAssessmentActOptionReview';
import type { DecisionSessionReviewResult } from './paidAssessmentDecisionSessionReview';

export interface InitialActionDraft {
  id: string;
  decisionSessionId: string;
  actId: string;
  title: string;
  purpose: string;
  sequence: number; // positive integer; human-authored, no auto-prioritization
  targetWindow: 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'LATER' | 'TO_BE_DECIDED';
  prerequisites: readonly string[];
  actorProposal?: { label: string; rationale: string }; // proposal only, never committed assignment
  deliverable: string;
  expectedChange: string; // not measured actual
  verificationApproach: string;
  openQuestions: readonly string[];
  authoredBy?: string;
}
export type InitialActionReviewState = 'REVIEWABLE_DRAFT' | 'NEEDS_CONFIRMATION' | 'BLOCKED_BY_DECISION_EVIDENCE';
export interface InitialActionPlanReview {
  actions: Array<InitialActionDraft & { state: InitialActionReviewState; reviewReasons: string[] }>;
  counts: Record<InitialActionReviewState, number>;
}
export function reviewPaidAssessmentInitialActions(
  options: ActOptionReviewResult,
  decisions: DecisionSessionReviewResult,
  drafts: readonly InitialActionDraft[],
): InitialActionPlanReview;
```

## Review rules
1. Pure deterministic validation, unique nonblank action IDs, nonblank human text, positive integer sequence, exact targetWindow enum, optional actor proposal with nonblank label/rationale, no blank list entries, no mutation/deep detached output.
2. Every decisionSessionId exists in C4a projection, every actId exists in C3a, and every draft ACT must be **explicitly listed in that decision session's selectedActIds**. No action for HOLD/STOP/ADDITIONAL_EVIDENCE dispositions; fail closed on non-ACT_SELECTION. Multiple actions for one ACT allowed with unique action IDs and human sequence.
3. If decision session state `BLOCKED_BY_OPTION_EVIDENCE` or linked ACT state `BLOCKED_BY_GAP_EVIDENCE`, action `BLOCKED_BY_DECISION_EVIDENCE` with deterministic reason codes `DECISION_BLOCKED:<id>`, `ACT_BLOCKED:<id>`.
4. Otherwise if decision state `NEEDS_CONFIRMATION`, ACT state `NEEDS_CONFIRMATION`, or action openQuestions nonempty, `NEEDS_CONFIRMATION` with codes `DECISION_NEEDS_CONFIRMATION:<id>`, `ACT_NEEDS_CONFIRMATION:<id>`, `ACTION_QUESTIONS_REMAIN`.
5. Otherwise `REVIEWABLE_DRAFT`. All states are *draft structural reviews*, NOT a valid management authorization, a work order or an execution commitment. Actor proposal never equals allocation.
6. Do not require a 90-day action for every ACT. DAYS_* windows are optional human choices; LATER and TO_BE_DECIDED explicitly valid. No calculated dates, duration estimates, forced 30-day milestones or implied 90-day completion.
7. Do not derive a schedule from sequence or claim ACT execution, actual CHANGE or ROI. No external Work, DB, GCP, API, AI, FACTACT authority, persistence, roadmap or document generation.
8. Empty drafts valid; no auto-created plan. Keep all caller-entered ordering and textual provenance.

## Tests and gates
- Valid selected ACT + valid decision → REVIEWABLE_DRAFT; actor remains a proposal.
- NEEDS_CONFIRMATION/blocked propagation from decision and ACT.
- HOLD/STOP/ADDITIONAL_EVIDENCE cannot produce an action, unknown/held/unselected ACT rejected.
- Multiple steps per ACT, optional LATER/TO_BE_DECIDED, zero drafts, no forced 90-day schedule.
- Duplicate IDs, invalid sequence/window, malformed actor proposal, blank strings/arrays fail closed.
- Deep detached copy, stable ordering and deterministic output.
- Re-run all C4a/C3b/C3a/C2/C1/B1/A/eligibility tests, build and diff check.

## STOP / follow-on
STOP if actual C4a contract differs, an authenticated decision is required, or additional files/business decisions needed. No PR creation before C4a reviewed. No merge, migration, production. C4c roadmap, D deliverables, E integration and F pilot are later separate slices. This plan review is not equivalent to customer delivery readiness.
