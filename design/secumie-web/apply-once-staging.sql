-- ONE-TIME STAGING ONLY. Paste whole file in Cloud SQL Studio while logged in
-- as secumie_web_migration_staging to database secumie_web_staging.
-- No Cloud Run Job needed. NEVER execute against the shared postgres DB.
-- The existing migration runner uses public.schema_migrations with this exact filename.
BEGIN;
DO $preflight$
BEGIN
  IF current_database() <> 'secumie_web_staging'
     OR current_user <> 'secumie_web_migration_staging'
     OR EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='schema_migrations')
  THEN
    RAISE EXCEPTION 'WEB_STAGING_MIGRATION_NOT_EMPTY_OR_WRONG_TARGET';
  END IF;
END;
$preflight$;
CREATE TABLE public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- CANONICAL BEGIN: do not alter the following SQL
-- SECU:MIE WEB: minimum Staging intake. 2 tables / 2 login roles.
-- Execute ONLY via the existing migration runner, after separately approved
-- bootstrap of secumie_web_staging and the two dedicated login roles.
-- Never apply Sales Tools/Insight/Secure Guard migrations to this database.
-- DRAFT: no Cloud SQL, Secret, deployment, or production change is authorized.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $guard$
BEGIN
  IF current_database() <> 'secumie_web_staging'
    OR current_user <> 'secumie_web_migration_staging'
    OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
  THEN
    RAISE EXCEPTION 'WEB_STAGING_CONTEXT_STOP';
  END IF;
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname IN ('secumie_web_migration_staging', 'secumie_web_admin_staging')) <> 2
    OR EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname IN ('secumie_web_migration_staging', 'secumie_web_admin_staging')
        AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
             OR rolreplication OR rolbypassrls))
    OR EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r ON r.oid = m.member
      WHERE r.rolname IN ('secumie_web_migration_staging', 'secumie_web_admin_staging'))
  THEN
    RAISE EXCEPTION 'WEB_STAGING_ROLE_STOP';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'secumie_web') THEN
    RAISE EXCEPTION 'WEB_STAGING_SCHEMA_EXISTS_STOP';
  END IF;
END;
$guard$;

CREATE SCHEMA secumie_web;

CREATE TABLE secumie_web.assembly_intake (
  intake_id uuid PRIMARY KEY,
  receipt_number text NOT NULL UNIQUE,
  union_name text NOT NULL,
  company_name text NOT NULL,
  registered_address text NOT NULL,
  website_url text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  -- Temporary corporate LP does not permit association/union data sharing.
  information_sharing_enabled boolean NOT NULL DEFAULT false
    CHECK (information_sharing_enabled = false),
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  request_status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (request_status IN ('RECEIVED', 'IN_PROGRESS', 'SUBMITTED', 'CANCELLED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assembly_intake_received_idx
  ON secumie_web.assembly_intake(received_at DESC);

CREATE TABLE secumie_web.assembly_status_history (
  status_history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES secumie_web.assembly_intake(intake_id),
  from_status text,
  to_status text NOT NULL
    CHECK (to_status IN ('RECEIVED', 'IN_PROGRESS', 'SUBMITTED', 'CANCELLED')),
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Database CONNECT/TEMPORARY grants are owned by postgres and must be
-- configured before this migration. Migration role cannot change DB ACL.
REVOKE ALL ON SCHEMA secumie_web FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA secumie_web FROM PUBLIC;
GRANT USAGE ON SCHEMA secumie_web TO secumie_web_admin_staging;
GRANT SELECT, INSERT, UPDATE(request_status, updated_at)
  ON secumie_web.assembly_intake TO secumie_web_admin_staging;
GRANT SELECT, INSERT ON secumie_web.assembly_status_history
  TO secumie_web_admin_staging;
-- CANONICAL END
INSERT INTO public.schema_migrations(filename) VALUES ('001_secumie_web_intake_staging.sql');
COMMIT;
-- Verify using SELECT only after the above completes successfully:
-- SELECT filename, applied_at FROM public.schema_migrations;
-- SELECT tablename FROM pg_tables WHERE schemaname='secumie_web';
