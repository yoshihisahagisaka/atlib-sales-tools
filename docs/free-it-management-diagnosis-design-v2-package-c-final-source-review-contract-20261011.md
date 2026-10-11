# IT経営KAIZEN 無料診断 Design v2 — Package C Final Source Review Contract

Status: FINAL SOURCE REVIEW REQUIRED
Date: 2026-10-11

## Review target

Branch: `feat/free-diagnosis-design-v2-package-c`
Expected HEAD: `9fc0cbaef90480dafe525de667da52bf92260ea3`
Pre-fix Package C commit: `b774e03c6df7d42b265cfaf1b2df70324e18199c`

This review is read-only.

Do not change code, tests, docs, migrations, branches, refs, DB state, Cloud resources, HA7, deploy state, or Production traffic.

## 1. State gate

Confirm:

- expected branch;
- expected HEAD;
- clean worktree.

Mismatch => STOP.

## 2. Fix diff boundary

Review `b774e03..9fc0cba`.

Expected fix files only:

- `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`
- `test/freeDiagnosisDesignV2Api.integration.test.ts`

Any migration or unrelated runtime wiring change => FAIL.

## 3. Stale edit source guard

Verify actual source in `appendDesignV2HumanEditedNarrative()` or equivalent.

A Human Edit may be created only if all are true inside the same transaction:

- target Generated belongs to the requested Case;
- target Generated is the latest Generated for that Case;
- target Generated's `current_state_id` equals the latest Current State ID;
- therefore the target Generated is CURRENT relative to the latest Human Current State.

The following window must be rejected:

- rev3 analyzed / generated;
- rev4 saved;
- rev4 not yet re-analyzed;
- edit against rev3 Generated.

Expected API behavior: conflict / 409 with stale-generated semantic error.

No Human Edit or Human Edit audit may be persisted on rejection.

## 4. Existing stale behavior preservation

Verify:

- fresh Generated can be edited;
- fresh edit status becomes CURRENT;
- after later Current State change, old existing Human Edit becomes STALE_REVIEW_REQUIRED in read model;
- old Human Edit row is not mutated or deleted;
- cross-case Generated remains rejected.

## 5. Re-analysis idempotency evidence

Verify the strengthened acceptance test directly proves that repeated re-analysis of the same exact Current State / analyzer / rule / generator versions does not increase:

- Analysis Result row count;
- Generated Narrative row count.

The test should also verify reused IDs or equivalent provenance.

## 6. Package C invariant re-check

Ensure the fix did not regress:

- Save Current and Re-analysis are separate transactions;
- Current Save does not invoke analyzer;
- analyzer input remains Current Structured State only;
- Hearing memo/operator note/structured hearing answer remain non-rule inputs;
- Analysis failure preserves saved Current State;
- freshness remains derived, not persisted as mutable status;
- actor remains server-auth derived;
- no customer Report finalize side effect;
- HA6 runtime remains additive / independent.

## 7. Regression evidence

Expected reported results:

- Package C API: 26/26 PASS
- Package B persistence: 29/29 PASS
- Package A Golden: 21/21 PASS
- HA6 Vertical Slice: 15/15 PASS
- HA6 Browser: 24/24 PASS
- build: PASS

Re-run as needed to validate review conclusions.

Known V1 Golden two failures remain pre-existing / non-blocking and must not be fixed here.

## 8. Final verdict

Return exactly one primary verdict:

`PACKAGE C FINAL SOURCE REVIEW: PASS`

or

`PACKAGE C FINAL SOURCE REVIEW: FAIL / FIX REQUIRED`

PASS requires:

- stale edit window closed;
- no edit/audit side effect on rejection;
- repeated re-analysis row-count idempotency directly asserted;
- Package C boundaries still intact;
- regression remains green.

If FAIL, report only concrete file/symbol/reason and STOP.

## 9. STOP

After review result, STOP.

Do not proceed to Package D/E, migration 033 Production application, HA7, deploy, or Production traffic.