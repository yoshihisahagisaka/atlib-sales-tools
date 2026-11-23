# Business KAIZEN Package D2 source evidence (2026-11-23)

## Baselines

- Package D2 base: PR #89 HEAD `683ca865f66fd654fb29d0a5eb64e2dd909ccb4e`.
- Latest `main` checked on 2026-11-23: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`.
- Package A/B1/B2/C1/C2 lineage: PR #78/#80/#82/#86/#87; all reviewed HEADs still match their recorded dependency SHAs.
- Package D1 semantics and protection evidence: `docs/business-kaizen-package-d1-source-evidence-20261123.md` and the APIs introduced by PR #89.
- Existing cross-service boundary: `docs/sales-tools-cross-service-dashboard-decision-20261013.md`.

## Reused contracts

- The existing Diagnosis detail page remains the only screen. Its diagnosis result, Original/Current answers, Attribution, and Staff Proxy resume behavior remain intact.
- Stage, schedule, Outcome, Stage History, and Commercial Event data are read and written only through the D1 Staff APIs. The UI adds no diagnosis rule, transition rule, inferred event, or automatic retry.
- `revision` is refreshed after successful Stage, schedule, or Outcome writes. A stale revision is reported without overwriting server state.
- A `datetime-local` value is interpreted as Japan Standard Time and converted to an offset-aware instant before submission.
- Commercial Event idempotency uses one UUID per intended submission. When the result is unknown, the same key and payload are retained for explicit retry; a new key is not generated automatically.
- Unknown amount is sent as `null`; entered zero is sent as numeric `0`.

## Release boundary and known gate

- No backend API, database schema, SQL draft, migration, Public Lead, diagnosis calculation, common CRM, or IT KAIZEN behavior is changed.
- The existing `business_kaizen_initial_accepted_unique` constraint means returning to `ACCEPTED` after another Stage can return 409. D2 exposes that error explicitly; resolving Stage lifecycle semantics remains a Release Gate.
- No Production database operation, deploy, traffic/DNS change, or merge is part of this change.
