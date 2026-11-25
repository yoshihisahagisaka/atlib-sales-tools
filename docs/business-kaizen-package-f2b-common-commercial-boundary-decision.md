# Business KAIZEN Package F2b Common Commercial Boundary Decision

Date: 2026-11-25 JST

Status: DECIDED

Scope: documentation and release boundary only. This decision authorizes no API, dashboard, database, migration, deployment, traffic, DNS, or Production change.

## 1. Source identity

- Repository: `yoshihisahagisaka/atlib-sales-tools`
- Base: PR #108 HEAD `a4ef12205978953a71bcaf5756a90b755f00909d`
- Observed `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Common KPI Foundation Contract: commit `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
- Common KPI Service Boundary Decision: commits `dde0500` / `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
- E3a source mapping and Fit/Gap: `docs/business-kaizen-package-e3a-common-kpi-adapter-fit-gap.md`
- F1 release record: `docs/business-kaizen-package-f1-release-readiness.md`
- F2a lifecycle decision: `docs/business-kaizen-accepted-reentry-decision-20261124.md`

Observed stacked dependency heads are PR #100 `15122dcb0e65fb6d929e1428078de931d2c1017d`, PR #106 `b91d0a47ebb135cfa7b3ee890610c47aba53ba74`, PR #107 `1e38cc6247e775bcd9e1c4b396f61d2a40686806`, and PR #108 `a4ef12205978953a71bcaf5756a90b755f00909d`. A stacked branch is not a Production Canonical substitute; final integration remains subject to normal review.

## 2. Canonical Fit/Gap

The Common KPI Foundation Contract requires a non-null Common Commercial `serviceCode`. The Business KAIZEN domain currently records the actual staff-entered fact as free-text `service_name`. No approved catalog, mapping table, normalization rule, or historical mapping policy connects those values.

The Service Boundary Decision requires sharing only facts whose meanings are genuinely common and forbids distorting a service-specific domain to force apparent commonality. Therefore:

- retaining `service_name` as the Business KAIZEN fact fits the service boundary;
- inventing or guessing `serviceCode` from free text would violate both Canonicals;
- returning `serviceCode: null` as a fully compliant Common Commercial response would violate the current Foundation Contract;
- changing the Common Contract in this slice would exceed scope and is not approved.

This is a connection-boundary GAP, not a defect in the Business KAIZEN Commercial Event or E1 KPI source data.

## 3. Decision

1. Business KAIZEN Commercial Events continue to use the existing free-text `service_name` as their authoritative service description.
2. E1 proposal/win counts and amounts continue to use the existing explicit Commercial Event facts. E1 does not require a Common `serviceCode`.
3. No `serviceCode` is inferred, generated, defaulted, or normalized without an approved mapping contract.
4. The E3a adapter may remain in the repository as an internal, incomplete projection and contract-test target. Its nullable projection is explicit Fit/Gap evidence, not a conforming Common KPI read model.
5. E3a must not be connected to a Common KPI API, dashboard, export, scheduled job, or other Production consumer while the mapping GAP remains.
6. Common Commercial integration may be completed only in a separately reviewed slice after an explicit mapping decision is approved.
7. This decision does not change SELF/PROXY behavior, Stage, Outcome, sales UI, Commercial Event persistence, E1 Business KAIZEN KPI, or anonymous KPI behavior.

Provided the disconnection in item 5 is preserved, the missing mapping is **not a blocker for release of the Business KAIZEN core or its service-specific E1 KPI**. It remains a **mandatory gate before any Common Commercial connection**.

## 4. Runtime evidence

Read-only source inspection at the base HEAD established:

- `src/server.ts` does not import, construct, register, or expose `BusinessKaizenCommonKpiAdapter`.
- No Production route, API, admin page, dashboard, export, worker, or scheduled job calls the E3a adapter.
- Adapter references are confined to its implementation, tests, package test commands, and documentation/evidence.
- E3a currently projects `serviceCode: null` together with the source service name, and its tests assert that unresolved state.
- Because there is no runtime consumer or serializer, this nullable field cannot currently leave the repository as an official Common KPI response.
- `BusinessKaizenKpiService` (E1) is wired independently and aggregates Business KAIZEN tables directly. It neither imports nor calls the Common adapter.

Repository inclusion alone is permitted only while these runtime-disconnection properties remain true.

## 5. STOP conditions

Common Commercial connection work must STOP before merge or release if any of the following is observed:

1. The E3a adapter is imported or instantiated by runtime composition code, including `src/server.ts`.
2. A route, API, dashboard, export, job, report, or other consumer exposes or depends on the E3a Commercial projection.
3. `serviceCode: null`, the raw free-text name, or a fallback value would be serialized as a conforming Common Commercial response.
4. Code derives a service code from spelling, labels, substrings, UI text, or an unapproved lookup.
5. A Common consumer is proposed without an approved stable service catalog, mapping ownership, versioning, and historical/unmappable-value policy.
6. A change makes E1 depend on E3a or changes Business KAIZEN facts merely to satisfy the Common interface.
7. The Common Contract itself changes; that requires a separate Canonical review and a new Fit/Gap assessment.

These conditions are suitable for source review and contract-test enforcement. A future consumer must not treat the present adapter class name or test coverage as evidence of Common-contract conformance.

## 6. Requirements for a future mapping slice

Before Common Commercial connection is authorized, a separate slice must provide:

- an approved, stable `serviceCode` catalog and mapping authority;
- an explicit rule for existing free-text values, including unmappable and newly introduced names;
- a decision on whether unmappable events are excluded from Common Commercial output or represented through a Canonical contract extension;
- preservation of the original Business KAIZEN `service_name` fact without destructive rewriting;
- adapter and contract tests proving that every published Common Commercial event has a valid non-null code;
- consumer/API/dashboard integration review, backward-compatibility review, and release Evidence.

Until all items are approved, the correct behavior is containment, not inference.

## 7. Release impact

- Business KAIZEN core release: not blocked by this mapping GAP when E3a remains disconnected.
- E1 Business KAIZEN KPI: not blocked; it remains service-specific and fact-based.
- E3a internal projection: may remain packaged but is not an official Common response.
- Common Commercial API/dashboard/consumer: blocked by this mandatory connection gate.
- Database and migration plan: unchanged; this decision adds no schema or migration requirement.
- Human Acceptance: must confirm no Business KAIZEN UI presents an inferred Common service code and no Common consumer is enabled.

F1 Release Readiness remains NO-GO for its other unresolved Production ledger, migration, configuration, Corporate acceptance, ACL, and real-environment gates. This decision only reclassifies the E3a mapping item from a core-release blocker to a Common Commercial connection gate.
