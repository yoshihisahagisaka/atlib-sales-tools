-- IT経営KAIZEN 無料診断 Design v2 Package B persistence.
-- Additive only. Migrations 027-032 and all HA6 routes remain unchanged.
BEGIN;

CREATE TABLE it_management_diagnosis_original_survey_snapshot_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL UNIQUE REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  survey_version TEXT NOT NULL CHECK (length(trim(survey_version)) > 0),
  entry_channel TEXT NOT NULL CHECK (entry_channel IN ('CUSTOMER_SELF','STAFF_PROXY')),
  answered_by_role TEXT NOT NULL CHECK (length(trim(answered_by_role)) > 0),
  entered_by_user_id TEXT,
  answers_json JSONB NOT NULL CHECK (jsonb_typeof(answers_json) = 'object'),
  submitted_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, case_id)
);

CREATE TABLE it_management_diagnosis_current_state_revision_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('INITIAL_FROM_ORIGINAL','HUMAN_UPDATE')),
  based_on_original_snapshot_id UUID NOT NULL,
  previous_state_id UUID,
  state_json JSONB NOT NULL CHECK (jsonb_typeof(state_json) = 'object'),
  supplement_json JSONB CHECK (supplement_json IS NULL OR jsonb_typeof(supplement_json) = 'object'),
  updated_by_user_id TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, revision_no),
  UNIQUE (id, case_id),
  CHECK ((revision_no = 1 AND source_type = 'INITIAL_FROM_ORIGINAL' AND previous_state_id IS NULL)
      OR (revision_no > 1 AND source_type = 'HUMAN_UPDATE' AND previous_state_id IS NOT NULL)),
  FOREIGN KEY (based_on_original_snapshot_id, case_id)
    REFERENCES it_management_diagnosis_original_survey_snapshot_v2(id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_state_id, case_id)
    REFERENCES it_management_diagnosis_current_state_revision_v2(id, case_id) ON DELETE RESTRICT
);
CREATE INDEX it_management_diagnosis_current_state_v2_latest_idx
  ON it_management_diagnosis_current_state_revision_v2(case_id, revision_no DESC);

CREATE TABLE it_management_diagnosis_analysis_result_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  current_state_id UUID NOT NULL,
  analyzer_version TEXT NOT NULL CHECK (length(trim(analyzer_version)) > 0),
  rule_set_version TEXT NOT NULL CHECK (length(trim(rule_set_version)) > 0),
  analysis_json JSONB NOT NULL CHECK (jsonb_typeof(analysis_json) = 'object'),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (current_state_id, analyzer_version, rule_set_version),
  UNIQUE (id, case_id),
  UNIQUE (id, current_state_id, case_id),
  FOREIGN KEY (current_state_id, case_id)
    REFERENCES it_management_diagnosis_current_state_revision_v2(id, case_id) ON DELETE RESTRICT
);
CREATE INDEX it_management_diagnosis_analysis_result_v2_case_idx
  ON it_management_diagnosis_analysis_result_v2(case_id, created_at DESC);

CREATE TABLE it_management_diagnosis_generated_narrative_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  current_state_id UUID NOT NULL,
  analysis_result_id UUID NOT NULL,
  generator_version TEXT NOT NULL CHECK (length(trim(generator_version)) > 0),
  content_json JSONB NOT NULL CHECK (jsonb_typeof(content_json) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_result_id, generator_version),
  UNIQUE (id, case_id),
  FOREIGN KEY (current_state_id, case_id)
    REFERENCES it_management_diagnosis_current_state_revision_v2(id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (analysis_result_id, current_state_id, case_id)
    REFERENCES it_management_diagnosis_analysis_result_v2(id, current_state_id, case_id) ON DELETE RESTRICT
);
CREATE INDEX it_management_diagnosis_generated_narrative_v2_case_idx
  ON it_management_diagnosis_generated_narrative_v2(case_id, created_at DESC);

CREATE TABLE it_management_diagnosis_human_edited_narrative_v2 (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  generated_narrative_id UUID NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  content_json JSONB NOT NULL CHECK (jsonb_typeof(content_json) = 'object'),
  edited_by_user_id TEXT NOT NULL CHECK (length(trim(edited_by_user_id)) > 0),
  edit_reason TEXT,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generated_narrative_id, revision_no),
  UNIQUE (id, case_id),
  FOREIGN KEY (generated_narrative_id, case_id)
    REFERENCES it_management_diagnosis_generated_narrative_v2(id, case_id) ON DELETE RESTRICT
);
CREATE INDEX it_management_diagnosis_human_edited_narrative_v2_case_idx
  ON it_management_diagnosis_human_edited_narrative_v2(case_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_free_diagnosis_design_v2_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Design v2 persistence history is append-only';
END $$;

CREATE TRIGGER original_survey_snapshot_v2_immutable BEFORE UPDATE OR DELETE
  ON it_management_diagnosis_original_survey_snapshot_v2 FOR EACH ROW
  EXECUTE FUNCTION prevent_free_diagnosis_design_v2_history_mutation();
CREATE TRIGGER current_state_revision_v2_immutable BEFORE UPDATE OR DELETE
  ON it_management_diagnosis_current_state_revision_v2 FOR EACH ROW
  EXECUTE FUNCTION prevent_free_diagnosis_design_v2_history_mutation();
CREATE TRIGGER analysis_result_v2_immutable BEFORE UPDATE OR DELETE
  ON it_management_diagnosis_analysis_result_v2 FOR EACH ROW
  EXECUTE FUNCTION prevent_free_diagnosis_design_v2_history_mutation();
CREATE TRIGGER generated_narrative_v2_immutable BEFORE UPDATE OR DELETE
  ON it_management_diagnosis_generated_narrative_v2 FOR EACH ROW
  EXECUTE FUNCTION prevent_free_diagnosis_design_v2_history_mutation();
CREATE TRIGGER human_edited_narrative_v2_immutable BEFORE UPDATE OR DELETE
  ON it_management_diagnosis_human_edited_narrative_v2 FOR EACH ROW
  EXECUTE FUNCTION prevent_free_diagnosis_design_v2_history_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT ON TABLE
      it_management_diagnosis_original_survey_snapshot_v2,
      it_management_diagnosis_current_state_revision_v2,
      it_management_diagnosis_analysis_result_v2,
      it_management_diagnosis_generated_narrative_v2,
      it_management_diagnosis_human_edited_narrative_v2 TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT ON TABLE
      it_management_diagnosis_original_survey_snapshot_v2,
      it_management_diagnosis_current_state_revision_v2,
      it_management_diagnosis_analysis_result_v2,
      it_management_diagnosis_generated_narrative_v2,
      it_management_diagnosis_human_edited_narrative_v2 TO sales_tools_app;
  END IF;
END
$$;

COMMIT;
