# Business KAIZEN Package F3a Production Ledger Preflight

Date: 2026-11-25 JST

Status: **STOP — Production database ledger and SQL privileges are not yet observed**

Scope: read-only Production identity and migration preflight. This record authorizes no migration numbering or application, DDL, role/secret change, deployment, traffic change, DNS change, or merge.

## 1. Source identity

- Repository: `yoshihisahagisaka/atlib-sales-tools`
- Base: PR #109 HEAD `1079210d4886ff3df232b72526144d76cb0d8e73`
- Observed remote `main`: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Production Canonical: `docs/sales-tools-production-canonical-policy-20261003.md`
- Existing deployment/runbook sources:
  - `docs/運用手順書_デプロイ.md`
  - `docs/it-management-diagnosis-readiness-runbook.md`
  - `docs/production-release-free-diagnosis-design-v2-033.md`
  - `docs/production-release-marketing-initiative-v1-034.md`
  - `docs/production-release-test-case-management-v1-035.md`
  - `docs/production-release-test-case-audit-acl-036.md`
- Release and decisions:
  - `docs/business-kaizen-package-f1-release-readiness.md`
  - `docs/business-kaizen-accepted-reentry-decision-20261124.md`
  - `docs/business-kaizen-package-f2b-common-commercial-boundary-decision.md`

Read-only PR inspection confirmed the active stack:

`PR #100 (15122dc)` → `PR #106 (b91d0a4)` → `PR #107 (1e38cc6)` → `PR #108 (a4ef122)` → `PR #109 (1079210)`.

PR #109 is OPEN and Draft, its Git base is PR #108 branch at `a4ef12205978953a71bcaf5756a90b755f00909d`, and its head is the requested F3a base. F2a and F2b Decision files are present at the final head. The BEL control character before the Base SHA in PR #109's description was removed on 2026-11-25; no Git base, commit, or code changed.

## 2. Existing runbook Fit/Gap

### Fit

- The established target is project `msp-zabbix`, region `asia-northeast1`, instance `msp-customer-portal-db`, and database `sales_tools`.
- The approved pattern is the existing IAP path through `msp-frontend-server`/Cloud SQL Proxy or another explicitly approved Production read-only connection, followed by a transaction that begins with `BEGIN READ ONLY`.
- Existing migration preflight scripts fail closed on database identity, PostgreSQL major version, ledger baseline, prerequisite objects, ownership, and read-only transaction state.
- Production `schema_migrations`, not repository filenames, is the numbering authority.
- Runtime rollback is not database rollback; backup/PITR evidence is a separate release prerequisite.

### Gap observed in this session

- The local environment had no `DB_NAME`, migration user/password, socket, host, or port variables.
- The existing IAP host was reachable. `cloud-sql-proxy.service` was active and `psql` was installed.
- The runbook checkout `/opt/atlib-msp-dev/sales-tools` and its `.env` were not available to the authenticated OS user, and no readable `.pgpass` was present.
- Therefore no approved database credential was available. No Secret Manager value was fetched, no alternative database user was created, and no connection was guessed.
- The repository's existing preflight scripts are release-specific and assume a numbered immutable artifact/baseline. Reusing one as if it were an F3a general ledger observer would produce false assertions. The SQL in section 7 is limited to observation and does not create a new migration mechanism.

## 3. Confirmed Production control-plane values

The following were observed read-only with the authenticated `gcloud` configuration on 2026-11-25. They are control-plane facts, not substitutes for SQL-level database identity.

| Item | Observed value |
| --- | --- |
| Authentication | an active approved Workspace account was available; its identity is not copied into this repository Evidence |
| Active project | `msp-zabbix` |
| Cloud SQL instance | `msp-customer-portal-db` |
| Connection name | `msp-zabbix:asia-northeast1:msp-customer-portal-db` |
| Region / state | `asia-northeast1` / `RUNNABLE` |
| Cloud SQL engine | `POSTGRES_16` |
| Availability / disk | `ZONAL` / `PD_SSD` |
| Public IPv4 setting | enabled |
| Database | `sales_tools` exists, UTF8 / `en_US.UTF8` |
| Cloud SQL users | `sales_tools_app`, `sales_tools_migration` exist as built-in users |
| Cloud Run service account | `sales-tools-sa@msp-zabbix.iam.gserviceaccount.com` |
| Latest ready Sales Tools revision | `sales-tools-fds-20261124-01` |
| Automated backups | enabled; latest five listed backups were `SUCCESSFUL` |
| Latest observed backup | ID `1795543200000`, `2026-11-24T19:55:20.830Z` to `2026-11-24T19:57:02.102Z`, `SUCCESSFUL` |
| Backup retention | 30 backups (`COUNT`) |
| PITR | enabled; transaction-log retention 7 days; log archiving enabled |

The Admin API user list does not prove PostgreSQL role membership, object ownership, default ACL, or effective table privileges. The instance-level `POSTGRES_16` value also does not replace `current_setting('server_version')` from the target database session.

## 4. Unconfirmed Production SQL values

Because no approved SQL credential was available, none of the following is claimed as observed:

- `current_database()`, exact PostgreSQL server version, database owner, session user, or `transaction_read_only`;
- every `schema_migrations` row, duplicate filenames, numeric gaps, or the maximum applied migration number;
- whether repository-expected migrations through 036 match the Production ledger;
- presence and ownership of `business_web_consultation_leads`, `company`, `contact`, `sales_activity`, and `marketing_initiative`;
- presence/absence of the Business KAIZEN Diagnosis, history, audit, Commercial Event, and anonymous KPI tables;
- collision status for either unnumbered draft;
- presence of `sales_tools_runtime` as a PostgreSQL role;
- role memberships, owners, default ACL, or effective SELECT/INSERT/UPDATE/DELETE privileges;
- trigger/function/index/constraint collision status.

Repository expectations and previous isolated PostgreSQL tests are not promoted to Production facts.

## 5. Draft migration identity and dependencies

The current Git files were recalculated at PR #109 HEAD:

| Draft | SHA-256 | Bytes | Dependencies / collision boundary |
| --- | --- | ---: | --- |
| `migrations/UNNUMBERED_business_kaizen_diagnosis_package_a.sql` | `239da79789346ec01afadd9e58f445a8389af667450f3364f6ede7b2467933c0` | 8,021 | SQL FKs require `business_web_consultation_leads` (repository Migration 025) and `sales_activity`, `company`, `contact` (repository Migration 027). PROXY attribution read behavior also relies on Migration 030. It creates four Business KAIZEN tables plus functions, triggers, indexes and constraints. Production absence and name collisions are unconfirmed. |
| `migrations/UNNUMBERED_business_kaizen_anonymous_kpi_daily.sql` | `e5fa76b55c5feacbb3e3149e75a7e686e2f8bc9015c3db78b29634569bb14a77` | 2,050 | Creates one daily aggregate table and index using `UNIQUE NULLS NOT DISTINCT`. Runtime UTM classification reads `marketing_initiative` (repository Migration 034), although the draft has no FK to it. Production absence and name collisions are unconfirmed. |

Repository Migration 036 is the highest numbered SQL file in this checkout. That is not evidence that Production's maximum is 036, and it does not authorize 037/038 or any other number.

The Diagnosis draft explicitly grants mutable CRUD only on `business_kaizen_diagnoses`; stage history, audit, and Commercial Events are append-only with UPDATE/DELETE revoked for role names that exist. The anonymous draft permits SELECT/INSERT/UPDATE for atomic UPSERT and revokes DELETE. These are intended post-migration states, not observed Production privileges.

## 6. E3a/F2a/F2b boundary verification

- F2a's accepted re-entry Decision and current Diagnosis SQL identity are present.
- F2b's Common Commercial boundary Decision is present.
- `BusinessKaizenCommonKpiAdapter` remains referenced only by its implementation, tests, package test commands, and documentation.
- `src/server.ts` neither imports nor constructs E3a. No Production route or dashboard invokes it.
- E1 uses `BusinessKaizenKpiService` directly and remains independent of E3a.
- Therefore the unresolved `serviceCode` mapping remains a Common Commercial connection gate, not a reason to infer a mapping during migration work.

## 7. One approved read-only evidence procedure

An authorized operator may use **Cloud SQL Studio** against instance `msp-customer-portal-db`, database `sales_tools`, with an already-approved read-only or migration identity. Do not create a user, change a password/grant, or retrieve a secret merely to run this check. Paste and execute the following as one transaction. Save the result through the approved evidence channel after confirming it contains no row data or credentials.

```sql
BEGIN READ ONLY;

SELECT current_database() AS database,
       session_user AS session_user_name,
       current_user AS current_user_name,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only,
       pg_get_userbyid(d.datdba) AS database_owner
FROM pg_database d
WHERE d.datname = current_database();

SELECT filename, applied_at
FROM schema_migrations
ORDER BY filename, applied_at;

SELECT filename, count(*) AS occurrences
FROM schema_migrations
GROUP BY filename
HAVING count(*) <> 1
ORDER BY filename;

WITH numbered AS (
  SELECT DISTINCT substring(filename FROM '^([0-9]+)_')::integer AS migration_number
  FROM schema_migrations
  WHERE filename ~ '^[0-9]+_'
), bounds AS (
  SELECT min(migration_number) AS minimum, max(migration_number) AS maximum
  FROM numbered
)
SELECT bounds.minimum, bounds.maximum,
       ARRAY(
         SELECT n
         FROM bounds b, generate_series(b.minimum, b.maximum) AS n
         WHERE NOT EXISTS (SELECT 1 FROM numbered x WHERE x.migration_number = n)
         ORDER BY n
       ) AS missing_numbers
FROM bounds;

WITH expected(name) AS (VALUES
  ('business_web_consultation_leads'),
  ('company'), ('contact'), ('sales_activity'), ('marketing_initiative'),
  ('business_kaizen_diagnoses'),
  ('business_kaizen_diagnosis_stage_history'),
  ('business_kaizen_diagnosis_audit'),
  ('business_kaizen_commercial_events'),
  ('business_kaizen_anonymous_kpi_daily')
)
SELECT e.name,
       c.oid IS NOT NULL AS exists,
       CASE WHEN c.oid IS NULL THEN NULL ELSE pg_get_userbyid(c.relowner) END AS owner
FROM expected e
LEFT JOIN pg_class c
  ON c.relnamespace = 'public'::regnamespace
 AND c.relname = e.name
 AND c.relkind IN ('r','p')
ORDER BY e.name;

SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb
FROM pg_roles
WHERE rolname IN ('sales_tools_app','sales_tools_runtime','sales_tools_migration')
ORDER BY rolname;

SELECT member_role.rolname AS member_role,
       granted_role.rolname AS granted_role,
       grantor_role.rolname AS grantor_role,
       m.admin_option,
       m.inherit_option,
       m.set_option
FROM pg_auth_members m
JOIN pg_roles member_role ON member_role.oid = m.member
JOIN pg_roles granted_role ON granted_role.oid = m.roleid
JOIN pg_roles grantor_role ON grantor_role.oid = m.grantor
WHERE member_role.rolname IN ('sales_tools_app','sales_tools_runtime','sales_tools_migration')
   OR granted_role.rolname IN ('sales_tools_app','sales_tools_runtime','sales_tools_migration')
ORDER BY member_role.rolname, granted_role.rolname, grantor_role.rolname;

WITH relevant_owners AS (
  SELECT DISTINCT c.relowner AS role_oid
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN (
      'business_web_consultation_leads','company','contact','sales_activity','marketing_initiative',
      'business_kaizen_diagnoses','business_kaizen_diagnosis_stage_history',
      'business_kaizen_diagnosis_audit','business_kaizen_commercial_events',
      'business_kaizen_anonymous_kpi_daily'
    )
  UNION
  SELECT oid FROM pg_roles
  WHERE rolname IN ('sales_tools_app','sales_tools_runtime','sales_tools_migration')
)
SELECT owner_role.rolname AS owner_role,
       COALESCE(grantee_role.rolname, 'PUBLIC') AS grantee_role,
       d.defaclobjtype AS object_type,
       n.nspname AS schema_name,
       a.privilege_type,
       a.is_grantable
FROM pg_default_acl d
JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
LEFT JOIN pg_roles grantee_role ON grantee_role.oid = a.grantee
WHERE d.defaclrole IN (SELECT role_oid FROM relevant_owners)
ORDER BY owner_role, grantee_role, object_type, schema_name, privilege_type;

SELECT n.nspname AS schema_name,
       c.relname AS object_name,
       CASE c.relkind
         WHEN 'r' THEN 'table'
         WHEN 'i' THEN 'index'
         WHEN 'S' THEN 'sequence'
         WHEN 'v' THEN 'view'
         WHEN 'm' THEN 'materialized_view'
         WHEN 'c' THEN 'composite_type'
         WHEN 'f' THEN 'foreign_table'
         WHEN 'p' THEN 'partitioned_table'
         WHEN 'I' THEN 'partitioned_index'
         ELSE c.relkind::text
       END AS object_kind,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname !~ '^pg_toast'
  AND c.relname LIKE 'business_kaizen_%'
ORDER BY n.nspname, c.relname, c.relkind;

SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_result(p.oid) AS result_type,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname !~ '^pg_toast'
  AND p.proname LIKE 'business_kaizen_%'
ORDER BY n.nspname, p.proname, identity_arguments;

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_namespace n ON n.oid = con.connamespace
LEFT JOIN pg_class c ON c.oid = con.conrelid
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname !~ '^pg_toast'
  AND (con.conname LIKE 'business_kaizen_%' OR c.relname LIKE 'business_kaizen_%')
ORDER BY n.nspname, c.relname, con.conname;

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       t.tgname AS trigger_name,
       t.tgenabled,
       pn.nspname AS function_schema,
       p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname !~ '^pg_toast'
  AND (t.tgname LIKE 'business_kaizen_%' OR c.relname LIKE 'business_kaizen_%')
ORDER BY n.nspname, c.relname, t.tgname;

WITH target_tables AS (
  SELECT c.oid, c.relname
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r','p')
    AND c.relname IN (
      'business_web_consultation_leads','company','contact','sales_activity','marketing_initiative',
      'business_kaizen_diagnoses','business_kaizen_diagnosis_stage_history',
      'business_kaizen_diagnosis_audit','business_kaizen_commercial_events',
      'business_kaizen_anonymous_kpi_daily'
    )
), runtime_roles AS (
  SELECT rolname FROM pg_roles
  WHERE rolname IN ('sales_tools_app','sales_tools_runtime')
)
SELECT r.rolname, t.relname,
       has_table_privilege(r.rolname, t.oid, 'SELECT') AS can_select,
       has_table_privilege(r.rolname, t.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.rolname, t.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.rolname, t.oid, 'DELETE') AS can_delete,
       has_table_privilege(r.rolname, t.oid, 'TRUNCATE') AS can_truncate,
       has_table_privilege(r.rolname, t.oid, 'REFERENCES') AS can_references,
       has_table_privilege(r.rolname, t.oid, 'TRIGGER') AS can_trigger
FROM runtime_roles r CROSS JOIN target_tables t
ORDER BY r.rolname, t.relname;

ROLLBACK;
```

The operator must independently confirm the UI/session shows read-only execution. If `BEGIN READ ONLY`, `schema_migrations`, or any catalog query fails, stop and preserve only the non-secret error classification. Do not retry with a more privileged identity without separate authorization.

The complete SQL block above was syntax-checked on 2026-11-25 against a disposable, non-Production PostgreSQL 16.16 instance. It completed inside `BEGIN READ ONLY`/`ROLLBACK`. This confirms PostgreSQL 16 syntax and catalog-column compatibility only; it does not supply or imply any Production result.

## 8. Migration numbering decision

**Not permitted / not assessable yet.** The Production ledger maximum, duplicates/gaps, target-object absence, ownership, default ACL, and effective privileges are unconfirmed. Neither draft may be assigned a formal number or packaged for application.

After the section 7 evidence is returned, numbering eligibility may be assessed from the actual ledger. Even a clean ledger only permits a numbering proposal and immutable-artifact review; it does not authorize migration execution.

## 9. Next release gates

1. Execute section 7 through an approved Production read-only identity and retain the complete non-secret result.
2. Reconcile every Production ledger row with the approved release ledger; investigate duplicates, gaps, unexpected filenames, or numbers above the repository expectation.
3. Confirm all prerequisites and both target tables' absence, including function/trigger/index/constraint name collisions before artifact preparation.
4. Confirm table/database owners, runtime role membership, Production default ACL, and effective privileges. Preserve the historical default-ACL behavior documented by Migration 036 in rehearsal.
5. Confirm backup/PITR recovery acceptance, including restore evidence; enabled configuration and successful backups alone do not prove restore readiness.
6. Only after these gates, prepare separate immutable numbered artifacts and verifiers under a separately approved release slice.

## 10. STOP / GO

### Current result: STOP

- GO for documenting control-plane facts and the read-only follow-up procedure.
- STOP for migration numbering, artifact finalization, migration execution, application rollout, or Common KPI connection.
- Production SQL evidence remains the blocking input. No repository assumption may close it.

No Production DB write, DDL, migration, role/secret change, deployment, traffic, DNS, or merge occurred during this preflight.
