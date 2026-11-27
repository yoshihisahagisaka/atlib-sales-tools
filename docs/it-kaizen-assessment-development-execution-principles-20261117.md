# IT経営KAIZEN 設計Assessment — Development Execution Principles

Date: 2026-11-17
Status: USER-DIRECTED WORKING RULE / NO PRODUCTION CHANGE
Applies to: IT経営KAIZEN design/orchestration lane and bounded Codex tasks.

## Authority and source of truth
1. Existing Git current state, Business/Product Canonical, ADR, Decision Log, PR/Issue, migration/Production ledger, test evidence are authoritative. The current chat does not re-decide established business/product choices.
2. Inspect only evidence needed to resolve a named FIT/GAP/CONFLICT/UNKNOWN. Reuse existing knowledge and previous investigations. No repository-wide exploratory sweeps without a concrete unresolved question.
3. Separate confirmed implemented, approved but not implemented, proposed, unknown and superseded. No inference of Production state from source code alone.
4. Keep IT経営KAIZEN Business/Application responsibility separate from FACTACT Product/Core authority and 業務KAIZEN lane.

## Design authority and Codex execution
5. This orchestration lane completes architecture and code-level design BEFORE Codex implementation: precise files/symbols, type/interface, input/output, lifecycle, data mapping, authorization, idempotency, transaction/audit behavior, failure modes, test fixtures and expected assertions.
6. Codex receives only bounded investigation, implementation and verification instructions. Do not delegate product design, ambiguous architecture, new Core objects, business decisions or scope expansion to Codex.
7. A Codex task must include: baseline SHA, relevant Canonical and exact paths, objective, allowed files/functions, prohibited changes, stepwise algorithm, acceptance tests, evidence to return, STOP/escalation triggers. If facts differ, report FIT/GAP and STOP before implementation; do not improvise.
8. Minimize changes: use existing implementation and shared contracts; avoid duplicate Fact registry, analysis engine, CRM or unneeded abstractions.
9. If unknowns block code-level design, perform a bounded read-only investigation first, review evidence here, then issue an implementation-only instruction.
10. On completion, this lane reviews actual diffs/tests against contract before approving merge or release; Codex self-report is not approval.

## Assessment-specific gates
11. FACTACT remains authoritative for domain FACT/Evidence/provenance/verification; IT経営KAIZEN Assessment owns its business decisions, options, roadmap and customer deliverables. No new duplicate FACT store.
12. Cross-system integration candidate document is NOT an approved endpoint/schema contract. No Codex implementation against guessed FACTACT API. Await FACTACT Product lane FIT/GAP on exact existing interfaces.
13. Google Billing quota increase 5→8 is submitted/pending. No project billing/API activation, Cloud Run/SQL execution or Production writes on assumption of approval.
14. KPI, common dashboard and generic sales management are deferred; no incidental implementation.
15. Reuse approved Business Canonical: standard Assessment ¥1.2m excl tax, Human Decision, Word-type improvement plan→PDF, executive slides, Evidence Book. Do not substitute obsolete 8-chapter-only or ¥800k-default design.

## Required task handoff skeleton
- Goal and explicitly excluded work
- Baseline commit SHA and authoritative source paths
- Confirmed FIT and exact GAP to address
- File/symbol-level changes and algorithm
- Input/output, state, permissions, error/rollback and audit rules
- Tests (named cases and expected assertions), non-regression
- Allowed execution environment and no-go gates
- Evidence format (diff, commit, test output, unresolved issues)
- STOP when an unapproved decision or contract mismatch is found

## Immediate next action
Review the already written Assessment × FACTACT integration candidate against actual existing Sales Tools Design v2 Handoff and FACTACT Product lane response. Produce a narrow source-level compatibility matrix; no API implementation until the target interface is approved.
