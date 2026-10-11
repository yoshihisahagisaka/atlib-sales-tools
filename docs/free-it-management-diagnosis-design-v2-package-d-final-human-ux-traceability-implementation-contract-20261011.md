# Package D Final Human UX Traceability Implementation Contract — 2026-10-11

Status: IMPLEMENTATION GO / PACKAGE D NOT CLOSED

## 1. Purpose

Human Acceptance confirmed that Design v2 diagnosis, deterministic analysis, and generated narrative direction are acceptable. Remaining work is limited to human usability and traceability.

The system must help a human follow the path:

Hearing Theme -> Theme Memo -> Related Survey Q -> Human updates Current State if needed -> Re-analysis -> Related Analysis Item -> Related Narrative Section -> Human refines Customer-facing Narrative.

The system must NOT analyze hearing memo text to auto-change answers, auto-reanalyze, or auto-generate narrative.

## 2. Human authority boundary

- Hearing memo is reference information only.
- Hearing memo never becomes analyzer input.
- Hearing memo never automatically changes Current State.
- Human decides whether Q2-Q7 should be changed after reviewing hearing notes.
- Re-analysis uses only the latest Human-updated Current Structured State.
- Generated Narrative remains deterministic from Current State / Analysis.
- Human edits Customer-facing Narrative manually.

## 3. Live Hearing final UX

For each Hearing Viewpoint card:

- short theme title
- short reason / why useful
- lens badges
- related Q chips if deterministically available from provenance
- theme-specific memo area
- collapsed example questions

Desktop target:

- 5 themes should be scannable with minimal vertical travel.
- Use the currently unused horizontal space to place memo next to or within each theme card.
- Keep Original Survey read-only in the left pane.
- Keep an optional small general memo area only for notes that do not belong to a specific theme.

## 4. Theme memo persistence Fit/Gap gate

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

## 5. Related Q traceability

A Hearing Viewpoint may display related survey questions only when the relation is deterministic from existing rule/provenance metadata.

Preferred sources:
- sourceRuleIds / rule dependency metadata
- existing analyzer provenance
- existing deterministic rule definitions

Do not infer related Q from memo text.
Do not invent a frontend-only semantic mapping unless it is a direct representation of an existing deterministic rule dependency.

If no safe deterministic provenance exists, STOP and report the gap before adding new domain semantics.

## 6. Post-Hearing Hearing Record

Replace the large undifferentiated hearing memo presentation with theme-oriented records where possible.

Each theme block should show:
- theme title
- memo(s)
- related Q chips
- related analysis/narrative references if available

General memo remains separate as "その他メモ".

The human should be able to click a related Q chip and move to Step 1 "回答を見直す" with that Q opened.

No answer is changed by navigation.

## 7. Current State review bridge

In Step 1 "回答を見直す":

- keep Q2-Q7 human editable only
- keep Original Survey immutable
- show related hearing theme count / links per question when available
- clicking a related hearing theme should reveal that theme's memo without changing the answer

The UI should make it easy to answer:
"Which hearing information is relevant when deciding whether this current answer should change?"

## 8. Analysis traceability

In Step 2 "分析を確認する":

Where deterministic provenance allows, show which Hearing Viewpoint(s) relate to each analysis item.

Traceability is explanatory only.
It must not imply that hearing memo text caused the analysis result.

Preferred relation:
Hearing Viewpoint.sourceRuleIds intersects Analysis Item.sourceRuleIds.

Use section/item-level traceability, not sentence-level causal claims.

## 9. Narrative traceability

In Step 3 "顧客向け文面を整える":

Generated Narrative remains read-only.
Customer-facing Narrative remains human editable.

Show related Hearing Viewpoint chips at narrative section level where a deterministic provenance path exists.

Expected conceptual mapping:
- Future narrative section <- Future / expectation-related analysis
- Current understanding narrative section <- current understanding analysis
- Confirmation / improvement possibility section <- lens findings
- Unknown section <- unknowns
- Next confirmation section <- fact candidates

A theme chip may open a compact reference showing:
- theme title
- theme memo
- related Q
- related analysis item(s)

Do not claim that Human Edited Narrative sentences are automatically derived from a specific memo.

## 10. No new automation

Explicitly out of scope:
- NLP/AI extraction from memo
- memo summarization into Current State
- automatic Q recommendation
- automatic Q update
- automatic solution recommendation
- automatic narrative regeneration from memo
- automatic Assessment Scope

## 11. Preserve existing Package D semantics

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

## 12. Allowed implementation scope

Prefer minimal changes in:
- public/admin/free-diagnosis-v2-hearing.html
- public/admin/free-diagnosis-v2-hearing.js
- public/admin/free-diagnosis-v2-analysis.html
- public/admin/free-diagnosis-v2-analysis.js
- public/admin/free-diagnosis-v2-common.js
- public/admin/free-diagnosis-v2.css
- Package D browser/integration tests

A minimal read-only API/view-model extension is allowed only when needed to expose already-existing provenance or hearing statement reference data. Do not change diagnosis semantics.

## 13. Forbidden

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

## 14. Acceptance

Human Acceptance should prove:

1. The operator can record notes per hearing theme.
2. The operator can see which Qs are relevant to each theme.
3. From a theme note, the operator can jump to the relevant Q review without automatic modification.
4. From a Q, the operator can see relevant hearing notes.
5. After human Q changes and re-analysis, related analysis items can be traced back to relevant hearing themes where deterministic provenance exists.
6. While refining customer-facing narrative, the operator can see which hearing themes / analysis sections are relevant.
7. No memo text is consumed as analyzer or narrative-generation input.
8. Existing Package A-D regression remains green.

Package D remains open until Source Review and Human Acceptance PASS after this final UX patch.