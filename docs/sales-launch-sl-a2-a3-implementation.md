# SL-A2 / SL-A3 Application implementation

Status: local Application implementation only. Production / Controlled Customer Pilot remains NO-GO.

The validation counts below describe commit `63c84bd`. Subsequent failure classification and acceptance validation are recorded in [sales-launch-sl-a2-a3-acceptance-validation.md](sales-launch-sl-a2-a3-acceptance-validation.md).

## Baseline and FIT / GAP

- Branch: `feat/free-diagnosis-sales-launch`; starting HEAD: `2cd1ecb5b9b1e8b0b600d450dd89ecf39a68a95e`.
- Business reference: git_KAIZEN `origin/main` (`6768020`), docs/88 management-conversation-to-free-diagnosis sales principles.
- Development reference: git_KAIZEN `origin/dev/controlled-pilot-closure-v2` (`c5ed411`), docs/91 Sales Launch FIT/GAP.
- FIT: reuse existing staff authentication, Survey v2 Q01–Q10, answer validation, Case/participant creation, transaction/audit patterns, and raw-data deletion/reconciliation. No changes to Survey questions, FACTACT Core, MF-F / Assessment contracts, service definition or prices.
- GAP closed: staff-only conversation record before diagnosis; separate customer statements, explicit unknowns and salesperson notes; explicit Human-recorded customer agreement; atomic, idempotent Case creation and answer handoff; original-record read model.
- Existing SourceRecord represents downstream workspace sources. The three pre-diagnosis categories are therefore retained in an Application record, not coerced into customer statements or new Core objects. Neither statements nor hypotheses become FACT or reviewed Insight.

## Data and migration

`017_sales_conversation_intake.sql` adds `sales_conversation_intakes`, metadata-only `sales_intake_audit_logs`, the Case origin link and three Survey answer origin columns. Intake stores customer information, original/last staff actor and timestamps, optional conversation timestamp, separated supplements, existing-question answers, consent customer reference, recording staff actor, System timestamp and wording version, and linked Case ID.

Saving never creates a Case. The separate consent command locks the record, checks its version and explicit agreement, records consent, reuses Case creation, imports answers and commits the audit in one transaction. Unique links, row locking and returning the existing Case on retry prevent duplicate creation across connections. An audit failure rolls everything back. A DB insertion trigger rejects new SALES_VISIT Cases without a consented origin. Legacy Cases are not backfilled with invented consent.

The linked original record is read-only through the API. Imported answers retain their original staff, recording time and intake version; later Survey edits clear current-answer intake origin, while the original linked record remains available. Missing answers remain missing; explicit unknown answers and unknown supplements remain explicit. Previously recorded information is not asserted to be current.

Migration is required before deploying this Application revision. It was applied only to disposable test databases; no deployment or production migration was performed. This is an additive migration, but the previous direct sales-create command intentionally fails closed with HTTP 409.

## API

All paths below are under `/api/admin/it-management-diagnosis` and require existing staff authentication. Mutations require `X-Diagnosis-Command: 1`, reject cross-site calls and return no-store responses. Customer and AI actors cannot save or consent.

| Method / path | Behavior |
|---|---|
| GET /sales-intakes/questions | Existing canonical Survey v2 definitions |
| GET /sales-intakes | Most recent 100 conversation summaries |
| POST /sales-intakes | Save conversation only; 201 `{id, version}` |
| GET /sales-intakes/:id | Read original classified record |
| PUT /sales-intakes/:id | `{expectedVersion, record}`; editable before consent |
| POST /sales-intakes/:id/consent-and-start | `{expectedVersion, customerAgreed: true, customerReference}`; one Case, retry-safe |
| GET /cases/:id/sales-conversation | Original classified record, or null for legacy/Web Cases |

Record payload: `customer`, `customerStatements[]`, `unknowns[]`, `salespersonNotes[]`, `surveyAnswers` keyed by existing question code, optional `conversationAt`. Company is required to save; contact name/email can be completed before diagnosis start. No second question definition or AI consent decision exists.

## UI and progressive reuse

`/admin/sales-conversation.html` is the sales entry. The old new-case URL redirects here unless resuming an existing Case. The UI uses 営業で伺った内容を登録する, 確認できたこと, まだ分かっていないこと, 私たちの仮説・気づき and 無料診断として分析して返すことへの顧客同意.

Saving and consent/start are separate operations. Editing hides the consent controls until the new content is saved. Pending saves disable editing to avoid lost changes. Existing canonical answers are optional, prefilled after handoff, and marked as inherited. Case overview displays the three original classes and links back to their source. This supplies a reusable data state; it does not claim a fully automated subsequent interview or analysis workflow.

## Retention and unresolved UNKNOWN

- Linked conversation raw data follows the existing approved GENERAL_RAW_DIAGNOSIS deletion and restore-reconciliation path. Consent recording staff/time, origin IDs and audit metadata survive; customer identity, supplements and answers are redacted. The UI distinguishes deletion from never recorded.
- Retention period and deletion/withdrawal operations for **unconverted pre-consent conversations** are not defined by this slice. No duration, consent-withdrawal business rule or automatic deletion policy has been invented. A policy decision is required before operational release, not to save synthetic test records.
- Consent is the authenticated staff member's explicit record of the customer's agreement, not a verified customer signature. No AI inference or automatic Case start is used.
- External Production/Pilot evidence is not supplied by these tests. No GO claim, push, merge or deployment is authorized by this implementation.

## Validation

Validation uses the specified starting HEAD in `C:/atlib/atlib-sales-launch`, not the unrelated Development normalization lane. A temporary switch of the shared working directory was detected; only this task's patch was moved to the dedicated worktree and removed from the shared directory. No other-lane commit was imported. Earlier successful runs against the accidentally switched directory are not counted as validation of this commit.

| Check on the specified baseline plus this change | Result |
|---|---|
| New sales-intake golden scenarios | 6 passed (included in the full run below) |
| `RUN_READINESS_PG=1 npm run test:readiness:postgres` | 10 passed; PostgreSQL 17, independent connections, migration/rollback and synthetic WEB/SALES E2E |
| `npm run test:diagnosis:browser -- --grep '営業会話:'` | 2 passed; desktop/mobile, separate save/consent, no pre-consent Case, three classes, answer reuse, no horizontal overflow |
| `node -r ts-node/register --test --test-concurrency=1 test/*.golden.test.ts test/productionReadiness.security.test.ts` | 128 passed, 5 failed, 4 live-AI tests skipped |
| Full browser suite, `--timeout=15000` | 10 passed, 24 failed on existing UI-text expectations; includes both new passing sales scenarios |
| `npm run build` | 2 existing TS2345 errors in assessmentScopeClarification.ts lines 15/16 |
| New browser JS syntax / Git diff whitespace | Passed |

All five failing golden tests were rerun against the untouched `2cd1ecb` worktree and failed there as well: report semantic labels, diagnosis legacy-display assertion, two MF-A display assertions, and the MF-B support-label assertion. The build's same two errors also reproduce there. A representative Assessment browser failure was reproduced on the untouched baseline (`NOT_PROPOSED` expected versus `設計Assessment状況：未提案` rendered); full browser failures additionally expect former report, preparation, workspace and diagnosis labels. Full regression is therefore **not green**. These existing normalization issues remain outside this patch. The new sales browser scenarios pass independently and their screenshots were inspected.

The PostgreSQL test container was stopped after validation. No live AI/provider tests, production databases or external evidence were exercised. Remote CI was not triggered because this change has not been pushed.

The starting HEAD has existing type-check failures in `assessmentScopeClarification.ts` and outdated Japanese UI expectations in several tests. These are reproduced against an untouched detached worktree at the same starting HEAD and are reported separately; the Assessment/MF contract and unrelated normalization work are not changed here.

## Changed-file inventory

- Migration/domain/API: `migrations/017_sales_conversation_intake.sql`, `src/domain/salesIntake.ts`, `src/routes/salesIntake.ts`, `src/services/salesIntakeRepo.ts`, `src/services/itManagementDiagnosisRepo.ts`, `src/server.ts`.
- UI: `public/admin/sales-conversation.html`, `public/js/sales-conversation.js`, `public/admin/it-management-diagnosis-new.html`, `public/js/it-management-diagnosis-survey.js`, `public/js/it-management-diagnosis-admin.js`, `public/css/it-management-diagnosis.css`.
- Deletion continuity: `src/services/retentionDeletionWorker.ts`, `src/services/deletionReconciliation.ts`.
- Tests: `test/salesIntake.golden.test.ts`, `test/support/salesIntakeScenario.ts`, `test/support/salesIntakeFixtures.ts`, `test/support/diagnosisHarness.ts`, `test/itManagementDiagnosis.golden.test.ts`, `test/itManagementDiagnosis.browser.test.ts`, `test/controlledPilotPolicyClosure.golden.test.ts`, `test/productionReadiness.postgres.test.ts`.
- Test registration/report: `package.json`, `.github/workflows/controlled-pilot-closure.yml`, this document.
