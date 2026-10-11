# Package D Final UX Simplification Implementation Contract — 2026-10-11

Status: IMPLEMENTATION GO / PACKAGE D NOT CLOSED

## 1. Purpose

Human Acceptance confirmed that the Design v2 diagnosis semantics, deterministic analysis, hearing theme generation, Q relationship display, and customer-facing narrative direction are acceptable.

Remaining work is a final UX simplification so the operator's visible workflow matches actual usage:

Hear -> Memo -> If needed review/correct answers -> Re-analysis only when answers changed -> Review and refine customer-facing report.

The system should not force the operator through Answer -> Analysis -> Narrative as three mandatory visible steps when most cases only require report review/editing.

## 2. Human authority and system boundary

Preserve all existing semantic boundaries:

- Hearing memo is reference information only.
- Hearing memo never becomes Analyzer input.
- Hearing memo never automatically changes Current State.
- Hearing memo never directly generates customer-facing narrative.
- Human decides whether any answer should be changed.
- Re-analysis uses only the latest Human-updated Current Structured State.
- Q1 correction remains supplemental reference information and does not change Analyzer semantics.
- Generated narrative remains deterministic from Current State / Analysis.
- Human edits customer-facing narrative manually.

## 3. Live Hearing final layout

Each hearing theme card should follow the operator's natural thought flow from top to bottom:

1. Theme title
2. Related Q badges
3. Purpose / why this should be confirmed
4. How to ask / example prompts
5. Memo area

### 3.1 How-to-ask display

- Do not collapse the example prompts by default.
- Display the asking examples directly in the card.
- Keep them concise enough that all five themes remain scannable on a normal desktop.
- Do not add completion scores/checklists.

### 3.2 Theme memo interaction

The current dual actions such as per-card "テーマメモを追加" plus a separate bottom "メモを追加" are confusing.

Simplify to one clear operation model:

- Each theme card has its own memo textarea.
- One clearly named action saves the theme memos for the hearing screen, preferably "ヒアリングメモを保存".
- If a general/other memo is retained, label it explicitly as "その他メモ" and keep it visually secondary.
- The operator should not have to guess which button saves which memo.

### 3.3 Hearing record list

- Do not show the historical "ヒアリング記録" list on the Live Hearing screen.
- The live screen should focus on current themes, how to ask, and memo entry.
- Existing persisted hearing records remain stored; this is a display simplification only.

## 4. Post-Hearing primary screen

The primary post-hearing screen should no longer present three mandatory workflow tabs as the main navigation.

Default working layout on desktop:

- Left: Answer reference pane, collapsed by default
- Center: Theme-oriented hearing memo cards
- Right: Customer-facing report review/edit area

The normal operator path should be visible without requiring a step switch.

## 5. Left answer reference pane

The left pane is reference/supporting information and is not normally the main working area.

### 5.1 Default state

- Collapsed by default.
- Show a compact affordance such as "回答を表示".
- Expanding it reveals answer reference controls.

### 5.2 Expanded controls

Inside the expanded pane:

- Toggle: "見直し後の回答" / "最初の回答"
- Current/reviewed answers are the default when available.
- Questions that differ from Original show a neutral "変更あり" badge.
- "変更あり" means only that a human changed/corrected the answer; it has no positive/negative/risk meaning.
- Provide a clear "回答を見直す" action here because this pane is where answer review naturally belongs.

### 5.3 Answer review as auxiliary operation

Answer editing is not a mandatory main step.

When the operator chooses "回答を見直す":

- expose the existing Q1-Q7 human review/edit function
- preserve Original immutability
- preserve Current revision semantics
- preserve separate Save Current and Re-analysis requests
- if Current was changed and analysis is stale, show a clear re-analysis-required state
- after re-analysis, return naturally to report review

Do not remove the underlying review capability; only demote it from the main workflow.

## 6. Center hearing memo pane

The center pane should show hearing information by theme, not as an undifferentiated chronological memo list.

Each theme card should show:

- Theme number/title
- Related Q badges
- Purpose if helpful in compact form
- Saved theme memo(s)

The operator should be able to use the related-Q badges as a visual guide when deciding whether answer review is needed.

Historical timestamps may remain, but should not dominate the layout.

## 7. Theme color identity

Assign each hearing theme a stable, non-semantic visual identity color for the current case/session display.

Use the same theme color consistently in:

- Center theme card accent / theme number / identifying chip
- Right-side related-theme badges on report sections
- Optional related-theme badges in detailed analysis view

Requirements:

- The colors are identifiers only.
- Do not imply risk, health, priority, severity, good/bad, or recommendation.
- Avoid red/green semantics.
- Keep contrast and accessibility sufficient.
- The same theme must use the same color everywhere on the screen.

## 8. Customer-facing report as primary work area

The right pane should be the main post-hearing work area.

### 8.1 Default view

- Show the customer-facing report sections directly.
- Do not make the operator open "分析から作成した文面を見る" before seeing the report they need to refine.
- The operator should be able to read and edit the report from top to bottom as the normal task.

### 8.2 Full-height / auto-growing editors

Current small textareas that require internal scrolling or manual drag-resizing are not acceptable for the primary editing flow.

For each customer-facing narrative section:

- Show the entire current text on initial display where reasonably possible.
- Use auto-growing textarea behavior or equivalent so the field expands with content.
- Avoid internal textarea scrollbars for normal content sizes.
- The operator should be able to read the whole section while editing without manual resizing.

### 8.3 Related theme badges

At the relevant report section, show the existing deterministic related-theme badges.

- Use the same theme colors as the center pane.
- This is visual traceability only.
- Do not imply that memo text caused the narrative.
- Do not add new semantic mappings solely to fill missing badges.

### 8.4 Generated/original system text

The generated system narrative may still be available as a reference, but it should be secondary.

Recommended behavior:

- Human-editable customer-facing text is primary.
- "分析から作成した元の文面" or equivalent is optional/collapsible reference.
- Do not duplicate the same report content twice in the main vertical flow.

### 8.5 Save action

- Keep the report save action easy to reach.
- Prefer sticky/footer or another simple persistent placement if it can be done without complexity.
- The operator should not have to scroll to an unpredictable very bottom just to save.

## 9. Analysis detail

Detailed analysis remains available but is not part of the normal mandatory workflow.

- Hide it behind a secondary "分析詳細を見る" action or equivalent.
- Preserve all underlying Design v2 analysis outputs.
- Preserve related-theme badges where already available.
- Do not delete analysis functionality or analyzer output.
- Do not require the operator to visit analysis detail before editing the report.

## 10. Simplified visible workflow

Primary path:

Live Hearing:
Theme -> Purpose -> How to ask -> Memo -> Save hearing memo

Post-Hearing:
Theme memos + Report review/edit

Auxiliary only when needed:
Expand answers -> Review/correct answers -> Save Current -> Re-analysis -> Back to report

Optional:
Open analysis detail

## 11. Preserve existing semantics and guards

Must preserve:

- Original Survey immutable
- Current revision model
- Q1 supplemental correction behavior
- Q1 correction excluded from Analyzer semantic input
- memo excluded from Analyzer/Narrative input
- Save Current and Re-analysis separate HTTP requests
- re-analysis failure preserves saved Current
- freshness/stale guard
- Generated Narrative / Human Edited Narrative separation
- Healthy Case guard
- AI interest is not solution recommendation
- UNKNOWN is not a problem finding
- FACT Candidate is not confirmed Assessment Scope
- XSS-safe rendering
- same-case integrity

## 12. Allowed implementation scope

Prefer minimal changes in the existing Package D admin files and tests:

- public/admin/free-diagnosis-v2-hearing.html
- public/admin/free-diagnosis-v2-hearing.js
- public/admin/free-diagnosis-v2-analysis.html
- public/admin/free-diagnosis-v2-analysis.js
- public/admin/free-diagnosis-v2-common.js
- public/admin/free-diagnosis-v2.css
- existing Package D browser/integration tests

Reuse current APIs, persistence, provenance, and narrative revision mechanisms.

## 13. Forbidden

- new migration
- changes to migrations 027-033
- Production DB
- Package A Analyzer semantic changes
- new memo-analysis semantics
- automatic answer changes
- automatic Q recommendations from memo
- automatic narrative generation from memo
- Public Survey changes
- Package E implementation
- HA7
- deploy
- Production traffic changes

## 14. Acceptance criteria

Human Acceptance should prove:

1. Live Hearing reads naturally top-to-bottom as Theme -> Purpose -> How to ask -> Memo.
2. Asking examples are visible without expansion and are usable during a real conversation.
3. Memo save behavior is unambiguous; there is no confusing duplicate save action.
4. Live Hearing does not waste space on the historical hearing-record list.
5. Post-Hearing opens with answer reference collapsed, theme memos visible, and customer-facing report immediately editable.
6. The operator can open the answer pane and clearly see reviewed/original answers, "変更あり", and the "回答を見直す" action.
7. The operator does not need to visit analysis detail in a normal case.
8. Customer-facing report fields show their text fully without manual drag-resizing/internal scrolling for normal content.
9. Theme colors match between center theme cards and right-side related-theme badges.
10. Report saving is easy to access.
11. If an answer is changed, stale/re-analysis behavior remains correct.
12. All Package A-D and HA6 regressions remain green.

Package D remains open until Source Review and Human Acceptance PASS after this simplification patch.