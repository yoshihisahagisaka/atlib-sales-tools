# IT経営KAIZEN — Production Read-only Preflight
Date: 2026-10-16
Status: PREPARED / LIVE PRODUCTION NOT YET VERIFIED

## Baseline
- Confirmed GitHub main: d35581cec3dbc7d4ca2938f2a9c664906ccc5316
- IT survey KPI feature branch at preparation: 115ba809656352ab32f4cbbbf2ea937d53427f6b
- Existing canonical migration runner: src/db/migrate.ts
- Business KAIZEN has two unnumbered drafts; no confirmed reservation of 037+ as of last cross-lane response.

## Production read-only verification (operator PowerShell)
```powershell
gcloud.cmd run services describe sales-tools --project=msp-zabbix --region=asia-northeast1 --format="yaml(status.latestReadyRevisionName,status.traffic,spec.template.spec.containers[0].image)"
curl.exe -sS -i --max-time 15 https://sales.atlib.jp/healthz/
```

The first command reads the Cloud Run service and current traffic/revision/image only; the second requests the public health endpoint. Do not paste credentials, bearer tokens, secrets or full environment-variable dumps.

## Database read-only verification
Only use an already-authorized read-only connection (not the migration runner). Suggested queries:
```sql
BEGIN READ ONLY;
SELECT filename, applied_at FROM schema_migrations ORDER BY filename;
SELECT to_regclass('public.marketing_initiative') AS marketing_initiative,
       to_regclass('public.it_kaizen_survey_monthly_counts') AS it_counter,
       to_regclass('public.it_management_staff_test_submission_receipt') AS test_receipt;
COMMIT;
```

If no read-only DB access exists, mark DB state UNVERIFIED rather than guessing. Do not create users, change grants, run migrations or test writes in Production.

## Interpretation
- Git main's 036 migration is a source-code baseline, not evidence that Production DB has exactly 036.
- A Cloud Run health response does not prove migration status or feature availability.
- The survey KPI feature is not merged to main and the route is disabled unless IT_SURVEY_KPI_ENABLED=true; do not enable it without approved schema.
- Staff test provenance remains unresolved and ?test=1 remains unavailable.
- The latest migration runner rehearsal test has not yet passed in CI; earlier PostgreSQL concurrency/ACL tests passed.

## Next gate
Compare operator output against Canonical and coordinate Business KAIZEN migration/deploy immediately before a release. Keep all work read-only until then.

## Operator-observed Production status — 2026-10-16 (read-only)
- gcloud run services describe sales-tools, project msp-zabbix, region asia-northeast1:
  - status.latestReadyRevisionName: sales-tools-test-case-v1
  - status.traffic: 100 percent to sales-tools-test-case-v1, tag test-case-management-v1-d355
  - container image digest: sha256:da93eead069b1c038b0a2d60350d6b066a27510329cc6fa72e656e1b3f1d56e0
  - older tagged revisions remain listed with no percentage assigned in this output.
- Operator curl https://sales.atlib.jp/healthz/ returned HTTP 200 and body ok (response Date Thu, 15 Oct 2026 17:19:27 GMT).
- This verifies the current service routing and health response, not schema migration state, individual application flows, or a historical absence of Production changes.
- Database schema_migrations and target tables remain UNVERIFIED. Do not infer that Production is at migration 036 from Git main.
- No Production mutation was requested or performed as part of this preflight.

## 2026-10-16 Cross-lane release sequencing decision
- Business KAIZEN lane reported fresh read-only Production ledger PASS: 38 records, latest migration number 036, no 037+ applied. This is a cross-lane operator report, not independently queried by this branch.
- IT KAIZEN lane ACCEPTS IT anonymous KPI first, Business KAIZEN anonymous KPI second.
- Tentative numbers: IT 037, Business 038. These are **not reserved**. Confirm latest main SHA, all migration filenames and fresh Production ledger immediately before final numbering.
- Business KAIZEN Package A v7 remains independently in development; do not assume it can be numbered or released after 038 without separate coordination.
- Keep both KPI persistence models independent. Coordinate shared server.ts, runtime grants, regression and release artifacts.
- IT survey KPI release remains blocked until its own migration runner/browser/security gates pass. Staff ?test=1 full application simulation remains disabled due to unresolved consent provenance and must not be silently treated as released.
- No Production change or deploy authorized by this sequencing agreement.

## Work read-only investigation handoff — 2026-10-16
Source: operator-provided Work investigation report (not an independent DB query in this lane).
- Authorized existing read-only Jobs succeeded: sales-tools-production-migration-ledger-ro-8p9zx and sales-tools-prod-test-case-management-v1-035-readonly-inspm66dj; BEGIN READ ONLY, no DB writes.
- Production PostgreSQL 16 ledger: 38 filenames, latest 036, none numbered 037+. Historical duplicate 018 and 019 filenames are intentional; ledger primary key is filename.
- Migration 018 historical Production default ACL is not fully reproducible from current main SQL. Migration 035 inherited excess UPDATE/DELETE on append-only audit, corrected by explicit REVOKE in 036; post-verifier PASS.
- Marketing Initiative 034 and test designation 035/036 are present. Marketing Initiative effective DELETE privilege was NOT checked by the fixed read-only Job.
- Direct to_regclass checks for it_kaizen_survey_monthly_counts and it_management_staff_test_submission_receipt were NOT performed; do not claim proven absence, despite no canonical migration evidence.
- Follow-up bounded read-only queries: those two to_regclass values and effective Marketing Initiative DELETE privilege, using existing authorized Job mechanism. No new secrets, migration, runtime write, or deploy.
- Work report captured feature SHA 1d9bb278, which is stale relative to the live branch head; Git ref must be refreshed before any release artifact. Latest branch observed in this lane: 836d0c432b195713b8ad40862a85a714ab7ca3f2.
- Provisional release ordering IT KPI 037 then Business KPI 038 remains agreed but neither number is reserved. Production release remains blocked pending migration/rehearsal, browser checks, and approval.
