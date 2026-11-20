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

## 2026-11-20 Product PR #69 direct source verification (supersedes earlier UNKNOWN statements)

FACTACT repository: `yoshihisahagisaka/git_KAIZEN`, Draft PR #69, branch `feat/factact-device-work-fact-contract-20261117`, inspected head `9d606590a678a002c18b3f625b65b0a076aee5c0`.

**Implementation status:** pure, executable policy/transition kernel, **not** a hosted read/write API or persistence adapter. Do not mistake the following functions for callable HTTP endpoints.

| Concern | Product evidence | Assessment implication |
|---|---|---|
| Scope/authority | `packages/domain/src/device-information.ts` defines `DeviceAuthorizedContext` and `DeviceScopedGrant`; `packages/application/src/device-information-contract.ts` `requireDeviceRegistryGrant` checks actor/tenant/service/contract/recipient and active REGISTRY operation grant. | Never trust browser-supplied tenant/organization/grants; server must resolve live context |
| Customer identity | `deviceAssetKey(tenantId, organizationId, assetTag)` keeps conservative asset tag case/Unicode; no implicit cross-customer equality. | Assessment case/company id cannot be used as Product organization id without authorized mapping |
| Candidate matching | `classifyDeviceRow` returns NEW/UPDATE/UNCHANGED/REVIEW **only when given a complete, authorized customer-scoped existing Device set**. | Current UI must continue showing COMPARISON_PENDING; no guessed NEW/UPDATE |
| Initial create | `proposeDeviceInitialInformation` requires CREATE grant and `CUSTOMER_REGISTER` source with `evidenceId`, `locator`, `observedAt`; fields: assetTag, displayName, optional serialNumber. | Our three mapped fields align semantically; actual evidence identity/locator generation and permission remain unimplemented |
| Correction | `proposeDeviceInformationCorrection` requires UPDATE grant, exact Device id/current revision; permits displayName/serialNumber, **not** assetTag/Organization migration. | No generic overwrite or blind upsert |
| Verification | `proposeDeviceFieldVerification` requires non-CUSTOMER_REGISTER reality evidence; field-level verification is distinct from initial data. | No auto-verified FACT or automatic operational status |
| Human lifecycle | `verifyDeviceInformationChange` requires REVIEW and separate actor; `commitDeviceInformationChange` requires APPROVE, verified proposal, expected revision. | UI cannot silently perform Change→Verify→Commit as a single privileged action |
| Initial status | `commitDeviceInformationChange` creates `operationalStatus: UNKNOWN` and `verification: null`. | Do not map customer sheet `利用中` to AVAILABLE |
| Runtime readiness | Product file header explicitly says pure kernel, no DB write, no HTTP mutation endpoint; Product PR remains Draft. | **STOP** actual registration until Product publishes authenticated scoped-read, persistence/Command adapter and accepted contract |

Source review resolves the *semantic shape* of the Device contract, but not operational Organization mapping, server-side grant resolution, read API, durable idempotency, transaction/locking, or deployment. No new Core object or Assessment-owned Device DB is needed.

Next Product-lane response should focus only on (a) approved Assessment→Organization/ServiceRecipient mapping, (b) authenticated scoped Device read, (c) transactional propose/verify/commit endpoints and evidence reference creation, and (d) whether an Assessment import batch is supported or must be individual Commands. Keep the current offline three-step UI until these are verified.
