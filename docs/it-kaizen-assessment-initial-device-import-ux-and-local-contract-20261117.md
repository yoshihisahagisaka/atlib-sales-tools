# 設計Assessment — Excel/CSV 初期情報取込 UX・境界 Contract v0.1 (2026-11-17)

Status: **ASSESSMENT APPLICATION DESIGN CANDIDATE — FACTACT PROVIDER CONTRACT PENDING; NO CODE/DB/PRODUCTION CHANGE**
Branch baseline: `feat/it-kaizen-paid-assessment-20261117`, tree `be1537daa3c68980d4b2da7ea0a7fa7dadddcd72`.
Business: `git_KAIZEN/docs/87`, `docs/90`, `docs/92`.
Product: `git_KAIZEN/docs/91`; FACTACT Device import read-only reviews 2026-11-17 (Source Claim → Accepted Registry Information → Verified FACT; Product-side Device/Organization, UNKNOWN status and typed commands still pending).
Existing Assessment sources: `docs/it-kaizen-assessment-factact-integration-contract-candidate-20261117.md`, `docs/it-kaizen-assessment-development-execution-principles-20261117.md`, `src/domain/diagnosisAssessment.ts`, `src/services/assessmentHandoffSnapshot.ts`, `migrations/012_it_management_diagnosis_assessment_handoff.sql`. Existing legacy Assessment Handoff is not the Design v2 or Device import contract.

## 1. Purpose and ownership
An Assessment operator should be able to take an existing customer PC management Excel/CSV and create **source-linked initial-information candidates** without retyping each row. No full physical inventory prerequisite. The Assessment application owns upload, parsing, mapping proposal, correction, preview and submission. FACTACT owns scoped current-state comparison, authoritative target identity, grants, accepted registry information, verification, commit, history and audit. Never introduce an Assessment-owned Device master or claim that an imported record is already VERIFIED.

## 2. Human interaction: 3 screens, no mandatory multi-step wizard
1. **資料を選ぶ**: Excel (.xlsx) or CSV, one sheet/table in the first validation slice; select the actual worksheet only if ambiguous. Display file name, worksheet, row count, header preview and parse errors. No automatic network upload before operator action.
2. **項目を確認する**: show original column → suggested FACTACT field, sample values, required/optional/unsupported. Deterministic exact/alias matching first. Ambiguous and duplicate target mappings require operator correction. Optional AI suggestion only for ambiguous headers and only within approved privacy/data handling; never AI-only auto confirmation.
3. **登録候補を確認する**: table with original row number, target customer, asset tag, display name, serial, source-only columns, row outcome `新規登録候補 / 既存更新候補 / 差分なし / 要確認 / 除外`, reason and proposed field changes. Operator can exclude/correct rows and submit permitted candidates. Submission status is `確認待ち`, not `登録済み`. Actual FACTACT response governs commit status. Filter to errors/review, show counts; no forced item-by-item retyping.

This is one coherent workflow; UI must not expose backend Change→Verify→Commit as three human clicks. Reviewer/committer UX remains FACTACT Product responsibility.

## 3. Data interpretation
- `asset_tag` and `display_name` are the first candidate required mapping fields **subject to Product acceptance**. `serial_number` optional.
- User name and location are source claims, not automatically Person relation or Site registry data. Hostname is source-only until a target field exists. Do not silently discard source-only columns needed to explain row decisions.
- Device business status (AVAILABLE/UNAVAILABLE/RETIRED) is **not** verification status. A source value `利用中` must not map to AVAILABLE. Source status stays source information; FACTACT Product decides safe UNKNOWN representation.
- Distinguish `source row parsed`, `candidate selected`, `submitted proposal`, `accepted initial information`, `verified FACT`; never label all as FACT or VERIFIED.
- No automatic deletion because a Device is absent from the spreadsheet. No implicit asset-tag fabrication or duplicate merge. No auto-promotion of previous verified values on reimport.
- Existing target identity and customer Organization are resolved by FACTACT, never inferred from an Assessment `company_id` or tenant equivalence.

## 4. Application-side pure contract candidate (NOT API)
```ts
type ImportRowOutcome = 'NEW_CANDIDATE'|'UPDATE_CANDIDATE'|'UNCHANGED'|'NEEDS_REVIEW'|'EXCLUDED';
type ColumnMapping = {
  sourceColumnIndex: number;
  targetField: 'asset_tag'|'display_name'|'serial_number'|null;
  origin: 'EXACT'|'ALIAS'|'AI_SUGGESTION'|'HUMAN';
  confirmedByHuman: boolean;
};
type ParsedImportRow = {
  sourceRowNumber: number;
  originalCells: string[];
  mappedCandidate: { asset_tag?: string; display_name?: string; serial_number?: string };
  issues: string[];
};
type ImportPreviewRow = ParsedImportRow & {
  outcome: ImportRowOutcome;
  existingStateRef?: string; // only from authorized FACTACT read
  proposedChanges?: Record<string, { before?: string; after?: string }>;
};
```
All identifiers, statuses and fields above are Assessment-local candidate representations. FACTACT integration types, target IDs, error codes, authorization and API endpoints are **not specified**. No direct SQL or fabricated FACTACT adapter.

## 5. Deterministic mapping / validation
- Normalize header for comparison only (trim, common fullwidth spacing); preserve raw header and cell text. Maintain explicit alias dictionary with version, e.g. `資産番号/管理番号/asset tag` → `asset_tag`, `機器名/PC名/名称` → `display_name`, `シリアル番号/SN` → `serial_number`. Ambiguous `ID`, `番号`, `利用者`, `状態` are **not** silently assigned.
- A source column maps to at most one target; two source columns must not silently map to one target. Duplicate header names, duplicate `asset_tag` in a sheet, empty required cells and overlong/invalid fields yield review issues, not dropped rows.
- Initial local-only preview may identify intra-file duplicate and missing required columns. Classification requiring existing registry state must remain **UNKNOWN / comparison pending** until a scoped FACTACT read is available; do not present unverified `NEW_CANDIDATE` as an authoritative finding.
- Idempotent request identifiers and row fingerprints should be deterministic from file content/row + approved mapping version for retry detection, but exact semantics are pending Product contract. No raw sensitive spreadsheet contents in logs.

## 6. Error and lifecycle boundaries
- Parse failure: no candidate submitted; show file/worksheet/row/column error and preserve operator corrections if possible.
- Missing required mapping: block submission, not file preview.
- Unresolved duplicate/ambiguous customer/permission: mark row `要確認`; no commit.
- FACTACT unavailable or unauthorized: keep local preview as draft only, no false success; retry requires explicit user action.
- Source/provenance, retention and AI provider payload minimization must comply with `git_KAIZEN/docs/66` and later Assessment-specific security review. Do not assume uploaded whole files are permanently stored.
- A batch may produce per-row success/failed/pending outcomes only when FACTACT contract defines them; no inferred all-or-nothing or direct transaction handling on Assessment side.

## 7. Offline first-slice acceptance examples
A. CSV header `資産番号,PC名,シリアル番号,利用者,状態` -> 3 deterministic target columns; 利用者/状態 source-only; no auto AVAILABLE or Relation.
B. Duplicate `PC-001` within one file -> both rows NEEDS_REVIEW; no submission.
C. Missing `asset_tag` or `display_name` -> visible issue and submission blocked for affected row.
D. Unknown header `番号` -> requires explicit mapping.
E. Human changes mapping -> preview recomputed and original values preserved.
F. Existing-state read unavailable -> no authoritative new/update/unchanged classification; preview still usable.
G. AI suggestion disabled -> full manual/deterministic workflow succeeds.
H. Simulated provider returns pending -> UI displays 確認待ち, never 登録済み.
I. Two customer organizations with same asset tag -> no Assessment-side identity merge.
J. File has a row absent in subsequent reimport -> no delete proposal.

## 8. Implementation handoff gate
1. Implement **only pure local parser/mapping/preview** in a bounded independent Draft PR after reviewing existing code and file-size/format/retention constraints. Do not add a generic import subsystem, AI service or DB table. Review library and dependency choice before coding; `package.json` currently does not list a dedicated Excel reader.
2. Once FACTACT Product finalizes Device customer scope, status, Create/Update and verification interfaces, write a separate versioned adapter contract and end-to-end tests.
3. Do not touch GCP, Production, existing PRs, legacy Assessment Handoff, `server.ts`, or migrations in this first slice. No direct FACTACT DB writes.
4. This document is **design and test acceptance specification only**, not a claim that implementation/tests already pass.
