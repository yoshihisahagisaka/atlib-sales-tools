# Package D Reference Pane Switch Decision — 2026-10-11

Status: DESIGN LOCKED / INCLUDE IN FINAL UX PATCH

## 1. Purpose

During Post-Hearing work, the operator's main reference gradually shifts from the immutable Original Survey to the latest Human-updated Current State. The UI should support that change in focus without weakening the separation between Original and Current.

## 2. Simple UI rule

Keep the left reference pane, but add a simple segmented switch:

- 見直し後の回答
- 最初の回答

The switch changes only what is displayed in the left reference pane.
It does not modify either data layer.

## 3. Default behavior

- Live Hearing: always show 最初の回答 only. No switch is needed there.
- Post-Hearing before any Human update: either option may initially be identical; default may remain 最初の回答.
- After a Human-updated Current State exists, default the Post-Hearing reference pane to 見直し後の回答.
- The operator can switch back to 最初の回答 at any time.

The selected reference view may persist while moving between the three Post-Hearing steps.

## 4. Display details

When 見直し後の回答 is selected:

- show the latest Current Q2-Q7 values
- Q1 remains the immutable Original context
- mark questions that differ from Original with a small non-evaluative badge such as 変更あり
- where useful, show added / removed chips already available from the existing diff model

When 最初の回答 is selected:

- show the immutable Original Survey values
- keep the display read-only

Do not use score, warning, risk, error, or good/bad colors.

## 5. Relationship to right-side steps

Step 1 回答を見直す:
- right side remains the editable Current State area
- left pane may be used as reference and can switch between Original / Current

Step 2 分析を確認する:
- default reference should be 見直し後の回答 once Current exists, because Analysis is generated from Current State

Step 3 顧客向け文面を整える:
- default reference should also be 見直し後の回答 once Current exists, because the generated narrative is based on the latest analysis of Current State

The operator can always switch to 最初の回答 for comparison.

## 6. Data / semantics boundary

This is display-only.

Do not:
- overwrite Original Survey
- create another Current revision when switching
- re-run analysis when switching
- change Package B persistence semantics
- change Package C Save / Re-analysis semantics
- create new migration
- infer any new diagnosis meaning

## 7. Acceptance

The UX should make it easy to answer both questions:

- 今の診断は、現在どの回答を前提にしているか
- 最初の回答から何が変わったか

This decision is part of the final Package D human-UX patch and does not expand system intelligence or diagnosis semantics.