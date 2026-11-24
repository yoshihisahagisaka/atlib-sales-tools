# Business KAIZEN ACCEPTED Re-entry Decision

Status: DECIDED  
Date: 2026-11-24 JST  
Scope: Business Diagnosis sales Stage lifecycle

## Decision

- `ACCEPTED` means that consultation intake was established.
- A staff member may explicitly return a Diagnosis to any existing Stage, including `ACCEPTED`.
- Every actual Stage change appends one immutable Stage History row and one audit record.
- Saving the currently selected Stage remains a no-op: no revision increment, history row or audit row.
- The first `ACCEPTED` History row fixes the initial entry fact and timestamp. It is computed as `min(reached_at)` for the Diagnosis.
- Later `ACCEPTED` rows are sales-operation history. They do not create another KPI Subject, entry count or `ENTRY_ACCEPTED` milestone.
- Optimistic revision conflict behavior remains unchanged.

## Reason

The sales Stage is a current operational state and may legitimately return to intake after scheduling or later discussion. Preventing only the second `ACCEPTED` with a partial unique index conflicts with the otherwise repeatable Stage-history model and exposes a database constraint as a UI workflow rule.

The immutable history already supplies both necessary facts without a new table: the earliest row is initial acceptance, while all rows preserve the operational sequence. E1 and E3a already aggregate the earliest `ACCEPTED`, so allowing later rows does not change their subject/count semantics.

## Compatibility

- SELF creation still inserts its initial Lead, Diagnosis and first `ACCEPTED` atomically and idempotently.
- PROXY draft/save/complete still does not imply acceptance.
- No Stage order, automatic transition, correction API or new screen is introduced.
- Existing append-only triggers and runtime UPDATE/DELETE revocation remain authoritative.
- This Decision resolves the release gate recorded in Package D2 and Package F1; it does not resolve the separate E3a Commercial `serviceCode` gate.
