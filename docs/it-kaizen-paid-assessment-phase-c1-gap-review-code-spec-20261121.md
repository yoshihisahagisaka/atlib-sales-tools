# Paid Design Assessment Phase C1 — Evidence-bound Future/current GAP candidate contract

Date: 2026-11-21
Status: CODE-LEVEL DESIGN SPEC / NOT AN APPROVED FACTACT API OR PRODUCTION CHANGE
Base branch: `feat/it-kaizen-paid-assessment-20261117`
Canonical: git_KAIZEN `docs/74-it-management-kaizen-design-decision-investment-method-v1.md` (CANONICAL METHOD), `docs/73-it-management-kaizen-design-assessment-standard-offer-v1.md`, `docs/75-design-assessment-act-option-scenario-roadmap-output-standard-v1.md` (pilot proposal), `docs/87-design-assessment-analysis-and-initial-fact-import-business-decisions-20261117.md` (DECIDED), `docs/92-assessment-initial-information-work-driven-fact-verification-business-decision-20261117.md`; Assessment `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
Source review: `src/domain/ruleAnalysisEngine.ts`, `src/domain/freeDiagnosisAnalysisV2.ts`, `src/domain/initialRuleEngine.ts`, `src/domain/finalRuleEngine.ts`, Phase A PR #56, Phase B1 PR #59.

## Source-level Fit/Gap
- `ruleAnalysisEngine.ts` is a deterministic *free-diagnosis* investigation-need and scope-gate engine, not a paid GAP/root-cause evaluator. Reuse principles, not its output as a verified paid finding.
- `freeDiagnosisAnalysisV2.ts` produces survey-based narrative, unknowns and confirmation candidates; none is authoritative verified FACT.
- `initialRuleEngine.ts` and `finalRuleEngine.ts` are bounded free-diagnosis hearing analysis; `finalRuleEngine` explicitly emits `whyHypotheses: []`. Not paid causal analysis.
- Phase A/B1 are immutable source-labeled preparation/agenda views, not proof that any Core verification was performed.
- **Gap**: paid Assessment domain-level, explicit human-authored comparison of a management Future criterion and independently verified current reference, with conservative status and traceable evidence. Actual Product scoped verification is a caller/integration responsibility.

## C1 bounded implementation
Implement a **pure candidate review projection**, not a numerical maturity engine or auto-derived diagnosis.

Allowed files:
- Add `src/domain/paidAssessmentGapReview.ts`
- Add `test/paidAssessmentGapReview.test.ts`
No other code changes unless a precise STOP blocker is reported.

### Types
```ts
import type { AssessmentArea, PreparationSourceRef } from './paidAssessmentPreparation';
type GapReviewState = 'CONFIRMED_DIFFERENCE' | 'NO_DIFFERENCE_IDENTIFIED' | 'INSUFFICIENT_EVIDENCE';
interface GapReviewItem {
  id: string;
  area: AssessmentArea;
  futureCriterion: { statement: string; source: PreparationSourceRef }; // goal/intent, not FACT
  current: {
    statement: string;
    source: PreparationSourceRef;
    verification: 'VERIFIED_REFERENCE' | 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  };
  comparison: {
    statement: string; // human-authored comparison, not generated conclusion
    rationale: string;
    sourceIds: readonly string[]; // explicit source references used in comparison
    reviewedBy?: string; // attribution only, NOT a Core authorization grant
  };
}
interface GapReviewResult {
  items: Array<GapReviewItem & { state: GapReviewState }>;
  counts: Record<GapReviewState, number>;
}
export function reviewPaidAssessmentGaps(items: readonly GapReviewItem[]): GapReviewResult;
```

### Conservative rule
1. Validate nonblank ID, statements, rationale and source refs; versions positive integers; optional hashes 64 lowercase hex. Reject duplicate IDs, invalid areas, invalid verification state and malformed sourceIds. Require at least one sourceIds entry matching `current.source.id` and one matching `futureCriterion.source.id`. The same ID can count for both only if they genuinely are identical, but explicit source labels remain distinct.
2. If `current.verification !== 'VERIFIED_REFERENCE'`, state **INSUFFICIENT_EVIDENCE** regardless of human comparison wording. No promotion of survey statements or UNKNOWN.
3. If verified, require `current.source.kind === 'CORE_VERIFIED_REFERENCE'`. Determine comparison status only from an explicit review flag `comparison.assessment: 'DIFFERENCE' | 'NO_DIFFERENCE' | 'UNDETERMINED'` (add this mandatory field to interface). Do **not** parse natural-language statements, infer numerical difference or automatically score.
4. `DIFFERENCE` + verified → `CONFIRMED_DIFFERENCE`; `NO_DIFFERENCE` + verified → `NO_DIFFERENCE_IDENTIFIED`; `UNDETERMINED` → `INSUFFICIENT_EVIDENCE`. This is a **reviewed comparison candidate**, not an approved business priority or verified root cause.
5. Keep `futureCriterion` as intention. No cause, severity, urgency, priority, ACT, maturity score or ROI is inferred.
6. Return deterministic original order, copied nested objects/arrays, and state counts. No side effects, persistence, authorization, API, AI or DB.
7. Empty input is a valid no-gap review result (all counts zero). Do not force findings.

### Required tests
- Verified reference + explicit DIFFERENCE → CONFIRMED_DIFFERENCE with exact provenance.
- Verified reference + NO_DIFFERENCE → NO_DIFFERENCE_IDENTIFIED, healthy outcome.
- Unverified customer statement + DIFFERENCE → INSUFFICIENT_EVIDENCE.
- UNKNOWN + DIFFERENCE → INSUFFICIENT_EVIDENCE.
- Verified reference + UNDETERMINED → INSUFFICIENT_EVIDENCE.
- Source IDs, versions, hashes, Future intent and input ordering preserved.
- Missing/mismatched comparison source IDs, invalid hash/version/area/state, duplicate item IDs fail closed.
- Deterministic repeated runs, deep non-mutation/detached output.
- Empty input valid; no AI/DB/API calls; no fabricated root causes or priorities.
- Phase A (9), Phase B1 (8), eligibility (10) existing isolated tests remain passing.

## Implementation branch / PR strategy
- Phase C1 can branch from the **Phase B1 head** `f078eb557fbfda9f65a8933026bbc6992cdcf09a` to access the Phase A source types; use a new independent branch and stacked Draft PR based on `feat/paid-assessment-preparation-agenda-phase-b-20261121`.
- No edits to Draft PR #56, #59, or Device PR #48.
- First confirm baseline SHA and actual exported types. If any canonical semantic contradiction, STOP with file/symbol evidence. Do not change Product verification contracts or create a Core verified flag.
- Only local build and tests; no merge, migration, GCP, production or billing changes.

## Later phases (not in C1)
C2: evidence-bound root-cause hypotheses with explicit uncertainty and human review; C3: ACT options, three domains × six lenses as Design Space, scenarios; C4: human priority, 90-day and 12-month plan; eventual output projections.
