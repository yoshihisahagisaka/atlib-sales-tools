# Codex bounded task — Paid Design Assessment preparation projection, Phase A

Date: 2026-11-21
Status: CODE-LEVEL HANDOFF DRAFT — DESIGN LANE REVIEW BEFORE EXECUTION
Branch: `feat/it-kaizen-paid-assessment-20261117`
Baseline: verify current HEAD immediately before editing; planning source includes `6655a4ffb4564f28e73db0ff386e62f1848d23f8`.
Canonical: `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`, `docs/it-kaizen-assessment-proposal-goal-fit-gap-20261121.md`, `docs/it-kaizen-assessment-design-v2-handoff-fit-gap-20261117.md`, git_KAIZEN docs/23,73,75,78,84,99.
Reference implementation: `src/services/designV2AssessmentEligibility.ts`, `test/designV2AssessmentEligibility.test.ts`.

## Objective
Build the **smallest pure, deterministic Assessment-owned preparation projection** that takes already authorized/verified *source references* and explicitly labeled user-facing information, and returns an actionable, reviewable preparation summary. No paid engagement acceptance, FACTACT write, new questionnaire or AI requirement.

## Allowed files (proposed)
- Add `src/domain/paidAssessmentPreparation.ts`.
- Add `test/paidAssessmentPreparation.test.ts`.
- No other code files unless a named compatibility blocker is returned for design-lane review.

## Input contract (pure domain; not a DB or Product contract)
```ts
type AssessmentArea = 'TECHNOLOGY' | 'OPERATION' | 'MANAGEMENT';
type PreparationSourceKind = 'FREE_DIAGNOSIS_REPORT' | 'MANAGEMENT_FEEDBACK' | 'CUSTOMER_STATEMENT' | 'CORE_VERIFIED_REFERENCE';
interface PreparationSourceRef { kind: PreparationSourceKind; id: string; version: number; hash?: string; }
interface PreparationItem {
  id: string;
  area: AssessmentArea;
  topic: string;
  purpose: string; // why this needs confirmation for the management decision
  source: PreparationSourceRef;
  state: 'VERIFIED_REFERENCE' | 'UNVERIFIED_STATEMENT' | 'UNKNOWN';
  confirmation?: { question: string; requestedFrom?: string };
}
interface PreparationInput {
  caseId: string;
  decisionRef: {id:string;version:number;contextHash:string};
  reportRef: {id:string;version:number;contentHash:string;approvalSnapshotHash:string};
  future: { statement:string;source:PreparationSourceRef };
  items: readonly PreparationItem[];
}
interface PreparationOutput {
  caseId: string;
  sourceRefs: {decision:PreparationInput['decisionRef'];report:PreparationInput['reportRef']};
  future: PreparationInput['future'];
  confirmed: PreparationItem[];
  toConfirm: PreparationItem[];
  unknownWithoutAction: PreparationItem[];
}
export function preparePaidAssessment(input: PreparationInput): PreparationOutput;
```

## Algorithm / safety
1. Validate nonblank case, decision/report IDs and exact source versions/hashes (64 lowercase hex for hashes). Reject malformed input; do not fabricate missing sources or default to FACT.
2. Preserve Future as intention, **never** mark it current FACT. Copy source refs without modification.
3. Only items explicitly marked `VERIFIED_REFERENCE` go to `confirmed`; `UNVERIFIED_STATEMENT` with an explicit nonblank confirmation question goes to `toConfirm`; `UNKNOWN` with explicit question goes to `toConfirm`, otherwise `unknownWithoutAction`. An unverified statement without a question must remain in `unknownWithoutAction`, not silently disappear.
4. Preserve stable input order; do not score maturity, invent questions, create gap/priority or deduce facts from the source label.
5. Reject duplicate item IDs; reject `VERIFIED_REFERENCE` unless source.kind is `CORE_VERIFIED_REFERENCE` (no claim that a free diagnosis report is a verified FACT).
6. Return new arrays/objects (no input mutation); keep all original items, source references and source version/hash values. Never persist raw file data.
7. Do not generate a blanket questionnaire; `toConfirm` contains only explicitly supplied, relevant items.

## Tests
- valid synthetic three-area input, approved source refs and Future intent → deterministic output, all items accounted for, source IDs/versions/hashes preserved.
- customer statement cannot be accepted as verified FACT.
- unknown without confirmation question remains visible, not a forced Gap.
- unverified statement with explicit question appears once in toConfirm.
- duplicate IDs, blank source, invalid version/hash, malformed area/state fail closed.
- no AI/network/DB calls; deep equality and input immutability.
- no legacy `diagnosis_cases`, no FACTACT endpoints, no new Work/Evidence/Registry storage.

## Execution/STOP
Codex must verify baseline and existing source symbols before implementation. If current code conflicts with this proposed contract or the Product-owned verification semantics, return exact file/symbol and STOP without improvising. Execute only local typecheck and isolated tests; report commands, PASS counts, diff and commit. Keep changes in a **separate Draft PR** against the paid Assessment branch; do not amend Device PR #48.

No merge, DB migration, billing, GCP, production, RBAC or paid-price workflow. This contract is for the pure Assessment preparation projection only, **not** an authorized integration adapter.
