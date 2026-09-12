-- Additive Diagnosis Domain. Legacy migrations and tables remain untouched.
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0 AND name !~ '様[[:space:]]*$'),
  corporate_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE diagnosis_cases (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  entry_channel TEXT NOT NULL CHECK (entry_channel IN ('WEB', 'SALES_VISIT')),
  diagnosis_status TEXT NOT NULL CHECK (diagnosis_status IN ('APPLICATION_STARTED', 'SURVEY_IN_PROGRESS', 'SURVEY_COMPLETED')),
  assessment_status TEXT NOT NULL DEFAULT 'NOT_PROPOSED' CHECK (assessment_status IN ('NOT_PROPOSED','PROPOSED','PENDING','ACCEPTED','DECLINED')),
  -- Existing Google Workspace authentication uses email as the staff principal.
  owner_user_id TEXT,
  waiting_reason TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  survey_version INTEGER NOT NULL,
  access_token_hash TEXT CHECK (access_token_hash IS NULL OR access_token_hash ~ '^[a-f0-9]{64}$'),
  access_token_expires_at TIMESTAMPTZ,
  access_token_revoked_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (entry_channel <> 'WEB' OR (access_token_hash IS NOT NULL AND access_token_expires_at IS NOT NULL))
);
CREATE INDEX diagnosis_cases_status_created_idx ON diagnosis_cases(diagnosis_status, created_at DESC, id);
CREATE TABLE participants (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id, diagnosis_case_id)
);
CREATE TABLE participant_roles (
  participant_id UUID NOT NULL REFERENCES participants(id),
  role TEXT NOT NULL CHECK (role IN ('RESPONDENT','INTERVIEWEE','EXECUTIVE','SALES','DIAGNOSIS_OPERATOR','FEEDBACK_PARTICIPANT')),
  PRIMARY KEY(participant_id, role)
);
CREATE TABLE survey_questions (
  id UUID PRIMARY KEY,
  question_code TEXT NOT NULL,
  version INTEGER NOT NULL,
  display_order INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  answer_type TEXT NOT NULL CHECK (answer_type IN ('SINGLE_SELECT','MULTI_SELECT','TEXT')),
  options_json JSONB,
  is_required BOOLEAN NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(question_code, version),
  UNIQUE(id, version)
);
CREATE TABLE survey_responses (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  question_id UUID NOT NULL,
  question_version INTEGER NOT NULL,
  respondent_participant_id UUID NOT NULL,
  raw_value_json JSONB NOT NULL,
  entry_channel TEXT NOT NULL CHECK (entry_channel IN ('WEB','SALES_VISIT')),
  entered_by_user_id TEXT,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(question_id, question_version) REFERENCES survey_questions(id, version),
  FOREIGN KEY(respondent_participant_id, diagnosis_case_id) REFERENCES participants(id, diagnosis_case_id),
  UNIQUE(diagnosis_case_id, question_id),
  UNIQUE(id, diagnosis_case_id)
);
CREATE TABLE diagnosis_futures (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  statement TEXT NOT NULL,
  time_horizon TEXT,
  intent_status TEXT NOT NULL CHECK (intent_status IN ('SURVEY_STATED','INTERVIEW_RECONFIRMED')),
  source_ref_type TEXT NOT NULL CHECK (source_ref_type = 'SURVEY_RESPONSE'),
  source_ref_id UUID NOT NULL,
  reconfirmed_by_participant_id UUID REFERENCES participants(id),
  reconfirmed_by_user_id TEXT,
  reconfirmed_at TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(source_ref_id, diagnosis_case_id) REFERENCES survey_responses(id, diagnosis_case_id),
  UNIQUE(diagnosis_case_id, version)
);
CREATE UNIQUE INDEX diagnosis_futures_current_idx ON diagnosis_futures(diagnosis_case_id) WHERE is_current;
CREATE TABLE case_transitions (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  command TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER','STAFF')),
  actor_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX case_transitions_case_idx ON case_transitions(diagnosis_case_id, created_at);
CREATE TABLE diagnosis_audit_logs (
  id UUID PRIMARY KEY,
  diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
  command TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER','STAFF')),
  actor_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX diagnosis_audit_logs_case_idx ON diagnosis_audit_logs(diagnosis_case_id, created_at);
-- Versioned question definitions are inserted from the central TypeScript seed by
-- CreateDiagnosisCase in the same transaction (ON CONFLICT DO NOTHING).
-- Existing cases always read their pinned definitions from survey_questions.
