# Sales Tools Common Portal Slice P1 Fit/Gap

Date: 2026-11-25 JST

Status: IMPLEMENTED AS INFORMATION-ONLY PORTAL / KPI CONNECTION DEFERRED

## Source identity

- Repository: `yoshihisahagisaka/atlib-sales-tools`
- Base: PR #72 HEAD `87832b736f4bdda3deda8db2b4eece1d4efc3549`
- Observed `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- CRM stack: PR #54 `2c1e5f6` → #57 `d84b12d` → #68 `8917222` → #72 `87832b7`; all were OPEN Draft when reviewed.
- Dashboard Decision: `docs/sales-tools-cross-service-dashboard-decision-20261013.md`
- Common KPI Canonical source: commit `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
  - `sales-tools-common-kpi-foundation-contract-20261011.md`
  - `sales-tools-common-kpi-service-boundary-decision-20261011.md`

The Business KAIZEN PR stack beginning at #78 is intentionally absent from this branch.

## Portal and authentication Fit

- `/admin` is already protected by the shared `adminAuthGate`: 300 requests per 15 minutes per IP followed by staff authentication.
- The protected `express.static(public/admin)` serves `index.html` for `/admin/`; no new route or authentication mechanism is needed.
- `public/index.html` remains the public page and is not changed.
- Existing `partner-leads.css` supplies the shared admin typography, spacing, header and colors. `admin-portal.css` adds only portal layout/responsive rules.
- The portal contains no query input, filter, status mutation, form, or client-side script.

## KPI Fit/Gap

| Candidate | Fit | P1 decision |
| --- | --- | --- |
| Common KPI Aggregation/API | The Canonical path is defined, but PR #72 contains no Common adapter, aggregation service, or API. | Do not display a number. Show that no Common KPI is connected. |
| Marketing Initiative six KPIs | Real data, but campaign/UTM scoped and currently calculated from the IT Case path. They are not a cross-service total or service-summary contract. | Keep on the existing Marketing Initiative screen; do not aggregate on the portal. |
| IT diagnosis/case list totals | Real list APIs exist, but their subject, lifecycle, period and denominator do not form the locked Common KPI contract by themselves. | Link to the IT management screen; do not reinterpret list totals as KPI. |
| Business Web Consultation Lead list | Real records exist, but this legacy consultation status list is not the later Business Diagnosis/E1 KPI read model. | Link to the existing consultation list and label it accurately; do not calculate a service KPI. |
| Business KAIZEN E3a | Not present in this base and its Common Commercial connection gate is unresolved. | Remains disconnected. No import, API call, or display dependency. |

Accordingly, P1 renders no numeric KPI widget. This is deliberate compliance with the rule that absent or semantically incompatible data must not be shown as zero. A later slice may replace the availability message only after an adapter/API contract supplies comparable facts.

## Navigation identity

| Function | Existing destination |
| --- | --- |
| Common customer management | `/admin/sales-customers.html` |
| Marketing Initiative management | `/admin/marketing-initiatives.html` |
| IT management | `/admin/free-diagnosis-v1.html` |
| Business KAIZEN current management | `/admin/business-web-consultation-leads.html` |

The Business destination is intentionally described as the current consultation list. P1 does not claim that the later Business Diagnosis management UI is integrated.

## Parallel-change conflicts

- PR #98 changes only the public IT free-diagnosis application and its browser test/evidence. P1 adds protected admin portal files and does not overlap.
- PR #101 changes Docker/runtime dependency files only. P1 does not alter those files.
- Issue #102 is an unresolved whole-site CSP design. P1 adds no script and keeps CSS in an external file, reducing future CSP friction without independently introducing a CSP policy.

## Verification contract

- unauthenticated `/admin/` redirects through the existing staff login behavior;
- authenticated desktop and mobile views expose all four real navigation targets;
- no `0件` placeholder, query reflection, dynamic HTML sink, or script is present;
- the page has one `h1`, ordered section headings, a skip link and visible keyboard focus;
- viewport content does not overflow horizontally;
- TypeScript and the relevant existing CRM/IT regressions remain unchanged.

## Verification evidence

- `npm run build`: PASS.
- P1 portal Playwright, Desktop/Mobile: 2/2 PASS.
- Common CRM API integration: 4/4 PASS.
- Common CRM Playwright, Desktop/Mobile: 2/2 PASS.
- IT Management Diagnosis Golden: 13/13 PASS.
- IT Vertical Slice + Staff Proxy + Case Guard: 34/36 PASS. The same two Vertical Slice failures reproduce at the untouched PR #72 HEAD: Sales Activity acquisition-source filtering and a stale server-wiring regular expression. Staff Proxy and Case Guard suites pass; P1 does not change either failing source/test area.
- `public/index.html` SHA-256 before and after P1: `93538ec9608eb6b104c6ffbb60ff62718aa66bf05021552e1405d33b1dc913e7`.
- Source inspection finds no E3a adapter/runtime/API reference in this branch and no script or dynamic HTML sink in the portal.

No database, migration, Production configuration, deploy, traffic, DNS, or public-page change is part of P1.
