-- Public Customer Self Adapter audit + retry coordination.
-- This is an entry adapter record, not a Diagnosis Case replacement or a FACTACT object.
BEGIN;

CREATE TABLE it_management_public_self_submission (
  idempotency_key UUID PRIMARY KEY,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  sales_activity_id UUID NOT NULL REFERENCES sales_activity(id) ON DELETE RESTRICT,
  it_management_diagnosis_case_v2_id UUID NOT NULL UNIQUE REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  privacy_consent BOOLEAN NOT NULL CHECK (privacy_consent),
  diagnosis_use_consent BOOLEAN NOT NULL CHECK (diagnosis_use_consent),
  consent_wording_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_provenance TEXT NOT NULL CHECK (consent_provenance = 'CUSTOMER_SELF'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX it_management_public_self_submission_case_idx
  ON it_management_public_self_submission(it_management_diagnosis_case_v2_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE it_management_public_self_submission TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE it_management_public_self_submission TO sales_tools_app;
  END IF;
END
$$;

COMMIT;
