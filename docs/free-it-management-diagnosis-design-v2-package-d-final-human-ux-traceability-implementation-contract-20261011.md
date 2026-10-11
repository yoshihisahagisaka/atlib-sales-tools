# Package D Final Human UX Traceability Implementation Contract — 2026-10-11

Status: IMPLEMENTATION GO / PACKAGE D NOT CLOSED

## 1. Purpose

Human Acceptance confirmed that Design v2 diagnosis, deterministic analysis, and generated narrative direction are acceptable. Remaining work is limited to human usability and simple visual traceability.

The system should help a human follow the path:

Hearing Theme -> Theme Memo -> Related Survey Q -> Human updates Current State if needed -> Re-analysis -> Related Analysis / Narrative section -> Human refines Customer-facing Narrative.

This is not a new traceability engine. Existing deterministic relationships already used internally by the Design v2 rule / narrative generation should be surfaced as simple badges / chips where available.

The system must NOT analyze hearing memo text to auto-change answers, auto-reanalyze, or auto-generate narrative.

## 2. Human authority boundary

- Hearing memo is reference information only.
- Hearing memo never becomes analyzer input.
- Hearing memo never automatically changes Current State.
- Human decides whether Q2-Q7 should be changed after reviewing hearing notes.
- Re-analysis uses only the latest Human-updated Current Structured State.
- Generated Narrative remains deterministic from Current State / Analysis.
- Human edits Customer-facing Narrative manually.

## 3. Simple display principle

Do not build a new provenance graph, causal model, AI mapping, or sentence-level traceability.

Use the relationships already present internally when the system generates:
- Hearing Viewpoints from survey / rule state
- Analysis items from Current State
- Generated Narrative sections from Analysis

Expose those relationships only as display metadata such as:
- 関連する回答: Q2 / Q3 / Q7
- 関連する分析: 確認ポイント / まだ確認できていないこと
- 関連する文面: 確認ポイントと改善可能性

If an existing deterministic relation is not available, simply omit that badge. Do not invent a new semantic relation solely for display.

## 4. Live Hearing final UX

For each Hearing Viewpoint card:

- short theme title
- short reason / why useful
- lens badges
- related Q badges when already deterministically known
- theme-specific memo area
- collapsed example questions

Desktop target:

- 5 themes should be scannable with minimal vertical travel.
- Use the currently unused horizontal space to place memo next to or within each theme card.
- Keep Original Survey read-only in the left pane.
- Keep an optional small general memo area only for notes that do not belong to a specific theme.

Related Q badges are informational only. Clicking them may open the corresponding Q review if this is easy to implement, but navigation is optional. The required value is that the operator can see the relationship.

## 5. Theme memo persistence Fit/Gap gate

Before code change, inspect existing Hearing Statement API/repository/schema.

Reuse existing storage only if a Hearing Statement can safely carry a stable Design v2 Hearing Viewpoint reference without introducing HA6/M01-M06 semantics.

Allowed:
- existing optional reference field that can store a stable Design v2 viewpoint id
- plain append-only hearing statement
- authenticated actor
- same-case integrity

Forbidden:
- forcing M01-M06/question-code semantics
- using structured answer payload as memo meaning
- migration solely for this UX patch
- analyzer consumption of memo

If stable viewpoint linkage cannot be stored with the existing schema/API without semantic distortion, STOP and report Fit/Gap. Do not add a migration.

## 6. Related Q display

For each Hearing Viewpoint, show related survey Q badges only from already-existing deterministic rule / provenance information.

Preferred existing sources include:
- sourceRuleIds / rule dependency information
- existing analyzer provenance
- existing deterministic rule definitions

Do not infer related Q from memo text.
Do not create a separate frontend semantic engine.

The goal is simply to make visible what the system already knows internally.

## 7. Post-Hearing Hearing Record

Replace the large undifferentiated hearing memo presentation with theme-oriented records where possible.

Each theme block should show:
- theme title
- memo(s)
- related Q badges

General memo remains separate as "その他メモ".

If simple navigation is available, a related Q badge may open Step 1 "回答を見直す" with that Q expanded. This is optional and must never change the answer automatically.

## 8. Current State review bridge

In Step 1 "回答を見直す":

- keep Q2-Q7 human editable only
- keep Original Survey immutable
- show related hearing theme badges / references when already available

The purpose is to help the human answer:
"この回答を見直すとき、どのヒアリング内容を参考にすればよいか"

No automatic recommendation to change a Q is required.
No automatic Q update is allowed.

## 9. Analysis display bridge

In Step 2 "分析を確認する":

Where existing deterministic information already makes the relationship available, show related Hearing Theme badges on the relevant analysis section / item.

This is explanatory only.
It must not imply that hearing memo text caused the analysis result.

Do not add new domain semantics just to create these badges.

## 10. Narrative display bridge

In Step 3 "顧客向け文面を整える":

Generated Narrative remains read-only.
Customer-facing Narrative remains human editable.

At each generated / customer-facing narrative section, show simple related Hearing Theme badges where the relationship is already known from the existing deterministic generation path.

Examples:
- 関連テーマ: #2 自動化・AI活用の確認価値
- 関連テーマ: #4 経営判断に使える情報の形

A badge may optionally reveal the theme memo in a compact reference panel, but this is not required if it complicates the implementation.

Do not claim that Human Edited Narrative sentences are automatically derived from a specific memo.
Do not attempt sentence-level provenance.

## 11. No new automation

Explicitly out of scope:
- NLP/AI extraction from memo
- memo summarization into Current State
- automatic Q recommendation
- automatic Q update
- automatic solution recommendation
- automatic narrative regeneration from memo
- automatic Assessment Scope
- new provenance engine
- sentence-level causal traceability

## 12. Preserve existing Package D semantics

Must preserve:
- Live Hearing has no Current editor / Re-analysis / Narrative editor
- Post-Hearing 3-layer model
- Current Save and Re-analysis separate HTTP requests
- Re-analysis failure keeps saved Human Current State
- Generated Narrative and Human Edited Narrative separation
- freshness/stale guards
- Healthy Case guard
- Interest is not recommendation
- UNKNOWN is not a problem finding
- FACT Candidate is not confirmed Assessment Scope
- XSS-safe rendering

## 13. Allowed implementation scope

Prefer minimal changes in:
- public/admin/free-diagnosis-v2-hearing.html
- public/admin/free-diagnosis-v2-hearing.js
- public/admin/free-diagnosis-v2-analysis.html
- public/admin/free-diagnosis-v2-analysis.js
- public/admin/free-diagnosis-v2-common.js
- public/admin/free-diagnosis-v2.css
- Package D browser/integration tests

A minimal read-only API/view-model extension is allowed only when needed to expose already-existing relationship data. Do not change diagnosis semantics.

## 14. Forbidden

- migrations 027-033 changes
- new migration
- Production DB
- Package A analyzer semantic changes
- Package B persistence semantic changes
- Package C Current Save/Re-analysis semantics changes
- Public Survey changes
- Report / Human Review / Delivery / Feedback / Package E
- KPI implementation
- HA7
- deploy
- Production traffic

## 15. Acceptance

Human Acceptance should prove:

1. The operator can record notes per hearing theme.
2. The operator can see related Q badges for a theme when that relation already exists internally.
3. The operator can review hearing notes and manually decide whether a Current answer should change.
4. After re-analysis, the operator can see simple related-theme badges on relevant analysis / narrative sections where that relation is already known.
5. Customer-facing Narrative remains a human refinement step.
6. No memo text is consumed as analyzer or narrative-generation input.
7. No new provenance engine or automatic interpretation is introduced.
8. Existing Package A-D regression remains green.

Package D remains open until Source Review and Human Acceptance PASS after this final UX patch.