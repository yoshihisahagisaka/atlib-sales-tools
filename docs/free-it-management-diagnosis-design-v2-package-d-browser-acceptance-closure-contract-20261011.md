# Free IT Management Diagnosis Design v2 — Package D Browser Acceptance Closure Contract

Status: TEST-ONLY FIX REQUIRED / HUMAN ACCEPTANCE HOLD
Date: 2026-10-11

## Decision

Package D runtime implementation and design boundaries are accepted by Final Source Review, but Package D is not CLOSED because two Browser Acceptance requirements remain only indirectly verified.

This is a test-coverage closure only. Runtime behavior must not be changed unless a newly added direct assertion proves an actual defect.

## Starting point

Branch: `feat/free-diagnosis-design-v2-package-d`
Expected HEAD before closure fix: `1d831ea196bef8585fd28943fea813f6f98ca46e`

## Required direct assertions

### 1. Re-analysis failure preserves the Human-saved Current State in the browser

The Browser Acceptance must directly prove the following sequence:

1. load Post-Hearing workspace with a known Current revision/value;
2. change at least one editable Current answer;
3. save Current successfully;
4. make re-analysis fail;
5. verify the UI shows that Current was saved but re-analysis failed;
6. verify the changed Current value is still displayed after the workspace refresh/failure handling;
7. verify the newer revision is visible in the browser/read model when the UI exposes revision information, or otherwise directly verify the browser received/rendered the saved latest Current state;
8. retry re-analysis and verify the same saved Current state is used and the workspace returns to CURRENT.

A message-only assertion is insufficient. Package C persistence tests remain useful but do not substitute for the browser-level proof required here.

### 2. Original Survey Q1–Q7 answers are directly proven to be Japanese labels

The Browser Acceptance must directly verify every Original Survey answer shown for Q1 through Q7 uses operator-facing Japanese labels.

At minimum:

- Q1 employee range: Japanese label, raw code absent;
- Q1 site range: Japanese label, raw code absent;
- Q2 selected value(s): Japanese label(s), raw semantic code(s) absent;
- Q3 selected value(s): Japanese label(s), raw semantic code(s) absent;
- Q4 selected value: Japanese label, raw semantic code absent;
- Q5 selected value: Japanese label, raw semantic code absent;
- Q6 selected value: Japanese label, raw semantic code absent;
- Q7 selected value(s): Japanese label(s), raw semantic code(s) absent.

Use representative fixture values already valid under the canonical Survey Contract. Do not create fixture-only renderer behavior.

## Allowed changes

Preferred change scope:

- `test/freeDiagnosisDesignV2AdminUx.browser.test.ts`

Minimal fixture/helper changes required only to make the direct assertions possible are allowed.

Runtime file changes are not expected. If a direct assertion exposes an actual runtime defect, STOP and report instead of silently broadening this closure fix.

## Forbidden

Do not change:

- Design v2 domain logic;
- Package A analyzer/narrative;
- Package B persistence semantics;
- Package C API semantics;
- Package D runtime UX unless an actual defect is proven;
- migrations 027–033;
- DB or Production state;
- Public Survey;
- Report/Human Review/Delivery/Feedback;
- Package E;
- KPI implementation;
- HA7;
- deploy or Production traffic.

## Regression

After the direct assertions are added, run:

- Package D integration;
- Package D Browser desktop/mobile;
- Package C API;
- Package B persistence;
- Package A Golden;
- HA6 Vertical Slice;
- HA6 Browser desktop/mobile;
- `npm run build`.

Known V1 Golden 2 failures remain PRE-EXISTING / NON-BLOCKING if unchanged.

## Exit gate

Package D may proceed to Human Acceptance only when a read-only Final Source Review confirms:

- both direct-assertion gaps above are closed;
- runtime/package boundaries remain unchanged;
- regression is green;
- no migration/DB/Cloud/Production action occurred.

Then and only then: `PACKAGE D FINAL SOURCE REVIEW: PASS` → Human Acceptance.
