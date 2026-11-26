# Sales Tools Common Portal Slice P2a KPI Source Fit/Gap

Date: 2026-11-25 JST

Status: SOURCE CONTRACT PROPOSED / IMPLEMENTATION NOT STARTED

## 1. Source identity and scope

- Repository: `yoshihisahagisaka/atlib-sales-tools`
- Target: Draft PR #115, HEAD `8598a3ffb1d618f9da1a42f1a7c5ec6ac5cbbf46`
- Base: PR #72, HEAD `87832b736f4bdda3deda8db2b4eece1d4efc3549`
- Observed `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Common KPI Canonical commit: `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
- Reviewed Canonical/Decision sources:
  - `docs/sales-tools-cross-service-dashboard-decision-20261013.md`
  - `docs/sales-tools-common-kpi-foundation-contract-20261011.md`
  - `docs/sales-tools-common-kpi-contract-20261011.md`
  - `docs/sales-tools-common-kpi-service-boundary-decision-20261011.md`
  - `docs/it-management-kaizen-free-diagnosis-kpi-mapping-20261011.md`
  - `docs/business-kaizen-package-e1-kpi-fit-gap-20261123.md`
  - `docs/business-kaizen-package-f2b-common-commercial-boundary-decision.md`
  - `docs/sales-tools-common-portal-p1-fit-gap.md`

P2a changes no runtime code, API, database object, diagnostic flow, or sales flow. The Business KAIZEN stack beginning at PR #78 remains intentionally absent from PR #115 and is used only as read-only source evidence.

## 2. Canonical aggregation rules

The Common layer may aggregate only facts whose subject, event meaning, and actual timestamp agree across services. It must not infer a milestone from a current status, list presence, `updated_at`, or a similarly named service-specific state.

- Subject count is distinct Canonical subject count, not event count.
- `ENTRY_ACCEPTED` is the service's first actual acceptance fact.
- A milestone is counted once per subject using its first actual occurrence.
- Cohort Funnel and Activity Volume are separate calculations.
- The display period is a JST fiscal year from February 1 inclusive to the next February 1 exclusive.
- A successfully queried, fully connected metric may return `0`.
- Unconnected, unavailable, or failed data is `null`/`—`, never a fabricated zero.
- A conversion with a real denominator of zero is not applicable (`null`/`—`), not `0%`.

## 3. Actual source mapping

| Metric | IT management KAIZEN | Business KAIZEN | Common result in PR #115 |
| --- | --- | --- | --- |
| Accepted subjects | Subject is `it_management_diagnosis_case_v2.id`. The first and only immutable Design v2 Original Survey Snapshot (`it_management_diagnosis_original_survey_snapshot_v2`, unique `case_id`) provides `submitted_at`. This is the implemented acceptance artifact for both Customer Self and Staff Proxy. `is_internal_test=true` must be excluded from production KPI. A Case row alone is not acceptance. | Subject is `business_kaizen_diagnoses.id`. The earliest append-only `business_kaizen_diagnosis_stage_history.reached_at` where `stage='ACCEPTED'` is the acceptance fact. Draft creation, diagnosis completion, `current_stage`, and legacy Lead status are not acceptance. | IT has an implementable exact source. Business has an exact contract in a separate Draft stack but is not available in this base. A cross-service total is therefore partial and must not be displayed as a total. |
| Proposed subjects | No qualifying Common commercial source exists. `assessment_status='PROPOSED'`, `assessment_structure_suggestion`, generated scope, and next-action UI are IT workflow facts, not confirmed paid-service proposal events under the Common Contract. | Distinct Diagnosis subjects with an explicit `business_kaizen_commercial_events` row whose `event_type='PROPOSED'`; actual time is `occurred_at`. Multiple events for one Diagnosis still count as one proposed subject. | Not common-aggregatable. IT is missing the required fact. |
| Won subjects | No qualifying explicit paid-service win/order event exists in the PR #72 source. `assessment_status='ACCEPTED'` is not a Common paid-service win. | Distinct Diagnosis subjects with an explicit Commercial Event whose `event_type='WON'`; actual time is `occurred_at`. | Not common-aggregatable. IT is missing the required fact. |
| Accepted-to-won rate | Cannot be computed without a qualifying IT win fact. | E1 defines won Diagnosis subjects divided by accepted cohort subjects. Zero accepted denominator returns non-applicable. | Not common-aggregatable. Do not calculate a rate from only the connected service or reinterpret an IT status. |

### 3.1 IT-specific Fit/Gap

Fit:

- Design v2 Customer Self and Staff Proxy both persist the immutable Original Survey Snapshot through the same completion boundary.
- `submitted_at` is a real artifact time and does not require inference from Case creation or update time.
- the unique `case_id` relationship prevents one Case from being counted more than once for entry;
- `is_internal_test` is an existing explicit production/test designation and existing Marketing Initiative KPI queries exclude designated test Cases.

Gap:

- there is no existing IT service KPI Read Model for the portal contract;
- there is no explicit Common-compatible paid proposal or win event;
- existing Case/list counts include lifecycle states that are not equivalent to `ENTRY_ACCEPTED`;
- Marketing Initiative KPIs are campaign-scoped and must not be reused as a portal service total.

### 3.2 Business-specific Fit/Gap

Fit in the later Business stack:

- E1 already separates accepted Cohort from period Activity Volume;
- E1 counts distinct Diagnosis subjects and uses actual Stage History and Commercial Event timestamps;
- JST day boundaries and the February 1 fiscal-year start are defined;
- NULL commercial amount, missing Owner, and unaccepted Proxy Draft remain distinct from zero or accepted facts.

Gap relative to PR #115:

- the E1 service/read route and its tables are not present in the PR #72/P1 stack;
- copying E1 SQL or service code into the Common branch would create a second implementation and is prohibited;
- E3a cannot substitute for E1. Its Commercial projection has `serviceCode=null`, and the F2b Decision prohibits connecting it to a Common API or Dashboard until an approved mapping exists.

Business E1 remains eligible for a future **service-specific** portal summary after its owning stack is integrated. That does not authorize E3a Common Commercial connection or cross-service commercial totals.

## 4. Common versus service-specific metrics

### Common candidates

- `acceptedCount` is semantically common, but the portal may publish a cross-service value only when every business line declared in the response is connected for the requested period. Until Business is integrated, the value is unavailable with partial coverage metadata.
- `proposedCount`, `wonCount`, and `acceptedToWonRate` are not publishable as cross-service values because IT lacks qualifying Commercial Events.

### Service-specific metrics

- IT may expose only its exact accepted subject count in the first slice.
- Business may later expose E1's accepted, completed, proposed, won, amounts, and accepted-to-won rate as a Business summary after the E1 stack is integrated.
- IT workflow statuses, reports, feedback, suggested assessments, and Marketing Initiative KPIs remain IT-specific.
- Business diagnosis completion, amounts, Stage/Outcome, and Activity Volume remain Business-specific unless a separate Common mapping is approved.

The portal must not add unlike service-specific values and label the result “Common”.

## 5. Missing, NULL, zero, and failure behavior

| Condition | API meaning | Portal display |
| --- | --- | --- |
| Connected query succeeds with no matching subjects | `value: 0`, `status: AVAILABLE` | `0件` |
| Required service adapter is not connected | `value: null`, `status: PARTIAL` or `UNAVAILABLE` | `—` and an unconnected label |
| Source does not contain the qualifying fact | `value: null`, `status: UNSUPPORTED` | `—` |
| Query/runtime failure | `value: null`, `status: ERROR` | `—` and unavailable state; no cached/fabricated zero |
| Real accepted denominator is zero | rate `value: null`, `status: NOT_APPLICABLE`, reason `ZERO_DENOMINATOR` | `—` |
| Commercial amount is NULL | exclude it from amount sum without changing subject/event count | amount unknown; never `0円` |

## 6. Period contract

The minimal portal period is one fiscal year, with no UI filter in this slice.

- Time zone: `Asia/Tokyo`.
- `fiscalYear=2026` means `[2026-02-01T00:00:00+09:00, 2027-02-01T00:00:00+09:00)`.
- If omitted, the server selects the fiscal year containing the current JST date and returns the resolved bounds.
- Cohort accepted count filters `ENTRY_ACCEPTED.firstReachedAt` by those bounds.
- A later Activity Volume metric must filter its own event time, not the accepted time.
- Common aggregation must not mix Cohort and Activity values in one rate.

## 7. Minimal API contract proposal

The next slice may add one staff-authenticated, read-only endpoint:

`GET /api/admin/portal-kpis?fiscalYear=YYYY`

It returns display-ready facts, availability, and coverage; it does not expose service tables or persist a Common KPI record.

```json
{
  "period": {
    "kind": "FISCAL_YEAR",
    "fiscalYear": 2026,
    "timeZone": "Asia/Tokyo",
    "from": "2026-02-01T00:00:00+09:00",
    "toExclusive": "2027-02-01T00:00:00+09:00"
  },
  "common": {
    "acceptedCount": {
      "value": null,
      "status": "PARTIAL",
      "connectedBusinessLines": ["IT_KAIZEN"],
      "missingBusinessLines": ["BUSINESS_KAIZEN"]
    },
    "proposedCount": { "value": null, "status": "UNSUPPORTED" },
    "wonCount": { "value": null, "status": "UNSUPPORTED" },
    "acceptedToWonRate": { "value": null, "status": "UNSUPPORTED" }
  },
  "services": {
    "IT_KAIZEN": {
      "status": "AVAILABLE",
      "acceptedCount": { "value": 12, "status": "AVAILABLE" }
    },
    "BUSINESS_KAIZEN": {
      "status": "UNCONNECTED",
      "acceptedCount": { "value": null, "status": "UNAVAILABLE" }
    }
  }
}
```

Contract constraints:

- reuse `adminAuthGate` and validate the fiscal year;
- query service adapters independently and preserve their availability;
- do not return a numeric Common total when declared service coverage is partial;
- a service adapter returns subject-level semantics internally, while this endpoint returns only the counts/rates needed by P1;
- no persistence, backfill, status mutation, E3a call, or fallback to list counts;
- deterministic response codes and explicit error/availability status let the P1 UI distinguish zero from missing data.

## 8. First implementable KPI slice

The smallest safe P2b is **IT accepted subjects only**:

1. Add an IT read-only adapter/service that counts distinct non-test Cases having an Original Survey Snapshot whose `submitted_at` falls in the resolved JST fiscal-year range.
2. Add the staff-authenticated portal endpoint above, with the IT service metric available and all unavailable Common/Business/commercial fields explicitly non-numeric.
3. Update the existing P1 page only to fetch that endpoint and show the IT accepted count. Keep the Common top summary as `— / partially connected`.
4. Test Customer Self and Staff Proxy inclusion, Case-without-Original exclusion, `is_internal_test` exclusion, JST/FY boundaries, real zero, data-source failure, staff authentication, and desktop/mobile unavailable states.

This slice requires no migration and no service workflow change. Business E1 connection must be a later integration after its owning PR stack is present. Cross-service proposal/win/rate must wait for an approved, explicit IT Commercial source; Business E3a remains disconnected.

## 9. Unresolved gates

| Gate | Required before |
| --- | --- |
| Business A–E1 stack is integrated into the release lineage and its read contract is available | Business service KPI widget and complete Common accepted total |
| IT explicit paid-service `PROPOSED` event with actual time and Common meaning | Common proposed subjects |
| IT explicit paid-service `WON` event with actual time and Common meaning | Common won subjects and accepted-to-won rate |
| Approved Business Commercial `service_name` to Common `serviceCode` mapping | Any E3a Common Commercial consumer; not required for Business-specific E1 |
| Production/test designation policy remains enforced by the IT adapter | Production portal count release |
| Exact operational error/partial-coverage copy receives browser acceptance | Numeric portal rollout |

These are connection gates, not authority to redesign either service's diagnosis or sales lifecycle.

## 10. P2a conclusion

No complete cross-service numeric KPI can be safely displayed from PR #115 today. The first real, non-inferred value available in its lineage is the IT `ENTRY_ACCEPTED` service count derived from immutable Original Survey Snapshot `submitted_at`, excluding designated test Cases. All commercial Common metrics remain unavailable, and Business values remain unconnected until their existing service-owned Read Model is integrated.

P2a therefore authorizes only the bounded P2b contract above. It does not authorize database changes, Business E1 duplication, E3a connection, inferred milestones, or portal-wide redesign.
