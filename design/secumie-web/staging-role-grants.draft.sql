-- SECU:MIE Web Staging: DRAFT role grants for the existing assembly intake tables.
-- Run only inside the approved Web-only database secumie_web_staging, after
-- creating the separate Staging login roles and applying the approved schema.
-- No database/role/secret creation or production changes occur in this SQL.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $$
BEGIN
  IF current_database() <> 'secumie_web_staging' THEN
    RAISE EXCEPTION 'Not the approved Web staging database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'secumie_web_runtime_staging')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'secumie_web_admin_staging')
  THEN
    RAISE EXCEPTION 'Web staging roles do not exist';
  END IF;
  IF to_regclass('secumie_web.assembly_intake') IS NULL
     OR to_regclass('secumie_web.assembly_union_master') IS NULL
  THEN
    RAISE EXCEPTION 'Web assembly intake schema not applied';
  END IF;
END $$;

REVOKE ALL ON SCHEMA secumie_web FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA secumie_web FROM PUBLIC;
GRANT USAGE ON SCHEMA secumie_web
  TO secumie_web_runtime_staging, secumie_web_admin_staging;

-- Public intake: check the approved union, insert a new request and its
-- one-time-JWT/notification/audit records. No UPDATE or DELETE privileges.
GRANT SELECT ON secumie_web.assembly_union_master
  TO secumie_web_runtime_staging;
GRANT SELECT, INSERT ON secumie_web.assembly_intake
  TO secumie_web_runtime_staging;
GRANT INSERT ON secumie_web.assembly_consumed_jti,
  secumie_web.assembly_notification_outbox,
  secumie_web.assembly_status_history
  TO secumie_web_runtime_staging;

-- Sales Tools staff: list, update status, and record signed corporate LP
-- submissions using this same backend role (not exposed to browser clients).
GRANT SELECT, INSERT, UPDATE(request_status, updated_at)
  ON secumie_web.assembly_intake TO secumie_web_admin_staging;
GRANT SELECT, INSERT ON secumie_web.assembly_status_history
  TO secumie_web_admin_staging;
COMMIT;
