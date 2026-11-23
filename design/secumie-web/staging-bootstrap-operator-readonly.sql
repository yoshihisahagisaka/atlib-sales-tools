-- SECU:MIE Web: operator privilege preflight in the EXISTING Cloud SQL Studio.
-- READ-ONLY. Connect to database postgres on secumie-sg-shared-staging-db.
-- Never paste passwords or execute CREATE ROLE / CREATE DATABASE in this phase.
-- The result is a capability snapshot, not permission to run a bootstrap.
SELECT
  current_database() AS database_name,
  current_user AS operator_role,
  roles.rolcreatedb AS can_create_database,
  roles.rolcreaterole AS can_create_role,
  roles.rolsuper AS is_superuser,
  COALESCE(
    (SELECT pg_has_role(roles.oid, system_role.oid, 'MEMBER')
     FROM pg_roles system_role
     WHERE system_role.rolname = 'cloudsqlsuperuser'),
    false
  ) AS member_of_cloudsqlsuperuser,
  current_setting('createrole_self_grant', true) AS new_role_self_grant,
  (SELECT count(*)::int FROM pg_database
   WHERE datname = 'secumie_web_staging') AS web_database_count,
  (SELECT count(*)::int FROM pg_roles
   WHERE rolname IN (
     'secumie_web_migration_staging',
     'secumie_web_admin_staging',
     'secumie_web_runtime_staging'
   )) AS web_role_count
FROM pg_roles roles
WHERE roles.rolname = current_user;
