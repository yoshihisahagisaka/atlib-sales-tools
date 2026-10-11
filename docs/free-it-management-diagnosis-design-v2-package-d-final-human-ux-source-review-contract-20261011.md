# Package D Final Human UX Source Review Contract — 2026-10-11

Status: SOURCE REVIEW GO / READ-ONLY / PACKAGE D NOT CLOSED

## Review target

- Branch: `feat/free-diagnosis-design-v2-package-d`
- Base: `da4d59fd99e871969179836d91835b1eda437147`
- Target commit: `3cc4c32593449274b18257450de4be87626559f2`
- Review range: `da4d59fd...3cc4c325`

Review is read-only. Do not edit files, commit, migrate, deploy, or change traffic.

## Required review points

### 1. Scope boundary

Confirm changes are limited to Package D Final Human UX / minimal supporting read-only or persistence plumbing.

Must not introduce:
- new migration
- migration 027–033 modification
- Production DB change
- Package A analyzer semantic change
- Public Survey change
- Package E behavior
- HA7
- deploy / Cloud Run / Production traffic change

### 2. Theme memo persistence

Verify Design v2 Hearing Viewpoint memo uses existing Hearing Statement semantics safely.

Expected:
- `plan_item_ref = design-v2-viewpoint:<id>` or equivalent stable Design v2 reference
- no M01–M06 semantic leakage
- same-case integrity preserved
- memo remains plain hearing reference information
- memo text is not analyzer input
- memo text is not narrative-generation input

### 3. Related Q / theme badges

Verify displayed relation badges are derived only from already-existing deterministic rule / provenance data such as `sourceRuleIds` / `sourceQuestionCodes`.

Must not introduce:
- memo NLP inference
- new frontend semantic engine
- invented mappings solely for display
- implication that memo text caused analysis or narrative

### 4. Q1 correction boundary

Verify Q1 correction:
- leaves Original Survey immutable
- is stored only as human correction/reference information in the existing Current revision supplement structure
- does not enter analyzer structured input
- does not change analyzer semantics
- does not silently rewrite Original Q1
- participates only in reviewed/current reference display and neutral diff indication

### 5. Reviewed / Original reference pane

Verify Post-Hearing left pane:
- can switch between `見直し後の回答` and `最初の回答`
- defaults to reviewed/current when Current exists
- never mutates answers by switching
- uses `変更あり` only to mean Original and Current differ
- does not attach risk, score, improvement, or problem meaning to `変更あり`

### 6. Right pane UX

Verify right pane title is `ヒアリング後の整理` and existing three-step workflow remains intact:
1. 回答を見直す
2. 分析を確認する
3. 顧客向け文面を整える

### 7. Existing Package D invariants

Confirm preservation of:
- Live Hearing has no Current editor / Re-analysis / Narrative editor
- Original Survey remains immutable
- Current Save and Re-analysis are separate HTTP requests
- Re-analysis failure preserves saved Current
- Generated Narrative remains read-only
- Human Edited Narrative remains separate and editable
- freshness / stale guards remain enforced
- Healthy Case guard remains intact
- Interest does not become solution recommendation
- UNKNOWN remains unknown, not a problem finding
- FACT Candidate remains next-check candidate, not confirmed Assessment Scope
- customer/staff content remains XSS-safe

### 8. Regression verification

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

## PASS criteria

Return `PACKAGE D FINAL HUMAN UX SOURCE REVIEW: PASS` only if all review points pass and all regressions are green.

If PASS, explicitly state:
- `Human Acceptance GO`
- Package D remains open
- no Package E / migration / HA7 / deploy / Production action yet

If any issue exists, return `HOLD` with exact file / behavior / reason. Do not fix it during this review.
