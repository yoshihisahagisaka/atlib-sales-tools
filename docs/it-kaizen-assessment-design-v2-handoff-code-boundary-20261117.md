# IT経営KAIZEN 設計Assessment — Design v2 Handoff implementation boundary v0.2
Date: 2026-11-17
Status: CODE-LEVEL DESIGN CHECKPOINT / NO IMPLEMENTATION AUTHORIZATION
Source: Codex read-only A-D findings provided 2026-11-17, Git main 850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae; Business Canonical git_KAIZEN docs/73, 78, 81, 83, 84; FACTACT Product contract pending.

## Confirmed FIT
- `management_feedback_decisions` stores immutable per-v2-case version, route, report references/hashes, actor/time and decision context. Route DESIGN_ASSESSMENT transitions case to CLOSED. A FOCUSED_CONFIRMATION earlier can lead to multiple decisions.
- Design v2 Report source provenance, narrative staleness check, approval snapshot and DB immutability exist; no need to recreate.
- `assessment_structure_suggestion` provides immutable system recommendation and candidate price, NOT human commercial final decision.
- Legacy `assessment_handoffs` version/hash/freshness/immutable concepts can be reused conceptually, but its FK, case lifecycle and snapshot schema are incompatible with Design v2.
- Legacy ACCEPTED transition has no identified application route; do not assume available.

## Proposed bounded implementation architecture — subject to source-level review
### A. Read-only Design v2 eligibility projection (no FACTACT API)
Use `it_management_diagnosis_case_v2` and `management_feedback_decisions` as the existing owners. For a given case id:
1. Read v2 case by id. Never join via legacy `diagnosis_cases`.
2. Select latest feedback decision by `version DESC` with deterministic tie handling guaranteed by per-case unique version; require route DESIGN_ASSESSMENT, not simply any historical matching decision.
3. Require the current v2 case status CLOSED, except if an explicitly approved alternate lifecycle contract is later found. No FEEDBACK_COMPLETED condition from legacy.
4. Read report by decision snapshot report.id, require matching v2 case ownership and DELIVERED status; recompute stored report content and approval snapshot hashes, compare with decision snapshot. Do not use a different latest report.
5. Return explicit eligibility or a fail-closed error, with fixed source refs (case id, decision id/version/context hash, report id/version/content hash/approval snapshot hash).
6. No inference of verified FACT from survey, analysis or approved narrative.
These steps are candidate design; verify actual column names, snapshot JSON shape, and current report-status invariants before coding.

### B. Commercial final decision boundary (separate from suggestion)
- Reuse `assessment_structure_suggestion` only as an input reference. Human decides scope and final quote, with rationale and approval where required under docs/81/83/84.
- Keep original suggestion ID/version and grounds, human-selected scope/price, decision actor/time, approver/approval time where needed, remaining UNKNOWN and scope basis; append-only versioning, no overwrite.
- Do not create a generic commercial decision table or invent approval roles until exact Business Canonical + existing authorization primitives are mapped.
- No quote accepted by merely copying `suggested_base_price`; REVIEW remains a no-price safety state.
- Candidate precondition for paid Handoff is an approved human commercial decision AND eligible latest DESIGN_ASSESSMENT feedback decision; the precise order of quote/acceptance requires reconciliation with Business contract.

### C. Handoff snapshot (not a duplicate FACT store)
- Immutable references to v2 case, latest eligible feedback decision and delivered approved report with hashes and source IDs.
- Explicitly classify original survey, narrative and analysis as statements/projections; no promotion to FACT.
- Include human final commercial decision reference when approved.
- FACTACT target tenant/identity, ingestion, idempotency and audit are NOT defined here. Do not implement a network transfer endpoint until Product lane confirms.
- Avoid reusing legacy `assessment_handoffs` FK or old entry-channel enum. Do not change historical records.
- Hash canonical serialization and transaction/locking/idempotency behavior require exact existing utility review before implementation.

## Required next code-level review (narrow)
1. Check actual schema columns/uniques in `management_feedback_decisions` (migration 015 + 029) and v2 case current status.
2. Check `decide()` and its snapshot/report hash semantics; report ownership and post-delivery immutability.
3. Check existing commercial final decision and approval policy docs/83 and current auth/role implementation. No new approval scheme.
4. Check direct callsites of old Handoff to ensure no regression.
5. Ask FACTACT Product lane for existing callable interface and status (FIT/GAP), not an invented API.

## Codex next instruction status
**NOT YET IMPLEMENTATION READY.** First provide a code-level spec for A, with exact functions/types/query/exception/test assertions after the bounded checks. Implement only upon review; B/C require further decisions and Product interface.

## Release gates
No changes to Production, billing, DB, migration, deploy or traffic. KPI/dashboard/sales CRM remain deferred.
