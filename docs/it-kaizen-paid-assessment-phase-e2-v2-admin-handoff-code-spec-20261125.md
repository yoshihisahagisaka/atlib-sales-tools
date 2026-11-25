# IT経営KAIZEN 設計Assessment Phase E2 — Design v2既存管理画面の送付・Feedback・Handoff導線（code-level）

Date: 2026-11-25
Status: **CODE-LEVEL DESIGN / NOT IMPLEMENTED / NO MERGE OR PRODUCTION AUTHORIZATION**
Canonical: git_KAIZEN docs/23, docs/77, docs/78, docs/86; Sales Tools `docs/it-kaizen-assessment-development-execution-principles-20261117.md`, `docs/it-kaizen-assessment-scope-price-separated-development-priority-20261117.md`, `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.
Fit/Gap proof: `docs/it-kaizen-paid-assessment-phase-e2-existing-admin-ui-fit-gap-20261123.md`; source review posted to Issue #95 (closed).
Parent: Phase E1 PR #93 (initial HEAD `5e294762c52733021a254360747c3d803e4c0b5d`), **Issue #94 E1 test completion is mandatory before implementation**.
Intended branch: `feat/paid-assessment-v2-admin-handoff-phase-e2-20261125`, **create only after** verifying #94 PASS and resolving the then-current E1 HEAD.
Draft PR base: `feat/paid-assessment-v2-source-handoff-phase-e1-20261123` (stacked, not main).

## 0. Actual user task / acceptance

The staff member stays in the **existing** free-diagnosis Design v2 report screen (no duplicate assessment-CRM or separate app). After manually sending the approved PDF to the customer, staff records that delivery; after the actual management feedback discussion, staff records the human route/decision/next action; if the latest route is `DESIGN_ASSESSMENT`, staff clicks **「設計Assessmentへ引継ぐ」** once. E1 stores immutable refs; the page shows recorded state on reload.

- *Viewing a PDF is never proof it was sent*. Clicking the Handoff button is not a contract, payment or FACT verification.
- The source report, original survey, customer statements, hypotheses, pending Facts and material decision are not re-entered or duplicated as new FACT.
- No pricing/quote/contract approval engine, duplicate stage/work manager, new DB table, generic frontend framework, AI or FACTACT Core call.

## 1. Source FIT and specific GAP

### Reuse without code change
- `src/routes/adminFreeDiagnosisRuleBasedV1.ts:203–205`: existing staff-only `POST /cases/:id/reports/:reportId/deliver` (returns 204), `POST /cases/:id/feedback/start` (204), `POST /cases/:id/feedback/decision` (JSON `{status}`). Do not modify their effects.
- `Vs1ReviewReportFeedbackRepo.deliver/startFeedback/decide`: authoritative persistence, actor/audit/version handling. In particular `startFeedback` is NOT idempotent: a second call fails, so display must know if it already started.
- E1 `POST /api/admin/it-management-kaizen/assessment-source-handoffs/:caseId` and `GET /:caseId/latest` are staff-only, idempotent, source-authenticating.
- `src/domain/paidAssessmentPreparation.ts` and `paidAssessmentPreparationAgenda.ts` already handle later human-provided Future/current/UNKNOWNs. E2 only hands off refs; it does not auto-convert a free diagnosis report to verified Fact.
- `test/freeDiagnosisDesignV2ReportEditor.browser.test.ts`: existing desktop/mobile visual browser harness with route mocks. `test/freeDiagnosisDesignV2Report.integration.test.ts` and `test/support/freeDiagnosisRuleBasedV1Harness.ts`: existing PGlite/Express/staff cookie fixtures.

### Explicit read gap, no new state
- `GET /api/admin/free-diagnosis-v1/cases/:id` exposes case status and latest report status only, NOT `feedback_started_at` nor latest `management_feedback_decisions.route_code`.
- Add **one** staff-only read API from the existing VS1 report-feedback repository; no new state table and no duplicate eligibility checker.
- `public/admin/free-diagnosis-v2-report.{html,js}` has no delivery-record/feedback/Handoff controls; currently DELIVERED is not readonly in `renderApprovalState()`.

### Existing PDF restriction is deliberate and NOT changed
- `FreeDiagnosisDesignV2ReportPdfService.generate` accepts **only** `APPROVED`, rejects `DELIVERED` (confirmed by `test/freeDiagnosisDesignV2ReportPdf.test.ts`). E2 must **not change** this behavior or tests: show `PDFで表示` while APPROVED and allow staff to use it before recording actual send. Once DELIVERED, **hide PDF link** and show readonly HTML/sent status. Do not claim a saved PDF artifact exists or enable implicit re-render.

## 2. ONLY permitted files (6)

1. MODIFY `src/services/vs1ReviewReportFeedbackRepo.ts` — add one source status read method; keep current mutations unchanged.
2. MODIFY `src/routes/adminFreeDiagnosisRuleBasedV1.ts` — add one GET route using `vs1` dependency already wired.
3. MODIFY `public/admin/free-diagnosis-v2-report.html` — one small action section separate from the report edit form.
4. MODIFY `public/admin/free-diagnosis-v2-report.js` — minimal workflow handling; use existing fetch and helpers.
5. MODIFY `test/freeDiagnosisDesignV2ReportEditor.browser.test.ts` — mocked browser state, reload and action-flow tests; extend existing harness, no extra config.
6. MODIFY `test/freeDiagnosisDesignV2Report.integration.test.ts` — backend status read and staff-gated test using existing PGlite fixtures; do not modify the shared harness.

Do not modify E1 code/SQL/tests, `src/server.ts`, previous PRs, PDF service/tests, other routes, packages, business schema, FACTACT, migration numbers, shared browser config, or an authorization platform. **New files: 0.**

## 3. Backend read-only status contract

In `src/services/vs1ReviewReportFeedbackRepo.ts` add the following exported types and a method to the existing `Vs1ReviewReportFeedbackRepo`:

```ts
export type DesignV2FeedbackRoute =
  | 'DIRECT_ACT' | 'FOCUSED_CONFIRMATION' | 'DESIGN_ASSESSMENT' | 'STOP_HOLD';

export interface DesignV2FeedbackState {
  caseId: string;
  caseStatus: string;
  feedbackStarted: boolean;
  feedbackReportId: string | null; // the case's persisted feedback_report_id; not guessed from the page URL
  latestDecision: null | {
    id: string;
    version: number;
    route: DesignV2FeedbackRoute;
  };
}

// Existing class — add method, do not change constructor:
async feedbackState(caseId: string): Promise<DesignV2FeedbackState>;
```

Algorithm:
1. Require `z.string().uuid()` or equivalent existing validation for caseId (404 `CASE_NOT_FOUND` for invalid/absent case; do not leak SQL errors).
2. One **read-only query** to `it_management_diagnosis_case_v2` with a `LEFT JOIN LATERAL` selecting the latest `management_feedback_decisions` row by `version DESC LIMIT 1`, scoped to this exact v2 case. Select only case ID, case status, the persisted feedback_report_id, feedback_started_at, latest decision id/version/route. No raw report/feedback text or other-customer rows.
3. Missing case → existing `RuleBasedV1Error(404,'CASE_NOT_FOUND')`. `feedbackStarted` = `feedback_started_at != null`; `feedbackReportId` = exact case.feedback_report_id (or null); `latestDecision` = null if absent; otherwise exact stored ID/version/route. No synthetic decision, CASE status mutation, audit write, automatic approval or eligibility claim.
4. Existing DB constraints restrict route enum. Treat any unexpected status/route data as an error, never silently coerce it to DESIGN_ASSESSMENT.

In existing `src/routes/adminFreeDiagnosisRuleBasedV1.ts`, add:
```ts
r.get('/cases/:id/feedback/state', (req, res) => handle(res, async () => {
  if (!vs1) { res.status(501).json({error:'VS1_NOT_CONFIGURED'}); return; }
  res.json(await vs1.feedbackState(req.params.id));
}));
```
This router is already mounted under `adminAuthGate`; no separate auth/session system. Route remains read-only with safe error output. No public endpoint. Keep current feedback POSTs unchanged.

## 4. Existing report page: exact UX and handlers

In `public/admin/free-diagnosis-v2-report.html`, insert a compact `<section id="assessmentNextStep" class="card hidden"> ... </section>` **outside** `#reportForm`, after the action bar and before the report workspace. It contains existing-style controls for:
- `#markDelivered`: button label **「送付済みとして記録」**; only while `APPROVED`.
- `#feedbackEntry`: explicit route `#feedbackRoute` select options `DIRECT_ACT`/ `FOCUSED_CONFIRMATION`/ `DESIGN_ASSESSMENT`/ `STOP_HOLD` with the same Japanese explanations already shown in the legacy feedback UI, `#feedbackDecision` textarea (human material decision), `#feedbackNextAction` textarea, `#recordFeedback` button **「経営フィードバックを記録」**.
- `#handoffAction`: `#createHandoff` button **「設計Assessmentへ引継ぐ」** and read-only `#handoffStatus`.
- `#assessmentWorkflowStatus` for safe errors/status. Reuse existing `hidden`, `card`, `row`, `status` classes. Do not add new stylesheet or an alternate page.

In `public/admin/free-diagnosis-v2-report.js`, preserve current draft editor:
1. **Load:** report draft GET stays the authoritative displayed text. After a report with status APPROVED or DELIVERED is loaded, fetch the new `GET /api/admin/free-diagnosis-v1/cases/:caseId/feedback/state`. If GET fails, hide send/feedback/Handoff actions and show a non-success status; do not guess case state or auto-trigger commands. For DELIVERED display, require fetched `feedbackReportId === reportId` before enabling Feedback or Handoff. If not equal (historical report URL), show a clear readonly '過去のレポートです。現在のフィードバック対象ではありません' status with **no** Feedback/Handoff buttons. The existing delivered report remains viewable as history. When CLOSED and latest route DESIGN_ASSESSMENT, also GET E1 `/:caseId/latest` to show current Handoff version/id. If cached handoff's decision ID differs from current latest decision ID, treat it as historical; do not claim the latest handoff is current. Reload-safe UI is required.
2. **Readonly:** `APPROVED` OR `DELIVERED` makes the editor read-only; no submit/edit controls. Only APPROVED shows the existing PDF link and `#markDelivered`. DELIVERED hides PDF link (preserve PDF service's approved-only contract).
3. **Send-record:** After staff confirms they actually sent the PDF externally, require a human confirmation dialog, then `POST /api/admin/free-diagnosis-v1/cases/:caseId/reports/:reportId/deliver` with empty body. On 204 reload report and status; on errors do not mark delivered in the UI. **Do not send email or invoke PDF export automatically.**
4. **Feedback-record:** For report DELIVERED and status FEEDBACK_PENDING **with `feedbackReportId === reportId`**, display the human route/decision/next-action form. A single `#recordFeedback` click validates nonblank decision and next action; if `feedbackStarted===false`, call existing `POST /cases/:id/feedback/start` first, then existing `POST /cases/:id/feedback/decision` with exactly the entered `{route,materialDecision,nextAction}`. If feedback already started, call only `decide`. On any error, re-read feedback state and show a failure; do **not** blindly call `startFeedback` again. This is a two-command backend operation behind one UI action, not a new business transaction or claim that actual discussion time equals server timestamp. Never auto-select DESIGN_ASSESSMENT.
5. **Handoff:** Only for persisted `caseStatus==='CLOSED'` AND `latestDecision.route==='DESIGN_ASSESSMENT'`, and report DELIVERED **with `feedbackReportId === reportId`**, show `#handoffAction`. Clicking after staff confirmation calls existing E1 `POST /api/admin/it-management-kaizen/assessment-source-handoffs/:caseId` with empty body; `created:true/false` both return a valid handoff record. Render ID/version and success **only after** a 2xx response; when E1 GET/latest already refers to this exact latestDecision.id, disable redundant button (not an extra workflow state). On 409/401/etc, show safe error and leave action retryable; never infer commercial acceptance or verified FACT.
6. After route `FOCUSED_CONFIRMATION`, do not invent a paid Handoff; show navigation back to existing Design v2 hearing/analysis. For `DIRECT_ACT` or `STOP_HOLD`, do not display Handoff. No client-side decision record beyond current fetched state.
7. Preserve user text using `textContent`/value, not injected `innerHTML`; guard against duplicate clicks with button.disabled and finally; do not expose source hash in customer-facing report/panel or URL. API response may contain audit IDs but they are staff-only.
8. Avoid new initialization for REVIEW_REQUIRED drafts; existing draft Playwright tests should behave identically. Use safe error handling for post-approval status read; **do not bypass** missing status by guessing.

## 5. Acceptance tests

A. Extend `test/freeDiagnosisDesignV2ReportEditor.browser.test.ts` (existing desktop/mobile harness with mocks):
- Draft edit/save/approval tests unchanged; after APPROVED show readonly/PDF/send-record.
- Human cancellation of send confirmation must not call deliver. Confirmed send triggers **one** existing deliver POST, then reload shows DELIVERED readonly, no save button and no PDF link (service's current contract).
- DELIVERED+FEEDBACK_PENDING: on one feedback click, calls start then decision in correct order, with exact human text; if `feedbackStarted:true` skips start. Test failure after start→decide and reload/retry without starting twice.
- Persisted CLOSED+DESIGN_ASSESSMENT with matching feedbackReportId: E1 GET/latest null shows Handoff button; success POST with synthetic Handoff renders recorded version; browser reload avoids duplicate, no unnecessary second POST. For STOP_HOLD/other route hide Handoff.
- Failed state GET or failed handoff POST does **not** show success or auto-create Handoff. Test 401/409 safe UI.
- When a historical `DELIVERED` report is opened but `feedbackReportId` is different, show readonly history and hide both feedback/Handoff; no POST. The status read is bounded to the same case, never inferred from URL.
- All existing eight-page report rendering, PDF link target for APPROVED, 390px layout and text escaping tests remain intact.

B. Extend `test/freeDiagnosisDesignV2Report.integration.test.ts` using existing PGlite harness/actual staff-auth router:
- New GET status for no decision, feedback started, latest decision DESIGN_ASSESSMENT (and another latest route), missing/other case 404, without cookie 401. No state mutation or audit side effects.
- Actual legacy source table `management_feedback_decisions` is re-used; no new migration or duplicate row.
- Keep existing real-v2 approval/report integration intact. If route fixture setup is too large, add the narrow test inside the existing harness, not a new test framework.

C. `npm ci`, `npm run build`, amended E2 browser tests with existing Playwright config, modified integration tests, all then-current E1 regressions (including Issue #94 corrections), `git diff --check`. Report exact run counts and commands; browser tests must be run in desktop and mobile as configured, or explicitly report unavailable/manual visual status (no false claims).

## 6. STOP / implementation gates

1. **E1 Issue #94** must be committed/pushed, new E1 tests PASS, all regressions PASS, and updated E1 PR #93 HEAD verified. Current initial E1 HEAD `5e294762...` is a historical source-review baseline, NOT the final E2 starting SHA.
2. Codex must verify current Canonical, actual D3/E1 branch history and the published code-level doc, then create the E2 branch from the actual corrected E1 HEAD and make only six specified file changes. Before implementation report any source mismatch or need for a seventh file and STOP; do not invent architecture.
3. If Design v2 `DELIVERED` PDF access, commercial approval, an original sent-PDF archive, actual FACTACT Work/authority, or report/case workflow needs to be changed, STOP for separate business/product decision. Do not change existing PDF service/test or turn assessment suggestions into FACT.
4. Once mandatory automated checks PASS, commit/push the E2 branch and open stacked **Draft** PR based on the corrected E1 branch. No Merge, migrations against shared DB, GCP, Production, customer delivery or FACTACT writes.
