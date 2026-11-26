# Sales Tools Common Foundation R3 Release Gate

Date: 2026-11-26 (JST)

## Candidate identity

- Main baseline: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Production source: `0ea3dd4084084972a0ba820f73a5a9c47878bb47`
- Common Foundation source: `92ac86b32918e52b5b6bfdfe47c9fc1f5deab1bf`
- R2 preview: `68b6d46d90c1f55bb1e31922ce1c33a7a6c24b1d`

The R3 review branch is the only integration path proposed for this release. It contains the three production-ahead commits followed by the ten Common Foundation commits. PRs #54 through #118 must not also be merged after this integration PR, because doing so would duplicate the same source history.

R2 verified that the production-owned Dockerfiles, public diagnosis UI, security overlay, and `package-lock.json` remain byte-identical to Production Source. All 29 Common Foundation changed-file blobs remain identical to PR #118. The integration produced no conflict.

## Isolated gates

The `sales-tools-common-r3-candidate` workflow runs only by explicit dispatch. It performs application regression, the existing PostgreSQL 16 P2b test using migrations 027/033/035, and a no-push runtime image build. The image gate verifies the non-root user, removed npm/npx tooling, source-revision label, production dependency audit, and a Critical/High Trivy report. The reports are artifacts; no image is published.

Two existing vertical-slice failures are retained as explicit debt: Sales Activity acquisition-source filtering and the source-text server-wiring assertion. The workflow fails if the known-debt result is not exactly two failures with those identities.

## Inherited production gates

The following evidence is not recreated here: the 2026-11-25 Production Migration Ledger measurement, Migration 036 append-only ACL and role evidence, the strong `sales_tools_app` privileges, and the current Cloud Run secret-hygiene issue. They remain release inputs.

Both Production Source and this candidate contain `GET /healthz`. The observed Production 404 therefore remains a runtime-image/revision/routing provenance gate and is not addressed by a speculative source change.

## Current decision

Source integration is suitable for isolated candidate verification. Candidate deployment remains NO-GO until the exact final GitHub HEAD has passing R3 application and PostgreSQL jobs, the runtime image scan has been reviewed, `/healthz` provenance is resolved, and the inherited Production permission and secret gates have an explicit acceptance or remediation decision.
