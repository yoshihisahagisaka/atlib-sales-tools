-- SECU:MIE Web — Staging PostgreSQL catalog-only preflight.
-- READ ONLY: metadata and aggregate connections. No customer rows, secrets,
-- DDL, GRANT, UPDATE, or creation of new GCP assets.
-- Run ONLY through an already-approved private connection to the existing
-- Cloud SQL instance msp-zabbix:asia-northeast1:secumie-sg-shared-staging-db,
-- connected to database postgres. Do not open a new public connection.
-- Review the TARGET_DATABASE result before any future bootstrap operation.

-- 1. Context, PostgreSQL major version, and mandatory operator check.
SELECT
  current_database() AS connected_database,
  current_user AS connected_role,
  current_setting('server_version') AS postgres_version,
  CASE
    WHEN current_database() = 'postgres'
     AND current_setting('server_version_num')::integer BETWEEN 160000 AND 169999
    THEN 'TARGET_CONTEXT_OK'
    ELSE 'STOP_WRONG_DATABASE_OR_VERSION'
  END AS target_context;

-- 2. Web namespace must be absent; existing Insight / Secure Guard databases
-- must remain untouched. ACLs and DB owners are metadata, not data rows.
SELECT
  datname AS database_name,
  pg_get_userbyid(datdba) AS owner_role,
  datallowconn AS connection_allowed,
  datconnlimit AS connection_limit,
  datacl::text AS database_acl
FROM pg_database
WHERE datname IN (
  'postgres',
  'secumie_insight_staging',
  'secure_guard_staging',
  'secumie_web_staging'
)
ORDER BY datname;

-- 3. Do not mistake a Cloud SQL users API list for PostgreSQL pg_roles.
-- Unexpected pre-existing Web role => STOP before any bootstrap.
SELECT
  rolname AS role_name,
  rolcanlogin AS login_enabled,
  rolsuper AS superuser,
  rolcreatedb AS can_create_database,
  rolcreaterole AS can_create_role,
  rolreplication AS replication,
  rolbypassrls AS bypass_rls,
  rolconnlimit AS connection_limit
FROM pg_roles
WHERE rolname IN (
  'secumie_web_runtime_staging',
  'secumie_web_admin_staging',
  'secumie_web_migration_staging'
)
ORDER BY rolname;

-- 4. Snapshot of actual connection limits; a snapshot is NOT peak utilization
-- evidence. The shared-platform capacity and monitoring Gate remains separate.
SELECT
  current_setting('max_connections')::integer AS max_connections,
  current_setting('superuser_reserved_connections')::integer AS superuser_reserved_connections,
  current_setting('reserved_connections')::integer AS reserved_connections,
  (SELECT count(*) FROM pg_stat_activity) AS currently_open_connections;

-- 5. Aggregate connections by database, without user, query, or PII.
SELECT
  COALESCE(datname, '<system>') AS database_name,
  count(*)::integer AS connection_count
FROM pg_stat_activity
GROUP BY datname
ORDER BY database_name;

-- PASS requires context OK; exactly the existing 3 expected DBs;
-- zero secumie_web_staging DB/roles; backup/PITR, costs and live Cloud Run
-- already separately checked. This is only an observation, never permission
-- to create DB, role, Secret, or perform a Migration.
