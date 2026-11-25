# IT経営KAIZEN 設計Assessment Phase E3 — Free Diagnosis Design v2 → Preparation A/B pure bridge

Date: 2026-11-25
Status: **CODE-LEVEL SPEC + CONTROLLED PATCH PREPARED / NO RELEASE AUTHORIZATION**
Baseline: E2 PR #112 HEAD `fe4d7a40febbf9194c5d0f519f024a23f1870ba1` (Draft / OPEN); E1 PR #93 HEAD `5c88d52d65b5342ad373cdb18a6cccccac23b46c` (Draft / OPEN).
Implementation branch CREATED from exact E2 HEAD: `feat/paid-assessment-v2-preparation-bridge-phase-e3-20261125`.
Draft PR base after test PASS: `feat/paid-assessment-v2-admin-handoff-phase-e2-20261125`. No merge.

## 1. Source-level Fit/Gap

- FIT: E1 `PaidAssessmentSourceHandoff` is an immutable, hashed reference to the Design v2 case, latest human feedback Decision, and DELIVERED/approved Design v2 report. Existing `PaidAssessmentSourceHandoffRepo.latest()` enforces snapshot shape/hash; **a reference is not a verified FACT or paid acceptance**.
- FIT: E2 staff UI records a real manual send, human feedback decision, and idempotent Handoff using existing VS1 routes and E1. It checks current `feedbackReportId`; E3 does not copy or alter it.
- FIT: `DesignV2StoredReportDraft` from `FreeDiagnosisDesignV2PersistenceRepo.getDesignV2ReportDraft` contains `id,version,status,content` and the exact existing `DesignV2ReportContent` shape. `content.sections` contains FUTURE entries; `content.factCandidates` provides source-linked **unverified** confirmation candidates; `content.assessmentProposal` is customer-facing presentation, not an authorized commercial decision.
- FIT: existing pure `preparePaidAssessment(PreparationInput)` groups confirmed/toConfirm/pending; `buildPaidAssessmentPreparationAgenda(PreparationOutput)` creates a human-readable agenda. They already keep Future as intention, UNKNOWN without question visible, and do not invent verified references.
- GAP: No bounded, typed connection between E1 Handoff + the delivered report's source candidates + an **explicit human selection** and the existing A/B pure functions. This is the only Phase E3 source-bridge code gap.
- UNKNOWN (not solved by E3): an authenticated, persisted Assessment engagement/workbench state, authorized scoped FACTACT read/Write and real human source selection persistence. **Do not fake these in E3**.

Canonical cross-check: `yoshihisahagisaka/git_KAIZEN` `docs/23-assessment-factact-reporting-consistency-v1.md`, `docs/77-it-management-kaizen-customer-language-and-assessment-deliverable-principles-v1.md`, `docs/78-design-assessment-word-report-and-executive-slides-delivery-standard-v1.md`, `docs/86-business-product-lane-responsibility-and-handoff-principles-v1.md`; Sales Tools `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`. FACT/UNKNOWN/Hypothesis and management Future stay distinct, with Business vs Product authority unchanged.

## 2. Objective and allowed files

Enable an operator to select an existing Future phrase and only necessary follow-up candidates from the same delivered report, specify each candidate's area and an **explicit** question if needed, and obtain Phase A PreparationOutput and Phase B PreparationAgenda from existing functions **without retyping source wording**.

**Exactly two new files; no other code changes**:
1. NEW `src/services/paidAssessmentPreparationBridge.ts`
2. NEW `test/paidAssessmentPreparationBridge.test.ts`

Pure service-level adapter (no DB, HTTP, file, AI, clock, random, external services, or persistence). No new page/endpoint/table/migration and no changes to E1/E2 or A/B. No new dependencies. This is source-level preparation, **not a usable production workbench**; an authorized staff-facing application/selection persistence is a separate later decision.

## 3. Exact existing types / symbols to reuse

- Type-only `PaidAssessmentSourceHandoff` from `src/services/paidAssessmentSourceHandoffRepo.ts`
- Type-only `Pick<DesignV2StoredReportDraft, 'id'|'version'|'status'|'content'>` from `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`
- `DESIGN_V2_REPORT_FORMAT_VERSION`, `DesignV2ReportFactCandidate` from `src/domain/freeDiagnosisDesignV2Report.ts`
- `contentHash` from `src/domain/diagnosisReport.ts`
- `PreparationInput`, `PreparationOutput`, `PreparationSourceRef`, `AssessmentArea`, `preparePaidAssessment` from `src/domain/paidAssessmentPreparation.ts`
- `PreparationAgenda`, `buildPaidAssessmentPreparationAgenda` from `src/domain/paidAssessmentPreparationAgenda.ts`

Export:
```ts
export interface DesignV2PreparationSelection {
  futureEntryIndex: number;
  candidates: readonly {
    candidateId: string;
    area: AssessmentArea;
    confirmationQuestion?: string;
    requestedFrom?: string;
  }[];
}
export interface DesignV2PreparationBridgeResult {
  preparation: PreparationOutput;
  agenda: PreparationAgenda;
}
export function preparePaidAssessmentFromDesignV2(
  handoff: PaidAssessmentSourceHandoff,
  report: Pick<DesignV2StoredReportDraft, 'id'|'version'|'status'|'content'>,
  selection: DesignV2PreparationSelection,
): DesignV2PreparationBridgeResult;
```

## 4. Exact boundary and mappings

1. **Fail closed** unless `handoff.snapshot.schemaVersion===1`, `sourceKind==='FREE_DIAGNOSIS_DESIGN_V2'`, E1 snapshot hash matches `contentHash(handoff.snapshot)`, snapshot case/decision/report identities match handoff top-level refs. This is a defensive pure-boundary check; **the caller** must have loaded an authenticated `PaidAssessmentSourceHandoffRepo.latest()` record, not an arbitrary browser object.
2. Fail closed unless `report.status==='DELIVERED'`, `report.id/version` agree with the exact E1 snapshot's report ref, `report.content.formatVersion===DESIGN_V2_REPORT_FORMAT_VERSION`, and `contentHash(report.content)===handoff.snapshot.eligibility.report.contentHash`. E1 approval snapshot hash stays linked in `reportRef`; E3 does **not** independently authenticate an approval or rewrite it.
3. There must be exactly one section `key==='FUTURE'`; the operator explicitly selects an integer `futureEntryIndex` pointing to its existing **nonblank** entry. No automatic joining, summarizing, inference, or treating it as verified current.
4. Source candidate IDs within `report.content.factCandidates` must be unique and have a nonblank `whatToVerify` and `whyItMattersToFuture`. For each **explicitly selected** candidate ID (in human input order), the operator chooses an `area` in `TECHNOLOGY|OPERATION|MANAGEMENT` and optionally gives `confirmationQuestion` and `requestedFrom`. Reject unknown/duplicate IDs, invalid area, blank question/recipient, or recipient without question. No default question or automatic candidate selection. The original `factCandidates.lenses` are source hints, **not** an automatic human area decision.
5. Create `PreparationInput`:
   - `caseId = handoff.sourceCaseId`
   - `decisionRef = {id,version,contextHash}` from E1 snapshot feedbackDecision
   - `reportRef = {id,version,contentHash,approvalSnapshotHash}` from E1 snapshot report
   - `future = {statement: selected exact FUTURE entry, source: {kind:'FREE_DIAGNOSIS_REPORT',id:report.id,version:report.version,hash:E1 contentHash}}`
   - one `PreparationItem` per selected candidate: `id:candidate.id`, human-selected `area`, `topic:candidate.whatToVerify`, `purpose:candidate.whyItMattersToFuture`, same `FREE_DIAGNOSIS_REPORT` source with ID/version/hash, **`state:'UNKNOWN'` always**, `confirmation` only from explicit human question.
6. Call **existing** `preparePaidAssessment(input)` then **existing** `buildPaidAssessmentPreparationAgenda(preparation)`; return both unchanged. No extra scoring, diagnosis, maturity, gap or auto-prioritization. Do not use `assessmentProposal.selectedCandidateIds` to auto-pick, or `priceExcludingTaxText`/`durationText` as acceptance, scope or report content.
7. Must be deterministic, not mutate report/handoff/selections, with detached returned A/B objects. Empty candidate selections are valid and result in no fabricated next actions.
8. **Crucial authorization boundary:** this pure function cannot prove Handoff is the *current* latest decision or that the staff has access to this case. A later staff-scoped read API/selector must check current case decision, `feedbackReportId`, and E1 latest at invocation, and must not accept raw handoff/report input from the browser. **No such endpoint or UI is created in this slice.**

## 5. Exact acceptance tests (new test file, synthetic only)

- Valid E1 snapshot + exact DELIVERED report and staff selection → Phase A/B refs exact, ordered selected Future, candidate IDs and exact source wordings, operator-chosen area and question, correct counts, all `UNKNOWN`, zero verified context.
- Empty selection does not import `assessmentProposal.selectedCandidateIds`, prices, timing, new FACT/Work or fabricated questions.
- Forged E1 snapshot hash, mismatched case/decision/report ID, schema version → fail closed.
- Report not DELIVERED, wrong report ID/version, tampered content hash, incompatible format → fail closed.
- FUTURE invalid index, blank selected entry → fail closed; never make up Future text.
- Duplicate/unknown candidate ID, invalid area, blank explicit question, recipient without question → fail closed.
- Ambiguous duplicate candidate IDs in a report → fail closed.
- Deep equality on repeated calls, input unchanged, detached A/B outputs.
- Existing Phase A/B tests, E1 eligibility and E1 source Handoff tests, E2 Design v2 report integration, all current paid Assessment regressions still PASS.

## 6. Execution and STOP

- Before apply, compare *actual* E3 branch HEAD with E2 PR #112 HEAD `fe4d7a40febbf9194c5d0f519f024a23f1870ba1`, E1 and the Planning document. Reject dirty tree/branch mismatch.
- Patch **only** the two approved new files; run `npm ci`, `npm run build`, new E3 suite, then `node -r ts-node/register --test` with all existing `test/paidAssessment*.test.ts` and `test/designV2AssessmentEligibility.test.ts`, and relevant E2 Design v2 integration.
- Check exactly two new files with `git diff --check`; GitHub Actions if present; report exact test counts rather than estimated totals.
- Commit+Push only after all mandatory checks PASS. Keep stacked E3 Draft PR based on E2 branch; **never merge** automatically.
- STOP if sourced report shape differs, a necessary scope expansion is found, or a customer-facing/staff authorization/FACTACT Core contract is required. No production migration, GCP/Cloud SQL, customer data, commercial acceptance workflow, Assessment-owned duplicate FACT/Work/Evidence/CRM.
