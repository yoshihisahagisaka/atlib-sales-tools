# SECU:MIE Insight Production Release Gate A

- Date: 2026-11-14 JST
- Release base: `5afb0ec2c0ba6f813c88c888b391b48c5a0148bc`
- Release branch: `release/secumie-insight-production`
- Production status: No-Go
- GENERAL: disabled (`PIRA_GENERAL_ENABLED=false`)

## Integration result

`main` (`850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`) is an ancestor of the release base. PR #36, #43 and #45 are ancestors of PR #46, so a single release PR from this branch to `main` carries the approved stack without cherry-picking or merging the historical Draft PRs individually. At review time the release branch is 82 commits and 125 files ahead of `main`.

The review found no new blocking defect in the OTP/PIRA runtime, separate database pools, migrations 037-041, PIRA administration, JWT/JWKS/jti handling, GENERAL fail-closed behavior, or runtime secret contract. Existing Staging Migration, DB Acceptance, Synthetic E2E and JWT replay evidence was reused and not re-executed.

## CI contract

`.github/workflows/secumie-production-release-gate.yml` adds five independent jobs:

1. OTP/PIRA `linux/amd64` runtime image builds and Docker Scout Critical/High gates without a Registry push.
2. TypeScript build, migration manifest, SECU unit/contract regression, and Critical/High dependency gate.
3. PostgreSQL 16 OTP/PIRA/admin/role regression in isolated databases.
4. Mock browser OTP/PIRA flow and HA-1 regression.
5. The inherited KAIZEN Golden baseline, explicitly non-blocking and owned by the business KAIZEN lane.

The fifth job does not alter or omit the existing Golden test. The affected rule-engine and test blobs are identical to `main`; their two known failures are recorded rather than silently treated as SECU regressions.

## Local release verification

| Check | Result |
| --- | --- |
| TypeScript build | PASS |
| SECU targeted unit/contract tests | 21 PASS / 0 FAIL / 1 environment SKIP |
| PIRA mock browser / HA-1 | 3 PASS |
| Migration manifest 037-041 | PASS, exact five-file manifest |
| `npm ls --omit=dev` | PASS |
| `npm audit --omit=dev` | Critical 0 / High 0 / Moderate 7 |
| Full Golden sample | 173 PASS / 2 known main failures / 4 SKIP |

The local PostgreSQL endpoint was not running during Gate A. PostgreSQL-backed browser tests were therefore not counted as PASS locally; the new CI service container owns that release check. No Staging or Production database was accessed.

## Moderate dependency reachability

| Dependency path | Reachability | Gate A decision |
| --- | --- | --- |
| `qs` via Express/body-parser | Network reachable. Express parses query strings on public and staff routes. OTP/PIRA JSON bodies are strict and bounded, but the process-wide query parser remains a potential DoS surface. | Track as the highest-priority Moderate. Do not update blindly; validate an override/update against all existing routes. |
| `exceljs -> uuid@8` | Reachable only from authenticated PIRA XLSX export. The vulnerable UUID buffer APIs are not called by application code. | Record and monitor. Do not apply the audit-proposed incompatible ExcelJS downgrade. |
| `gaxios -> uuid`, `google-gax -> retry-request -> teeny-request -> uuid` | Reached through Google client libraries, principally Secret Manager/configuration. Inputs are service-controlled; application code does not invoke vulnerable UUID buffer forms. | Record and monitor pending compatible upstream updates. |

No dependency was changed in Gate A. Any dependency change remains a separate minimal-change review.

## Remaining release gaps

- CI must complete on the release PR.
- The business KAIZEN lane must decide whether implementation or Golden expectations own the two inherited failures.
- OTP/PIRA images must be rebuilt from the final approved release commit, scanned, pushed, and fixed by immutable digest.
- Production Cloud SQL/database/roles, runtime Service Accounts, Secrets, Cloud Run services, Sales Tools SECU pool, retention Job, LB/DNS/certificate, monitoring and rollback remain uncreated and separately approval-gated.
- Staging Cloud SQL assets remain subject to the 2026-11-20 10:12 JST cleanup decision; nothing is deleted automatically.

## Stop conditions

Critical/High detection, CI contract failure, migration manifest mismatch, immutable image digest mismatch, GENERAL enablement, over-broad IAM/Secret access, database capacity failure, or impact to existing Sales Tools/PPAP/www.atlib.jp stops the release. Production remains No-Go until a separate construction approval and final publication approval.
