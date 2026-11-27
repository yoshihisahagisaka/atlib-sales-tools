# Design v2 Assessment eligibility projection — code-level implementation specification v1
Date: 2026-11-17
Status: SPECIFICATION FOR BOUNDED IMPLEMENTATION; NO PROD APPROVAL
Baseline main: 850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae
Read-only source verified: migrations/015,029,027; src/services/vs1ReviewReportFeedbackRepo.ts; src/services/freeDiagnosisDesignV2ApiService.ts; src/domain/diagnosisReport.ts

## Scope
A read-only, internal TypeScript service that returns the immutable source references needed to determine whether a Design v2 case can proceed toward a paid Assessment. This is **eligibility only**, not paid engagement acceptance, commercial decision, or FACTACT transfer.

No routes, DB schema, migrations, server.ts edits, cloud resources, auth changes or legacy handoff changes in this slice.

## Existing facts to reuse
- Case: `it_management_diagnosis_case_v2(id,status,feedback_report_id,...)`.
- Feedback: `management_feedback_decisions(id,it_management_diagnosis_case_v2_id,version,route_code,context_snapshot_json,context_hash,decided_by_user_id,decided_at)`. Migration 029 ensures v2 ownership and unique (case,version).
- `Vs1ReviewReportFeedbackRepo.decide()` stores `context_snapshot_json = {report:{id,version,content_hash,approval_snapshot_hash},decision:{route,materialDecision,nextAction}}`; `context_hash = contentHash(snapshot)`; DESIGN_ASSESSMENT closes v2 case.
- Report: `diagnosis_reports(id,it_management_diagnosis_case_v2_id,version,status,content_json,snapshot_json,policy_version)`; approved report is DELIVERED at feedback decision.
- Existing `contentHash` from `src/domain/diagnosisReport.ts` canonicalizes JSON keys recursively before SHA-256.

## New pure internal service (candidate precise contract)
File: `src/services/designV2AssessmentEligibility.ts`.
Export `readDesignV2AssessmentEligibility(pool: Pick<Pool,'query'>, caseId: string): Promise<DesignV2AssessmentEligibility>`.
No actor parameter because this is an internal repository read, NOT an HTTP route. All future callers must enforce staff authorization before calling; do not expose publicly.
Return type:
```ts
interface DesignV2AssessmentEligibility {
  caseId: string;
  feedbackDecision: { id: string; version: number; contextHash: string; decidedByUserId: string; decidedAt: string };
  report: { id: string; version: number; contentHash: string; approvalSnapshotHash: string };
}
```
Error type `DesignV2AssessmentEligibilityError` with stable code; all ineligible/inconsistent states fail closed (never partial success). Avoid leaking raw report or survey content.

### Algorithm
1. Validate `caseId` as UUID before query. Do not infer/translate legacy case identity.
2. Query v2 case by exact id. Require `status='CLOSED'`, `feedback_report_id` not null; else throw `CASE_NOT_ELIGIBLE`.
3. Query latest **overall** v2 feedback decision by `it_management_diagnosis_case_v2_id=$1 ORDER BY version DESC LIMIT 1`; do NOT filter route before sorting. Require route `DESIGN_ASSESSMENT`. Require snapshot object, `contentHash(context_snapshot_json) === context_hash`, and `context_snapshot_json.decision.route === 'DESIGN_ASSESSMENT'`; otherwise fail closed. Validate nonempty IDs, integer versions, hashes.
4. Read the report by `id=decision.context_snapshot_json.report.id AND it_management_diagnosis_case_v2_id=$1`. Require report id equals `case.feedback_report_id`, report `status='DELIVERED'`, `policy_version='design-v2'`, and version equals decision snapshot version. If actual policy is not design-v2 for a supported historical v2 case, STOP and report instead of broadening acceptance.
5. Require `snapshot_json` object and `contentHash(report.content_json)` equals decision snapshot `content_hash`; `contentHash(report.snapshot_json)` equals decision snapshot `approval_snapshot_hash`; require `report.snapshot_json.content_hash === contentHash(report.content_json)` and approval actor/time exist. No reapproval, no fresh report generation.
6. Return only source identifiers, version, hash, actor/time. No persistence, mutation, FACT promotion, analysis or FACTACT call.

### Error semantics
- `CASE_NOT_FOUND` for absent case.
- `CASE_NOT_ELIGIBLE` for wrong state/missing feedback ref.
- `ASSESSMENT_ROUTE_NOT_SELECTED` if latest decision route differs.
- `DECISION_INTEGRITY_MISMATCH` if missing/invalid snapshot/hash/route.
- `REPORT_INTEGRITY_MISMATCH` if missing, wrong owner, wrong status/version/policy, hash mismatch or missing approval provenance.
- Database errors propagate; never silently treat DB failure as ineligible.
- No HTTP status contract in this slice.

### Tests (isolated mocks, no DB)
File: `test/designV2AssessmentEligibility.test.ts`.
- Valid CLOSED case, latest DESIGN_ASSESSMENT, delivered design-v2 report, matching source hashes → exact references returned, no raw data.
- Latest FOCUSED_CONFIRMATION or STOP_HOLD despite earlier DESIGN_ASSESSMENT → rejected.
- Open case, missing feedback report → rejected.
- Decision context tampering/hash mismatch → rejected.
- Decision snapshot route disagrees with route_code → rejected.
- Report belongs to different v2 case → rejected.
- Decision report ID differs from case.feedback_report_id → rejected.
- Report version/status/policy mismatch → rejected.
- Report content hash mismatch, approval snapshot hash mismatch, snapshot.content_hash mismatch → rejected.
- Missing approval actor/time → rejected.
- SQL queries only SELECT, no mutation; existing old `diagnosis_cases` and `assessment_handoffs` never referenced.
- No call to FACTACT and no new schema/route.
- Confirm test runner existing conventions before adding test script; avoid unrelated package.json edits.

## Important bounded STOP before implementation
Confirm exact report approval snapshot field names and policy_version for the Design v2 approved report, and that the `contentHash` values in `decide()` are canonical. The above matches inspected code, but if fixtures contradict, report and STOP rather than relax gates.
Also inspect whether `Vs1ReviewReportFeedbackRepo.decide()` query is guaranteed to use case-owned delivered report; it currently selects report by id/status only. Do NOT change existing feedback code in this slice. Report the observation separately.

## Codex instruction
Implement only this read-only service and isolated tests, against the specified main baseline, after narrow source verification. If any STOP condition occurs, return source evidence without edits. Do not implement paid engagement, commercial final decision, FACTACT adapter or Handoff persistence.

## Release
Local tests only. No branch merge, migration, DB write, GCP, Production deploy or traffic change.
