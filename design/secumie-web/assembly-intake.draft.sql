-- SECU:MIE Web / assembly intake: DRAFT ONLY.
-- Not registered in the shared migration runner; Insight DB owner must approve
-- schema ownership, role grants, and numbering before application.
-- No OTP tables or PDF storage are created here.
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
  information_sharing_enabled boolean NOT NULL DEFAULT true
    CHECK (information_sharing_enabled),
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
