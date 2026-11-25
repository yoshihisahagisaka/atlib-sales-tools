# Business KAIZEN Package F1 Release Readiness

Date: 2026-11-24 JST  
Scope: read-only Fit/Gap and release planning. This record authorizes no merge, migration, deployment, configuration change, traffic change, or DNS change.

## 1. Source identity

### Sales Tools

- Repository: `yoshihisahagisaka/atlib-sales-tools`
- Reviewed source: PR #106 HEAD `b91d0a47ebb135cfa7b3ee890610c47aba53ba74`
- Observed `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Production Canonical policy: `docs/sales-tools-production-canonical-policy-20261003.md`
- Common KPI Foundation Contract: commit `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
- Common KPI Service Boundary Decision: commits `dde0500` / `4d433028a354f8a3c468c62d4308e6a0f7a37a29`
- Package evidence: `docs/business-kaizen-package-{b1,b2,c1,c2,d1,d2,e1,e2b,e3a}*`

All observed Sales Tools PRs remain OPEN and Draft. The stack is:

`main` → #54 `2c1e5f6` → #57 `d84b12d` → #68 `8917222` → #72 `87832b7` → #78 `996e070` → #80 `d2ed434` → #82 `68a7567` → #86 `81e1769` → #87 `13d281e` → #89 `683ca86` → #90 `a99988c` → #96 `f9674fd` → #99 `d50ec07` → #100 `15122dc` → #106 `b91d0a4`.

The stack must be integrated and reviewed in dependency order. A stacked branch HEAD is not a Production Canonical substitute for a reviewed main SHA.

### Corporate

- Repository: `yoshihisahagisaka/atlib-corporate-site`
- Observed `main`: `eb9b229dd09ecee9c15a161cc03bdb289215458a`
- PR #74: OPEN Draft, HEAD `a7c14308a01da253d4842266ed3d9f94ac0bcb29`
- PR #80: OPEN Draft, base #74 branch, HEAD `431e05e3dd31f47ded5a7a04db93048cc9b76fb6`
- PR #80 depends on Sales Tools PR #100 endpoint/config contract.

Read-only HTTP evidence on 2026-11-24:

- `https://service.atlib.jp/business-web/self-check/`: 200, 782 bytes, Last-Modified `2026-11-22 12:22:33 GMT`.
- `https://www.atlib.jp/business-web/self-check/`: 200 with the same size and timestamp; it does not redirect to the service host.
- Both `self-check.js` assets: 200, 38,873 bytes, same timestamp.
- The service-host response still has the pre-E2c CSP (`script-src 'self'`, `connect-src 'self' https://sales.atlib.jp`); real Turnstile allowances are not yet published.
- The www HTML response did not present the same CSP header as the service-host response in this observation. This is evidence of an unresolved host/policy difference, not approval of either host.

## 2. Implementation inventory

| Area | Implemented in reviewed stack | Not completed / release boundary |
| --- | --- | --- |
| Diagnosis SELF | Public Consultation Lead, Diagnosis and initial `ACCEPTED` history are saved atomically; 201/200 idempotency and commit-after notification behavior are preserved. | Production Diagnosis schema is absent until the unnumbered draft is formally released. |
| Diagnosis PROXY | Existing `BUSINESS_WEB` Sales Activity is authoritative; draft/create/resume/revision/complete/consent audit reuse the B1 calculation and do not create CRM or Public Lead records. | Production schema/config and real staff Human Acceptance remain. |
| Diagnosis list/detail | SELF/PROXY read API, list/detail UI, question-contract reuse, safe rendering and draft-resume route are implemented. | Production migration and candidate-environment acceptance remain. |
| Stage / Outcome / schedule | Explicit staff writes, optimistic revision, actual timestamps and append-only audit are implemented. F2a subsequently approves repeat Stage arrival while retaining the first ACCEPTED as entry. | F2a resolves the lifecycle gate; numbered migration/release verification remains. |
| Commercial Event | Explicit PROPOSED/WON facts, idempotency, NULL/zero distinction and append-only behavior are implemented. | Common `serviceCode` mapping is not approved. Free-text `service_name` cannot satisfy the final Common Contract by inference. |
| D2 sales UI | Existing detail screen supports the four explicit operations, history, safe unknown-result retry and mobile behavior. | Real staff workflow acceptance remains. |
| E1 sales KPI | Business-specific cohort/activity read model and staff API are implemented, including JST/FY, NULL and data-quality semantics. | No Production query has been run; this is not a Common Dashboard. |
| E2 anonymous KPI Backend | Strict public endpoint, dedicated Turnstile verification, fail-closed config, atomic daily aggregation, TEST/PRODUCTION separation, staff read API and least-privilege draft SQL are implemented. | Migration, Production config, real Turnstile, Origin decision and operational monitoring remain. |
| E2 Corporate measurement | Q01-valid-answer start and rendered-result complete hooks are asynchronous, non-blocking and once-per-screen-attempt; event-specific tokens and minimal CSP changes are implemented in PR #80. | PR #74/#80 are not merged/deployed; real Invisible widget, CSP, privacy presentation and E2E remain. |
| E3 Common KPI Adapter | Accepted Diagnosis projection, source-separated identity/attribution, fact milestones, Commercial Events and drill-down are implemented as read-only code. | No common aggregation/dashboard is in scope. Nullable `serviceCode` is an explicit GAP and blocks final Common Contract consumption. |
| Common CRM boundary | Existing Company/Contact/Activity are reused for PROXY; SELF does not manufacture CRM identity; list handoff does not auto-create a Diagnosis. | CRM PR #54–#72 stack is also Draft and must precede Business KAIZEN integration. |
| Marketing Initiative boundary | E2b performs active `BUSINESS_WEB` exact-UTM read-only classification; unregistered raw UTM becomes OTHER without raw storage. | E3a does not claim an intake-time `marketingInitiativeId`, because no immutable reference snapshot exists. No mutable read-time match or backfill is allowed. |

The B1 pure function and Corporate browser logic remain separately distributed with Golden/drift evidence. No new shared build distribution mechanism is part of this release.

## 3. Migration Fit/Gap

Two and only two Business KAIZEN SQL drafts are unnumbered at the reviewed HEAD:

| Draft | SHA-256 / bytes | Direct prerequisites | Runtime dependency |
| --- | --- | --- | --- |
| `UNNUMBERED_business_kaizen_diagnosis_package_a.sql` | `239da79789346ec01afadd9e58f445a8389af667450f3364f6ede7b2467933c0` / 8,021 | Business Web Lead table (025); Company/Contact/Sales Activity tables (027) | Sales Activity attribution (030) for PROXY read projection; app/runtime roles and Production default ACL must be verified. |
| `UNNUMBERED_business_kaizen_anonymous_kpi_daily.sql` | `e5fa76b55c5feacbb3e3149e75a7e686e2f8bc9015c3db78b29634569bb14a77` / 2,050 | PostgreSQL 16 for `UNIQUE NULLS NOT DISTINCT` | Marketing Initiative table (034) is queried by E2b classification; runtime roles need SELECT/INSERT/UPDATE and must not have DELETE/ownership. |

The Diagnosis identity above is the current Release-preparation identity after F2a. It was recalculated from the working-tree file on 2026-11-24 and matches the F2a Source Evidence. At the original F1 audit point, before ACCEPTED re-entry was implemented, the same unnumbered filename had SHA-256 `7dc5405eaeba25ac969161ba12ab0992820c0aa68256fc5f3ec568736391442c` and 7,864 bytes. That old identity is historical evidence only and must not be used to build, allowlist or verify the Release artifact.

Required order is: confirmed prerequisites → Diagnosis schema → Anonymous daily aggregate. The two drafts must become separate immutable migration artifacts and ledger entries. Applying both as an unreviewed combined script is prohibited.

Production `schema_migrations` is the sole numbering authority. No approved Production connection variables (`DB_NAME`, migration user/password, socket/host) are available in this session, so the Production ledger was **not read**. Repository verifiers describe an expected historical state through 036, but that is not evidence of the current Production ledger. Therefore:

- the next number is unknown;
- neither draft may be renamed or numbered;
- migration artifact preparation, application and runtime release are STOP;
- a new `BEGIN READ ONLY` preflight through the established IAP/migration path is mandatory.

That preflight must record PostgreSQL/database identity, every ledger filename/count, absence/presence of both target tables, prerequisite tables/constraints, owners, Production default ACL, role existence, and a no-higher-number assertion based on the observed ledger—not a repository assumption.

## 4. Release gates and classification

| Gate | Classification | Required closure |
| --- | --- | --- |
| `ACCEPTED` re-entry blocked by `business_kaizen_initial_accepted_unique` | **修正必須 — F2aで解決** | `business-kaizen-accepted-reentry-decision-20261124.md` approves re-entry, preserves append-only history and fixes entry at the earliest ACCEPTED. Production release still requires the final numbered SQL and verifier. |
| E3a free-text Commercial `service_name` vs required common `serviceCode` | **修正必須** for Common KPI consumption | Approve a stable mapping/source contract or exclude unmappable Commercial Events from the final common interface with a Canonical rule. Do not invent codes. Core Business KAIZEN may release only if E3 common consumption stays disabled. |
| Corporate baseline regression: 3 existing failures | **受入判断のみ** | Record named owner and either fix in its own lane or approve a time-bounded release waiver proving the same three failures on PR #74. Any new failure is No-Go. |
| Production/Test Turnstile widgets, secrets, actions and hostname lists | **設定確認** | Separate widgets/secrets; exact `diagnosis_start`/`diagnosis_complete` actions; Production must not accept test configuration. Secret stays only in Sales Tools. |
| Official Origin and legacy www | **受入判断のみ** | Decide service-only vs dual-host support. Both hosts currently return 200. Then configure Corporate allowlist, Backend CORS/Origin-hostname pairing, Turnstile hostname and redirects consistently. |
| Corporate CSP and Invisible-mode privacy/branding | **設定確認** | Verify real widget in Staging, script/frame/connect CSP, keyboard/screen-reader/mobile behavior, Cloudflare privacy/terms display and no clipped visible fallback. |
| Production-equivalent runtime ACL | **設定確認** | Reproduce historical default CRUD ACL in rehearsal and verify effective ACL in Production after each migration. Diagnosis history/audit/events reject UPDATE/DELETE; anonymous aggregate permits UPSERT but rejects DELETE/DROP and is not runtime-owned. |
| Production Migration Ledger | **設定確認** | Read with the approved read-only path before numbering. Current status is unconfirmed and blocks release. |
| Anonymous measurement failure behavior | **受入判断のみ** | Accept that Turnstile/API timeout means no count, no retry and no user notification; diagnosis/result/consultation must continue. Define monitoring and incident annotation so KPI gaps are not misread as user behavior. |
| Real-environment E2E | **受入判断のみ** | Pass Staging with real Turnstile, exact action/hostname/Origin, TEST bucket, CSP and failure injection before Production enablement. |
| Access-log IP retention | **受入判断のみ** | The app serializer omits IP/body secrets and the aggregate stores no IP, but Cloud Run/load-balancer logs may retain requester IP. Approve retention/access/deletion policy and privacy wording before enablement. |

## 5. Recommended execution order

The order below preserves current service availability and separates irreversible database work from reversible runtime/traffic changes.

1. Apply the approved F2a ACCEPTED lifecycle resolution and close the remaining E3a serviceCode consumption boundary. Re-run focused PostgreSQL and browser regressions.
2. Resolve or formally waive the three Corporate baseline failures. Rebase/review the complete Sales Tools and Corporate PR stacks in dependency order and establish final clean reviewed SHAs on the intended integration branches/main.
3. Decide official/legacy Origins, Turnstile Production/Test policy, privacy presentation, access-log IP policy and anonymous-outage acceptance.
4. Run the approved Production `BEGIN READ ONLY` ledger/identity/ACL preflight. STOP on any mismatch. Only then allocate two unused consecutive or otherwise approved migration numbers according to the observed ledger.
5. Freeze each SQL byte sequence and create separate allowlist manifests, one-SQL immutable artifacts, checksums and dedicated one-shot Job definitions. Rehearse each from the exact observed Production baseline on PostgreSQL 16 with Production default ACL reproduced.
6. Verify Cloud SQL backup/PITR identity, retention and restore evidence. This is required before the first database write.
7. Under separate approval, apply the numbered Diagnosis migration once. Resolve unknown Job state from Job history and the ledger; never retry speculatively. Run the read-only post-verifier for tables, constraints, triggers, owners and effective ACL.
8. Under separate approval, apply the numbered Anonymous KPI migration once and run its post-verifier, including atomic UPSERT privileges and DELETE/DROP denial.
9. Build Sales Tools from the final reviewed SHA. Deploy a tagged/no-traffic candidate with anonymous KPI disabled. Smoke SELF/PROXY/read/sales/KPI/admin authentication against the candidate. Existing Production traffic remains unchanged.
10. Configure separate TEST Turnstile/backend values and exercise real Staging E2E. Confirm invalid/expired/duplicate tokens and Siteverify outage produce no count while the 15-question flow and consultation continue.
11. Promote the schema-compatible Sales Tools candidate gradually only after database verification and Human Acceptance. Keep anonymous Production ingestion disabled.
12. Build/deploy the Corporate final reviewed SHA as a tagged/no-traffic candidate with measurement disabled. Verify both intended hosts, CSP, consultation and TimeRex without changing existing traffic.
13. Enable TEST measurement on the Corporate candidate and complete desktop/mobile/accessibility/privacy acceptance. Confirm only TEST rows change.
14. Configure Production Turnstile/backend allowlists first; verify the endpoint remains fail closed. Enable Corporate Production measurement last, then shift Corporate traffic gradually while monitoring diagnosis UX, Siteverify errors and aggregate continuity.
15. Record final image digests, revision names, migration execution IDs, ledger before/after, verifier outputs, configuration fingerprints without secrets, E2E evidence and traffic decisions.

No step requires stopping the current public diagnosis. Database migrations are additive; candidates are deployed with no traffic; anonymous measurement remains disabled until the final enablement step.

## 6. Rollback boundaries

- **Database:** there is no automatic down migration. A runtime rollback does not remove tables or undo accepted data. Database recovery requires the separately approved Cloud SQL backup/PITR decision. Never hand-delete ledger rows or tables.
- **Sales Tools runtime:** traffic may return to a previously verified schema-compatible revision. Before rollback, confirm that revision does not assume a missing schema and that new Business KAIZEN writes are either safely ignored or operationally paused.
- **Anonymous Backend:** disable only the anonymous KPI feature/config to fail closed; do not stop Sales Tools. Aggregated rows already committed remain.
- **Corporate measurement:** disable the explicit measurement config or roll Corporate traffic back; the diagnosis, result and consultation flow must continue without measurement. Backend may remain deployed but disabled/unused.
- **Turnstile:** widget/secret rotation is configuration rollback, not database rollback. Corporate never receives the secret.
- **Traffic/DNS:** traffic rollback is independent of schema recovery. Do not change DNS to compensate for an unresolved Origin contract.

## 7. Human Acceptance

- SELF: initial 201 and replay 200 produce one Diagnosis and exactly one initial ACCEPTED history row, preserve Original, and notify only after commit and only once. Later explicit Stage operations may append further ACCEPTED history rows; they must not change the first accepted timestamp or increase the E1/Common entry count.
- PROXY: authoritative Activity identity, draft/resume/revision conflict, consent, completion, no CRM/Lead creation and no automatic ACCEPTED.
- Diagnosis list/detail: SELF/PROXY source separation, safe rendering, stable paging, mobile use and draft resume.
- Sales operations: explicit Stage/schedule/Outcome/Event changes, history/audit, NULL vs zero, unknown-result retry and no inferred events.
- ACCEPTED lifecycle behavior matches the newly approved decision.
- E1 totals match seeded/known facts across JST and February fiscal-year boundaries; no Stage-only proposal/win.
- E3 drill-down opens the exact Diagnosis; unmapped service names are not presented as approved service codes.
- CRM handoff validates `BUSINESS_WEB` and opening the list creates no draft.
- Anonymous start fires once on first valid Q01 answer; complete fires once only after result rendering; tokens differ; TEST and PRODUCTION remain separated.
- Turnstile/API failure never blocks answers, result, consultation or TimeRex; no automatic retry occurs.
- Intended Origin(s), CSP, privacy/terms presentation, keyboard, screen reader and mobile behavior pass with the real widget.
- Operational dashboards/logs describe anonymous values as event counts, not unique-person conversion.

## 8. No-Go conditions

Release is prohibited while any of the following is true:

1. Production ledger or database identity is unavailable/unconfirmed, or a higher/unexpected migration exists.
2. Either SQL draft is still unnumbered, mutable, combined with another migration, or lacks an immutable reviewed artifact and post-verifier.
3. Backup/PITR restore evidence, migration ownership or Production-equivalent ACL evidence is missing.
4. The approved F2a ACCEPTED lifecycle resolution is absent from the final reviewed code/UI/schema or its numbered migration artifact.
5. E3a is exposed to a Common KPI consumer while `serviceCode` is unresolved.
6. The stacked PRs are not integrated/reviewed from their exact bases, or the release SHA is not reproducible from the Production Canonical.
7. Corporate has new regression failures, or the three existing failures have neither remediation nor an explicit recorded waiver.
8. Official/legacy Origin, Turnstile hostname/action/widget separation, CSP or privacy presentation is unresolved.
9. Real Staging E2E, accessibility or outage behavior fails.
10. Cloud Run/platform IP retention policy is unapproved.
11. Any migration Job has an unknown result. Resolve it from Job history and `schema_migrations`; do not rerun.
12. A candidate requires direct Production traffic, DNS or destructive database change to be tested.

Current conclusion at the F1 review point: **NO-GO for Production release.** The implementation stack is substantially complete and isolated tests exist, but ledger/migration identity, two contract gates, Production configuration, Corporate acceptance and real-environment E2E are not closed. The ACCEPTED lifecycle gate is subsequently resolved by `business-kaizen-accepted-reentry-decision-20261124.md`; the other gates remain.
