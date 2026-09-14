# Controlled Pilot Policy Closure — Branch Status

2026-09-14. **NO-GO — EXTERNAL EVIDENCE / OPERATIONAL CLOSURE REMAINS.**

## Verified baseline and SSOT

- Branch: `feat/controlled-pilot-policy-closure`.
- PR #2: OPEN / DRAFT, base `main`. No merge/deployment performed.
- Implementation code head validated by full CI: `46f8d218c4106e573dbc8921cb5f938541f26189`.
- Full CI run `34793748001`: **SUCCESS**.
- SSOT: `git_KAIZEN` `dev/controlled-pilot-closure-v2`, docs/66–71.
- Business Canonical: `docs/66-customer-data-ai-continuity-business-policy-v1.md`.

## Fit / Gap

| Slice | Verified fit | Remaining status |
|---|---|---|
| A | Acknowledgement, atomic WEB creation, separate Transcript consent/DB guard | Technical PASS; approved Legal/Privacy copy/link and deployed enablement BLOCKED_EXTERNAL |
| B | Human deletion scope/decision, Transcript purpose completion, Holds, retention preview, Human-approved anonymization worker, Organization identity classification, structured AI Proposal wipe | Application/CI PASS for current exact mapping; Approved Evidence 5-year destructive expiry deliberately disabled |
| C | External-manifest replay for current anonymize targets; RESTRICT_RETAIN non-destructive provenance | Application PASS; durable external export/storage and real Cloud SQL restore BLOCKED_EXTERNAL |
| D | AI-01–04 authority boundaries; AI-02/03 Transcript default-deny; Raw AI application storage lifecycle widened to structured AI proposal payload | Application PASS; real provider + provider retention/privacy BLOCKED_EXTERNAL |
| E | Five-block Management Feedback translation, coded Pilot Evidence Capture, A–F test mapping, real PostgreSQL + browser CI | Application/CI PASS; actual Human A–F role-play, named owners and real staging E2E remain OPEN/BLOCKED_EXTERNAL |

## Retention / Deletion exact mapping

`RetentionDeletionWorker` executes only an already Human-approved deletion request. It does not create, approve or widen deletion scope.

### GENERAL_RAW_DIAGNOSIS

Current anonymization:
- `survey_responses.raw_value_json` → JSON null while retaining ID/reference integrity.
- non-Transcript `source_records` raw content → `[REDACTED]`, speaker/external raw reference removed.
- `participants` identity → pseudonymous replacement, phone/job title removed, relational ID retained.
- `organizations.name` → pseudonymous replacement **only when the Organization belongs to exactly one Diagnosis Case**.

A shared Organization fails closed with `SHARED_ORGANIZATION_CLASSIFICATION_REQUIRES_REVIEW`. The worker will not alter another Case as a side effect.

### TRANSCRIPT_RECORDING

Transcript `source_records` are handled independently from General Raw and anonymized after the Business-defined lifecycle / Human-approved execution path.

### RAW_AI_IO

Current anonymization:
- `ai_executions.input_snapshot_json` → `{}`.
- `ai_executions.raw_output_json` → NULL.
- `ai_proposals.title` → `[REDACTED]`.
- `ai_proposals.content_json` → `{}`.

Execution/proposal IDs, process/provider/model/status metadata and Human/source provenance remain. Structured `ai_proposals` are treated as AI output rather than being silently retained after provider raw output has been parsed.

### APPROVED_DECISION_EVIDENCE

This class remains **non-destructive / RESTRICT_RETAIN** in the current worker.

The policy-expiry read model now exposes an explicit inventory including:
- APPROVED/DELIVERED reports.
- READY/TRANSFERRED/ACCEPTED handoffs.
- HUMAN_APPROVED insights.
- Human Reviews.
- Assessment Confirmation Items.
- lifecycle transitions.
- audit logs.
- policy acknowledgement records.
- Transcript consent records.
- deletion request records.

This closes the inventory gap without turning inventory into automatic deletion authority. Exact 5-year expiry destruction/anonymization semantics require separate review.

## Restore consistency

ANONYMIZE tombstones can now replay:
- SourceRecord raw fields.
- SurveyResponse raw values.
- Participant identity.
- Organization identity.
- AIExecution raw I/O.
- AIProposal generated wording/payload.

`RESTRICT_RETAIN` remains Human-decision provenance and is not treated as a physical erase target. Physical row DELETE remains fail-closed.

Application reconciliation is not the external continuity gate: the manifest must still be stored durably outside the database/backup lineage and exercised in a real Cloud SQL restore rehearsal.

## Management Feedback Translation

The management-facing five blocks now align to the Business Launch Gate while preserving stable internal section keys:

1. `FUTURE` — 実現したい会社の未来
2. 現在分かっていること / 現時点で分からないこと
3. `GAP` — Futureとの差（Gapの可能性）
4. `WHY` — なぜこのGapが起きている可能性があるか
5. `NEXT DECISION` — 次に確認・判断すべきこと

`ROOT_CAUSE_HYPOTHESIS` is shown under WHY. `KAIZEN_DIRECTION` and `EVIDENCE_CANDIDATE` are shown under NEXT DECISION as candidates. No FACT/Decision authority is added by this Translation Layer.

## Pilot Evidence Capture

A minimal staff-only Pilot Evidence endpoint now records coded operational signals using existing audit storage rather than a new Core Object/table.

Captured categories include:
- customer segment / entry trigger / Future theme.
- completion/abandonment.
- confusing question codes / UNKNOWN patterns.
- operator correction / AI misclassification categories.
- management feedback reaction.
- whether Assessment need was understood.
- next action / customer feedback signal.

The event intentionally excludes raw customer quotes, contact details, Transcript text and arbitrary free-form notes.

## Business Acceptance A–F

`docs/business-launch-acceptance-a-f-v1.md` maps doc65 cases A–F to current automated controls.

Automated coverage is **not** considered a substitute for internal Human role-play. The actual management-feedback flow must still be exercised for A–F and recorded before external Controlled Pilot GO.

## Validation evidence

Full GitHub Actions run `34793748001` at code head `46f8d218c4106e573dbc8921cb5f938541f26189`: **SUCCESS**.

Passed:
- npm ci / TypeScript build.
- diagnosis / preparation / workspace / review / report / handoff.
- readiness security / policy closure / restore-AI closure.
- retention-deletion suite, including Organization fail-close and Raw AI structured-output lifecycle.
- Pilot Evidence suite.
- real PostgreSQL 17 readiness suite.
- Chromium desktop/mobile browser suite.

Real AI/provider checks are still not CI evidence for the external provider gate.

## Remaining Critical Path

1. **C continuity:** durable external reconciliation-manifest export/storage with access/integrity/completeness controls; real Cloud SQL backup/PITR/isolated restore/reconciliation/smoke; measure internal RPO/RTO <=24h and verify 30-day backup retention.
2. **D/platform:** real Anthropic AI-01–04 and provider retention/privacy evidence; Secret Manager/IAM; real Google allowed/disallowed OAuth; Cloud Run worker/scale/lease/request-outside-CPU/deploy-shutdown behavior; proxy/rate-limit; Monitoring alert delivery; deployed Node runtime; moderate dependency review.
3. **E/operation:** final Legal/Privacy-approved customer copy/link; named B9 operational owners and failure/correction/duplicate handling; Human A–F role-play; real WEB + SALES_VISIT staging E2E.
4. **Approved Evidence lifecycle:** keep 5-year expiry execution fail-closed until exact immutable/accountability semantics are separately reviewed; this need not be silently widened merely to reach Pilot.
5. Re-run `docs/32` Production Readiness Gate against current code/environment/Evidence and return Controlled Customer Pilot GO / CONDITIONAL GO / NO-GO.

## Current Gate

Controlled Customer Pilot: **NO-GO — EXTERNAL / OPERATIONAL CLOSURE REMAINS**.

Business Decision BD-01〜05: **RESOLVED**.  
Current application-level Retention/Deletion classification: **MATERIALLY CLOSED / CI PASS / FAIL-CLOSED WHERE AMBIGUOUS**.  
Management Feedback Translation: **IMPLEMENTED / CI PASS**.  
Pilot Evidence Capture: **IMPLEMENTED / CI PASS**.  
Business Acceptance A–F automated mapping: **DONE; HUMAN ROLE-PLAY OPEN**.  
External Cloud / Provider evidence: **OPEN**.

No new FACT Core Object, no AI authority, no automatic atLIB Actor selection, no external 24h SLA promise, and no main merge were introduced.

Development implementation PASS ≠ Controlled Customer Pilot GO.
