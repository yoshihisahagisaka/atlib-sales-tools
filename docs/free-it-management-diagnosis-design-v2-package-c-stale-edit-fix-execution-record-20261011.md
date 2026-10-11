# IT経営KAIZEN 無料診断 Design v2 — Package C stale-edit Fix Execution Record

Status: FIX IMPLEMENTED LOCALLY / FINAL SOURCE REVIEW REQUIRED
Date: 2026-10-11

## Target

Branch: `feat/free-diagnosis-design-v2-package-c`
Fix commit: `9fc0cbaef90480dafe525de667da52bf92260ea3`
Commit subject: `fix: reject stale design v2 narrative edits`

## Changed files

- `src/services/freeDiagnosisDesignV2PersistenceRepo.ts`
- `test/freeDiagnosisDesignV2Api.integration.test.ts`

## Fix summary

`appendDesignV2HumanEditedNarrative()` now validates, within the same transaction, that:

1. the target Generated Narrative belongs to the Case;
2. the target is the latest Generated Narrative in the Case;
3. `targetGenerated.current_state_id == latestCurrentState.id`;
4. therefore the source Generated Narrative is CURRENT for the latest Current State.

If the condition is not met, the operation rejects with `STALE_GENERATED_NARRATIVE` and the Admin API maps this to HTTP 409.

No Human Edit row and no `SaveDesignV2HumanEditedNarrative` audit row are created on rejection.

## New acceptance coverage

The suite now directly verifies the stale window:

- revision 3 analyzed and Generated exists;
- revision 4 Human Save completed;
- revision 4 re-analysis not yet executed;
- edit request using revision 3 Generated ID;
- request rejected with 409;
- Human Edit count unchanged;
- Human Edit audit count unchanged;
- Generated rows unchanged;
- old Human Edit unchanged;
- revision 4 remains latest Current State;
- `analysisFreshness = REANALYSIS_REQUIRED`.

Repeated re-analysis also directly checks that Analysis and Generated row counts do not increase, in addition to verifying reused IDs.

## Regression evidence

- Package C API: 26/26 PASS
- Package B persistence: 29/29 PASS
- Package A Golden: 21/21 PASS
- HA6 Vertical Slice: 15/15 PASS
- HA6 Browser desktop/mobile: 24/24 PASS
- `npm run build`: PASS

## Scope boundary

No migration, Package D/E, HA7, deploy, Production migration, or Production traffic operation was performed.

Package C remains open only for final bounded Source Review of fix commit `9fc0cbaef90480dafe525de667da52bf92260ea3`.