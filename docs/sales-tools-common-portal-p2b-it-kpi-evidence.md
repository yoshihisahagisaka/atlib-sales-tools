# Sales Tools Common Portal Slice P2b IT KPI Evidence

Date: 2026-11-25 JST

Status: IMPLEMENTED / RELEASE NOT PERFORMED

## Source identity

- Repository: `yoshihisahagisaka/atlib-sales-tools`
- Base: PR #117 HEAD `221dfdda3927a0d55c2907854753a2eba2fb4d2a`
- P1: PR #115 HEAD `8598a3ffb1d618f9da1a42f1a7c5ec6ac5cbbf46`
- PR #72 lineage: `87832b736f4bdda3deda8db2b4eece1d4efc3549`
- Observed `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Contract: `docs/sales-tools-common-portal-p2a-kpi-source-fit-gap.md`
- Common KPI Canonical commit: `4d433028a354f8a3c468c62d4308e6a0f7a37a29`

## Implemented boundary

The adapter counts distinct `it_management_diagnosis_case_v2.id` only when an immutable `it_management_diagnosis_original_survey_snapshot_v2` exists, its `submitted_at` is inside the requested JST fiscal-year interval, and `is_internal_test=false`.

It does not read Case creation time, current status, `updated_at`, Case-list totals, assessment status, suggested scope, or any Business KAIZEN/E3a source. Customer Self and Staff Proxy share the same Original Survey source and are both included.

`GET /api/admin/portal-kpis?fiscalYear=YYYY` is protected by the existing `adminAuthGate`. Omitted year resolves from the current date in `Asia/Tokyo`; the interval is February 1 inclusive through the following February 1 exclusive. Invalid years return a generic 400. Database failures return a generic 503 and never substitute zero or expose database details.

The existing P1 page displays only the IT service count and resolved fiscal year. Common totals remain unavailable, Business remains unconnected, and Commercial metrics remain unsupported. Rendering uses `textContent`; the only script is an external static file. A numeric value is displayed only when both the IT service status and the accepted-count metric status are exactly `AVAILABLE`; contradictory responses containing a number with `UNAVAILABLE` or `ERROR` fail closed to `—`.

## Verification

| Check | Result |
| --- | --- |
| TypeScript build | PASS |
| P2b PGlite/API | 5/5 PASS |
| P2b portal browser desktop/mobile | 6/6 PASS |
| Isolated PostgreSQL 16 | 1/1 PASS on PostgreSQL 16.16 |
| Common CRM API | 4/4 PASS |
| Common CRM browser desktop/mobile | 2/2 PASS |
| IT Golden + Vertical Slice + Staff Proxy + Case Guard | 47/49 PASS; the same two pre-existing PR #72 Vertical Slice failures remain |

P2b API coverage includes staff authentication, Customer Self, Staff Proxy, missing Original exclusion, internal-test exclusion, database UNIQUE protection plus `COUNT(DISTINCT ...)`, both fiscal-year boundaries, omitted-year JST resolution, a real zero, strict year validation, partial/unconnected response fields, and generic database failure handling.

The browser coverage verifies a real `12件`, fiscal-year labeling, common-total non-display, Business unconnected state, error `—`, error copy, no false `0件`, and rejection of numeric values when either the service or metric status is not `AVAILABLE`. Navigation, HTML/query safety, accessibility, and responsive desktop/mobile layout also remain covered.

The two unchanged baseline failures are:

1. Sales Activity acquisition-source filtering in `freeDiagnosisRuleBasedV1VerticalSlice.integration.test.ts`.
2. A stale production-wiring regular expression that expects the older Admin router argument list.

Both reproduced before P2b in P1 evidence and are outside this Slice. Staff Proxy and Case Guard pass.

## PostgreSQL 16 evidence

- GitHub Actions run: [45568692117](https://github.com/yoshihisahagisaka/atlib-sales-tools/actions/runs/45568692117)
- Job: `postgres16` (`139049721022`)
- Image: `postgres:16-alpine`
- Observed server version: PostgreSQL `16.16`
- Result: 1/1 PASS, 0 FAIL

The job created the disposable `portal_kpi` database and a random isolated schema. It applied the actual repository SQL in dependency order: Migration 027, 033, then 035. The test then used their real Company, Contact, Sales Activity, Case, Original Survey, unique `case_id`, entry-channel check, internal-test field, indexes, and immutable-trigger definitions.

The adapter query counted Customer Self and Staff Proxy at the inclusive start and just before the exclusive end of FY2026. It excluded a designated internal test, a Case without an Original Survey, and an Original at the next fiscal-year boundary; FY2025 returned a real zero. A second Original for the same Case was rejected by the real unique constraint.

The Action used fixed loopback port `55438`, fixed disposable database identity `portal_kpi`, and an explicit execution flag. No Production or persistent database was contacted. The local environment still had neither Docker nor `psql`; local invocation therefore remained explicitly skipped rather than silently using another database.

## Fit/Gap after P2b

- IT accepted service count: connected.
- Cross-service accepted total: partial and deliberately non-numeric until Business is connected.
- Business service KPI: unconnected; E1 was not copied.
- Common proposed/won/rate: unsupported because IT has no qualifying Commercial source.
- E3a Common Commercial: no runtime import, route, or consumer.
- No migration or KPI persistence was added.

No Production DB, migration, deploy, traffic, DNS, or merge operation is part of P2b.
