# IT経営KAIZEN 軽量営業管理・共通KPI実装判断 (2026-10-14)

Status: BUSINESS DECISION APPROVED / IMPLEMENTATION PENDING
Base: atlib-sales-tools main d35581cec3dbc7d4ca2938f2a9c664906ccc5316
Scope: IT経営KAIZENの営業管理最小拡張とSales Tools共通KPIダッシュボード。Production変更の承認ではない。

## Decision / Rationale
高度なCRMは作らない。既存のIT経営KAIZEN案件一覧に、管理者が手動更新する営業ステータスと提案金額・受注金額（任意、税抜JPY）を追加する。経営上の受付・提案・受注・失注・金額を簡単に把握できれば十分であり、診断/ヒアリング/Reportの細かな状態から営業ステータスを自動推定しない。顧客・Case・診断情報は既存の正本を維持する。

## Status candidates (label set pending implementation Fit/Gap)
- 未対応
- 対応中
- 有料提案済み
- 受注
- 失注
- 継続フォロー
- 提案不要・終了

上記7候補はUIの初期案であり、既存営業Stage/Outcomeと照合してから確定する。現行の診断Case statusを置換しない。提案不要・終了は正常終了であり失注に含めない。

## Fields and controls
- sales stage: staff manually selects; initial default and exact persistence are implementation Fit/Gap.
- proposed amount / won amount: optional non-negative numeric JPY ex-tax; NULL and 0 distinct. Avoid premature quotation/invoice system.
- owner / next follow-up date: existing source first; missing persistence is GAP, not automatic migration authorization.
- change history: actor, timestamp, previous/new value, and source; do not overwrite the only evidence of proposal/win.
- commercial event: actual human-confirmed proposal or win; stage alone must not imply that event. Proposal remains counted after win. Revisions/multiple offers need stable identity or explicit documented MVP limitation.

## Common KPI boundary
Existing canonical documents take precedence:
- docs/sales-tools-common-kpi-foundation-contract-20261011.md at 4d433028a354f8a3c468c62d4308e6a0f7a37a29
- docs/sales-tools-common-kpi-contract-20261011.md at same SHA
- docs/sales-tools-common-kpi-service-boundary-decision-20261011.md at same SHA
- docs/sales-tools-cross-service-dashboard-decision-20261013.md on main

Dashboard is Sales Tools authenticated admin landing/portal, not an independent CRM. Existing public / page must not be replaced without route/auth review. Common KPI uses semantic matching only, separate cohort conversion and period activity, drill-down to canonical subjects. Service-specific funnels remain separate. Business KAIZEN owns its adapter and destination URL. No forced shared Case/Lead schema. Missing vs zero vs not applicable must be distinct.

## IT management source Fit/Gap so far
- case: it_management_diagnosis_case_v2; company / owner / attribution: sales_activity.
- self/proxy: it_management_diagnosis_original_survey_snapshot_v2.entry_channel; submitted_at exists.
- marketing initiatives: existing marketing_initiative with exact UTM matching; reuse existing 6-indicator service KPIs, not as replacement for common milestones.
- reports: diagnosis_reports approved_at / delivered_at, feedback_completed_at; first reached only per subject, and exact source/policy-version eligibility to be validated.
- ENTRY_ACCEPTED: unresolved distinction between sales_activity creation, Case creation and accepted survey submission. Do not use timestamps interchangeably.
- commercial proposed/won: canonical source not confirmed; no inference from recommendation, suggested price, stage, or report. Requires explicit minimal human-confirmed record contract.
- test cases: current is_internal_test must be excluded from normal KPI and restored on unmark; no physical delete UI.
- cross-company identity: do not assume independently created company IDs identify the same real company.

## Implementation gates
1. Read main HEAD, existing Canonical and Production release evidence; confirm branch and worktree changes; coordinate with concurrent Business KAIZEN development.
2. Confirm entry event, exact milestone source, manual sales fields and event semantics. Prepare schema/API/UI contract and tests, no speculative migrations.
3. Implement on isolated branch/worktree; reuse existing adminAuthGate and service routes; preserve public and Partner regressions.
4. Contract tests: 1 subject=1; proposal retained after win; no-paid-needed != lost; NULL amount != 0; no double count; test exclusion/restore; unknown != zero; cohort vs activity separate; drilldown works; auth guard works.
5. No production migration, DB write, deploy, or traffic change without explicit separate approvals and release coordination.

## Responsibility
IT経営KAIZEN lane: shared KPI foundation, aggregation/API, portal, IT adapter and lightweight IT sales management.
業務KAIZEN lane: its own diagnosis, customer/lead/stage/detail KPI and Common KPI adapter, plus final customer-list route.

## Decision amendment — 2026-10-14: one proposal and one win amount per subject
Status: APPROVED / IMPLEMENTATION PENDING
- For the initial IT経営KAIZEN lightweight sales management, exactly one optional proposed amount and one optional won amount per canonical diagnosis Case. JPY ex-tax; NULL is not zero.
- No multiple offers, service-line itemization, recurring billing breakdown, quote system, or CRM in MVP.
- Proposal amount and won amount may differ; the approved proposal fact must remain available after a win.
- This is a **service-specific MVP constraint**, not a restriction or rewrite of the Common KPI Foundation's CommercialEvent array, which remains capable of multiple events for other services or later extensions.
- A manual stage change alone must not fabricate PROPOSED/WON events. Implementation must define the minimal explicit human confirmation and stable first-occurrence timestamps, with edit audit and non-duplicating KPI semantics. The amount field's edits must not silently create additional commercial events.
- Existing decision and migration/Production approval gates remain unchanged.

## Decision amendment — 2026-10-14: compact sales ledger UX
Status: APPROVED / IMPLEMENTATION PENDING
- IT経営KAIZEN sales management uses a **separate compact, spreadsheet-like, one-row-per-subject ledger**, not a large card/form and not a replacement for the existing diagnosis operations screen.
- Clicking the company/subject navigates to the existing diagnosis detail; clicking stage/proposal amount/won amount edits that cell inline. Keep row height approximately 36–40px in resting state, targeting about 20 visible rows on a typical desktop where practical. No multiline workflow explanations in table rows.
- Compact search/filter bar: company keyword, sales stage, marketing initiative, accepted-date range, self/staff entry channel, normal/test/all; newest/oldest sort. Search/filter **on the entire matching DB dataset**, not only the existing 100-row client result. Paginate with stable ordering and display total matching count.
- KPI drill-down must preserve filter semantics to the underlying canonical subject list. Reuse existing auth guard, UTM attribution and test-case designation; do not mix test cases into normal KPIs.
- Inline edits persist only after explicit change confirmation; first human-confirmed proposal/win requires minimal confirmation, audit and stable first-reached time; do not create events merely because stage text changes. Failed writes restore original UI values and show an error.
- Search and ledger are not a CRM: no detailed activities, opportunity forecast, invoices, or multiple proposals. Business KAIZEN continues to own its independent list and adapter.
- Route, exact column set, query API, index/migration needs and performance acceptance remain implementation Fit/Gap; no Production changes authorized.

## Source review — 2026-10-14: compact ledger API Fit/Gap
Evidence: main d35581c, src/routes/adminFreeDiagnosisRuleBasedV1.ts, src/services/freeDiagnosisSalesLauncherRepo.ts, src/server.ts, migrations/027_free_diagnosis_rule_based_v1.sql.

- Existing GET /api/admin/free-diagnosis-v1/sales-activities is authenticated, returns items and test-case-management capability, and supports acquisitionSourceName, utmCampaign, initiativeId, testStatus. It does **not** accept keyword, sales stage, date range, entry channel, sort, limit/cursor; Zod strict rejects them.
- Repo listSalesActivities currently ORDER BY s.created_at DESC,s.id DESC LIMIT 100; no total count or pagination. Client-only filtering would miss older subjects and is prohibited.
- Existing list starts from sales_activity and LEFT JOINs latest Case; records without a Case exist. Define whether the compact IT diagnosis ledger lists accepted Case only, or all Sales Activity, before counting KPI subjects. Do not equate sales_activity creation to ENTRY_ACCEPTED without evidence.
- Current list computes marketing initiative by UTM exact match and uses is_internal_test from latest Case. Reuse matching and test semantics; do not regress normal/test/all behavior.
- Existing sales_activity has owner_user_id and company_id; the current list does not expose the owner field as an editable commercial assignment. Do not introduce a duplicate owner SSOT without Fit/Gap.
- Suggested bounded implementation: **new dedicated authenticated ledger API** and compact HTML under /admin, leaving legacy diagnosis list and API behavior unchanged. Use server-side filtering, stable pagination and total count. Proposed stage/amount storage and commercial confirmation audit require a separately reviewed migration, not approved by this doc.
- Contract acceptance: keyword across all rows; filter combinations; stable page boundary; correct total; stage inline editing; NULL/0 distinction; no duplicate proposal/win; historical proposal retained after win; explicit test filtering; permission checks; no public page or legacy admin regression; drilldown exact subject.
- Open design points: exact Case eligibility/ENTRY_ACCEPTED timestamp, accepted-date range field, commercial audit persistence, stage transition edge cases, owner semantics, service route and company-identity uniqueness. Keep unresolved; do not fabricate values.

## Source review — 2026-10-14: Design v2 accepted-entry boundary
Evidence: src/services/publicCustomerSelfSubmissionService.ts and src/services/staffProxyDesignV2SubmissionService.ts on main d35581c.
- Both CUSTOMER_SELF and STAFF_PROXY create Sales Activity, create diagnosis Case and complete Design v2 original survey within a single DB transaction, committing only after successful completion. Replayed idempotency keys return existing Case instead of a new Case.
- Thus for the Design v2 initial common KPI mapping, an accepted subject is a canonical diagnosis Case with a committed original survey snapshot, not any Sales Activity row or a provisional Case. ENTRY_ACCEPTED.firstReachedAt candidate = original survey submitted_at. Confirm source timestamp consistency and historical coverage with contract tests before implementation.
- Existing Sales Activity list includes records without a Case and must not be blindly reused as the accepted-entry cohort.
- Legacy v1 / incomplete cases need separate explicit mapping or exclusion, not guessed timestamps. Distinguish commercial manual stage from actual human-confirmed event, preserving 1 proposed amount and 1 won amount per Case.
