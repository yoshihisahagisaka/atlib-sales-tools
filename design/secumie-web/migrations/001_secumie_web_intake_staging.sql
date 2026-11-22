-- SECU:MIE Web — STAGING-ONLY MIGRATION CANDIDATE; NOT APPROVED FOR EXECUTION.
-- This file is exclusively for secumie_web_staging. Never place it in the
-- Sales Tools root migrations/ or Insight/Secure Guard migration directories.
-- Reused, unmodified SQL statements: assembly-intake.draft.sql and
-- staging-role-grants.draft.sql. Transaction and ledger are owned by the
-- existing src/db/migrate.ts runMigrations() runner.
-- STOP: this file does not create a Cloud SQL DB/role/Secret or authorize execution.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $secumie_web_staging_guard$
BEGIN
  IF current_database() <> 'secumie_web_staging'
     OR current_user <> 'secumie_web_migration_staging'
     OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
  THEN
    RAISE EXCEPTION 'SECU:MIE_WEB_STAGING_CONTEXT_STOP';
  END IF;
  IF (SELECT COUNT(*) FROM pg_roles
      WHERE rolname IN ('secumie_web_migration_staging',
                        'secumie_web_admin_staging',
                        'secumie_web_runtime_staging')) <> 3
     OR EXISTS (SELECT 1 FROM pg_roles
      WHERE rolname IN ('secumie_web_migration_staging',
                        'secumie_web_admin_staging',
                        'secumie_web_runtime_staging')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
  THEN
    RAISE EXCEPTION 'SECU:MIE_WEB_ROLE_BOUNDARY_STOP';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'secumie_web') THEN
    RAISE EXCEPTION 'SECU:MIE_WEB_SCHEMA_ALREADY_EXISTS_STOP';
  END IF;
END;
$secumie_web_staging_guard$;

-- BEGIN unchanged DDL from assembly-intake.draft.sql
CREATE SCHEMA IF NOT EXISTS secumie_web;

-- Source is the organizer-approved formal union list. It is maintained by an
-- authorized import process; public callers can only read active entries.
CREATE TABLE secumie_web.assembly_union_master (
  union_id text PRIMARY KEY,
  official_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source_version text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(union_id)) > 0 AND length(trim(official_name)) > 0)
);

CREATE TABLE secumie_web.assembly_intake (
  intake_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  reception_code text NOT NULL,
  organizer_name text NOT NULL,
  union_id text NOT NULL,
  union_name_snapshot text NOT NULL,
  company_name text NOT NULL,
  registered_address text NOT NULL,
  website_url text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  result_delivery_mode text NOT NULL DEFAULT 'MANUAL'
    CHECK (result_delivery_mode = 'MANUAL'),
  -- Corporate temporary LP explicitly does not consent to association/union
  -- sharing; assembly OTP requests retain their original approved semantics.
  information_sharing_enabled boolean NOT NULL DEFAULT true
    CHECK (
      (reception_code = 'CORPORATE_LP' AND information_sharing_enabled = false)
      OR (reception_code <> 'CORPORATE_LP' AND information_sharing_enabled = true)
    ),
  request_status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (request_status IN ('RECEIVED','IN_PROGRESS','SUBMITTED','CANCELLED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  auth_session_id text NOT NULL,
  CONSTRAINT assembly_required_strings CHECK (
    length(trim(reception_code)) > 0
    AND length(trim(organizer_name)) > 0
    AND length(trim(union_id)) > 0
    AND length(trim(union_name_snapshot)) > 0
    AND length(trim(company_name)) > 0
    AND length(trim(registered_address)) > 0
    AND length(trim(website_url)) > 0
    AND length(trim(contact_name)) > 0
    AND length(trim(contact_email)) > 0
    AND length(trim(contact_phone)) > 0
    AND length(trim(consent_version)) > 0
  )
);

CREATE TABLE secumie_web.assembly_status_history (
  status_history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES secumie_web.assembly_intake(intake_id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('RECEIVED','IN_PROGRESS','SUBMITTED','CANCELLED')),
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- JWT jti is scoped to Web intake, not shared with Insight.
CREATE TABLE secumie_web.assembly_consumed_jti (
  jti text PRIMARY KEY,
  intake_id uuid NOT NULL REFERENCES secumie_web.assembly_intake(intake_id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assembly_intake_received_idx
  ON secumie_web.assembly_intake(received_at DESC);
CREATE INDEX assembly_consumed_jti_expiry_idx
  ON secumie_web.assembly_consumed_jti(expires_at);

-- Durable notification outbox: insert in the same transaction as the intake.
-- A separate authenticated worker sends to Slack and marks delivery.
CREATE TABLE secumie_web.assembly_notification_outbox (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL UNIQUE REFERENCES secumie_web.assembly_intake(intake_id),
  channel text NOT NULL DEFAULT 'SLACK' CHECK (channel = 'SLACK'),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','SENDING','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  sent_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assembly_outbox_pending_idx ON secumie_web.assembly_notification_outbox(next_attempt_at)
 WHERE state IN ('PENDING','FAILED');
-- END unchanged DDL

-- BEGIN unchanged permission statements from staging-role-grants.draft.sql
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

-- The shared PostgreSQL instance hosts separate service databases.
-- PostgreSQL normally grants CONNECT and TEMPORARY on new databases to PUBLIC.
-- Restrict the Web database itself, not only its schema. The migration owner
-- retains its inherent owner access; other service roles receive no CONNECT.
REVOKE CONNECT, TEMPORARY ON DATABASE secumie_web_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE secumie_web_staging
  TO secumie_web_runtime_staging, secumie_web_admin_staging;

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
-- END unchanged permission statements
