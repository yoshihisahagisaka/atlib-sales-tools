# Business KAIZEN Package B2 source evidence (2026-11-22)

## Source baselines

- Sales Tools dependency: PR #80, `d2ed434aa94d380c840c080d726c09d6f8eb5e08`.
- Package A persistence: PR #78 lineage and `UNNUMBERED_business_kaizen_diagnosis_package_a.sql`.
- Package B1 diagnosis source: `src/domain/businessKaizenDiagnosis.ts` at the dependency SHA above.
- Corporate question source: `atlib-corporate-site` PR #74, `a7c14308a01da253d4842266ed3d9f94ac0bcb29`, `public/business-web/self-check/self-check.js`.

## Reuse and differences

- The Staff Proxy question contract preserves all 15 question IDs, answer codes, cardinality rules, and the Corporate PR #74 question and option labels.
- Diagnosis calculation calls the Package B1 `diagnoseBusinessKaizenSnapshot()` function. The Staff Proxy route and UI contain no Direction, six-dimension, Facts, Unknown, Coverage, Confidence, or Bottleneck rules.
- Staff-only presentation state, attribution-like fields, and proxy notes are outside the answer schema and are not diagnosis inputs. The B1 deterministic-output test covers this boundary.
- The Staff Proxy UI differs from Corporate only in its authenticated workflow shell: server-derived Company/Contact/Service identity, explicit draft save/resume, revision conflict handling, consent confirmation, and completion.
- Consent wording is versioned as `business_kaizen_staff_proxy_consent_v1`; the completion audit stores the confirmation flags and wording version, not a duplicate answer payload.

## Persistence boundary

- A Staff Proxy diagnosis references an existing `BUSINESS_WEB` Sales Activity and never creates Company, Contact, Sales Activity, Public Lead, or `ACCEPTED` stage history.
- The unnumbered Package A draft gains only optimistic `revision` and an append-only Staff Proxy audit table. It intentionally does not add a unique constraint for Sales Activity or assign a production migration number.
