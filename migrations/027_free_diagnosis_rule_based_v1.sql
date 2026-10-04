-- IT経営KAIZEN 無料診断 Rule-Based v1, Production Vertical Slice 1.
-- New tables only. Existing diagnosis_cases/organizations/participants (Historical V1/V2)
-- are untouched. See docs/free-diagnosis-rule-based-v1-implementation-specification-20261003.md §3.
-- Deliberately out of Slice 1 scope (not created here): commercial_final_decision
-- (Human Commercial Review is after Management Feedback, which Slice 1 does not reach).

CREATE TABLE company (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  corporate_number TEXT,
  created_by_user_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contact (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT,
  phone TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contact_company_idx ON contact(company_id);

-- Sales Launcher orchestration record only. Owns no Business Web or IT-KAIZEN domain data
-- ("共通入口はサービスを起動する、サービスの中身は共通化しない").
CREATE TABLE sales_activity (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
  primary_contact_id UUID REFERENCES contact(id) ON DELETE RESTRICT,
  selected_service TEXT NOT NULL CHECK (selected_service IN ('IT_KAIZEN','BUSINESS_WEB')),
  created_by_user_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_activity_company_idx ON sales_activity(company_id);

-- Deliberately separate from existing diagnosis_cases (Historical V1/V2 Survey path).
-- Existing table is not modified, renamed, or reused.
CREATE TABLE it_management_diagnosis_case_v2 (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES contact(id) ON DELETE RESTRICT,
  sales_activity_id UUID NOT NULL REFERENCES sales_activity(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'APPLICATION_STARTED' CHECK (status IN (
    'APPLICATION_STARTED','INTAKE_IN_PROGRESS','INTAKE_COMPLETED','FOCUS_SELECTED',
    'BOOKING_PENDING','PREPARATION_IN_PROGRESS','HEARING_IN_PROGRESS','HEARING_ORGANIZING',
    'HEARING_COMPLETED','RULE_ANALYSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','ANALYSIS_REJECTED',
    'ANALYSIS_APPROVED','PRELIMINARY_SCOPE_READY'
  )),
  primary_focus TEXT CHECK (primary_focus IN (
    'H00_MANAGEMENT_DISCOVERY','M01_IT_MANAGEMENT_JUDGMENT','M02_IT_OPERATION_CONTINUITY',
    'M03_BUSINESS_DEFENSE_CONTINUITY','M04_BUSINESS_PRODUCTIVITY','M05_GROWTH_CHANGE_ADAPTATION',
    'M06_IT_STRATEGIC_USE'
  )),
  secondary_focus TEXT CHECK (secondary_focus IN (
    'H00_MANAGEMENT_DISCOVERY','M01_IT_MANAGEMENT_JUDGMENT','M02_IT_OPERATION_CONTINUITY',
    'M03_BUSINESS_DEFENSE_CONTINUITY','M04_BUSINESS_PRODUCTIVITY','M05_GROWTH_CHANGE_ADAPTATION',
    'M06_IT_STRATEGIC_USE'
  )),
  -- Internal Production Dogfooding guard (Doc B §11): Slice 1 has no public intake lane,
  -- every Case created through it is an internal test case by construction.
  is_internal_test BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (secondary_focus IS NULL OR primary_focus IS NULL OR secondary_focus <> primary_focus)
);
CREATE INDEX it_management_diagnosis_case_v2_company_idx ON it_management_diagnosis_case_v2(company_id);
CREATE INDEX it_management_diagnosis_case_v2_status_idx ON it_management_diagnosis_case_v2(status);

-- 7-question Hearing Intake. One current answer per question (editable until Focus Selected);
-- this is Intake data entry, not the append-only Hearing Statement record below.
CREATE TABLE hearing_intake_response_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  question_code TEXT NOT NULL CHECK (question_code IN ('Q1','Q2','Q3','Q4','Q5','Q6','Q7')),
  channel TEXT NOT NULL CHECK (channel IN ('SELF','PROXY')),
  raw_value_json JSONB NOT NULL,
  entered_by_user_id TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('CUSTOMER_SELF','SALES_PROXY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, question_code)
);

-- Raw Hearing statement + operator note, append-only. 整理モード reconfirmation inserts a new
-- row (same plan_item_ref); it never rewrites an existing statement_text (Acceptance test:
-- "Statement + Source preserveが、整理モード後も元のStatementを書き換えないこと").
CREATE TABLE hearing_statement_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  plan_item_ref TEXT,
  statement_text TEXT NOT NULL CHECK (length(trim(statement_text)) > 0),
  operator_note_text TEXT,
  knowledge_state TEXT NOT NULL CHECK (knowledge_state IN ('KNOWN','AVAILABLE','PARTIAL','UNKNOWN')),
  -- Structural fact the Staff records directly from the conversation: this plan item covers
  -- multiple targets (subsidiaries/sites/vendors/...) that cannot be confirmed via one
  -- representative source and would each need individual confirmation to establish the Fact.
  -- This is the sole source for the requires_individual_confirmation_per_target Gate -- never
  -- a count of targets (Rule doc §6/§11 Guardrails: no scope-up from headcount/site-count alone).
  requires_individual_confirmation BOOLEAN NOT NULL DEFAULT false,
  -- UI上で「ない（存在しない、確認済み）」と「分からない（UNKNOWN）」を区別するための表示フラグ。
  -- knowledge_state='KNOWN'の時のみ意味を持つ（「確認できた内容が『ない』という回答だった」）。
  is_negative_answer BOOLEAN NOT NULL DEFAULT false,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_user_id TEXT NOT NULL
);
CREATE INDEX hearing_statement_v2_case_idx ON hearing_statement_v2(case_id, recorded_at);

CREATE OR REPLACE FUNCTION prevent_hearing_statement_v2_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hearing_statement_v2 rows are append-only';
END $$;
CREATE TRIGGER trg_hearing_statement_v2_immutable
BEFORE UPDATE OR DELETE ON hearing_statement_v2
FOR EACH ROW EXECUTE FUNCTION prevent_hearing_statement_v2_mutation();

-- Deterministic Rule Analysis execution record. No AI, no lease/timeout columns (runs
-- synchronously in-request; status exists for audit/history, not queueing).
CREATE TABLE rule_analysis_execution (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'SUCCEEDED' CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  rule_version TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Human Review outcome (step 9/10). NULL until a staff member reviews this execution.
  review_status TEXT CHECK (review_status IN ('APPROVED','REJECTED')),
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  -- Doc E #9 Human Review: 編集して採用 (wording edit) / 却下 (omit) per finding, within the
  -- existing Rule output -- never changes the underlying grounds/Gates, only how a specific
  -- finding is presented or whether it is carried forward. Never free-form score/judgment.
  review_notes_json JSONB,
  CHECK ((review_status IS NULL AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
      OR (review_status IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rule_analysis_execution_case_idx ON rule_analysis_execution(case_id, created_at DESC);

-- T1-T4 trigger outputs + per-trigger Investigation Need. Investigation Need here is never
-- read as an input to assessment_structure_suggestion (Guardrail, see Rule doc §6/§11).
CREATE TABLE investigation_output (
  id UUID PRIMARY KEY,
  rule_analysis_execution_id UUID NOT NULL REFERENCES rule_analysis_execution(id) ON DELETE RESTRICT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('T1_KNOWLEDGE','T2_DECISION','T3_CHANGE','T4_OPPORTUNITY')),
  investigation_need TEXT NOT NULL CHECK (investigation_need IN ('RECOMMENDED','OPTIONAL','NO_IMMEDIATE_INVESTIGATION_NEED')),
  grounds_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX investigation_output_execution_idx ON investigation_output(rule_analysis_execution_id);

-- Assessment Structure / Suggested Scope Rule output (commit f416119). Append-only across
-- stages: a later PRELIMINARY/RECOMMENDATION row never overwrites an earlier one.
CREATE TABLE assessment_structure_suggestion (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('PRELIMINARY','RECOMMENDATION')),
  structure TEXT NOT NULL CHECK (structure IN ('LIMITED','STANDARD_CROSS_FUNCTIONAL','EXTENDED','UNRESOLVED')),
  suggested_scope TEXT NOT NULL CHECK (suggested_scope IN ('COMPACT','STANDARD','EXPANDED','REVIEW')),
  suggested_base_price INTEGER,
  grounds_json JSONB NOT NULL,
  gate_flags_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((suggested_scope = 'REVIEW' AND suggested_base_price IS NULL)
      OR (suggested_scope <> 'REVIEW' AND suggested_base_price IS NOT NULL))
);
CREATE INDEX assessment_structure_suggestion_case_idx ON assessment_structure_suggestion(case_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_assessment_structure_suggestion_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assessment_structure_suggestion rows are append-only';
END $$;
CREATE TRIGGER trg_assessment_structure_suggestion_immutable
BEFORE UPDATE OR DELETE ON assessment_structure_suggestion
FOR EACH ROW EXECUTE FUNCTION prevent_assessment_structure_suggestion_mutation();

-- Runtime privileges for the 9 tables above. 018_runtime_table_privileges.sql's
-- ALTER DEFAULT PRIVILEGES only covers sales_tools_runtime, not the current Production
-- application role sales_tools_app (confirmed via pre-apply Production ledger/role review,
-- same gap 019/026 already grant around for web_development_partner_leads and
-- business_web_consultation_leads). Same role-exists-safe DO block pattern as those two.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sales_activity TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE it_management_diagnosis_case_v2 TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hearing_intake_response_v2 TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hearing_statement_v2 TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rule_analysis_execution TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE investigation_output TO sales_tools_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assessment_structure_suggestion TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sales_activity TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE it_management_diagnosis_case_v2 TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hearing_intake_response_v2 TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hearing_statement_v2 TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rule_analysis_execution TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE investigation_output TO sales_tools_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assessment_structure_suggestion TO sales_tools_app;
  END IF;
END
$$;
