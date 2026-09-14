# Controlled Customer Pilot — External Evidence Execution Pack v1

Status: **EXECUTION READY / NOT YET EXTERNAL EVIDENCE**  
Date: 2026-09-14

This pack prepares the remaining external validation work. It does not change Business Decisions and does not declare Pilot GO.

## 1. Safety / evidence rules

- Use an authenticated operator with the minimum role needed for each validation.
- Never commit Secret values, customer raw content, database dumps, OAuth tokens or full Cloud Run environment dumps.
- Read-only preflight comes before any restore/deploy operation.
- Cloud SQL restore must target an isolated instance/database. Do not restore over the live controlled-pilot source instance for rehearsal.
- Traffic remains disabled until deletion reconciliation, Approved Evidence integrity and application smoke are complete.
- Internal RPO/RTO targets are 24h / 24h. They are not an external SLA.
- Business Decision completed != Production Ready.

## 2. Read-only GCP preflight

Required environment variables:

```sh
export GCP_PROJECT_ID='<project>'
export CONTROLLED_PILOT_CLOUD_SQL_INSTANCE='<source-instance>'
export CONTROLLED_PILOT_CLOUD_RUN_SERVICE='<service>'
export CONTROLLED_PILOT_CLOUD_RUN_REGION='<region>'
export DIAGNOSIS_RECONCILIATION_GCS_BUCKET='<manifest-bucket>'
```

Run:

```sh
npm run readiness:external-preflight > external-preflight.json
```

The collector uses only `gcloud ... describe/list` operations and outputs a sanitized summary. It deliberately excludes Secret values, customer data and raw service JSON.

Evidence to review:
- Cloud SQL automated backup enabled.
- PITR enabled where required by the rehearsal plan.
- latest successful backup exists and is recent enough for the 24h RPO target.
- configured retained backup evidence is compatible with the 30-day internal target; if the API field alone is insufficient, verify actual backup history separately.
- Cloud Run has a service account, latest ready revision and expected region/service.
- request-outside-CPU / min instance / max instance settings are explicitly observed rather than inferred.
- reconciliation bucket exists and access is controlled.
- required Secret Manager secret names exist. Presence alone is not proof that the runtime identity can access the required versions.

Store only the sanitized output as Gate Evidence after Human review.

## 3. Real deletion-manifest export/readback

With ADC / workload identity for the approved operator and live controlled-pilot DB connection configured:

```sh
npm run retention:export-manifest
```

PASS evidence must include only:
- bucket.
- object name.
- manifest hash.
- bundle hash.
- tombstone count.
- execution timestamp / operator identity in the external validation record.

The application adapter already uses immutable object creation (`ifGenerationMatch=0`) and readback hash verification. Real execution is still required.

Do not put manifest content in GitHub if it includes customer-linked identifiers. Record hashes/metadata only.

## 4. Cloud SQL isolated restore rehearsal

Before changing anything, record:
- source instance name.
- source backup/PITR timestamp selected.
- rehearsal target instance/database name.
- start time.
- source application write-stop boundary used for RPO measurement, if applicable.

Execution principles:
1. create or identify an isolated rehearsal target with no production traffic.
2. restore from the selected real backup/PITR point using current Google Cloud-supported procedure.
3. apply the reviewed migration artifact if the restored point predates the current schema.
4. connect the application/reconciliation operator only to the isolated target.
5. retrieve the external deletion manifest by its recorded bucket/object/hash.
6. run deletion reconciliation VERIFY.
7. if VERIFY has no unsupported target and the operator has approved the target, run APPLY.
8. repeat VERIFY/APPLY to demonstrate idempotency.
9. verify Approved Report / Handoff / Human Decision / Audit integrity and immutability.
10. run application smoke against the isolated restored DB.
11. record restore-complete time and measured RPO/RTO.
12. destroy or access-restrict the isolated rehearsal target according to the approved operational policy after evidence capture.

Immediate FAIL / STOP conditions:
- unsupported deletion target.
- manifest hash mismatch.
- missing or stale manifest relative to known deletion events.
- Approved Report/Handoff integrity difference.
- schema/migration ambiguity.
- accidental connection to production traffic.
- RPO/RTO measurement cannot be supported by timestamps.

## 5. Real Anthropic evidence

Run AI-01 through AI-04 using a controlled synthetic/approved pilot Case. Required evidence:
- each process reaches the expected execution status.
- provider/model/run metadata recorded.
- no AI process grants FACT/Decision/Actor authority.
- AI-02/03 Transcript remains excluded by default.
- if Transcript is explicitly necessary, separate consent/necessity guard is evidenced.
- AI-04 input contains only Human Approved context.
- provider retention/privacy terms used for the pilot are reviewed externally; Development does not infer them from successful API calls.

Do not store prompt/output containing customer raw data in the external evidence record. Use run IDs and sanitized metadata.

## 6. Google OAuth evidence

Using the real configured HTTPS callback:
- allowed `@atlib.jp` Workspace account succeeds.
- a non-allowed account is rejected.
- redirect URI matches configured production/staging URI exactly.
- admin route remains inaccessible without staff session.
- OAuth/state errors do not leak token or cookie values into logs.

Record account category and outcome, not personal email addresses where unnecessary.

## 7. Secret Manager / IAM evidence

Evidence must show runtime identity can read only the required Secret versions and connect to Cloud SQL/GCS as intended.

Minimum checks:
- Cloud Run runtime service account identified.
- Cloud SQL Client permission available to runtime identity.
- Secret Accessor permissions are scoped to required secrets where practical.
- manifest export/restore identity has only required GCS object permissions.
- no service-account key file is required for normal Cloud Run operation when workload identity/ADC is available.

Never copy secret payloads into the evidence record.

## 8. Cloud Run worker / scaling evidence

Because diagnosis AI workers poll outside HTTP requests, verify in the real service:
- request-outside-CPU / billing setting is compatible with polling.
- minimum instances is sufficient for the controlled pilot.
- queued work completes when there is no incoming user request.
- multi-instance execution claims a job once.
- deploy/shutdown interruption causes lease recovery / explicit FAILED behavior rather than duplicate authoritative output.
- DB connection budget is safe for configured max instances.

Record revision, timing and sanitized AIExecution IDs/status only.

## 9. Monitoring evidence

Create/verify operational alerts for at least:
- service unavailability / elevated 5xx.
- DB connectivity/error signal.
- AI queue failure/stale lease signal.
- OAuth/token verification failure spike where operationally useful.
- notification failures where meaningful.

PASS requires an actual test notification to the named operational recipient/channel, not only configuration existence.

## 10. Legal / Privacy and B9 operational ownership

Development does not write legal sufficiency into code.

Before Pilot:
- final customer-facing notice/link must be approved by the responsible Legal/Privacy reviewer.
- named roles must exist for diagnosis owner, Human reviewer, customer follow-up, management feedback, technical incident escalation and privacy/security escalation.
- submission failure, AI failure, correction and duplicate/test Case handling must be operationally assigned.

Exact external SLA must not be invented by Development.

## 11. Human Business Acceptance A–F

Use `docs/business-launch-acceptance-a-f-v1.md` as the scenario map.

For each scenario A–F record:
- participants/roles.
- Case/scenario ID using synthetic or approved data.
- whether the five-block feedback was understandable without manual reconstruction.
- correction points.
- whether unsupported certainty appeared.
- whether atLIB was incorrectly treated as mandatory Actor.
- whether Assessment was incorrectly forced.
- final PASS / FAIL / remediation.

Automated tests do not replace this role-play.

## 12. Real WEB / SALES_VISIT staging E2E

Run both entry channels end-to-end with the same method:
application -> Survey -> AI preparation -> Human plan -> 60-min -> post-AI -> Human Review -> five-block Report -> Human approval -> Feedback -> Assessment proposal/handoff as applicable.

Verify:
- customer notice/acknowledgement provenance.
- no evidence-free FACT formation.
- UNKNOWN remains visible where unresolved.
- report is Human approved before customer-facing use.
- Pilot Evidence Capture can be recorded.
- notifications work in the deployed environment.

## 13. Gate completion rule

After the above evidence is captured, re-run `git_KAIZEN/docs/32-free-it-management-diagnosis-production-readiness-gate-v1.md` against the current branch/environment.

Return exactly one evidence-based verdict for Controlled Customer Pilot:
- GO
- CONDITIONAL GO
- NO-GO

Until that rerun, the current state remains **NO-GO — EXTERNAL / OPERATIONAL CLOSURE REMAINS**.
