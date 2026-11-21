# Paid Design Assessment Phase B — Work-context presentation boundary and Codex implementation spec

Date: 2026-11-21
Status: CODE-LEVEL SPEC / NO MERGE, MIGRATION OR RELEASE AUTHORIZATION
Baseline paid Assessment branch: `823f9cc4299619a26a36f3532478a8c58792b081`
Phase A actual Draft PR #56 HEAD: `35cc6a2fd4f53497aeee01d84714d24c809dbf3e` (not merged).
Business goal: `docs/it-kaizen-assessment-proposal-goal-fit-gap-20261121.md`.
Architecture: `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
Product authority: git_KAIZEN `docs/18-operator-work-context-v1.md`, `docs/92-assessment-initial-information-work-driven-fact-verification-business-decision-20261117.md`, `docs/factact-device-initial-fact-work-verification-implementation-plan-20261117.md`, `docs/adr/0005-change-lifecycle.md`.

## Verified source Fit/Gap
- Phase A `preparePaidAssessment(input)` is a pure projection of source refs, Future, and three item lists. It does **not** authenticate Product verified references or create Work.
- Product operator context already defines the human-facing pattern: why this work, next action, procedure/context, verified vs unknown, and consequence preview. Reuse the pattern, not a second Work engine.
- Product Device S0 is a pure policy kernel, S1–S3 DB/Command/Scoped Read are not proven callable; no invented endpoint.
- Paid Assessment v2 eligibility reads an approved closed Design v2 case and immutable report/decision hashes; it is a **source gate**, not paid engagement authorization.
- Legacy free-hearing and kaizenAssessment flows cannot be presumed paid Assessment Work.
- **Gap:** a bounded Assessment-specific *read-only presentation* from Phase A classification to a human-understandable preparation agenda. Product Work persistence, ownership, assignment, grants and evidence are outside this slice.

## Phase B1: bounded pure preparation agenda (safe parallel slice)
Input is the exact `PreparationOutput` from Phase A (do not fork its enums or rebuild its validation). The caller is responsible for producing authorized input; this function must not claim authority.

Add `src/domain/paidAssessmentPreparationAgenda.ts`:
```ts
import type { PreparationOutput, PreparationItem, AssessmentArea } from './paidAssessmentPreparation';
export interface PreparationAgendaAction {
  itemId: string;
  area: AssessmentArea;
  topic: string;
  why: string;
  question: string;
  requestedFrom?: string;
  source: PreparationItem['source'];
  verificationState: 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  nextActionLabel: string;
}
export interface PreparationAgenda {
  caseId: string;
  future: PreparationOutput['future'];
  sourceRefs: PreparationOutput['sourceRefs'];
  nextActions: PreparationAgendaAction[];
  knownContext: PreparationItem[];
  pendingWithoutQuestion: PreparationItem[];
  counts: { verified: number; toConfirm: number; pendingWithoutQuestion: number };
}
export function buildPaidAssessmentPreparationAgenda(preparation: PreparationOutput): PreparationAgenda;
```

Algorithm:
1. Validate basic shape and ensure `toConfirm` contains only items with nonblank `confirmation.question` and non-VERIFIED state; reject contradictory projections (do not silently repair).
2. For each `toConfirm` item in input order, project an action with `itemId`, `area`, `topic`, `why=purpose`, exact `question`, `requestedFrom`, source and verification state; `nextActionLabel='確認する'` (not an actual Work creation). Do not assign operator, deadline, status, or fabricate evidence.
3. `confirmed` becomes read-only `knownContext` and is **labeled source-provided verified reference**; no independent Core verification claim.
4. `unknownWithoutAction` becomes `pendingWithoutQuestion`; never auto-create questions, gaps or work from UNKNOWN.
5. Include counts, Future intent and immutable source refs; no AI, scoring, prioritization or side effects. Preserve input ordering, return detached arrays/objects. Never include raw survey/report content other than supplied item labels.
6. No case lifecycle mutation or persistence. Product Work can later consume an approved typed contract, not this view object directly.

Add `test/paidAssessmentPreparationAgenda.test.ts`:
- Synthetic three-area Phase A fixture → exact action list, Japanese next-action label, requestedFrom, source/version/hash, Future and counts.
- Verified references remain context, never actions; unverified and unknown-with-question remain visibly unverified.
- UNKNOWN without question remains pending, no auto-created action.
- Stable order, deterministic output, no input mutation and detached nested objects.
- Reject malformed toConfirm entries (missing question, VERIFIED), duplicate itemId across lists, invalid count sources; do not swallow contradictory projections.
- Existing Phase A tests and Design v2 eligibility tests still PASS.

Allowed implementation changes: **only** `src/domain/paidAssessmentPreparationAgenda.ts` and `test/paidAssessmentPreparationAgenda.test.ts`. If Phase A code changes are required, STOP and report exact blocker. Work from Phase A PR #56 head on a separate Phase B branch and open a **Draft PR based on Phase A branch**, not on the paid Assessment base until Phase A is reviewed/merged. Do not amend #56.

## Phase B2: NOT AUTHORIZED UNTIL Product integration contract
An actual human workbench, Work creation/assignment, attachment/Evidence recording, Core verification and persistent hearing progress require exact existing Product Work/authority and scoped Query/Command contract. Before this, inspect source symbols and determine FIT/GAP; no Assessment-specific Work/Evidence tables, invented Work IDs, faux audit or client-side 'verified' toggles.

## STOP / review
Stop if the Phase A export contract differs, Product verification semantics conflict, new fields are required to assert authority, or additional code files must change. Return exact source file/symbol, Git SHA, diff, test commands and counts. No DB/GCP/migration/production/merge, no Device PR #48 edits, no commercial pricing implementation.
