-- Additive Slice 2. No legacy table or published migration changes.
ALTER TABLE diagnosis_cases DROP CONSTRAINT diagnosis_cases_diagnosis_status_check;
ALTER TABLE diagnosis_cases ADD CONSTRAINT diagnosis_cases_diagnosis_status_check CHECK
  (diagnosis_status IN ('APPLICATION_STARTED','SURVEY_IN_PROGRESS','SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS'));
ALTER TABLE diagnosis_cases ADD COLUMN plan_confirmed_by_user_id TEXT;
ALTER TABLE diagnosis_cases ADD COLUMN plan_confirmed_at TIMESTAMPTZ;
ALTER TABLE diagnosis_cases ADD COLUMN plan_snapshot_json JSONB;
ALTER TABLE diagnosis_audit_logs ADD COLUMN detail_json JSONB;

CREATE TABLE ai_executions (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  process_type TEXT NOT NULL CHECK (process_type='PRE_DIAGNOSIS_ORGANIZER'),
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  input_snapshot_json JSONB NOT NULL,
  raw_output_json JSONB,
  validation_status TEXT NOT NULL DEFAULT 'NOT_VALIDATED' CHECK (validation_status IN ('NOT_VALIDATED','VALID','INVALID')),
  error_code TEXT,
  requested_by_user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,diagnosis_case_id)
);
CREATE UNIQUE INDEX ai_executions_one_pending_case ON ai_executions(diagnosis_case_id) WHERE status IN ('PENDING','RUNNING');
CREATE INDEX ai_executions_queue ON ai_executions(status,created_at);
CREATE TABLE ai_proposals (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  ai_execution_id UUID NOT NULL,
  parent_theme_proposal_id UUID,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('THEME','QUESTION','UNKNOWN','HYPOTHESIS','EVIDENCE_CANDIDATE')),
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED','UNDER_REVIEW','ACCEPTED','ACCEPTED_WITH_EDIT','REJECTED')),
  title TEXT NOT NULL,
  content_json JSONB NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,diagnosis_case_id),
  FOREIGN KEY(ai_execution_id,diagnosis_case_id) REFERENCES ai_executions(id,diagnosis_case_id),
  FOREIGN KEY(parent_theme_proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id)
);
CREATE TABLE ai_proposal_sources (
  ai_proposal_id UUID NOT NULL,
  diagnosis_case_id UUID NOT NULL,
  source_ref_type TEXT NOT NULL CHECK (source_ref_type='SURVEY_RESPONSE'),
  source_ref_id UUID NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('SUPPORTS','CONTRADICTS','RELATED')),
  PRIMARY KEY(ai_proposal_id,source_ref_id,relation),
  FOREIGN KEY(ai_proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id),
  FOREIGN KEY(source_ref_id,diagnosis_case_id) REFERENCES survey_responses(id,diagnosis_case_id)
);
CREATE TABLE diagnosis_themes (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  title TEXT NOT NULL,
  description TEXT,
  future_relation TEXT NOT NULL,
  priority_order INTEGER NOT NULL,
  source_ai_proposal_id UUID UNIQUE,
  created_by TEXT NOT NULL CHECK (created_by IN ('AI_ACCEPTED','HUMAN')),
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,diagnosis_case_id),
  FOREIGN KEY(source_ai_proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id)
);
CREATE TABLE diagnosis_plan_items (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  diagnosis_theme_id UUID,
  item_type TEXT NOT NULL CHECK (item_type IN ('QUESTION','CONFIRMATION','FOLLOW_UP','EVIDENCE_CANDIDATE_CHECK')),
  text TEXT NOT NULL,
  purpose TEXT,
  priority_order INTEGER NOT NULL,
  source_ai_proposal_id UUID UNIQUE,
  created_by TEXT NOT NULL CHECK (created_by IN ('AI_ACCEPTED','HUMAN')),
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(diagnosis_theme_id,diagnosis_case_id) REFERENCES diagnosis_themes(id,diagnosis_case_id),
  FOREIGN KEY(source_ai_proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id)
);
CREATE INDEX ai_proposals_case ON ai_proposals(diagnosis_case_id,created_at);
CREATE INDEX diagnosis_themes_case ON diagnosis_themes(diagnosis_case_id,priority_order);
CREATE INDEX diagnosis_plan_items_case ON diagnosis_plan_items(diagnosis_case_id,priority_order);
