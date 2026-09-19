# SL-A5 — Management Analysis / 経営分析・改善選択肢ビュー

Baseline: `c16fe0f2d09906404a3e755634ddb015afe71800`, `feat/free-diagnosis-sales-launch`.

## FIT / GAP / CONFLICT / UNKNOWN

| Classification | Finding / result |
| --- | --- |
| FIT | Existing Human Review already supports OBSERVATION, UNKNOWN, GAP_CANDIDATE, HYPOTHESIS, ROOT_CAUSE_HYPOTHESIS, KAIZEN_DIRECTION, EVIDENCE_CANDIDATE; adopt/edit/convert/reject operations and source references are reused. |
| FIT | Existing optional `area_tag` and `improvement_lens` exactly represent the three areas and six lenses. No taxonomy or schema addition. |
| FIT | SL-A4 supplies separated intake/Web/customer information, unknowns, staff notes, selected plans and recorded follow-up speech. Reuse its read model without changing its contract. |
| FIT | MF-B `buildReportContext` already connects approved WHY to reviewed observations and assessment confirmation candidates. Reuse these links exactly; do not infer another graph. |
| FIT | MF-C already persists Human routes. Read the latest recorded decision; do not write a decision, infer a route or initiate an Assessment action. |
| GAP | Human Review was organized around editing/review operations rather than a management analysis story. Add the seven-step analysis view to that screen, with direct links to existing review controls and SL-A4. |
| GAP | Existing tags had no sparse 3×6 view. Group only explicitly tagged KAIZEN_DIRECTION records. Preserve unclassified options separately. |
| GAP | Add ordinary-language provenance and pending/approved distinctions in the analysis view, plus a read-only Human route and next-action display. |
| CONFLICT | No Canonical conflict requiring a contract change was found. Report structure, source authority, review gates and Assessment ordering remain unchanged. |
| UNKNOWN | A missing WHY connection is not inferred. Display the missing connection; existing Report approval guards continue to require reviewed support and confirmation links. The global unknown list is not claimed to be causally related to a particular WHY. |
| UNKNOWN | Source dates do not establish present validity. Existing SL-A4 temporal semantics remain; no automatic expiry, reconfirmation threshold or FACT promotion. |
| UNKNOWN | A prior Human decision is a historical record from its feedback context, not automatic approval of newer analysis. The UI states this distinction. |

## Reused structures and model boundary

No migration, new DB object or write contract. `managementAnalysisReadModel` reads existing Application data under the existing Case lock and staff gate. It combines SL-A4 reuse, approved insights, pending validated post-diagnosis proposals, existing MF-B report context and the latest MF-C decision.

The read is side-effect free: no Case version changes, AI execution, Insight creation, Human approval, route selection, Evidence evaluation or Assessment proposal/order. Superseded insights and accepted/rejected proposal duplicates are excluded from the new analysis projection. Existing review history remains available below it. Redacted raw source content is not recovered; missing raw information is displayed as unavailable.

## API

Add staff-only GET `/api/admin/it-management-diagnosis/cases/:id/review/analysis`.

Returns `reuse`, `items`, `lens`, `report_context`, `decision`. `items` distinguish pending `PROPOSAL` from `HUMAN_APPROVED`; internal identifiers are retained for traceability and navigation, not printed as sales labels. Existing authentication and no-store policy apply. No new POST endpoint.

## UI

Extend `it-management-diagnosis-review.html`; no new screen or navigation state.

1. 目指している会社の姿 — existing Future interpretation, first in the analysis view; shortcut to next confirmation/decision.
2. 今、確認できていること — acquired answers/statements and explicitly labelled analysis observations; no corporate FACT claim.
3. まだ分かっていないこと — existing unknowns including unresolved, contradictory and not-required-now states.
4. 目指している会社の姿との差 — explicitly a candidate, not a final diagnosis.
5. なぜ、その状態になっているのか — explicitly a reason hypothesis, sources, existing reviewed support, required confirmations and missing-connection text.
6. ITで良くできそうなこと — options, not implementation decisions; sparse 3×6 view.
7. 次に確認・判断すること — information gathering is separated from Human management decisions.

The view links a candidate to its existing review card. Human adoption/editing/conversion/rejection continues through the existing commands. Selected SL-A4 plans and recorded speech are visible under confirmation; the Case overview link opens existing Progressive Reuse for further inspection. Existing state guards still determine where additions are permitted; the view does not reopen a finished interview.

“もとになった情報を見る” shows source type in ordinary Japanese, content, relation and recording date. Intake, Web answers, customer speech and linked additional confirmation retain distinct labels. Source lookup is restricted to the same Case. Raw answers and observations remain distinct from hypotheses and reviewed interpretation.

## 3×6 lens

Only KAIZEN_DIRECTION is grouped, using existing tags: 技術 / 運用 / 管理 × なくす / 自動化する / 標準化する / 任せる / 残す / 整える. Each nonempty cell retains per-item approval status. Items lacking either tag remain visible as unclassified options. Empty cells are omitted, with explanatory text that they mean no applicable candidate, not a problem.

No tag inference, mandatory cells, count KPI, score, maturity, radar, ranking, pricing rule, Scope calculation or Core taxonomy. Human editing of existing optional tags remains the only way to change classification of approved content.

## AI → Human Review → Report

Existing post-diagnosis AI pipeline and validators are unchanged. Pending proposals are visible only as unadopted candidates. The new view does not feed its raw information or pending proposals into Report generation.

`buildReportContext` and existing Report generation/approval gates remain authoritative: current Human-approved insights only; candidate/hypothesis labels preserved; WHY readiness and meaning-change rejection maintained. The five Business feedback topics are explained in the view. Gap/WHY remain analysis processes supporting them; stored Report section keys and immutable approved snapshots are unchanged.

## Route / next decision

Display only recorded MF-C Human decisions, using these translations:

| Stored route | Sales label |
| --- | --- |
| DIRECT_ACT | 改善の実行へ進む |
| FOCUSED_CONFIRMATION | 絞り込んだ追加確認へ進む |
| DESIGN_ASSESSMENT | 設計Assessmentを検討する |
| STOP_HOLD | 今回は止める・保留する |

The recorded material decision, next action, actor and time accompany the label. No decision means “まだ記録されていません”; no route is recommended or preselected. DESIGN_ASSESSMENT never starts proposal or order processing from this view.

## Changed files

- New projection: `src/services/managementAnalysisReadModel.ts`.
- Existing service/router integration: `src/services/diagnosisReviewRepo.ts`, `src/routes/diagnosisReview.ts`.
- New view renderer: `public/js/management-analysis.js`.
- Existing screen: `public/admin/it-management-diagnosis-review.html`, `public/js/it-management-diagnosis-review.js`, `public/css/diagnosis-review.css`.
- New tests: `test/managementAnalysis.golden.test.ts`, `test/managementAnalysis.browser.test.ts`, `test/support/managementAnalysisScenario.ts`.
- Regression integration: `test/productionReadiness.postgres.test.ts`, `test/diagnosis.playwright.config.ts`, `test/diagnosisReview.browser.test.ts` (source label expectation).
- Test execution: `package.json`, `.github/workflows/controlled-pilot-closure.yml`.
- This report.

## Validation

| Check | Result |
| --- | --- |
| All golden/unit/integration plus security (`node -r ts-node/register --test --test-concurrency=1 test/*.golden.test.ts test/productionReadiness.security.test.ts`) | 148 tests: 144 passed, 0 failed, 4 skipped |
| Real PostgreSQL 17 (`RUN_READINESS_PG=1 npm run test:readiness:postgres`) | 12 passed, 0 failed, 0 skipped, including parent test |
| Desktop/mobile browser (`npm run test:diagnosis:browser -- --timeout=20000`) | 42 passed, 0 failed, 0 skipped |
| Typecheck / build | Passed |
| Diff whitespace check | Passed |

Coverage includes sparse/unclassified/empty lenses, pending versus approved content, source and WHY continuity, no automatic FACT/decision/order, Human route display, read purity, authorization, desktop/mobile and real PostgreSQL. Existing SL-A1–A4, Report meaning guards and Survey v2 regression suites are included. The final SL-A5 fixture uses normal Japanese titles and checks that internal enum/ID labels are not printed; the focused unit/browser and PostgreSQL tests were rerun after that fixture adjustment.

Residual failures: none. The four skips are existing opt-in live AI adapter, AI-02, AI-03 and representative-company end-to-end AI tests; credentials/explicit live execution were not enabled. No live-provider readiness conclusion is drawn. PostgreSQL uses the dedicated disposable loopback database, not any customer or FACTACT database.

No BUSINESS DECISION REQUIRED arose: no new management evaluation rule or advancement condition was necessary. SL-A6, Assessment Scope development, MF-F, FACTACT Core, push and main merge are outside this change. This is Application implementation progress, not a Production/Pilot GO decision.
