# Assessment Device initial import — FACTACT Product fit/gap and minimum connection gate

Date: 2026-11-20
Status: READ-ONLY CONTRACT REVIEW; NO FACTACT WRITE AUTHORIZATION
Assessment Draft PR: #48 (head before this document: 24403e635d250418701ec78ba053154dd728987a)

## Verified Assessment implementation
- `public/admin/kaizen-assessment.html`: staff-facing link to the offline Device preview.
- `public/admin/assessment-device-import-preview.html`: CSV/XLSX file selection, mapping confirmation, candidate preview. No submit/commit button.
- `public/js/assessment-device-preview-core.js`: single shared deterministic mapping/validation/preview for both file types and Node tests.
- `public/js/assessment-xlsx-reader.js`: bounded local single-sheet reader; formula, styled numeric, multiple sheets, malformed/ZIP64/duplicate ZIP entries fail closed.
- `src/server.ts`: `/admin` is mounted with `adminAuthGate` before the general static middleware. This is a source-level finding, not a live authentication test.
- Browser acceptance includes a request observer confirming no `/api/` request during preview.
- CI at commit `24403e635d250418701ec78ba053154dd728987a`: 13 Node tests + 16 Chromium tests; both jobs SUCCESS.

## Product contract Fit / Gap (do not guess endpoints)
| Question | Finding | Gate |
|---|---|---|
| Does Assessment create authoritative Device records? | NO. Preview only; source file data remains unverified. | FIT with separation of responsibilities |
| Are asset tag, display name and serial number mapped? | YES as unverified candidates; original row number and raw cells retained in memory. | FIT for local candidate preparation |
| Can we determine new vs existing Device? | NO authorized FACTACT Organization-scoped Device Read contract was verified in this review. | GAP — require Product-owned scoped read |
| Can we determine customer Organization? | NO validated mapping between Assessment customer/case and FACTACT Organization/tenant. Existing Design v2 `company_id` is not assumed equal to FACTACT tenant id. | GAP — Product mapping + authorization |
| Can we create/update Device? | No typed, authorized Product Command payload and idempotency/version contract verified in this review. | GAP — no API call, no submit button |
| Can a row be promoted to Verified FACT or Person relation? | NO. Human verification remains Product-owned. | STOP auto-promotion, status inference, relation creation |
| Can an operator inspect the preview? | Static staff gate is present in `src/server.ts`; real hosted auth test not run. | Local source FIT, hosted verification pending |

## Minimal Product response requested
1. Exact approved Organization identity and staff authorization/scoping source, with read-only source path or API contract.
2. Exact Device Scoped Read matching rules: asset tag uniqueness scope, serial collisions, duplicate handling, and missing-Device state.
3. Existing typed Create/Update and FieldVerification Commands, required source/evidence fields, idempotency/version and audit contract, with current tests.
4. Which fields from imported rows may be retained as `UNVERIFIED` and what operation, if any, is approved for bulk candidate intake.
5. Confirm no auto `AVAILABLE`, no automatic Person Relation, no deletion/merge, and no cross-tenant lookup.

## Decision and next engineering step
- Assessment UI remains three actions: select file → confirm column mapping → preview candidates.
- No new FACTACT Core object, parallel Device store, generic import engine, RBAC or pricing workflow.
- When the Product response is available, compare actual contract to this adapter boundary; implement only the minimum approved request shape, with explicit human confirmation and synthetic tenant isolation tests.
- Do not implement an API adapter or claim Product acceptance based on a proposed interface.

## Release gates
- Draft PR #48 remains unmerged; no GCP/DB/production changes.
- Prior npm install reported 17 dependency findings (1 critical, 10 high, 6 moderate); independent security review before release.
- Hosted staff auth, tenant isolation and Product Command E2E remain unverified.
