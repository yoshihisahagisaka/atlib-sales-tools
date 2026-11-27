# IT経営KAIZEN 設計Assessment — Scope / Price separation and next engineering slice
Date: 2026-11-17
Status: USER DECISION — DEVELOPMENT PRIORITY
Branch: feat/it-kaizen-paid-assessment-20261117

## Decision
User explicitly directed: Scope and price are commercial/operational matters; separate them from system engineering and proceed with system development.

### Excluded from engineering scope
- Human Final Scope/Price Decision table, workflow, authorization/RBAC, pricing rule enforcement, approval chain, UI, quote calculations.
- Commercial final decision is NOT a precondition for technical Design v2 Handoff, Assessment case creation, or FACTACT integration.
- Do not alter or delete existing system recommendation artifacts; simply do not build new commercial workflows.
- Existing `docs/it-kaizen-assessment-human-commercial-decision-fit-gap-20261117.md` is a historical analysis, not an implementation gate after this user decision.

## Technical engineering boundary
- Reuse `readDesignV2AssessmentEligibility()` (commit 56a0be16880fbb9875c0a154ee6e3437cbba0371) as a read-only projection of the latest `DESIGN_ASSESSMENT` feedback decision and approved delivered report; not proof of contract/payment.
- Next bounded slice: versioned Design v2 source-context Handoff to paid Assessment application, preserving case/decision/report references, hashes, provenance, immutable snapshot, idempotency and authorized internal access. No legacy table/FK mutation and no FACT promotion.
- FACTACT API/tenant mapping remains a separate Product lane contract; no guessed network transfer.
- Existing immutable decision/report storage and old handoff snapshot/hash semantics should be reused wherever compatible.

## Required implementation design gates (technical only)
1. Confirm exact current eligible projection contract and current branch SHA.
2. Choose smallest additive v2 Handoff persistence and read contract, reusing existing patterns; explicitly specify schema/unique keys, state transitions, locking, version and hash checks.
3. Identify existing staff auth and route registration patterns for authorized operations; do not build pricing approver roles.
4. Define deterministic local tests for repeat request, competing requests, stale source, wrong case, unauthorized actor, and immutability.
5. Have Codex implement only the approved file-level specification; local tests only, no production migrations or deployment.

## STOP
No new generic CRM, sales quotation engine, price approval system, FACTACT Core or duplicate FACT store. Billing quota 5→8 remains pending; no GCP operations.
