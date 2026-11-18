-- SECU:MIE Web / assembly intake: DRAFT ONLY.
-- Not registered in the shared migration runner; Insight DB owner must approve
-- schema ownership, role grants, and numbering before application.
-- No OTP tables or PDF storage are created here.
CREATE SCHEMA IF NOT EXISTS secumie_web;

CREATE TABLE secumie_web.assembly_intake (
  intake_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_code text NOT NULL,
  organizer_name text NOT NULL,
  union_id text NOT NULL,
  union_name_snapshot text NOT NULL,
  company_name text NOT NULL,
  registered_address text NOT NULL,
  website_url text NOT NULL,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  result_delivery_mode text NOT NULL DEFAULT 'MANUAL'
    CHECK (result_delivery_mode = 'MANUAL'),
  information_sharing_enabled boolean NOT NULL DEFAULT true
    CHECK (information_sharing_enabled),
  request_status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (request_status IN ('RECEIVED','IN_PROGRESS','DELIVERED','CANCELLED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  CONSTRAINT assembly_required_strings CHECK (
    length(trim(reception_code)) > 0
    AND length(trim(organizer_name)) > 0
    AND length(trim(union_id)) > 0
    AND length(trim(union_name_snapshot)) > 0
    AND length(trim(company_name)) > 0
    AND length(trim(registered_address)) > 0
    AND length(trim(website_url)) > 0
    AND length(trim(consent_version)) > 0
  )
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
