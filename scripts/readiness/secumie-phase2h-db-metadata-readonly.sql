-- SECU Insight Phase 2H: DB administrator metadata-only preflight
-- Run only after approval against the intended database.
-- This file reads catalog/statistics metadata only. It does not read business rows.
-- Execute with ON_ERROR_STOP so a missing ledger or unexpected privilege stops review.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

SHOW server_version;
SHOW max_connections;

SELECT current_database() AS database_name,
       current_user AS execution_role,
       pg_is_in_recovery() AS is_replica;

SELECT datname,
       usename,
       application_name,
       state,
       count(*)::integer AS connection_count
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
GROUP BY datname, usename, application_name, state
ORDER BY usename, application_name, state;

SELECT n.nspname AS schema_name,
       pg_catalog.pg_get_userbyid(n.nspowner) AS schema_owner
FROM pg_catalog.pg_namespace n
WHERE n.nspname IN ('public_auth', 'pira', 'secumie_deployment')
ORDER BY n.nspname;

SELECT r.rolname,
       r.rolsuper,
       r.rolinherit,
       r.rolcreaterole,
       r.rolcreatedb,
       r.rolcanlogin,
       r.rolreplication,
       r.rolbypassrls
FROM pg_catalog.pg_roles r
WHERE r.rolname IN (
  'sales_tools_app',
  'sales_tools_migration',
  'secumie_otp_rehearsal',
  'secumie_pira_rehearsal',
  'secumie_admin_rehearsal',
  'secumie_migration_rehearsal',
  'secumie_maintenance_rehearsal'
)
ORDER BY r.rolname;

SELECT table_schema,
       table_name,
       grantee,
       privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public_auth', 'pira')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT routine_schema,
       routine_name,
       grantee,
       privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema IN ('public_auth', 'pira', 'secumie_deployment')
ORDER BY routine_schema, routine_name, grantee, privilege_type;

SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public_auth', 'pira', 'secumie_deployment')
ORDER BY n.nspname, p.proname, identity_arguments;

SELECT CASE WHEN pg_catalog.to_regclass('public.schema_migrations') IS NOT NULL
            THEN 'true' ELSE 'false' END AS ledger_exists
\gset

\if :ledger_exists
  SELECT filename, applied_at
  FROM public.schema_migrations
  WHERE filename ~ '^(037|038|039|040|041)_'
  ORDER BY filename;
\else
  SELECT 'MISSING'::text AS migration_ledger_status;
\endif

COMMIT;
