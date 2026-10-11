# Package D Human Acceptance Workflow Simplification Decision — 2026-10-11

Status: HUMAN ACCEPTANCE HOLD / UX SIMPLIFICATION REQUIRED / PACKAGE D NOT CLOSED

## 1. Human Acceptance conclusion

Source Review for commit `3cc4c32593449274b18257450de4be87626559f2` passed. Human Acceptance then confirmed that the remaining issue is not diagnosis semantics, deterministic analysis, persistence, or safety. The remaining issue is operator workflow complexity.

The primary real-world operator task after hearing is expected to be:

Hearing notes -> review generated customer-facing report -> add/correct wording -> save.

Changing structured answers and inspecting detailed analysis are expected to be exception paths rather than the primary path.

## 2. Live Hearing findings

Keep:
- Original Survey left pane
- Hearing Viewpoints
- related Q badges
- theme-specific memo areas

Change:
- Remove the separate "ヒアリング記録" history list from the Live Hearing screen. It is not needed during the conversation and consumes space.
- Remove ambiguous dual save controls (per-theme "テーマメモを追加" plus bottom "メモを追加").
- Prefer one simple memo-save model for all theme memos, with clear wording such as "ヒアリングメモを保存". The UI must make it clear when notes are saved.
- General memo may remain only if there is a clear operational need; it must be visually secondary to theme memos.

## 3. Fixture clarification

In the Human Acceptance local fixture, Q1 and Q5 were already prepared with Current-state differences before the operator entered new hearing notes. Their initial "変更あり" display did NOT result from memo interpretation or automatic answer updates.

Product behavior remains:
- Hearing memo never automatically changes Q1-Q7.
- "変更あり" means only that Human Current differs from Original Survey.

Human Acceptance data should avoid pre-seeded changes when validating whether memo entry appears to cause a change, unless the fixture clearly labels them as pre-existing.

## 4. Post-Hearing workflow simplification

Current 3-step primary navigation is too heavy for expected operator behavior.

The main Post-Hearing screen should prioritize:

1. customer-facing report review/edit
2. hearing notes reference
3. current/original answer reference

Answer correction and detailed analysis inspection should remain available, but as secondary/exception actions.

Do not remove the underlying capabilities or semantics. Simplify only the primary workflow.

## 5. Recommended Post-Hearing layout

Keep the 3-pane desktop foundation where useful:

### Left pane — 回答参照
- Default: 見直し後の回答
- Toggle: 見直し後の回答 / 最初の回答
- Neutral "変更あり" on questions that differ
- Human may open "回答を見直す" only when needed
- Q1 correction remains Human Current supplement only and does not alter Analyzer semantics

### Center pane — ヒアリングメモ
- Theme-oriented memo cards
- Each memo card shows related Q badges
- No large undifferentiated memo stream
- Purpose: help the operator understand which hearing notes are relevant if an answer needs review

### Right pane — 顧客向けレポート確認・編集
This is the primary workspace.

For each report section:
- section title
- related Hearing Theme badges where already deterministically available
- editable customer-facing text shown directly
- optional collapsed "分析から作成した文面を見る" / generated-source reference

Do not show the full generated narrative once above and then repeat another complete editor below. The operator should not need to scroll through duplicate content.

Prefer a single section-by-section editing surface.

## 6. Detailed analysis becomes secondary

The current Step 2 "分析を確認する" is not expected to be part of most cases.

Retain deterministic Analysis and all existing provenance internally, but expose it only through a secondary control such as:
- "分析詳細を見る"
- section-level collapsed reference

Do not make detailed analysis review a mandatory workflow step.

## 7. Answer changes become secondary

Most hearings are expected to add resolution rather than require many survey-answer changes.

Therefore:
- do not require the operator to review every Q after every hearing
- show "変更あり" prominently when a Human Current difference actually exists
- allow answer review/correction as an exception path
- after an answer change, keep Save Current and Re-analysis as separate explicit operations
- after re-analysis, return the operator to report review/edit as the primary task

## 8. Report editing UX

Human Acceptance found the current Step 3 difficult because:
- initial view starts with the editor
- expanding "分析から作成した文面を見る" shows another full narrative
- further scrolling reveals the editor again
- save action is only at the bottom

Required simplification:
- one editable report section per section card
- generated/source text only as optional collapsed reference
- related theme badges adjacent to each section title
- save action should remain easily reachable (for example sticky action area or equivalent simple approach)
- avoid duplicated long narrative blocks

## 9. Human authority boundary remains unchanged

Must preserve:
- Hearing memo is not Analyzer input
- Hearing memo does not change answers automatically
- Human decides whether an answer changes
- Re-analysis uses only Human Current Structured State
- Generated report is system-generated from structured state/analysis, not memo text
- Human refines customer-facing text

## 10. Package D gate

Package D Human Acceptance remains HOLD until this workflow simplification is implemented, Source Reviewed, and Human Accepted.

Do not reopen diagnosis semantics or analyzer rules based on these findings.

Do not start Package E, HA7, Production migration/deploy/traffic, or migration changes.