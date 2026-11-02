-- PIRA public intake is deliberately separate from public_auth and Sales Tools case data.
CREATE SCHEMA IF NOT EXISTS pira;

CREATE TYPE pira.initiative_kind AS ENUM ('UNION', 'GENERAL');
CREATE TYPE pira.submission_state AS ENUM ('RECEIVED', 'ANSWERING', 'COMPLETED');

CREATE TABLE pira.pira_initiative (
  initiative_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_code text NOT NULL UNIQUE,
  initiative_kind pira.initiative_kind NOT NULL,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pira.pira_submission (
  submission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL UNIQUE,
  initiative_id uuid NOT NULL REFERENCES pira.pira_initiative(initiative_id),
  initiative_kind pira.initiative_kind NOT NULL,
  company_name text NOT NULL,
  company_name_normalized text NOT NULL,
  contact_name text NOT NULL,
  verified_email text NOT NULL,
  website_url text NOT NULL,
  phone text,
  union_name text,
  address text,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  sales_use_allowed boolean NOT NULL,
  state pira.submission_state NOT NULL DEFAULT 'RECEIVED',
  received_at timestamptz NOT NULL DEFAULT now(),
  answering_at timestamptz,
  completed_at timestamptz,
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  CONSTRAINT pira_submission_union_shape CHECK (
    (initiative_kind='UNION' AND union_name IS NOT NULL AND address IS NOT NULL AND sales_use_allowed=false)
    OR (initiative_kind='GENERAL' AND union_name IS NULL AND address IS NULL)
  )
);
CREATE INDEX pira_submission_completed_replay_idx
  ON pira.pira_submission(initiative_kind, company_name_normalized, verified_email, completed_at DESC)
  WHERE state='COMPLETED';

-- jti is owned by this receiving service, not by the common OTP service.
CREATE TABLE pira.pira_consumed_jti (
  jti text PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES pira.pira_submission(submission_id),
  operation text NOT NULL CHECK (operation IN ('CREATE_SUBMISSION', 'UPDATE_STATE')),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX pira_consumed_jti_expiry_idx ON pira.pira_consumed_jti(expires_at);

-- Reserved for the independent administration/export phase; no export is implemented here.
CREATE TABLE pira.pira_export_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_subject text NOT NULL,
  initiative_code text,
  exported_at timestamptz NOT NULL DEFAULT now(),
  filter_snapshot jsonb NOT NULL,
  format text NOT NULL CHECK (format IN ('CSV', 'XLSX'))
);
