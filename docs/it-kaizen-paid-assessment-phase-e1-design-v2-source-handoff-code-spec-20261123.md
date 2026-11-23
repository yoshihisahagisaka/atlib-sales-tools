# IT経営KAIZEN 設計Assessment E1 — Design v2 Source Handoff (code-level specification)

Date: 2026-11-23
Status: **CODE-LEVEL SPEC / INTERNAL ONLY / NO MIGRATION OR PRODUCTION AUTHORIZATION**
Owner: IT経営KAIZEN Assessment Application Lane
Start branch: `feat/paid-assessment-v2-source-handoff-phase-e1-20261123`
Starting HEAD: `c136bc553ca75d17080dca09396e456df88b5b5a` (D3 PR #91)
Draft PR base: `feat/paid-assessment-executive-slides-phase-d3-20261122`
Authoritative: git_KAIZEN docs/23, 77, 78, 86, 87; Sales Tools `docs/it-kaizen-assessment-development-execution-principles-20261117.md`, `docs/it-kaizen-assessment-scope-price-separated-development-priority-20261117.md`, `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`, `docs/it-kaizen-assessment-factact-integration-contract-candidate-20261117.md`.
**Supersession:** Scope/price/final commercial decision MUST NOT be an E1 technical handoff gate. Prior candidate docs that imply the opposite are superseded by the explicit Business decision.

## 0. Business purpose

For one approved, completed free diagnosis Design v2 case, a staff member performs one intentional "引継ぎ" action. E1 records immutable *references* (source case, latest approved feedback decision and delivered report with versions/hashes) for Assessment preparation. It does not ask the customer to answer the free diagnosis again, create a separate company registry, copy Evidence/FACT, certify anything or perform a commercial acceptance decision. No work queue, stage management, AI, external transmission or FACTACT API.

The Sales Tools Assessment side owns this *handoff reference*; FACTACT Core remains authoritative for Evidence, verified Fact, Decision/Work/Change, Authority and operational history. This E1 record is **not** FACTACT verified evidence or a customer-approved paid assessment report.

## 1. Fit/Gap with actual sources (2026-11-23)

- **FIT / REUSE unchanged:** `src/services/designV2AssessmentEligibility.ts` `readDesignV2AssessmentEligibility(pool,caseId)`, `DesignV2AssessmentEligibility`. It requires Design v2 CLOSED, latest feedback Decision `DESIGN_ASSESSMENT`, matching original case, DELIVERED `design-v2` report, approval provenance, source version and content/approval/decision hashes. It executes SELECTs only and can receive the transaction's `PoolClient` through the structural `Pick<Pool,'query'>` contract. **Do not reproduce its validation.**
- **FIT / REUSE:** `contentHash` from `src/domain/diagnosisReport.ts`, `randomUUID`, `requireStaffAuth()`, `adminAuthGate` in `src/server.ts`, `it_management_diagnosis_case_v2_audit` in migration 029, transaction pattern from `src/services/testCaseManagementRepo.ts`, append-only trigger + role grant from migrations 033/035.
- **FIT / TEST:** PGlite `test/support/freeDiagnosisRuleBasedV1Harness.ts`, with `{includeDesignV2:true}`, loads 027-035 (not 036); new test can apply its own **new** migration 037, without modifying the shared harness. Reuse synthetic v2 case/report/decision fixture pattern from `test/designV2AssessmentEligibility.test.ts`.
- **GAP:** no persistent versioned v2→paid Assessment source reference; `assessment_handoffs` in migration 012 binds to legacy `diagnosis_cases` and is **NOT** a valid destination.
- **GAP:** no bounded staff-only create/read endpoint for this reference. Add **one** simple command and one read; no paid case lifecycle or UI in E1.
- **NOT IN SCOPE:** no new scope/price approval, no FACTACT endpoint/tenant mapping, no DB copy of report text/survey answers, no new CRM, no generic Handoff framework.

## 2. ONLY allowed implementation files (5)

1. NEW `migrations/037_design_v2_paid_assessment_source_handoff.sql`
2. NEW `src/services/paidAssessmentSourceHandoffRepo.ts`
3. NEW `src/routes/adminPaidAssessmentSourceHandoff.ts`
4. MODIFY `src/server.ts` (imports, single constructor, one staff-gated router mount only)
5. NEW `test/paidAssessmentSourceHandoff.integration.test.ts`

Do not edit D1/D2/D3, `designV2AssessmentEligibility.ts`, shared harness, `package*.json`, FACTACT Core, existing migrations, old `diagnosisAssessmentRepo`, report/feedback routes or commercial modules. Migration file is authored and locally verified **only**; do NOT execute it against GCP, Production or any shared database.

## 3. Database contract: one small append-only table

SQL file 037 uses an ordinary `BEGIN; ... COMMIT;` as the adjacent SQL migration conventions do (the repository migration runner also brackets migrations and supports nested transaction commands in PostgreSQL).

```sql
CREATE TABLE paid_assessment_source_handoff_v2 (
  id UUID PRIMARY KEY,
  source_case_id UUID NOT NULL
    REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  feedback_decision_id UUID NOT NULL
    REFERENCES management_feedback_decisions(id) ON DELETE RESTRICT,
  report_id UUID NOT NULL
    REFERENCES diagnosis_reports(id) ON DELETE RESTRICT,
  snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id TEXT NOT NULL CHECK (btrim(created_by_user_id) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_case_id,version),
  UNIQUE (source_case_id,feedback_decision_id)
);
CREATE INDEX paid_assessment_source_handoff_v2_latest_idx
  ON paid_assessment_source_handoff_v2(source_case_id,version DESC);
```

- The migration must also add `BEFORE UPDATE OR DELETE` trigger that unconditionally rejects mutation (use the adjacent `prevent_*_mutation` pattern), and `DO $$ ... $$` role-exists-safe GRANT **SELECT, INSERT only** to `sales_tools_runtime` and `sales_tools_app`. No UPDATE, DELETE or public grants.
- Audit: **reuse** `it_management_diagnosis_case_v2_audit` in the same transaction for the initial creation. Store command `CreatePaidAssessmentSourceHandoff`, actor, and a *minimal* detail JSON with source IDs, version, handoff ID and snapshot hash. Never log report text/survey or secrets. Duplicate retries generate **no new** audit event.
- SQL FKs establish the referenced entities exist. Cross-case linkage and matching hashes are enforced by the *existing eligibility reader* inside the command, not by invented composite FKs or source-table alterations. No new company/FACT/Work tables.

### Exact snapshot JSON

```ts
import type { DesignV2AssessmentEligibility } from './designV2AssessmentEligibility';

export interface PaidAssessmentSourceHandoffSnapshot {
  schemaVersion: 1;
  sourceKind: 'FREE_DIAGNOSIS_DESIGN_V2';
  eligibility: DesignV2AssessmentEligibility;
}
export interface PaidAssessmentSourceHandoff {
  id: string;
  sourceCaseId: string;
  version: number;
  feedbackDecisionId: string;
  reportId: string;
  snapshot: PaidAssessmentSourceHandoffSnapshot;
  snapshotHash: string;
  createdByUserId: string;
  createdAt: string; // ISO 8601
}
export interface CreatePaidAssessmentSourceHandoffResult {
  created: boolean;
  handoff: PaidAssessmentSourceHandoff;
}
```

Snapshot is exactly `{schemaVersion:1,sourceKind:'FREE_DIAGNOSIS_DESIGN_V2',eligibility}` built from the validated eligibility return. Store `snapshot_hash=contentHash(snapshot)` and the exact decision/report IDs as indexed columns. No raw customer report text, survey, questionnaire, free-form override, guessed FACTACT tenantId, price, paid contract status or human Decision Record.

## 4. Service contract and command algorithm

```ts
export class PaidAssessmentSourceHandoffError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export class PaidAssessmentSourceHandoffRepo {
  constructor(private readonly pool: Pool) {}
  create(sourceCaseId: string, actorEmail: string): Promise<CreatePaidAssessmentSourceHandoffResult>;
  latest(sourceCaseId: string, actorEmail: string): Promise<PaidAssessmentSourceHandoff | null>;
}
```

1. Validate `sourceCaseId` via `z.string().uuid()` or the existing validated utility; invalid → 400 `INVALID_CASE_ID`. Validate nonblank actorEmail; invalid/missing → 403 `STAFF_REQUIRED`. Do not assume an arbitrary text actor is authenticated: **route** passes `req.staffEmail` only after the existing `adminAuthGate`; the service rejects absent identity.
2. `create`: `pool.connect()`; `BEGIN`; `SELECT id FROM it_management_diagnosis_case_v2 WHERE id=$1 FOR UPDATE` to serialize handoffs per source case and check 404. **On that same client** call `readDesignV2AssessmentEligibility(client, sourceCaseId)` (not `pool.query`) to recheck the latest approved source. Map existing eligibility errors by code: CASE_NOT_FOUND→404; all other eligibility failures→409 with their unchanged code.
3. Assemble the exact `PaidAssessmentSourceHandoffSnapshot` and `contentHash`; SELECT newest handoff row for case `ORDER BY version DESC LIMIT 1`. On every returned prior record, verify its JSON object structure, required immutable references, matching `feedback_decision_id` and `report_id` columns, and `contentHash(snapshot_json)===snapshot_hash`; mismatches fail 409 `HANDOFF_INTEGRITY_MISMATCH`. The source reader does not authenticate old Handoffs; this read does not claim Core certification.
4. If latest has the **same** feedback decision ID and the same snapshot hash, return that existing row with `created:false`; do not insert or create a new audit row, do not change version/time/actor. If it has the same decision ID but a different hash/record, fail 409 `HANDOFF_SOURCE_CONFLICT` (do not overwrite history). If latest refers to a different valid new feedback decision, append a version `latest.version+1`; if none, version 1. Do not update any old rows.
5. Insert new handoff with fresh UUID, explicit source decision/report IDs and version, JSON snapshot and hash, actor. Insert **one** audit row on existing `it_management_diagnosis_case_v2_audit` using the same client. Then COMMIT and return `created:true`. Never update the original case's status/version; the Handoff is not a free diagnosis status transition, paid contract, or FACT verification.
6. On failure ROLLBACK, release client. A concurrent uniqueness conflict (23505), which should be prevented under the case lock, fails closed as 409 `HANDOFF_CONFLICT`; no blind retry and no partial audit. Propagate unexpected SQL errors for the safe route's 500 response.
7. `latest`: validate case/actor, SELECT current latest for the case (no modification), return null if absent. Validate stored hash, snapshot shape and indexed source IDs before returning. This is an **immutable historical reference**, not an assertion that the source report remains the newest or an authenticated Core fact. No reapproval. Never expose internal raw report/decision JSON.
8. Keep only the two service methods and one small row-mapper. No generic repository, trigger runner, idempotency key table, command bus, background worker or state machine. No speculative Factory/API for FACTACT.

**Concurrency model:** PostgreSQL row lock on v2 source case + unique `(source_case_id,feedback_decision_id)` and `(source_case_id,version)` prevents two handoffs for the same case/decision via this command. Existing source case changes normally mutate the same case row; the command's eligibility check is performed on the same locked transaction. If source reads yield an unstable or corrupted source, reject rather than guessing.

## 5. HTTP API (staff only, no UI or extra workflow)

NEW `src/routes/adminPaidAssessmentSourceHandoff.ts`:
```ts
export function createAdminPaidAssessmentSourceHandoffRouter(
  repo: PaidAssessmentSourceHandoffRepo,
): Router;
```

In `src/server.ts`, instantiate `new PaidAssessmentSourceHandoffRepo(pool)` and mount exactly once after existing `adminAuthGate`:
```ts
app.use('/api/admin/it-management-kaizen/assessment-source-handoffs',
  ...adminAuthGate,
  createAdminPaidAssessmentSourceHandoffRouter(handoffRepo));
```

- `POST /:caseId`: request must be empty object (or omitted body), Zod `z.object({}).strict()`; extra keys → 400 `INVALID_REQUEST`. Actor = `req.staffEmail` (no `unknown-staff` fallback). Call `repo.create`. If created 201 else 200, body the `CreatePaidAssessmentSourceHandoffResult`.
- `GET /:caseId/latest`: call `repo.latest`, return `{handoff: ... | null}` with 200. No GET side effects.
- Handle only `PaidAssessmentSourceHandoffError` with safe `{error: code}` + its HTTP status; unexpected errors → 500 `INTERNAL_ERROR`. Do not serialize stack, SQL, sensitive report content. All routes inherit staff OAuth session cookie, same-origin behavior and existing IP limiter. No anonymous/public endpoints, no new roles/price approver, no notification.
- Use existing `safeAccessRequest` redacted logging, no token or raw source content in URL/log.

## 6. Exact acceptance tests and negative cases

NEW `test/paidAssessmentSourceHandoff.integration.test.ts` using `createFreeDiagnosisRuleBasedV1Harness({includeDesignV2:true})` with a disposable PGlite PostgreSQL database. Apply only new migration 037 in test; do not modify the shared harness. Seed a minimal but **genuine** Design v2 source case/report/feedback decision with the actual schema, hashes and approval metadata; use SQL fixtures from existing Eligibility test as the semantic reference. Do not silently reinterpret legacy `diagnosis_cases`.

Required:
1. Valid CLOSED v2 case with latest DESIGN_ASSESSMENT feedback decision and DELIVERED/approved design-v2 report → a single Handoff version=1 with correct IDs, versions, hashes, snapshot hash; **no copied raw text and no FACT/Work/price/actor assignment**.
2. Repeating same POST, even by another authenticated staff user, returns exactly same row/version/hash with `created:false` and **one** audit insert total. Two concurrent attempts yield exactly one row (PGlite harness serializes connections; verify DB uniqueness/locking separately and do not claim a real multi-connection stress proof).
3. New valid feedback decision ID/version (after controlled synthetic source change) → version=2 and both history rows preserved. Altered hash for same decision/old row, tampering snapshot, UPDATE/DELETE attempt → fail closed; no history rewrite.
4. Invalid source UUID, missing case, non-CLOSED case, missing/different latest route, source report not DELIVERED, wrong case report, tampered content/approval or decision hash → correct 400/404/409, no handoff or audit.
5. Existing `readDesignV2AssessmentEligibility` returns only refs; no new statement promotes to verified FACT. `sourceKind` is reference-only.
6. Audit INSERT failure → transaction rollback: no handoff, no audit, no partial rows. Ensure transaction connection released.
7. REST authentication: without staff cookie 401, invalid cookie 401, authenticated POST 201/200, GET read 200; extra payload rejected 400, no public route. No `Authorization` bearer bypass. Apply middleware in test exactly as server.
8. Cross-case wrong source record cannot be linked; latest read returns null for case with no handoff, no leakage across case IDs.
9. SQL migration 037 creates one table and indexes; immutable trigger and grants do not alter legacy Handoff, reports, feedback, source facts or other migrations.
10. Confirm `npm ci`, `npm run build`, E1 new test suite, **all 121 existing D3 baseline regressions** plus any other directly relevant eligibility/source tests, `git diff --check`. Report actual PASS counts, file diff, immutable migration SQL, and full STOP status.

## 7. Execution, acceptance, STOP

- Before Codex implementation, verify **exact** E1 branch starting SHA, code-level spec Planning commit, actual D3 PR #91 head, upstream eligibility exports, and whether another branch introduced migration 037; if source differs report mismatch and STOP. Existing migration runner sorts by filename; do not reuse duplicate numbers or modify existing migrations.
- Implement **only the five allowed files**, with no refactor. Use the exact SQL, interface, single transaction algorithm and routes above; Codex investigates/implements/verifies, does **not** choose design changes.
- If required SQL, TypeScript contract, error mapping, source authorizations or Local PGlite constraints mismatch, STOP and return FIT/GAP without expanding scope. Do not silently bypass tests, introduce further tables or self-authorize FACTACT APIs.
- If all mandatory checks PASS: Commit/Push to E1 branch and open stacked **Draft** PR based on `feat/paid-assessment-executive-slides-phase-d3-20261122`. Return SHA, PR URL, changed paths, actual test results and Canonical Fit/Gap.
- NO PR merge; NO migration execution in shared DB/Cloud SQL; NO DNS, Cloud Run, Production, billing/secret changes or real customer writes. Local synthetic migration is allowed strictly for test.
