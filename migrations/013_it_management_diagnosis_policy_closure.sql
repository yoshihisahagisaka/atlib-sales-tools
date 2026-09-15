-- Controlled Pilot Closure: BD-01〜BD-05 technical policy foundations.
-- Additive only. No FACT authority is introduced.

CREATE TABLE diagnosis_policy_acknowledgements (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL UNIQUE REFERENCES diagnosis_cases(id) ON DELETE CASCADE,
  notice_version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('WEB','SALES_VISIT')),
  acknowledged_by_type TEXT NOT NULL CHECK (acknowledged_by_type IN ('CUSTOMER','STAFF')),
  acknowledged_by_user_id TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diagnosis_transcript_consents (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  consent_scope TEXT NOT NULL,
  customer_reference TEXT,
  evidence_note TEXT,
  recorded_by_user_id TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  revoked_by_user_id TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'REVOKED' OR (revoked_by_user_id IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX diagnosis_transcript_consents_one_active
  ON diagnosis_transcript_consents(diagnosis_case_id)
  WHERE status='ACTIVE';

ALTER TABLE source_records ADD COLUMN purpose_completed_at TIMESTAMPTZ;

CREATE FUNCTION enforce_transcript_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type='TRANSCRIPT' AND NOT EXISTS (
    SELECT 1 FROM diagnosis_transcript_consents c
      WHERE c.diagnosis_case_id=NEW.diagnosis_case_id AND c.status='ACTIVE' AND c.consented_at <= now()
  ) THEN
    RAISE EXCEPTION 'TRANSCRIPT_CONSENT_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_records_transcript_consent
  BEFORE INSERT ON source_records
  FOR EACH ROW EXECUTE FUNCTION enforce_transcript_consent();

CREATE TABLE diagnosis_deletion_requests (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED','SCOPED','APPROVED','REJECTED','EXECUTION_PENDING','COMPLETED','PARTIALLY_RETAINED','FAILED')),
  requester_reference TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scoped_data_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision_reason TEXT,
  approved_by_user_id TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id TEXT,
  rejected_at TIMESTAMPTZ,
  restricted_retention_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  executed_by_user_id TEXT,
  executed_at TIMESTAMPTZ,
  failure_code TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'APPROVED' OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'REJECTED' OR (rejected_by_user_id IS NOT NULL AND rejected_at IS NOT NULL)),
  CHECK (status NOT IN ('COMPLETED','PARTIALLY_RETAINED') OR (executed_by_user_id IS NOT NULL AND executed_at IS NOT NULL))
);
CREATE INDEX diagnosis_deletion_requests_case ON diagnosis_deletion_requests(diagnosis_case_id,created_at DESC);

CREATE TABLE diagnosis_retention_holds (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  data_class TEXT NOT NULL CHECK (data_class IN ('GENERAL_RAW_DIAGNOSIS','TRANSCRIPT_RECORDING','RAW_AI_IO','APPROVED_DECISION_EVIDENCE')),
  reason TEXT NOT NULL,
  approved_by_user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > started_at)
);
CREATE INDEX diagnosis_retention_holds_active ON diagnosis_retention_holds(diagnosis_case_id,data_class)
  WHERE ended_at IS NULL;

CREATE TABLE diagnosis_deletion_tombstones (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  deletion_request_id UUID REFERENCES diagnosis_deletion_requests(id),
  data_class TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  deleted_or_anonymized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL CHECK (action IN ('DELETE','ANONYMIZE','RESTRICT_RETAIN')),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(target_kind,target_id,action)
);

COMMENT ON TABLE diagnosis_policy_acknowledgements IS 'Versioned pre-submit service/data-use acknowledgement provenance. Legal wording remains external to schema.';
COMMENT ON TABLE diagnosis_transcript_consents IS 'Separate explicit consent required before Transcript/Recording capture/import/processing.';
COMMENT ON TABLE diagnosis_deletion_requests IS 'Human-controlled customer deletion/anonymization workflow; not a FACTACT Core Object.';
COMMENT ON TABLE diagnosis_deletion_tombstones IS 'Durable reconciliation records used to prevent deleted data from permanently reappearing after restore.';
