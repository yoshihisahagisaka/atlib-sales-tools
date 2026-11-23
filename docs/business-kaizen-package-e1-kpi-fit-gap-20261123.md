# Business KAIZEN Package E1 KPI Fit/Gap

Date: 2026-11-23
Base: PR #90 HEAD `a99988cdac935d5b5ca59264f9e4bbdba701865c`

## Canonical references

- Sales Tools Common KPI Foundation Contract at `4d433028a354f8a3c468c62d4308e6a0f7a37a29`.
- Sales Tools Common KPI Service Boundary Decision at the same commit.
- Business KAIZEN KPI Fit/Gap handoff at `b5a02941a680b87ece2de4d9a3b58addcd1e8cf9`.
- Package A–D2 lineage: PR #78/#80/#82/#86/#87/#89/#90.
- Latest `main` checked on 2026-11-23: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`.

The governing rule is: only facts whose meaning is already shared are projected. No Business KAIZEN source, lifecycle, or missing timestamp is changed for KPI purposes.

## Source mapping

| Read-model fact | Exact source | Rule |
| --- | --- | --- |
| Subject | `business_kaizen_diagnoses.id` | One Business Diagnosis is one subject; Company and Lead are not subjects. |
| Business line/type | Adapter constants `BUSINESS_KAIZEN` / `BUSINESS_DIAGNOSIS` | Stable labels only; no persistence. |
| ENTRY_ACCEPTED | Earliest `business_kaizen_diagnosis_stage_history.reached_at` where `stage='ACCEPTED'` | Draft/create/complete/current Stage/legacy Lead status do not imply acceptance. |
| Diagnosis completed | `business_kaizen_diagnoses.completed_at` | Never inferred from `updated_at`, Outcome, or answer presence. |
| Proposed | `business_kaizen_commercial_events` where `event_type='PROPOSED'` | A `PROPOSED` Stage is not a Commercial Event. |
| Won | `business_kaizen_commercial_events` where `event_type='WON'` | Outcome `WON` alone is not converted to a Commercial Event. |
| Meeting/schedule | Actual Stage History rows (`SCHEDULING`, `SCHEDULED`, `MEETING_COMPLETED`) | Available for a later detailed funnel; E1 does not add them to the initial seven KPIs. `scheduled_at` is a plan, not a reached timestamp. |
| Entry Channel | `business_kaizen_diagnoses.entry_channel` | `CUSTOMER_SELF` and `STAFF_PROXY` retain their exact meanings. |
| SELF attribution | Linked `business_web_consultation_leads` fields | Lead is the source; no Company/Sales Activity is guessed. Not used by the initial total-only API. |
| PROXY attribution | Linked `sales_activity` attribution fields | Sales Activity is the source; Public Lead is not generated or inferred. Not used by the initial total-only API. |
| Owner | `business_kaizen_diagnoses.owner_user_email` | NULL remains missing; Lead/Activity/operator is not substituted. |
| Amount/currency | Commercial Event `amount` / `currency` | NULL amount remains unknown. No event means a real total of zero; events whose every amount is NULL produce a NULL total. |

## Aggregation contract

- Request dates are JST calendar dates. `from` is inclusive; `to` is an inclusive date converted to the next JST midnight as `toExclusive`.
- `fiscalYear=YYYY` means `[YYYY-02-01 00:00 JST, YYYY+1-02-01 00:00 JST)`.
- Cohort Funnel selects subjects by their first ENTRY_ACCEPTED in the period and follows their later facts after acceptance, including facts reached after the cohort selection period. This follows the Common KPI Contract and is intentionally distinct from period Activity Volume.
- Activity Volume counts facts whose own timestamp is in the period, regardless of the subject's entry cohort.
- Proposal/win diagnosis counts use distinct Diagnosis IDs. Event counts remain separate fields, so multiple events for one Diagnosis do not inflate subject counts.
- Acceptance-to-win conversion uses won Diagnosis subjects divided by accepted cohort subjects. A zero denominator returns `null`, never zero percent.
- Idempotent Commercial Event replay has one persisted event ID and therefore contributes once.

## Data quality and gaps

- Accepted SELF subjects may have no Owner; they remain counted and are reported as Owner-missing.
- Completed diagnoses without ENTRY_ACCEPTED are reported separately and never inserted into the accepted cohort.
- Consultation Leads without a Diagnosis are reported separately; no historical Diagnosis is generated.
- Commercial Events with NULL amount are counted as unknown. They are never treated as zero yen.
- Outcome `COMPLETED_NO_PROPOSAL` does not create a proposal or win.
- Historical Stage/timestamp gaps cannot be reconstructed and are not backfilled.
- Acquisition/Attribution and meeting-stage breakdowns are source-fit but outside the seven initial totals. Adding filters/breakdowns requires a later explicit contract; E1 does not silently choose mappings.

## Implementation boundary

- Query-time read service and Staff-authenticated API only.
- No KPI table, migration, write endpoint, UI/dashboard, backfill, diagnosis/stage/outcome change, Public LP change, or IT KAIZEN KPI implementation.
