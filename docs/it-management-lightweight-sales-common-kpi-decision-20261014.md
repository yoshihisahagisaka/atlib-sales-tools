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
