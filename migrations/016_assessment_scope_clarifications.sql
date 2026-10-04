-- AS-A3: Route-C-only missing-information clarification.
-- Application/Translation layer only. This table is deliberately separate from
-- assessment_confirmation_items, which remains Assessment Evidence confirmation.
CREATE TABLE assessment_scope_clarifications (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  dimension TEXT NOT NULL CHECK (dimension IN (
    'TARGET_SCOPE','INFORMATION_LOCATION','MANAGEMENT_OWNER',
    'EVIDENCE_ACCESS','INTERVIEW_SCOPE','SPECIAL_REQUIREMENT'
  )),
  prompt_ja TEXT NOT NULL,
  reason_ja TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','NOT_REQUIRED')),
  source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution_source_record_id UUID,
  created_by_user_id TEXT NOT NULL,
  resolved_by_user_id TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id, diagnosis_case_id),
  FOREIGN KEY(resolution_source_record_id, diagnosis_case_id)
    REFERENCES source_records(id, diagnosis_case_id),
  CHECK ((status='RESOLVED' AND resolution_source_record_id IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL)
      OR (status<>'RESOLVED' AND resolution_source_record_id IS NULL AND resolved_by_user_id IS NULL AND resolved_at IS NULL))
);
CREATE INDEX assessment_scope_clarifications_case_status
  ON assessment_scope_clarifications(diagnosis_case_id,status,created_at);
