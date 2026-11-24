# Business KAIZEN Package F2a Source Evidence

Date: 2026-11-24 JST  
Base: PR #107 HEAD `1e38cc6247e775bcd9e1c4b396f61d2a40686806`

## Fit

- D1 already defines Stage History as an append-only record written only when the current Stage changes.
- E1 selects one entry per Diagnosis with `min(reached_at)` grouped by Diagnosis for `stage='ACCEPTED'`.
- E3a uses the same earliest-ACCEPTED projection for one Subject and one `ENTRY_ACCEPTED` milestone.
- Package A SELF idempotency returns the existing Lead/Diagnosis on replay and inserts no second initial history row.
- No Canonical or ADR was found that requires `ACCEPTED` to be globally unique for the lifetime of a Diagnosis. Package D2 and F1 explicitly record the restriction as an unresolved release gate.

## Change

- Replace `business_kaizen_initial_accepted_unique` with a non-unique `(diagnosis_id,stage,reached_at,id)` read index.
- Preserve the append-only trigger and runtime/app `UPDATE`/`DELETE` revocation.
- Remove the obsolete `STAGE_ALREADY_RECORDED` translation and UI message.
- Preserve same-Stage no-op and revision conflict behavior.

No numbered migration, new table, correction endpoint, Stage order or additional UI flow is introduced.

Updated unnumbered Diagnosis SQL identity:

- SHA-256: `239da79789346ec01afadd9e58f445a8389af667450f3364f6ede7b2467933c0`
- Bytes: `8021`

## Verification contract

- `ACCEPTED → SCHEDULING → ACCEPTED` produces three immutable rows and two ACCEPTED facts.
- The first accepted timestamp remains the E1 entry time and E3a `ENTRY_ACCEPTED.firstReachedAt`.
- E1 accepted count and E3a Subject/milestone counts remain one.
- Same-Stage save is a no-op; stale revision remains 409.
- SELF replay retains one initial ACCEPTED.
- PostgreSQL 16 reproduces Production-like default ACL and proves append-only effective privileges.

## Verification results

- TypeScript build: PASS.
- F2a PGlite lifecycle/KPI/Adapter contract: 1/1 PASS.
- D1/E1/E3/SELF related PGlite/API regression: 18/18 PASS.
- D2 Desktop/Mobile browser: 2/2 PASS.
- F2a isolated PostgreSQL 16.16: 1/1 PASS; 3 connections; two ACCEPTED rows; first timestamp unchanged; runtime UPDATE/DELETE denied.
- D1 isolated PostgreSQL 16.16 regression: 1/1 PASS with Production-like default ACL reproduced.
- Package A SELF isolated PostgreSQL 16.16 regression: 1/1 PASS, including replay and eight-request convergence.
