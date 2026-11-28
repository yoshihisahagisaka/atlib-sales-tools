-- Production-only equivalent of immutable staging migration; target guards are mandatory.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF current_database() <> 'secumie_general'
 OR current_user <> 'secumie_general_migration_prod'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 THEN RAISE EXCEPTION 'GENERAL_PRODUCTION_CONTEXT_STOP'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='secumie_general')
 THEN RAISE EXCEPTION 'GENERAL_SCHEMA_EXISTS_STOP'; END IF;
END $guard$;
CREATE SCHEMA secumie_general;
CREATE TABLE secumie_general.lead (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('WEB','INSIGHT')),
 idempotency_key uuid NOT NULL UNIQUE,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 receipt_hash text NOT NULL UNIQUE CHECK(receipt_hash ~ '^[0-9a-f]{64}$'),
 receipt_expires_at timestamptz NOT NULL,
 company_name text NOT NULL CHECK(length(btrim(company_name)) BETWEEN 1 AND 150),
 person_name text NOT NULL CHECK(length(btrim(person_name)) BETWEEN 1 AND 150),
 email text NOT NULL CHECK(length(email) BETWEEN 1 AND 254),
 department text, position text, phone text,
 target_url text,
 consent_version text NOT NULL, consented_at timestamptz NOT NULL DEFAULT now(),
 sales_contact_allowed boolean NOT NULL DEFAULT false,
 diagnosis_status text NOT NULL DEFAULT 'RECEIVED' CHECK(diagnosis_status IN ('RECEIVED','COMPLETED','FAILED')),
 diagnosis_result jsonb, completed_at timestamptz,
 consultation_status text NOT NULL DEFAULT 'NONE' CHECK(consultation_status IN ('NONE','REQUESTED')),
 consultation_note text, consultation_requested_at timestamptz,
 consultation_consent_version text,
 notification_status text NOT NULL DEFAULT 'NONE' CHECK(notification_status IN ('NONE','PENDING','SENT','FAILED')),
 sales_status text NOT NULL DEFAULT 'NEW' CHECK(sales_status IN ('NEW','CONTACTED','PROPOSAL','WON','LOST','CLOSED')),
 staff_note text NOT NULL DEFAULT '',
 is_test boolean NOT NULL DEFAULT false,
 received_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='WEB' AND target_url IS NOT NULL) OR (kind='INSIGHT' AND target_url IS NULL)),
 CHECK((diagnosis_status='COMPLETED') = (completed_at IS NOT NULL)),
 CHECK((diagnosis_status='COMPLETED') = (diagnosis_result IS NOT NULL)),
 CHECK((consultation_status='REQUESTED') = (consultation_requested_at IS NOT NULL)),
 CHECK((consultation_status='REQUESTED') = (consultation_consent_version IS NOT NULL))
);
CREATE INDEX lead_kind_received_idx ON secumie_general.lead(kind,received_at DESC,id);
CREATE TABLE secumie_general.staff_change (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES secumie_general.lead(id),
 actor text NOT NULL, previous_status text NOT NULL, next_status text NOT NULL,
 previous_note text NOT NULL, next_note text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON SCHEMA secumie_general FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA secumie_general FROM PUBLIC;
-- Runtime and staff grants require approved role provisioning and separate ACL verification.
-- This candidate deliberately grants no runtime access.
