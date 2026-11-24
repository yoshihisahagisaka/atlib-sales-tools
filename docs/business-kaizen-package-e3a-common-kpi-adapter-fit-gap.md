# Business KAIZEN Package E3a Common KPI Adapter Fit/Gap

Date: 2026-11-24 JST  
Base: Sales Tools PR #100 HEAD `15122dcb0e65fb6d929e1428078de931d2c1017d`

## Canonical evidence

- Common KPI Foundation Contract: commit `4d433028a354f8a3c468c62d4308e6a0f7a37a29`.
- Common KPI Service Boundary Decision: commits `dde0500` / `4d433028a354f8a3c468c62d4308e6a0f7a37a29`.
- Business KAIZEN Package E1 Fit/Gap: `docs/business-kaizen-package-e1-kpi-fit-gap-20261123.md` on the base HEAD.
- Latest `main` observed before implementation: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`.

The adapter projects only immutable or explicit Business KAIZEN facts. It creates no common table, API, aggregation, dashboard, backfill, or service-domain write.

## Source mapping

| Common field | Business KAIZEN source | Rule |
| --- | --- | --- |
| Subject | `business_kaizen_diagnoses.id` | `BUSINESS_KAIZEN` / `BUSINESS_DIAGNOSIS`; one accepted Diagnosis is one Subject. |
| Entry | earliest `ACCEPTED` Stage History `reached_at` | No Stage History means no common Subject. Draft/completion/current Stage never implies entry. |
| Company/Contact | PROXY Diagnosis foreign keys | SELF returns NULL; names never create identity. |
| Entry channel | Diagnosis `entry_channel` | Exact `CUSTOMER_SELF` / `STAFF_PROXY` mapping. |
| Acquisition | PROXY Sales Activity `acquisition_source_type` | Exact stored common-compatible code. SELF is NULL; unknown is not converted to OTHER. |
| Attribution | SELF Lead or PROXY Sales Activity UTM/referrer/landing URL | Source lanes never cross. Valid URL is reduced to its pathname; invalid/unavailable value is NULL. |
| Owner | Diagnosis `owner_user_email` | Missing remains NULL. |
| Outcome | Diagnosis outcome fields | No common outcome category is approved; category remains NULL. Explicit reason and `closed_at` remain available. |
| Drill-down | Diagnosis ID | `/admin/business-kaizen-diagnosis-detail.html?id=<encoded-id>`. |

## Milestone mapping

| Common milestone | Exact source | firstReachedAt |
| --- | --- | --- |
| `ENTRY_ACCEPTED` | `ACCEPTED` Stage History | earliest actual `reached_at` |
| `MEETING_SCHEDULED` | `SCHEDULED` Stage History | earliest actual `reached_at`; `scheduled_at` is not used |
| `PAID_SERVICE_PROPOSED` | Commercial Event `PROPOSED` | earliest actual `occurred_at` |
| `PAID_SERVICE_WON` | Commercial Event `WON` | earliest actual `occurred_at` |

`PROPOSED` Stage alone creates no paid-service milestone. `MEETING_COMPLETED` is not mapped to common `HEARING_COMPLETED`: the current Canonical does not establish that their business meanings are identical. REPORT milestones do not exist in this domain and are not synthesized.

## Commercial mapping and GAP

Every persisted Commercial Event is preserved, including multiple proposals/wins, actual time, NULL/zero amount distinction, and stored currency. `service_name` is free text. No approved mapping to the Common Contract's required `serviceCode` was found. The E3a boundary therefore returns `serviceCode: null` plus the exact `sourceServiceName` as an explicit adapter GAP; it does not invent a code. A later common consumer must not treat this nullable E3a projection as a final service-code mapping until a Canonical mapping is approved.

## Other gaps and non-common facts

- There is no stored Marketing Initiative reference snapshot on Diagnosis/Lead/Activity; matching mutable UTM master data at read time would not prove an intake-time reference. `marketingInitiativeId` is NULL.
- SELF has no Canonical Company/Contact ID. No CRM record is created or inferred.
- No common Outcome mapping is approved. In particular, `COMPLETED_NO_PROPOSAL` is not loss and `WON` Outcome alone is not a Commercial Event.
- Anonymous E2b daily aggregates have no subject identity and are intentionally not joined.
- Business-specific diagnosis completion, six-axis results, answers, stages, schedule, and detailed outcome remain outside the Common Adapter.

## Contract verification

- PGlite contract test covers accepted-only inclusion, one Diagnosis/Subject, SELF/PROXY identity and attribution separation, first milestone timestamps, repeated stages, multiple events, NULL amount, stage-only non-conversion, outcome non-inference, drill-down, and read-only source counts.
- Disposable PostgreSQL 16 test independently verifies server/database identity before applying draft schema and confirms the adapter is read-only.
- E1/E2b and Business Web/CRM/IT regression remain separate suites; no source schema or route is changed by E3a.
