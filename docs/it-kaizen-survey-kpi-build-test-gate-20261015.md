# IT経営KAIZEN Survey KPI — Build & Test Gate
Date: 2026-10-15
Branch: feat/it-anonymous-survey-kpi-vs1-20261014
Status: TEST COMMANDS PREPARED; RESULTS NOT YET OBSERVED

## Before executing
1. In the existing Windows Sales Tools worktree, confirm `git status --short`, `git rev-parse HEAD`, and `git fetch origin`. Do not overwrite uncommitted work.
2. Use a clean worktree on the feature branch. Confirm the branch includes the approved latest SHA from this checkpoint.
3. Confirm Node >=20 and use the repository lockfile with `npm ci` (not npm install) if dependencies are not already installed. Never load Production secrets for unit tests.

## Local commands (PowerShell)
```powershell
git status --short
git rev-parse --short HEAD
npm run build
npm run test:survey-kpi
```

## Gate interpretation
- Any compile error, test failure, missing dependency or route regression = STOP. Record exact output and SHA; do not claim PASS.
- Existing public self-submission, admin authentication, test-case designation, marketing initiative and diagnosis flows require separate regression checks before release.
- The new test suite includes source-contract tests and mocked API tests. It does not establish PostgreSQL migration correctness, Cloud Run network security, real OAuth login, or end-to-end test-case provenance.
- Run PostgreSQL migration rehearsal and concurrent atomic upsert tests only after an approved numbered migration and DB permissions review.
- The feature branch currently contains deliberately unmounted API routes and a staff test submission guard returning STAFF_TEST_PROVENANCE_NOT_IMPLEMENTED. Do not enable the test URL or merge to main as a completed feature.

## Follow-up engineering gates
1. Resolve staff test consent provenance and approve test-only receipt design.
2. Coordinate migration number with the separate Business KAIZEN lane.
3. Apply migration to disposable/staging DB; validate runtime ACL and rollback plan.
4. Wire authenticated test entry, public count API and summary API, and verify that public submissions remain unchanged.
5. Verify start/completion counters with real browser navigation, failed telemetry, repeated visits, and authenticated test exclusion.
6. Obtain explicit release approval before Production migration/deploy.
