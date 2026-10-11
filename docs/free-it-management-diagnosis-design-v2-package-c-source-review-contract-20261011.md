# IT経営KAIZEN 無料診断 Design v2 — Package C Source Review Contract

Status: READ-ONLY FINAL GATE
Date: 2026-10-11
Expected branch: `feat/free-diagnosis-design-v2-package-c`
Expected commit: `b774e03c6df7d42b265cfaf1b2df70324e18199c`

## 1. Purpose

Package Dへ進む前に、Package C Admin API実装がPackage C API Boundary Decision / Implementation Contractへ実際に適合していることをsource-levelで確認する。

レビューはread-only。修正、commit、push、migration、deploy、HA7、Production操作は行わない。

## 2. SSOT priority

1. `free-it-management-diagnosis-design-v2-package-c-api-boundary-decision-20261011.md`
2. `free-it-management-diagnosis-design-v2-package-c-api-implementation-contract-20261011.md`
3. Slice 4 Post-Hearing Re-analysis API Contract
4. Package B Architecture / Implementation Contract
5. Package A domain contracts

Failure semanticsはPackage C Boundary Decisionを正とする。

## 3. Scope review

Verify the Package C code commit changes only the bounded API/application layer and any minimal Package B repository extensions required for the split transaction boundary.

Allowed implementation files include:

- `src/routes/adminFreeDiagnosisDesignV2.ts`
- `src/services/freeDiagnosisDesignV2ApiService.ts`
- `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`
- `src/server.ts`
- `test/freeDiagnosisDesignV2Api.integration.test.ts`

No migration changes are allowed. Existing Public Survey, Structured Hearing, Final Rule, V1 Report/Review/Feedback semantics must not be replaced.

## 4. Route/auth review

Verify all four Design v2 Admin endpoints exist under the existing Admin auth guard:

- workspace read
- current state revision save
- deterministic re-analysis
- human narrative edit

Verify unauthenticated access is rejected.

Verify operator identity comes from server-side authenticated context rather than client-supplied `updatedByUserId` / `editedByUserId`.

## 5. Current State Save boundary

Verify Current State Save does only:

1. validate canonical Q2–Q7 state
2. lock/check expected revision
3. append Current State revision
4. audit in same transaction
5. commit

It must not call `appendDesignV2CurrentStateAndReanalyze()` or otherwise run Analyzer in the same transaction.

Expected revision mismatch must map to 409-equivalent conflict.

Q1 must remain non-editable in this operation.

## 6. Re-analysis boundary

Verify Re-analysis:

- resolves exact/latest Current Structured State
- uses `CurrentStructuredStateV2` as Analyzer semantic source
- does not directly pass Hearing memo, operator note, structured hearing answer, arbitrary free text, or HA6 Final Rule output into Analyzer
- runs Package A deterministic analyzer
- stores exact Analysis Result and Generated Narrative
- avoids duplicate canonical rows for identical Current State/analyzer/rule/generator versions

## 7. Analysis failure semantics

This is a critical gate.

After Human Current State revision is already committed, inject Analyzer failure and verify:

- saved Current State remains
- Original remains
- previous revisions remain
- no new Analysis persists
- no new Generated Narrative persists
- workspace `analysisFreshness = REANALYSIS_REQUIRED`
- API returns machine-readable `ANALYSIS_FAILED`
- no stack/SQL/secret leaks
- retry against the same Current State succeeds

This behavior must be source-supported and integration-tested.

## 8. Workspace read model

Verify response separates:

- case summary
- Original Survey
- Hearing Records
- Current Structured State
- Current revision
- Original-vs-Current diff
- latest Analysis nullable
- latest Generated Narrative nullable
- latest Human Edited Narrative nullable
- derived Human Edit status
- derived Analysis freshness

Original must not be synthesized client-side from Current State.

## 9. Freshness derivation

No mutable DB freshness/status columns may be introduced.

Analysis freshness:

- latest Analysis source Current State == latest Current State and matching Generated exists → CURRENT
- otherwise → REANALYSIS_REQUIRED

Human Edit freshness:

- edit source Generated == latest Generated → CURRENT
- edit source Generated != latest Generated → STALE_REVIEW_REQUIRED
- no edit → NONE

## 10. Diff semantics

Verify Q2–Q7 can express at least:

- UNCHANGED
- CHANGED
- ADDED
- REMOVED

No scoring/maturity interpretation is introduced.

## 11. Human Narrative Edit

Verify:

- generatedNarrativeId required
- same-case validation
- latest Generated required
- append-only Human Edit
- audit in same transaction
- old edit unchanged
- stale Generated edit rejected with conflict-equivalent response
- cross-case edit rejected

## 12. Error mapping

Verify meaningful API mapping for at least:

- invalid semantic input → 400
- missing case/original → 404
- expectedRevision mismatch → 409
- stale Generated edit → 409-equivalent
- analysis failure → 500 + `ANALYSIS_FAILED`

Error responses must not expose stack, SQL, secrets, or internal DB details.

## 13. Acceptance tests

Read `test/freeDiagnosisDesignV2Api.integration.test.ts` and verify the Package C acceptance scenarios are substantively asserted rather than merely exercising happy paths.

At minimum confirm direct coverage for:

1. Original and Current are distinct
2. Hearing Records are display-only
3. Current revision increment
4. Original unchanged
5. save → REANALYSIS_REQUIRED
6. reanalysis → CURRENT
7. Q5 change alters generated understanding/narrative
8. Hearing memo-only change does not alter semantic analysis
9. expectedRevision mismatch
10. true concurrent save conflict
11. Analyzer failure retains Human Current State
12. Analyzer failure persists no new Analysis/Generated
13. failure leaves freshness REANALYSIS_REQUIRED
14. retry success
15. AI interest does not create recommendation
16. Healthy state does not manufacture Problem/Gap/Assessment
17. Human Edit CURRENT
18. Current change makes old edit STALE
19. stale Generated edit rejected
20. cross-case edit rejected
21. invalid semantic code rejected
22. unauthenticated rejected
23. structured hearing answer not Analyzer input
24. no Customer Report finalization side effect
25. idempotent repeated re-analysis does not duplicate canonical records

Weak/indirect assertions should be marked PARTIAL.

## 14. HA6 independence

Verify Package C is additive and does not replace:

- Public submission flow
- existing intake complete flow
- Structured Hearing flow
- Final Rule flow
- V1 Review / Report / Feedback

`server.ts` wiring should only mount the Design v2 Admin route within existing Admin auth conventions.

## 15. Regression evidence

Confirm reported regressions are still green or read their latest execution result where available:

- Package C API
- Package B persistence
- Package A Golden
- HA6 Vertical Slice integration
- HA6 Browser desktop/mobile
- TypeScript build

Known V1 Golden two failures are pre-existing/non-blocking and should not be fixed in this review.

## 16. Final verdict

Return exactly one:

- `PACKAGE C SOURCE REVIEW: PASS`
- `PACKAGE C SOURCE REVIEW: PARTIAL / HOLD`
- `PACKAGE C SOURCE REVIEW: FAIL / FIX REQUIRED`

PASS requires all critical boundaries above to be source-supported and tests to substantively cover them.

If PARTIAL/FAIL, identify exact file/symbol/reason only. Do not fix.

## 17. STOP

After review, STOP.

Do not proceed to Package D, Package E, migration 033 Production application, HA7, deploy, or Production traffic.
