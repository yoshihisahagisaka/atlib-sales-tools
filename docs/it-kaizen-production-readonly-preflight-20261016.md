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
