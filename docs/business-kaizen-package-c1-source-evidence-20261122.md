# Business KAIZEN Package C1 source evidence (2026-11-22)

## Baselines

- Package C1 base: PR #82 HEAD `68a75673c13b2744b80295355719ab065b3cace4`.
- Package A persistence: PR #78 lineage; `business_kaizen_diagnoses` remains the Diagnosis source of truth.
- Package B1 calculation: PR #80 lineage; this read-only package does not calculate or reinterpret diagnosis results.
- Package B2 Staff Proxy: PR #82; its existing detail response fields remain available.
- Business KAIZEN Implementation Contract v1: previously supplied source referenced by the Package B1/B2 evidence records.

## Read-model boundaries

- `CUSTOMER_SELF` identity and attribution are read only from the referenced `business_web_consultation_leads` row.
- `STAFF_PROXY` identity is read only from its referenced Company and Contact; attribution is read only from its Sales Activity.
- Names are selected according to `entry_channel`; no Company-name matching or cross-channel inference is performed.
- A historical Lead without a Diagnosis is not listed and does not cause backfill.
- Listing is stable at equal timestamps using `updated_at DESC, id DESC`; paging uses a validated page/limit and a limit-plus-one `hasNext` check.
- This package adds no write API, schema change, migration, stage/outcome transition, KPI, or UI.
