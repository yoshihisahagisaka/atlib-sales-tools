# SL-A4 Progressive Reuse / Missing-only UX

Baseline: `dbdbd08b7ec50a503565691cb055acfbe9bfeb68` on `feat/free-diagnosis-sales-launch`.
Scope: Diagnosis Application only. SL-A2/A3 contracts and Survey v2 Q01–Q10 remain unchanged.

## FIT / GAP / CONFLICT / UNKNOWN

| Area | Finding and implementation |
| --- | --- |
| FIT: Intake handoff | Existing linked intake, three separate arrays, consent and survey origin metadata are reused. No new Case creation or consent behavior. |
| FIT: SurveyResponse | Saved answers and their channel/actor are reused; a canonical “分からない” answer remains meaningful. Required missing answers are distinguished from explicit unknown answers. |
| FIT: Preparation | Existing DiagnosisTheme, Future relation, Human PlanItem creation/removal, confirmation and snapshot are reused. |
| FIT: Workspace / Review | Existing SourceRecord insertion, audit, diagnosis finish and Human Review are reused. |
| GAP: overview | A staff-only read projection now separates acquired statements, unknown information and staff/AI interpretation, with the next Human action displayed first. |
| GAP: missing-only survey | Staff can open only unanswered existing survey items. Saved Web/intake answers can be expanded without rewriting their provenance. No second questionnaire or question count KPI. |
| GAP: candidate selection | Human-selected unknown candidates create existing plan items with origin references in the existing audit. Concurrent/repeated selection reuses one active plan. |
| GAP: follow-up continuity | A selected plan opens the existing customer statement form; the question is never copied into customer speech. Saved speech is linked through existing audit metadata and appears in existing Human Review. |
| CONFLICT | No conflict requiring a Canonical change was identified. No Core, MF-F, Assessment contract or pricing changes. |
| UNKNOWN: current validity | Existing timestamps establish when information was recorded/obtained, not whether it remains correct. The UI preserves dates and explicitly leaves currentness to Human confirmation. No expiry/reconfirmation threshold was invented. |
| UNKNOWN: resolution | Recording speech does not resolve an unknown. A plan with recorded speech says to inspect that speech before reasking. No new “confirmed” or automatic resolution contract is introduced. |

## Data and authority

No schema changes, migrations or new objects. The read model uses existing intake, survey, sources, reviewed insights, AI proposals, themes, Future and plans. It is read-only; reading does not change Case version or create an audit command.

`SelectReuseConfirmation` uses the existing diagnosis audit table to retain candidate origin IDs and versions, alongside the existing Human-created plan. The existing `AddInterviewStatement` audit can additionally retain `plan_item_id`. Case locking, optimistic version checking and transactional audit preserve concurrency and rollback behavior. The linked plan must be active and belong to the same Case.

Customer speech and survey answers are displayed as acquired information, not corporate FACT. Staff observations and AI interpretations remain separate. Reviewed UNKNOWN subtypes are preserved; NOT_REQUIRED_NOW is displayed but is not automatically offered as a candidate. Intake and survey unknowns are not assigned an inferred semantic subtype. No AI call or automatic proposal acceptance was added.

Preparation “今回は確認しない” reuses existing plan removal; the original unknown stays intact. Existing recorded follow-up speech supports a Human decision about whether further questions are needed, without a new unknown-resolution state. Deleted raw information is not reconstructed, and redacted survey rows are not reinterpreted as missing answers.

## API

All routes are under `/api/admin/it-management-diagnosis`, using existing staff authentication, no-store responses, command-header and cross-site guards.

| Method and relative path | Behavior |
| --- | --- |
| GET `/cases/:id/progressive-reuse` | Read grouped information, origins, candidates, active plans and recorded follow-up speech. |
| POST `/cases/:id/progressive-reuse/select` | Body: `candidateKey`, `expectedVersion`, existing Human `plan` schema. Returns `{id, replayed}`. Human selection is permitted during preparation or active diagnosis. |
| POST `/cases/:id/progressive-reuse/plan-items/:planId/statements` | Existing raw source payload; save an INTERVIEW_STATEMENT linked to an active same-Case plan during diagnosis. |

Existing endpoints and accepted Intake handoff contracts are unchanged.

## UI and Progressive Reuse

Overview, preparation and workspace share a panel. “次に確認すること” and the Human-selected plan appear first, with “目指している会社の姿” and each plan’s purpose/relation. Candidates are optional; selecting one opens a blank Human editor rather than generating a fixed question list.

The three distinct information groups are “今、確認できていること”, “まだ分かっていないこと”, and “私たちの仮説・気づき”. “もとになった情報を見る” exposes ordinary-language source labels, dates and recording staff; internal IDs are not printed. Web answers, sales intake and subsequent customer speech remain distinguishable.

For incomplete surveys, “足りない回答を確認する” hides saved items (including valid unknown answers); staff can reveal them for inspection. The survey itself is unchanged. After preparation, selected content opens the existing workspace statement form. A recorded result is shown next to its plan, so reasking is not the default. Finishing diagnosis leads to existing Human Review.

## Changed files

- Projection and services: `src/services/progressiveReuseReadModel.ts`, `diagnosisPreparationRepo.ts`, `diagnosisWorkspaceRepo.ts`.
- Routes: `src/routes/diagnosisPreparation.ts`, `diagnosisWorkspace.ts`.
- UI: `public/js/progressive-reuse.js`, `it-management-diagnosis-admin.js`, `it-management-diagnosis-preparation.js`, `it-management-diagnosis-survey.js`, `it-management-diagnosis-workspace.js`; corresponding detail/preparation/workspace HTML and `public/css/it-management-diagnosis.css`.
- Validation: `test/progressiveReuse.golden.test.ts`, `test/progressiveReuse.browser.test.ts`, `test/support/progressiveReuseScenario.ts`, `test/productionReadiness.postgres.test.ts`, existing preparation/workspace/review browser expectations and `test/diagnosis.playwright.config.ts`.
- Execution: `package.json`, `.github/workflows/controlled-pilot-closure.yml`.
- This report.

## Validation

- All golden/unit/integration files: `node -r ts-node/register --test test/*.golden.test.ts test/productionReadiness.security.test.ts` — 145 tests: 141 passed, 0 failed, 4 skipped.
- Real PostgreSQL 17: `npm run test:readiness:postgres` — 11 passed, 0 failed, 0 skipped (including parent test). Dedicated disposable local database; multi-connection SL-A4 selection and source-to-review scenario included.
- Browser: `npm run test:diagnosis:browser -- --timeout=20000` — 38 passed, 0 failed, 0 skipped across desktop/mobile.
- `npm run typecheck` and `npm run build` — passed.
- `git diff --check` — passed.

The four unit/integration skips are existing opt-in live AI adapter, AI-02, AI-03 and representative-company AI end-to-end tests. Live execution credentials/opt-in were not enabled. Synthetic adapter, authorization, retention/redaction and Human Gate checks were executed. These skips are not evidence of live-provider readiness.

Browser regression checks also cover the pre-existing sales intake, preparation, workspace, review, report and assessment flows. Japanese UI wording expectations were updated; duplicate navigation labels found during the run were corrected. Survey definitions were not changed.

## Decisions and scope boundary

No BUSINESS DECISION REQUIRED was needed for this implementation. Temporal currentness and unknown resolution remain explicitly undecided by the system. No SL-A5, MF-F or FACTACT Core implementation; no push or main merge. This report records Application progress only and does not make a Production/Pilot GO decision.
