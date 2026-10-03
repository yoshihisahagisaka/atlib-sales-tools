# Sales Tools Production Canonical / Partner Funnel Recovery

Date: 2026-10-03

## Decision

`atlib-sales-tools/main` is the Production Canonical for internal admin screens, sales-management APIs, and their migration provenance served by `sales.atlib.jp`.

Completion criterion: a specific SHA on `main` must be sufficient to reproduce the Production management functionality.

## Phase 1 facts

- Baseline main SHA: `93679b419824fb5818061f2de15f9e1c52070b3c`.
- Current Production revision at the checkpoint: `sales-tools-00052-guw`, 100% traffic.
- Production Partner Funnels confirmed: InfraVision Partner and Web Development Partner.
- Recovery source lineage: `f486f9e47058346b6381d3df122cc62046f78774` (`feat: restore partner lead funnels and scheduler workers`).
- The recovery source is not merged wholesale because its shared wiring also contains unrelated IT経営KAIZEN / worker changes.

## Phase 2 recovery rule

Start from main and recover Partner Funnel files explicitly. Do not merge/cherry-pick the source branch wholesale. Shared files such as `src/server.ts` and `src/services/mailer.ts` receive only the Partner Funnel wiring/methods required by the recovered domains.

Business Web and the IT経営KAIZEN free-diagnosis work are excluded from this recovery.

## Migration rule

The Production `schema_migrations` ledger is the Source of Truth for applied migrations. Existing migrations are not re-run, renamed, rewritten, squashed, or recreated under a new number.

This recovery restores Partner Funnel migration provenance only. Business Web migrations 025/026 remain outside this phase and are to be tracked from main when the completed Business Web delta is integrated later.

## Admin UI rule

Shared: auth, header/navigation, layout, card/table/status presentation, responsive behavior.

Separated: DB, API, service workflow, domain business rules.

Principle: shared management foundation/UI, service-specific domain logic.

## Deploy rule

Production deployment to the shared Cloud Run service is serialized. Candidate revisions are deployed tagged and with no traffic, smoke-tested through the candidate URL, then promoted. Production revision ↔ Git SHA provenance must remain traceable.

No Production deploy is part of Partner Funnel Recovery until recovery validation is complete.

## Lane checkpoints

Business Web remains STOP with completed source `a2be0de...`; migrations 025/026 are already applied/verified at its checkpoint and are not mixed into Partner Funnel Recovery.

IT経営KAIZEN free diagnosis remains STOP; its completed design/specification assets are not redesigned and are not mixed into Partner Funnel Recovery.
