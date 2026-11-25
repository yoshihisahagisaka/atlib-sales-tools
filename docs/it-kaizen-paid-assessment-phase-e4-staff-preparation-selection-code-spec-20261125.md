# IT経営KAIZEN 設計Assessment Phase E4 — Staff Preparation Selection（最小保存＋既存画面）

Date: 2026-11-25
Status: **CODE-LEVEL SPEC / NO MERGE, SHARED DB MIGRATION OR PRODUCTION AUTHORIZATION**
Upstream: E3 Draft PR #114 HEAD `bf57dcd57c58f6cc484db7c57c2832a05fdf22b5`; E2 Draft PR #112 and E1 Draft PR #93. All remain unmerged.
E4 branch CREATED from exactly E3: `feat/paid-assessment-preparation-selection-phase-e4-20261125`. Stacked Draft PR base = `feat/paid-assessment-v2-preparation-bridge-phase-e3-20261125`.

## 1. Operational objective and Fit/Gap

A staff member who has completed the Design v2 report delivery, management feedback and E1 Handoff can **stay in the existing Design v2 report screen**, select one existing Future entry and a *subset* of original factCandidates, explicitly choose the area/optional verification question for each, **save**, and find the same draft after a page reload. The saved selection is a human-authored **Assessment preparation draft**, not paid acceptance, verified FACT, evidence, operator Work, recommendation or the delivery of an Assessment report.

FIT to reuse unchanged:
- E1 `PaidAssessmentSourceHandoffRepo.latest` validates immutable Handoff shape/hash. E1 `readDesignV2AssessmentEligibility` checks current CLOSED + latest DESIGN_ASSESSMENT feedback decision + DELIVERED/approved report and content/version hashes.
- E2 `free-diagnosis-v2-report.html/.js` shows staff delivery, feedback and current Handoff status with `feedbackReportId === reportId` guard, under existing `adminAuthGate`. E2 must not be forked.
- `FreeDiagnosisDesignV2PersistenceRepo.getDesignV2ReportDraft(caseId,reportId)` reads exact Design v2 report content. `PaidAssessmentPreparationBridge.preparePaidAssessmentFromDesignV2` already rejects content/hash/id mismatches and produces existing Phase A/B outputs from explicit selection with candidates always UNKNOWN.
- Existing VS1 `it_management_diagnosis_case_v2_audit` is a command audit and can record one E4 audit per *new* saved revision; it is **not** the storage for current selection state.
GAP: No Design v2-paid Assessment human preparation selection storage exists. Existing `assessment_handoffs` and `it_management_diagnosis_preparation` are legacy `diagnosis_cases`-bound; do not reuse or retarget them.
Decision for this minimal slice: **one dedicated append-only table for the human selection revisions only**. No duplicate customer/CRM, FACT, Evidence, Work, verified source or approval table; no added generic workflow/stage or authorization system.

Canonical:
- `git_KAIZEN/docs/23-assessment-factact-reporting-consistency-v1.md`: source kind/FACT/UNKNOWN/Future/Decision separation.
- `git_KAIZEN/docs/77-it-management-kaizen-customer-language-and-assessment-deliverable-principles-v1.md`: Japanese first and traceable actual evidence.
- `git_KAIZEN/docs/86-business-product-lane-responsibility-and-handoff-principles-v1.md`: Product vs Business boundaries.
- Sales Tools `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
- E1/E2/E3 exact code-level specifications on Planning branch.

## 2. Exactly eight allowed files

1. NEW `migrations/038_paid_assessment_preparation_selection.sql`
2. NEW `src/services/paidAssessmentPreparationSelectionRepo.ts`
3. MODIFY `src/routes/adminPaidAssessmentSourceHandoff.ts`
4. MODIFY `src/server.ts`
5. MODIFY `public/admin/free-diagnosis-v2-report.html`
6. MODIFY `public/admin/free-diagnosis-v2-report.js`
7. NEW `test/paidAssessmentPreparationSelection.integration.test.ts`
8. MODIFY `test/freeDiagnosisDesignV2ReportEditor.browser.test.ts`

No new page, new dependency, new separate router, other migration, change to existing E1/E2/E3/Phase A/B domain, PDF service, legacy Handoff, Workspace or FACTACT. **Check** no competing migration 038 exists in actual implementation base before writing; if collision, STOP rather than overwrite.

## 3. Migration 038 — one append-only selection revision table

`migrations/038_paid_assessment_preparation_selection.sql` has **no embedded BEGIN/COMMIT** because `src/db/migrate.ts` wraps file SQL and schema history in one transaction. Exact table:

```sql
CREATE TABLE paid_assessment_preparation_selection_v1 (
  id UUID PRIMARY KEY,
  source_case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  handoff_id UUID NOT NULL REFERENCES paid_assessment_source_handoff_v2(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  selection_json JSONB NOT NULL CHECK (jsonb_typeof(selection_json) = 'object'),
  selection_hash TEXT NOT NULL CHECK (selection_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id TEXT NOT NULL CHECK (btrim(created_by_user_id) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (handoff_id, version)
);
CREATE INDEX paid_assessment_preparation_selection_v1_latest_idx
  ON paid_assessment_preparation_selection_v1(handoff_id, version DESC);
```
Add a `BEFORE UPDATE OR DELETE` trigger that always raises (similar to E1 migration 037). Use role-exists-safe DO block to GRANT SELECT, INSERT only and **explicitly REVOKE UPDATE, DELETE** for `sales_tools_runtime` and `sales_tools_app` (migration 018 default runtime privileges are broad). Do not alter global default privileges. No migration application to shared/production DB; local PGlite only for acceptance.

This table stores ONLY human-selected `{futureEntryIndex,candidates:[{candidateId,area,confirmationQuestion?,requestedFrom?}]}` plus source Handoff ID, version, actor, timestamps and hash. No raw report/diagnostic/survey copy, no verified FACT, no second customer registry, no paid acceptance.

## 4. Source authority and service contract

NEW class `PaidAssessmentPreparationSelectionRepo` with `constructor(private readonly pool: Pool)`. It may compose existing `PaidAssessmentSourceHandoffRepo`, `FreeDiagnosisDesignV2PersistenceRepo`, `readDesignV2AssessmentEligibility`, `contentHash` and E3 pure `preparePaidAssessmentFromDesignV2`. No new source eligibility algorithm.

```ts
type PreparationSelection = DesignV2PreparationSelection; // E3 export
interface SavedPreparationSelection {
  id: string;
  sourceCaseId: string;
  handoffId: string;
  version: number;
  selection: PreparationSelection;
  selectionHash: string;
  createdByUserId: string;
  createdAt: string;
}
type PreparationSelectionView = {
  saved: SavedPreparationSelection | null;
  preparation: PreparationOutput | null;
  agenda: PreparationAgenda | null;
};
class PaidAssessmentPreparationSelectionError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
class PaidAssessmentPreparationSelectionRepo {
  async latest(caseId: string, actorEmail: string): Promise<PreparationSelectionView>;
  async save(caseId: string, actorEmail: string, selection: PreparationSelection):
    Promise<{created: boolean; view: PreparationSelectionView}>;
}
```

### A. Shared read authority (never trust browser Handoff/report)

1. Validate UUID caseId, nonblank staff actor (400/403). Call existing `PaidAssessmentSourceHandoffRepo.latest(caseId,actor)`; 409 `HANDOFF_REQUIRED` if absent. The caller never supplies Handoff snapshot or report content.
2. Call existing `FreeDiagnosisDesignV2PersistenceRepo.getDesignV2ReportDraft(caseId,handoff.reportId)`. Reject missing/wrong/undelivered/stale report with safe 409, no raw DB error.
3. Call E3 `preparePaidAssessmentFromDesignV2(handoff,report,selection)` to validate all source/content/hash/selection contracts and generate exact A/B results. No fabricated question or verification and no inferred area.
4. **Current authority** before exposing or writing saved selection: obtain `readDesignV2AssessmentEligibility(pool,caseId)` (existing reader), confirm it matches Handoff snapshot/decision/report IDs/versions/hashes exactly. If changed since Handoff, 409 `HANDOFF_STALE`; do not treat a historical E1 Handoff as current. For save, repeat this inside a transaction after the source case row is locked.
5. For save concurrency: `BEGIN` + `SELECT id FROM it_management_diagnosis_case_v2 WHERE id=$1 FOR UPDATE`, then **on that same client** call `readDesignV2AssessmentEligibility(client,caseId)`, compare returned source hash refs to the previously E1-validated handoff; `SELECT id FROM paid_assessment_source_handoff_v2 WHERE source_case_id=$1 ORDER BY version DESC LIMIT 1` on the client, ensure its ID equals the loaded Handoff ID. E1 creates also acquire this case lock; no TOCTOU latest replacement. The before-lock fetched Design v2 report is checked by E3 against E1 hash, and the locked eligibility reader rechecks the current source report hash.
6. Under lock, `SELECT ... FROM paid_assessment_preparation_selection_v1 WHERE handoff_id=$1 ORDER BY version DESC LIMIT 1`. Validate saved row, stored selection JSON and `contentHash(saved.selection)===selection_hash`. Corrupt stored row → 409 `PREPARATION_SELECTION_INTEGRITY_MISMATCH` (no silent repair). If current latest stored hash equals new `contentHash(selection)`, return the exact same row with `created:false` and no extra audit. Different valid selection → append version+1, one existing v2 case audit `RecordPaidAssessmentPreparationSelection` in **the same transaction**, COMMIT. No UPDATE/DELETE; history preserved. On audit failure rollback whole row.
7. `latest`: same source authority checks (read-only, no audit), read the latest saved selection for *the current Handoff ID*; if none return `{saved:null,preparation:null,agenda:null}`. If present, validate stored JSON/hash and invoke E3 again on authoritative source. A changed/new Handoff never silently reuses an old selection; staff must explicitly choose again. Do not expose an old draft as current, do not mutate the record.
8. Exception surface: 400 `INVALID_CASE_ID` or `INVALID_SELECTION`; 403 `STAFF_REQUIRED`; 404 `CASE_NOT_FOUND`; 409 for stale/source/integrity errors; 500 `INTERNAL_ERROR` for unexpected failures. Avoid SQL/raw customer data in error response.

Do not create a new "reviewed/approved/paid" status; saving selects a **DRAFT preparation**, not an authorized handoff to FACTACT or customer deliverable.

## 5. Existing E1 staff route extension

In existing `src/routes/adminPaidAssessmentSourceHandoff.ts`, extend `createAdminPaidAssessmentSourceHandoffRouter(handoffRepo, preparationRepo?: PaidAssessmentPreparationSelectionRepo)`. Optional argument preserves the current E1 integration tests without edits. Add:
- `GET /:caseId/preparation` → `{view: await preparationRepo.latest(caseId,req.staffEmail??'')}` (200).
- `POST /:caseId/preparation` → Zod strict selection DTO only:
```ts
{
  futureEntryIndex: z.number().int().min(0),
  candidates: z.array(z.object({
    candidateId: z.string().trim().min(1).max(200),
    area: z.enum(['TECHNOLOGY','OPERATION','MANAGEMENT']),
    confirmationQuestion: z.string().trim().min(1).max(1000).optional(),
    requestedFrom: z.string().trim().min(1).max(200).optional(),
  }).strict()).max(100),
}
```
Reject extra `handoffId`, report content, fabricated FACT. Result 201 if created, 200 idempotent. GET is side-effect-free, no audit. Extend existing error handling to recognize `PaidAssessmentPreparationSelectionError` without leaking internal failures. If preparationRepo not configured return 501; production passes it. Under existing `adminAuthGate` — no new auth/session/provider.
- In `src/server.ts`, instantiate repo from same Pool and pass as optional 2nd argument to existing E1 router. Do not add separate mount or change middleware ordering/rate limits.

## 6. Extend the existing Design v2 report page (not a second workbench)

Modify only `public/admin/free-diagnosis-v2-report.html/.js`. Below the existing E2 `#handoffAction`, add compact hidden `#preparationSelection` with one Future choice `#preparationFuture`, one list of source candidate controls `#preparationCandidates`, save button `#savePreparation`, and readonly summary `#preparationSummary` / error `#preparationStatus`. Use current page styles, no new stylesheet.

- Show the panel **only** if current `feedbackState.caseStatus==='CLOSED'`, `latestDecision.route==='DESIGN_ASSESSMENT'`, `feedbackReportId===reportId`, report.status `DELIVERED`, and E1 `GET /:caseId/latest` returns a Handoff bound to the exact latest decision ID and displayed report ID. Never show on other routes, historic delivered reports, pre-handoff status or source failures.
- One GET `/:caseId/preparation` after the current Handoff is established. Failure shows a safe error; **does not** infer a saved draft or enable save. If saved current selection exists, prefill form and summary. If none, Future select initially blank (not automatically chosen) and no candidate is checked (even if report`assessmentProposal.selectedCandidateIds` contains values).
- Future choices are the **original** delivered report's FUTURE section entries, in original order. Candidate list uses original `factCandidates` title/reason; checkbox initially unchecked; if checked, human chooses area explicitly from blank `TECHNOLOGY / OPERATION / MANAGEMENT` select, optionally enters question and requestedFrom. Never auto-assign area from lenses. Avoid requiring all candidates.
- Click **「Assessment準備の選択内容を保存」** after human selection; send **only** `{futureEntryIndex,candidates}` to existing E1 path `POST /:caseId/preparation`. No browser-provided source refs, status, approval, handoff, report content, price or contract. Server retrieves/validates authoritative current source.
- Use DOM `textContent`, not innerHTML, for user input. Disable button during save; success only after 200/201 + returned matching valid view; reload GET after save, show stored version and `agenda.nextActions`/unknown count with explicit `未確認` label. On 400/401/409/500, show safe error and retain user input where possible; do not label as saved. Existing report print/PDF and E2 workflow unaffected.
- This selection panel is **staff internal draft**. No Customer confirmation, commercial acceptance, Core FACT/Work writes, Assessed maturity score or AI. Saving and reloading reliably retains the staff choice.

## 7. Acceptance and test gates

1. New `test/paidAssessmentPreparationSelection.integration.test.ts` with existing `createFreeDiagnosisRuleBasedV1Harness({includeDesignV2:true})`, local-only apply 037+038, exact E1 approved/delivered feedback fixture and actual E3 report format. Test valid create/read+Phase A/B agenda, empty candidates, same retry actor / different actor idempotent; revised selection→version2/history, wrong case/no auth/missing latest or STOP_HOLD route fail; stale/new decision/second Handoff invalidates old selection; bad E1 report hash; tampering UPDATE/DELETE trigger and saved hash; audit failure rollback. Check runtime SELECT/INSERT grants + UPDATE/DELETE revoke and no nested migration transaction.
2. Extend `test/freeDiagnosisDesignV2ReportEditor.browser.test.ts` using existing desktop/mobile mocked E2 workflows: no preselection from free report proposal, explicit Future/area/question, staff save POST exact DTO, reload prefill saved revision and show UNKNOWNs; hide during pre-Handoff/STOP_HOLD/historical report, reject GET/POST failure without success; preserve all E2 browser cases.
3. `npm ci`, `npm run build`, new E4 PGlite test, E3 pure 8 cases, E2 report integration 8, existing E1/Phase A–D Assessment 132 and browser desktop+mobile (plus any other directly relevant tests), `git diff --check` and exact eight-file diff. Do not claim passing without actual output.
4. Only after every mandatory test PASS: Commit/Push the existing E4 branch and open **stacked Draft PR** based on E3 PR #114 branch. No Merge, production DB migration, GCP, customer data or FACTACT integration. Any need for another table, source data copy, legacy workflow modification, generic CRM, new role, cross-tenant exposure or more files → STOP and return Fit/Gap.

## 8. Explicit operational limitations

E4 stores a **human preparation selection draft and an E3-derived read-only agenda**, not the entire Assessment engagement, not a full evidence collection workflow. Later actual FACTACT collection/work verification must use a separately approved Product-owned typed contract; do not simulate it with a local FACT/Work table. Commercial acceptance stays outside engineering gating. No production access until upstream Draft PR and migration/release ledger gates are separately authorized.
