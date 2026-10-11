# IT経営KAIZEN 無料診断 Design v2 — Package D Final Human Acceptance Last UX Fix Contract

Date: 2026-10-11
Status: IMPLEMENTATION GO / PACKAGE D STILL OPEN

## Context

Final Human Acceptance against Package D Final UX Simplification confirmed that the Live Hearing screen is operationally usable and accepted.

Human Acceptance result:

- Live Hearing: PASS / freeze
- Diagnosis semantics: accepted / do not reopen
- Analyzer semantics: accepted / do not reopen
- Narrative semantics: accepted / do not reopen
- Post-Hearing: HOLD for one remaining layout defect

Observed defect: when the answer reference pane is collapsed, its full column width remains reserved, leaving unnecessary empty space. The intended behavior is that a collapsed answer pane almost completely exits the layout so the Hearing Memo and Customer Report workspaces can use the released width.

Report generation/preview is explicitly deferred to Package E.

## Package D final change

### Collapsed answer reference pane

Initial Post-Hearing state remains collapsed.

When collapsed:

- do not reserve the previous answer-pane column width;
- retain only a compact control such as `回答を表示` at the left edge;
- allow the center Hearing Memo pane and right Customer Report pane to expand into the released width;
- keep the Customer Report pane the primary workspace.

When expanded:

- restore the answer reference pane;
- retain the existing `見直し後の回答 / 最初の回答` switch;
- retain neutral `変更あり` semantics;
- retain `回答を見直す` as a secondary action;
- closing the pane must restore the expanded center/right layout.

Responsive/mobile behavior must remain usable and must not introduce horizontal overflow.

## Freeze / no-change boundary

Do not change:

- Live Hearing UI or behavior;
- Survey contract;
- Original immutable semantics;
- Current revision semantics;
- Q1 supplement behavior;
- Hearing memo persistence or provenance;
- memo exclusion from Analyzer/Narrative input;
- Analyzer rules;
- Generated Narrative / Human Edited Narrative separation;
- Save Current / Re-analysis separation;
- freshness/stale guards;
- Healthy / UNKNOWN / FACT Candidate / AI-interest guards;
- database schema or migrations;
- Package E functionality.

## Package E handoff — report UX decision

Package E must implement report preview/output using a fixed Report Version as the single source for all representations.

Intended model:

Human-reviewed customer-facing narrative
→ fixed/versioned Report Version
→ HTML report preview
→ PDF representation
→ PowerPoint representation

Requirements:

- Past reports are normally reviewed through an HTML preview screen rather than regenerating/opening PDF/PPTX every time.
- The preview must render the fixed historical Report Version, not recompute the report from current answers/rules/templates.
- PDF and PowerPoint must be rendered from the same Report Version as the preview.
- Main report actions are `PDFで表示` and `PowerPointで表示`.
- No separate application-level download button is required; browser/Office standard save behavior is sufficient.
- Viewing PDF/PPTX must not itself mean approved or delivered.
- Existing FACTACT/report version, approval, delivery, audit, immutable snapshot/hash concepts should be reused where they fit rather than redesigned from zero.

Package E is NOT authorized by this document. This section is a handoff decision only.

## Acceptance

Package D may be considered ready for final Human Acceptance closure when:

1. Post-Hearing initially shows only a compact answer-pane opener rather than an empty full-width column.
2. Center and right panes visibly consume the released width.
3. Opening and closing answer reference works naturally.
4. Existing answer review/edit semantics remain unchanged.
5. Desktop/mobile browser tests and all existing Package A–D / HA6 regressions pass.

## STOP

After implementation and regression, STOP for final Human Acceptance.

Do not:

- close Package D automatically;
- start Package E;
- apply migration 033 to Production;
- start HA7;
- deploy;
- change Production traffic.
