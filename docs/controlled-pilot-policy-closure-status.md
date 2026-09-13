# Controlled Pilot Policy Closure — Branch Status

2026-09-13. **NO-GO — IMPLEMENTATION / EXTERNAL EVIDENCE CLOSURE REMAINS.**

## Verified baseline and SSOT

- Branch: `feat/controlled-pilot-policy-closure`, starting HEAD `70bbd91fbdb0d25e8bcfcf5d31ef1e0744a1b99a`.
- [PR #2](https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/2): OPEN / DRAFT, base main. No merge/deployment performed.
- Baseline [CI 34758590544](https://github.com/yoshihisahagisaka/atlib-sales-tools/actions/runs/34758590544): SUCCESS at that exact HEAD. It did not run browser or real PostgreSQL tests.
- SSOT: `git_KAIZEN` `origin/dev/controlled-pilot-closure-v2` at `a3844f88a9ee5afe71aefdb2e60168debd9f01ed`, docs/66–70 read in full. Its main only contains 66–67 and is not the complete handoff.
- docs/69 and PR description cite older A/B evidence. docs/70 and current code already contain C/D foundations; these were reused.
- Final implementation SHA: the commit containing this report (`git rev-parse HEAD`). Baseline CI is not evidence for subsequent commits.

## Fit/Gap

| Slice | Verified fit | Remaining status |
|---|---|---|
| A | Acknowledgement, atomic WEB creation, separate Transcript consent/DB insert guard | Technical tests PASS; approved Legal/Privacy copy/link and deployed enablement BLOCKED_EXTERNAL |
| B | Human deletion scope/decision, retention metadata/preview; purpose-completion API/UI now added | Partial PASS; destructive worker and complete table classification OPEN |
| C | External-manifest replay foundation and retry-safe masking reused | Local tests PASS; external export job/storage OPEN, real Cloud SQL restore BLOCKED_EXTERNAL |
| D | AI-01–04 boundaries, AI-02/03 Transcript default-deny reused | Local tests PASS; real provider and retention/privacy BLOCKED_EXTERNAL |
| E | Existing diagnosis regression and Human Gates; CI expanded | Management five-block translation, Pilot Evidence Capture and A–F acceptance mapping OPEN; staging/owners BLOCKED_EXTERNAL |

## This change

Staff `POST /cases/:id/sources/:sourceId/purpose-completion` under the existing admin API accepts `{ completedAt: ISO8601 }`. Workspace Transcript cards accept the actual completion timestamp and show the 90-day maximum, including after diagnosis Finish. The command locks the case/source, checks same-case Transcript ownership, rejects invalid/future/pre-storage times, and writes completion plus actor/time/source audit atomically. Exact retry is idempotent; a different timestamp cannot extend the clock. Revoking consent does not prevent recording completion for already captured data.

Historical pre-import purpose completion requires a separately reviewed operational path; this command rejects pre-storage timestamps rather than inventing them. Source content is unchanged; no FACT or Decision is created.

Retention dry-run excludes held classes from eligible counts and exposes Transcript rows lacking purpose completion. Destructive mode remains disabled. The preview remains partial: it is not a complete Survey/Participant/AIProposal/Approved Evidence deletion plan, and General Raw still uses 365 days rather than a calendar year. Resolve these before destructive execution.

No new migration: reuse 013 `purpose_completed_at` and audit storage. No existing migration rewritten. No new FACT Core Object, automatic atLIB Actor, AI authority or external SLA.

Restore runbook now requires external-manifest completeness/integrity, replay, Approved-record integrity and application smoke before traffic restoration. VERIFY checks target existence, not whether data has been erased. Field masking is not claimed as full Case anonymization.

## Local validation

Windows Node `24.18.0`: clean `npm ci` and build PASS. CI remains Node 22; deployed image unverified.

| Check | Result |
|---|---|
| diagnosis / preparation / workspace / review / report / handoff | 75 PASS, 3 live-provider checks SKIPPED / BLOCKED_EXTERNAL |
| readiness security | 3 PASS |
| policy closure | 4 PASS: purpose clock, auth/cross-site, wrong case/type, invalid times, retry, Hold, non-sensitive audit |
| restore/AI closure | 3 PASS |
| Real PostgreSQL 17 disposable loopback DB | 7 PASS including parent; 6 scenarios: main-through-012 upgrade, legacy upgrade/rollback/rerun, concurrent claims, Human conflict/immutability, WEB and SALES_VISIT synthetic E2E |
| Browser desktop/mobile | 32 PASS, including notice acknowledgement and purpose completion after Finish/reload |
| npm audit | 7 moderate, 0 high/critical; unresolved, lockfile unchanged |

Real PostgreSQL fixtures now record WEB acknowledgement and separate Transcript consent. Migration checks cover main through 012 and the actual full ledger instead of hardcoding 12. Browser fixtures perform the real acknowledgement and consent preconditions. Production guards were not weakened. CI now includes PostgreSQL 17 and Chromium desktop/mobile tests. Synthetic AI/stub OAuth are not external evidence.

Audit findings: `qs` via Express (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g), `uuid` via Google clients/gax/retry-request/teeny-request (GHSA-w5hq-g745-h8pq). Review target upgrades/runtime reachability before dependency changes; no automatic audit fix applied.

## Remaining Critical Path

1. B: exact table/field mapping, calendar-year/five-year clocks, Hold lifecycle, Human-approved execution semantics and idempotent worker. Preserve Approved provenance; do not equate masking with irreversible anonymization. Enablement requires staging/review or explicit Business-approved Pilot restrictions; none assumed.
2. C: externally durable manifest export/job, access/integrity/completeness controls, isolated Cloud SQL restore/replay/integrity/smoke; measure internal RPO/RTO ≤24h and backup 30d.
3. D/platform: real Anthropic AI-01–04/provider retention, Secret/IAM, Google allowed/disallowed OAuth, Cloud Run worker/scale/lease, proxy/rate-limit, Monitoring delivery; resolve seven moderate findings and verify deployed runtime.
4. E/Business: approved Legal/Privacy copy/link, named owners, five-block management view, minimal Pilot Evidence Capture, docs/65 A–F fixtures, real WEB/SALES_VISIT staging E2E.
5. Reevaluate docs/32 A–K using current external evidence and Human decision. No Production/Pilot GO from local/CI success.

Current docs/32 evidence inventory: A local build PASS/deployment unverified; B Cloud SQL BLOCKED_EXTERNAL; C secrets BLOCKED_EXTERNAL; D real AI BLOCKED_EXTERNAL; E real OAuth BLOCKED_EXTERNAL; F Cloud worker BLOCKED_EXTERNAL; G local PostgreSQL concurrency PASS; H FAIL/open dependencies, lifecycle and Legal controls (BD-01–05 themselves RESOLVED by doc66); I alerts BLOCKED_EXTERNAL; J cloud restore BLOCKED_EXTERNAL; K staging E2E BLOCKED_EXTERNAL. This inventory is not a completed external gate run.
