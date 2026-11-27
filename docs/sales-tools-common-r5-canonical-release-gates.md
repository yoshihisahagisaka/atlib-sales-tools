# Sales Tools Common Foundation R5 — Canonical integration & Release Gates

Date: 2026-11-27 JST
Status: DRAFT / Production no-traffic candidate deploy **NO-GO**; Production traffic change **NO-GO**.

## Canonical source lineage

Repository: `yoshihisahagisaka/atlib-sales-tools`.

- `main` at integration checkpoint: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`.
- PR #119: R3 integrated Production-ahead 3 commits and Common Foundation 10 commits into one chain.
- PR #120: R4a dependency/runtime security remediation.
- PR #121: R4b Node.js 24 runtime verification (exact HEAD `9ef708f74197c9b62c09ee3b4abf4479eb58852e`).
- PR #124: R4c non-reserved public `GET /health` and tests, exact HEAD `2b3c79516f726e63674f6754d667787b73d7b4aa`.
- PR #122: operator-supplied VM Runbook, solely `docs/sales-tools-test-runner-vm-runbook.md` at `a9564aded2390dbbf37cb6127cd42a5f950bbb67`. This R5 branch copies and updates that **one document**, rather than merging the PR's six documentation commits.
- **R5 candidate**: linear descendant of PR #124, plus a single updated VM Runbook and this Release Gate record. Use the **current exact R5 PR HEAD** as source identity for all future checks; it is not either parent HEAD.

The **only proposed main integration path** for this Common Foundation candidate is the R5 Draft PR. Do not additionally merge #119/#120/#121/#122/#124, nor the previously integrated service Common Foundation PR stack (#54/#57/#68/#72/#115/#117/#118), into main: that would duplicate history/content. This candidate does not integrate unrelated Business KAIZEN or paid Assessment branches.

The existing 2026-10-03 Production Canonical rule still applies: a specific commit on main must ultimately reproduce Production management functionality. **Opening a Draft PR is not a merge or Production release.**

## Verified evidence — avoid redundant reruns

| Evidence | Result / provenance |
| --- | --- |
| PR #124 GitHub Actions | Run [45920317788](https://github.com/yoshihisahagisaka/atlib-sales-tools/actions/runs/45920317788): exact HEAD, all three jobs SUCCESS; application, PG16, security evidence |
| VM HTTP | PR [#124 evidence comment](https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/124#issuecomment-7207198656): exact R4c SHA, synthetic disposable PG16, localhost-only HTTP: `/health` and `/healthz` 200 `ok`, Staff redirects/401, OCI revision/user, cleanup PASS |
| Runtime | Node 24 and Chromium PDF byte generation passed within PR #124 CI; VM smoke verified application HTTP but did not rerun all CI |
| Known application debt | Existing vertical-slice 2 failures unchanged (acquisition-source filtering; source-text server-wiring assertion). They are **not** new R4c regressions, and still need release acceptance or targeted remediation. |
| Historical Production HTTP | 2026-11-26 Cloud Shell: `sales-tools` 100% traffic `sales-tools-fds-20261124-01`; GFE returned 404 at `/healthz` for service, tagged revision, and public domain. `/admin/` 302 and `/` 200. GFE `/health` **has not** been verified. |

R5 adds **documentation only** on top of the already-tested PR #124 application tree. Check for exact file-diff identity and one documentation transfer; run only the mandatory exact-R5-SHA validation gates required by release policy, not an automatic repetition of already passing functional suites.

## Release Gate decision matrix

| Gate | Classification | Current evidence and required next decision |
| --- | --- | --- |
| R4c `GET /health` in VM | **VERIFIED PASS** | 200 `ok`; no Production credentials or DB. |
| R5 source identity and unified main candidate | **IN PROGRESS** | R5 PR head must include all #119→#124 changes plus #122 Runbook exactly once; verify against R4c tree, CI for final exact SHA. Do not merge yet. |
| Trivy remaining findings | **EXPLICIT SECURITY DECISION REQUIRED** | R4c Actions logged Critical 4 / High 136 / `fixedAvailable=0`; this records scanner data, not a waiver or proof that upstream fixes can never appear. Do not silently accept/suppress. |
| Production `schema_migrations` ledger / Migration 036 append-only ACL | **READ-ONLY DELTA RECHECK REQUIRED** | Reuse 2026-11-25 Production evidence, verify only changes since then before release. Existing migration numbers and history are authoritative; no production DDL in R5. |
| `sales_tools_app` privileged membership / CREATE | **REMEDIATION OR SECURITY EXCEPTION REQUIRED** | Broad role privileges observed in earlier production evidence. No IAM/DB role changes in this candidate. Resolve before Traffic authorization. |
| Production Secret hygiene | **REMEDIATION REQUIRED** | Sensitive plaintext-style production config risk previously observed. Do not display or copy secret values. Define separately reviewed remediation and verification before Release GO. |
| Attribution mismatch | **ACCEPTANCE OR TARGETED FIX REQUIRED** | Pre-existing acquisition-source filtering failure; confirm business impact, workaround, and owner decision. |
| Inherited vertical-slice server-wiring assertion | **EXPLICIT ACCEPTANCE OR FIX REQUIRED** | Source-text assertion brittleness is a separate known test debt, not proof of application failure. Maintain explicit owner/impact decision. |
| GFE `GET /health` | **NOT VERIFIED** | Requires **separately approved** no-traffic Cloud Run candidate, then HTTP 200 `ok` on tagged URL. Existing `/healthz` must not be used for external monitoring. |
| Image digest / source / service account traceability | **PENDING DEPLOY APPROVAL** | Pin exact source SHA, immutable image digest, deployed revision and configured SA. No image push or Cloud Run update until approved. |
| Rollback | **PENDING RELEASE FREEZE** | Record and check previous `sales-tools-fds-20261124-01` revision and its immutable image digest before touching traffic; rollback is a separately approved step. |
| Production no-traffic candidate deploy | **NO-GO** | Hold until required decisions and identity/read-only gates are satisfied; VM/GitHub Actions PASS alone is not authorization. |
| Production traffic change | **NO-GO / SEPARATE APPROVAL** | Must follow successful no-traffic tagged smoke, reviewed risks, operator approval, and runbook-defined rollback path. |

## Boundaries

- No production Cloud Run deployment, image push, traffic update, DB migration, Secret/IAM modification, or main merge is approved or performed by this docs integration.
- Avoid unauthorized Production cloud reads that expose config values. For security controls, log presence/type and decision without secret contents.
- No new GCP resource; reuse `atlib-test-runner` for bounded synthetic testing when needed.
- Preserve product-specific ownership: Business KAIZEN, IT paid Assessment, and other service-level adapters remain outside this Common Foundation Release Candidate.
- The R5 PR and this document establish **what remains blocked**. They are not a risk acceptance or a completed production release.

## Next controlled sequence

1. Verify R5 PR actual HEAD and Git tree; compare R5 against R4c (#124) for only the two intended documentation files and confirm PR #122 Runbook content reflected once.
2. Verify final-SHA GitHub Actions checks; if a mandatory release check fails, fix only the demonstrated issue.
3. Present the unresolved risk/permission/secret/attribution gates for explicit decisions and arrange limited read-only Production delta inspection.
4. Obtain separate approval **before** any immutable image push and no-traffic candidate deploy.
5. Only then test GFE `GET /health` on candidate tag and review rollout/rollback. Production traffic requires a subsequent approval.
