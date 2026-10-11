# IT経営KAIZEN 無料診断 Design v2 — Package B Persistence Fit/Gap Investigation Contract

Status: READ-ONLY INVESTIGATION / NO MIGRATION / NO CODE
Date: 2026-10-11

## 1. Purpose

Package A pure domain is closed and PASS.

Before Package B persistence implementation is designed or any migration is created, inspect the actual HA6 persistence layer so Design v2 can be mapped onto existing schema and repository assets with the smallest additive change.

This investigation must not modify code, schema, migrations, branches, or Production.

## 2. Design v2 persistence model to map

The read-only investigation must map these logical layers to actual HA6 persistence:

1. Original Survey Snapshot — immutable historical survey answer snapshot created once on completion
2. Current Structured State — append-only / versioned human-updatable Q2-Q7 state
3. Analysis Result — deterministic structured result tied to a Current State revision
4. System Generated Narrative — immutable generated narrative tied to Analysis Result / Current State
5. Human Edited Narrative — separate human edit with CURRENT / STALE semantics

Hearing Record remains observation/provenance only and must not become direct Rule input.

Approved Report / delivery / feedback / audit should be reused where the existing HA6 assets are sufficient.

## 3. Required read-only inspection

### A. Migrations 027-032

Read the full SQL for migrations 027 through 032.

For each table, index, constraint, trigger, enum/check, or FK introduced, report:

- migration filename
- object name
- relevant columns and types
- PK/FK/unique constraints
- update/delete behavior where visible
- purpose inferred from code usage

Do not edit or rerun any migration.

### B. Existing persistence repositories/services

Inspect at minimum:

- `src/services/freeDiagnosisRuleBasedCaseRepo.ts`
- `src/services/vs1ReviewReportFeedbackRepo.ts`
- `src/services/publicCustomerSelfSubmissionService.ts`
- any service/repository directly used by staff proxy or hearing persistence
- any audit repository/service used by the free-diagnosis flow

Identify actual functions for:

- intake upsert / survey submission
- Case creation / status changes
- hearing statement / memo persistence
- structured hearing answer persistence
- rule execution persistence
- report draft persistence
- human review / approval persistence
- approved report snapshot/hash
- delivery
- feedback
- audit

### C. Current schema roles

Determine which physical HA6 object currently acts as:

- Survey Draft / intake transport
- survey completion record
- current/last structured answer, if any
- hearing observation record
- structured hearing answer
- analysis/rule execution record
- report draft
- approved report
- human edit/review
- audit/provenance

Explicitly state whether any current object is mutable/upserted and therefore unsuitable as immutable Original Survey Snapshot.

### D. Transaction boundaries

Inspect the actual code path for customer self completion and staff proxy completion.

Report whether the current code already has a DB transaction spanning any of:

- validate answers
- create/update intake
- create Case
- create initial rule result
- create hearing units
- change Case status

Identify the narrowest existing transaction helper / DB abstraction that Package B can reuse.

### E. Revision / concurrency support

Inspect whether HA6 already has reusable patterns for:

- revision_no
- append-only version records
- previous revision pointer
- optimistic concurrency / expected revision
- immutable snapshots
- hash/versioned report snapshots

Report exact files/tables/functions.

### F. Stale Human Edited Narrative handling

Inspect whether HA6 already has a status/version model that can represent:

- Human Edited Narrative based on a particular Generated Narrative
- CURRENT vs STALE
- preserving old human edits after re-analysis

If not, report the smallest missing capability. Do not design the migration yet.

### G. Audit and governance

Identify the actual existing audit mechanism and whether it can record:

- Original Survey completion
- Current Structured State revision creation
- Human Edited Narrative save
- Report approval/delivery

Also identify any existing retention/deletion hooks that would affect immutable historical records.

## 4. Fit/Gap matrix required

Return a matrix for the following Design v2 logical entities:

- Original Survey Snapshot
- Current Structured State
- Analysis Result
- System Generated Narrative
- Human Edited Narrative
- Hearing Record boundary
- Approved Report reuse
- Audit reuse

For each, classify:

- REUSE AS-IS
- REUSE WITH ADAPTER
- ADDITIVE EXTENSION REQUIRED
- NEW TABLE / OBJECT LIKELY REQUIRED
- AMBIGUOUS / STOP

Support each classification with exact HA6 table/file/function evidence.

## 5. Minimal additive options

After the factual mapping, propose at most two physical persistence options:

### Option A — Minimal additive

Favor reusing existing HA6 tables where semantics are safe, adding only the minimum new persistence objects needed to preserve immutable Original + versioned Current + Generated/Human edit separation.

### Option B — Clear separation

Use dedicated Design v2 persistence objects where overloading HA6 tables would blur semantics or create unsafe update behavior.

For each option, report:

- objects reused
- objects newly needed
- main integrity benefits
- main migration/implementation risks
- effect on existing HA6 flow

Do not choose a migration number or write SQL.

## 6. Non-negotiable guards

The recommendation must preserve:

- Original Survey immutable after completion
- Current State append-oriented / versioned
- Hearing memo not direct analyzer input
- Analysis tied to exact Current State revision
- Generated Narrative immutable per generation
- Human Edited Narrative separate from Generated Narrative
- prior Human Edit preserved and marked stale after state/regeneration change
- Approved Report snapshot/hash remains downstream immutable artifact
- no silent last-write-wins for Current State
- no reuse of migrations 027-032

## 7. Required final verdict

Return one of:

`PACKAGE B PERSISTENCE FIT/GAP: READY FOR CONTRACT`

or

`PACKAGE B PERSISTENCE FIT/GAP: AMBIGUOUS / STOP`

If READY, include the recommended physical mapping and the unresolved decisions that still require product/architecture choice before migration design.

If AMBIGUOUS, list only the missing facts required.

## 8. STOP

After the report, stop.

Do not:

- create migration
- write SQL
- change code
- create branch
- commit
- push
- wire API/UI
- build/deploy
- create HA7
- touch Production
