# Package D Final UX Simplification Source Review Contract — 2026-10-11

Status: READ-ONLY SOURCE REVIEW REQUIRED / HUMAN ACCEPTANCE NOT YET AUTHORIZED / PACKAGE D NOT CLOSED

## Review target

- Branch: `feat/free-diagnosis-design-v2-package-d`
- Base: `3cc4c32593449274b18257450de4be87626559f2`
- Target: `71f44ca10a5ab5f4847ffc9bd0f23fb91daf8fbe`
- Review range: `3cc4c325...71f44ca1`

## Review purpose

Confirm that the final UX simplification changes only presentation/workflow emphasis and does not change Design v2 diagnosis, persistence, API transaction semantics, or human-authority boundaries.

## Required review points

### Live Hearing

- Display order is Theme -> Related Q -> Purpose -> Asking Guidance -> Memo.
- Asking guidance is directly visible and no longer requires expand/collapse interaction.
- Theme memo save action is unambiguous and does not accidentally save unrelated general memo state.
- Historical hearing-record list is not shown on the Live screen.
- Hearing memo remains reference-only and is not consumed by Analyzer or Narrative generation.
- Related Q badges still come only from existing deterministic provenance.

### Post-Hearing simplified workflow

- Mandatory three-step workflow navigation is removed from the primary path.
- Answer reference pane is collapsed by default.
- Opening/closing the answer pane is display-only.
- Existing `見直し後の回答 / 最初の回答`, neutral `変更あり`, and answer-edit behavior remain correct.
- Theme-oriented hearing memo cards remain visible in the center pane.
- Customer-facing report editing is the primary right-pane task.
- Existing answer-edit -> save Current -> re-analysis semantics remain intact when answer correction is needed.

### Report editing

- Human Edited Narrative remains editable and Generated Narrative remains separate/read-only.
- Generated source narrative is secondary/collapsible and not duplicated as another primary editing surface.
- Textareas auto-grow safely and do not create accidental data mutation.
- Sticky save control saves only the intended Human Edited Narrative revision.
- Stale/freshness guards remain enforced.

### Theme colors

- Theme colors are deterministic visual identifiers only.
- Same theme uses the same visual identity across center memo cards and right-side related-theme badges/references.
- Colors do not encode risk, good/bad, score, severity, or recommendation meaning.
- Theme color rendering does not alter domain semantics.

### Existing invariants

Confirm no regression to:

- immutable Original Survey
- versioned Current State
- Q1 supplement-only correction behavior
- Q1 correction excluded from Analyzer semantics
- separate Current Save and Re-analysis HTTP requests
- re-analysis failure preserving saved Current State
- Generated Narrative / Human Edited Narrative separation
- Healthy Case guard
- UNKNOWN semantics
- FACT Candidate semantics
- AI interest not becoming solution recommendation
- XSS-safe rendering

## Forbidden / boundary check

Confirm no changes to:

- migrations 027-033
- new migration
- Package A analyzer semantics
- Package B persistence semantics
- Package C save/re-analysis transaction semantics
- Public Survey
- Package E / Report approval / Delivery / Feedback
- KPI implementation
- HA7
- deploy / Cloud Run / Production traffic

## Regression

Re-run suites individually:

- Package D integration
- Package D Browser Desktop/Mobile
- Package C API
- Package B persistence
- Package A Golden
- HA6 Vertical Slice
- HA6 Browser Desktop/Mobile
- `npm run build`
- `git diff --check`

## Result

If all checks pass, report exactly:

`PACKAGE D FINAL UX SIMPLIFICATION SOURCE REVIEW: PASS`

and:

`Human Acceptance GO`

Then STOP.

Do not close Package D, start Package E, apply migration 033 to Production, create HA7, deploy, or change Production traffic.