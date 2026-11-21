# IT経営KAIZEN 設計Assessment Phase C3b — Management Priority Scenario Comparison code specification

Date: 2026-11-22
Status: CODE-LEVEL SPEC / NOT HUMAN DECISION, PR MERGE OR PRODUCTION AUTHORIZATION
Baseline: Phase C3a Draft PR #65 HEAD `331f5f37c2fd26048fdff3b96260bd01e7f4e308`.
Canonical: git_KAIZEN `docs/74-it-management-kaizen-design-decision-investment-method-v1.md` (CANONICAL), `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` (pilot candidate), `docs/87-design-assessment-analysis-and-initial-fact-import-business-decisions-20261117.md` (DECIDED); Assessment responsibility boundary `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
Code reviewed: `src/domain/paidAssessmentActOptionReview.ts` and test in C3a PR #65; `src/domain/assessmentStructureRule.ts` is commercial scope only, NOT scenario ranking.

## FIT/GAP
C3a provides human-authored ACT options, explicit Future/GAP/cause links, expected change, risk, dependencies, actor candidates, and states REVIEWABLE / NEEDS_CONFIRMATION / BLOCKED_BY_GAP_EVIDENCE. It does not establish actual investment, relative priority, approval or human decision. Canonical requires optional comparison of different management priorities without inventing three scenarios, automatic scoring or preferred vendor. Missing: a pure comparison view of explicitly human-authored scenarios and their selected ACT IDs, assumptions and tradeoffs.

## Bounded implementation
Allowed new files ONLY:
- `src/domain/paidAssessmentScenarioComparison.ts`
- `test/paidAssessmentScenarioComparison.test.ts`

### Types
```ts
import type { ActOptionReviewResult } from './paidAssessmentActOptionReview';
import type { PreparationSourceRef } from './paidAssessmentPreparation';

export interface ManagementScenarioCandidate {
  id: string;
  title: string;
  managementPriority: { statement: string; source: PreparationSourceRef };
  rationale: string; // why this priority changes the option selection
  optionIds: readonly string[]; // ordered, explicitly selected by consultant for comparison
  expectedDirection: string; // expectation, not actual outcome
  tradeoffs: readonly string[];
  risks: readonly string[];
  assumptions: readonly string[];
  investmentCharacter: 'NOT_ASSESSED' | 'QUALITATIVE_ONLY' | 'EVIDENCE_BACKED_RANGE';
  investmentNote?: string; // narrative only; not a computed price or quote
  authoredBy?: string; // attribution only, not approval
}
export type ScenarioReviewState = 'REVIEWABLE' | 'NEEDS_CONFIRMATION' | 'BLOCKED_BY_OPTION_EVIDENCE';
export interface ManagementScenarioReview {
  scenarios: Array<ManagementScenarioCandidate & { state: ScenarioReviewState; reviewReasons: string[] }>;
  counts: Record<ScenarioReviewState, number>;
}
export function reviewPaidAssessmentScenarios(
  options: ActOptionReviewResult,
  scenarios: readonly ManagementScenarioCandidate[],
): ManagementScenarioReview;
```

### Rules
1. Validate options array, unique nonblank option IDs, exact C3a option state enum; validate scenarios array, unique nonblank scenario IDs, title, priority statement, rationale, expectedDirection, optional authoredBy, exact investmentCharacter, optional investmentNote; source kind/id/positive integer version/optional 64 lowercase hex hash. No reliance on free-text interpretation.
2. Scenario must reference >=1 unique existing option ID, preserving explicit order. Duplicate/dangling option IDs fail closed. Reject blank tradeoffs/risks/assumptions entries; arrays may be empty. Empty scenario list is valid; do NOT force 2 or 3 scenarios.
3. `EVIDENCE_BACKED_RANGE` requires a nonblank investmentNote **and** explicit externally supplied evidence source reference: add optional `investmentEvidence?: PreparationSourceRef` to the interface, mandatory only for `EVIDENCE_BACKED_RANGE`. Validate source; this is still an asserted reference, not verified by this pure function. `QUALITATIVE_ONLY` requires nonblank investmentNote. `NOT_ASSESSED` may omit note and evidence; do not synthesize amounts. Never parse note into price.
4. If any linked option is `BLOCKED_BY_GAP_EVIDENCE`, scenario state is `BLOCKED_BY_OPTION_EVIDENCE` with `OPTION_BLOCKED:<id>` per blocked option in scenario order.
5. Otherwise, if any linked option is `NEEDS_CONFIRMATION`, state `NEEDS_CONFIRMATION` with `OPTION_NEEDS_CONFIRMATION:<id>`; if assumptions nonempty append `ASSUMPTION_REMAINS` once. If investmentCharacter is `EVIDENCE_BACKED_RANGE`, add no automated endorsement of evidence.
6. Otherwise if assumptions nonempty, state `NEEDS_CONFIRMATION`; else `REVIEWABLE`. `REVIEWABLE` means structural review only, NOT recommended, approved, ranked, selected or committed. No winner, default priority or scenario score.
7. Copy nested source references, arrays and objects; deterministic stable ordering, no mutation, no AI, DB, API, FACTACT authority, Work/Evidence registry, price engine or UI.
8. The output may contain one or multiple human-authored scenarios, including only one. It never generates scenarios. Actor candidates in C3a are not assignments. No 90-day plan/12-month roadmap in this slice.

### Tests
- Single scenario + one REVIEWABLE option → REVIEWABLE, exact source/option order.
- Multiple scenarios with different explicit priorities → stable, no automatic winner.
- NEEDS_CONFIRMATION option/assumptions → NEEDS_CONFIRMATION with exact reasons.
- BLOCKED option → BLOCKED_BY_OPTION_EVIDENCE, even with other reviewable options.
- No scenarios → empty counts. Missing/duplicate option ID, invalid state, malformed source/hash/version, blank title/priority, bad investment enum fail closed.
- QUALITATIVE_ONLY requires note; EVIDENCE_BACKED_RANGE requires note + investmentEvidence; neither implies actual quote.
- Deep immutability/detachment and deterministic repeated calls.
- Existing C3a 9, C2 10, C1 11, B1 8, A 9, eligibility 10 tests remain PASS; `npm run build` and `git diff --check`.

## Git/STOP
Create new branch from C3a PR #65 HEAD `331f5f37c2fd26048fdff3b96260bd01e7f4e308`; Draft PR base `feat/paid-assessment-act-options-phase-c3a-20261121`. Do not amend PR #48/#56/#59/#61/#63/#65. STOP on mismatch with actual exported C3a contract, a required third code file, or any need for a new Business/Product decision. No merge, migration, GCP, production or pricing changes.
