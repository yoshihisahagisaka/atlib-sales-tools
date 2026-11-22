# IT Case Per Sales Activity Decision

Status: DECIDED
Date: 2026-11-22
Scope: IT Management KAIZEN Case creation from Sales Activity

## Context

PostgreSQL 16 release-gate testing for Common CRM Slice 1-C found that the existing IT Case creation API and the Design v2 Staff Proxy submission path could each create a Case for the same Sales Activity. The Staff Proxy path already serialized its own competing submissions by locking the Sales Activity row, but the existing API did not participate in that lock.

This decision supplements the existing Canonical and architecture decisions. It does not replace or reinterpret them.

## Decision

- One Sales Activity may create at most one new IT Management KAIZEN Case through supported application paths.
- A separate diagnosis starts from a new Sales Activity while reusing the existing Company and Contact when appropriate.
- Re-analysis, re-hearing, and other operations inside an existing Case remain part of that Case and are unchanged.
- Both the existing Case creation API and Staff Proxy submission lock the same Sales Activity row before checking for an existing Case and creating a new one.
- A repeated creation attempt returns `409 SALES_ACTIVITY_CASE_ALREADY_EXISTS`.

## Implementation boundary

- The existing generic `FreeDiagnosisRuleBasedCaseRepo.createCase()` behavior remains unchanged for established internal transaction owners.
- The existing Sales Activity Case creation API uses a dedicated transactional repository operation.
- Staff Proxy idempotency, consent audit, Design v2 persistence order, and transaction boundary remain unchanged.
- No database constraint or migration is introduced by this decision.
- No Case status, transition, re-analysis, re-hearing, report, or feedback lifecycle is changed.

## Rationale

Locking the shared Sales Activity row gives both entry paths the same serialization point without changing the existing Case lifecycle or adding a migration. Requiring a new Sales Activity for a separate diagnosis also preserves the Sales Activity as the explicit business event that initiated that diagnosis.
