-- Current Design v1 Phase 2C-2. Additive dual ownership for artifacts used now.
BEGIN;

ALTER TABLE diagnosis_insights ADD COLUMN it_management_diagnosis_case_v2_id UUID REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT;
ALTER TABLE diagnosis_insights ALTER COLUMN diagnosis_case_id DROP NOT NULL;
ALTER TABLE diagnosis_insights ADD CONSTRAINT diagnosis_insights_exactly_one_case CHECK (num_nonnulls(diagnosis_case_id,it_management_diagnosis_case_v2_id)=1);
ALTER TABLE diagnosis_insights ADD UNIQUE(id,it_management_diagnosis_case_v2_id);

ALTER TABLE insight_sources ADD COLUMN it_management_diagnosis_case_v2_id UUID REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT;
ALTER TABLE insight_sources ALTER COLUMN diagnosis_case_id DROP NOT NULL;
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_exactly_one_case CHECK (num_nonnulls(diagnosis_case_id,it_management_diagnosis_case_v2_id)=1);
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_vs1_insight_case_fkey FOREIGN KEY(diagnosis_insight_id,it_management_diagnosis_case_v2_id) REFERENCES diagnosis_insights(id,it_management_diagnosis_case_v2_id);

ALTER TABLE hearing_intake_response_v2 ADD UNIQUE(id,case_id);
ALTER TABLE hearing_statement_v2 ADD UNIQUE(id,case_id);
ALTER TABLE rule_analysis_execution ADD UNIQUE(id,case_id);
ALTER TABLE insight_sources DROP CONSTRAINT insight_sources_source_ref_type_check;
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_source_ref_type_check CHECK (source_ref_type IN ('SURVEY_RESPONSE','SOURCE_RECORD','HEARING_RECORD','VS1_INTAKE_RESPONSE','VS1_HEARING_STATEMENT','VS1_RULE_EXECUTION'));
ALTER TABLE insight_sources ADD COLUMN vs1_intake_response_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='VS1_INTAKE_RESPONSE' THEN source_ref_id END) STORED;
ALTER TABLE insight_sources ADD COLUMN vs1_hearing_statement_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='VS1_HEARING_STATEMENT' THEN source_ref_id END) STORED;
ALTER TABLE insight_sources ADD COLUMN vs1_rule_execution_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='VS1_RULE_EXECUTION' THEN source_ref_id END) STORED;
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_vs1_source_owner_check CHECK ((it_management_diagnosis_case_v2_id IS NOT NULL) = (source_ref_type IN ('VS1_INTAKE_RESPONSE','VS1_HEARING_STATEMENT','VS1_RULE_EXECUTION')));
ALTER TABLE insight_sources ADD FOREIGN KEY(vs1_intake_response_id,it_management_diagnosis_case_v2_id) REFERENCES hearing_intake_response_v2(id,case_id);
ALTER TABLE insight_sources ADD FOREIGN KEY(vs1_hearing_statement_id,it_management_diagnosis_case_v2_id) REFERENCES hearing_statement_v2(id,case_id);
ALTER TABLE insight_sources ADD FOREIGN KEY(vs1_rule_execution_id,it_management_diagnosis_case_v2_id) REFERENCES rule_analysis_execution(id,case_id);

ALTER TABLE human_reviews ADD COLUMN it_management_diagnosis_case_v2_id UUID REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT;
ALTER TABLE human_reviews ALTER COLUMN diagnosis_case_id DROP NOT NULL;
ALTER TABLE human_reviews ADD CONSTRAINT human_reviews_exactly_one_case CHECK (num_nonnulls(diagnosis_case_id,it_management_diagnosis_case_v2_id)=1);

ALTER TABLE diagnosis_reports ADD COLUMN it_management_diagnosis_case_v2_id UUID REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT;
ALTER TABLE diagnosis_reports ALTER COLUMN diagnosis_case_id DROP NOT NULL;
ALTER TABLE diagnosis_reports ADD CONSTRAINT diagnosis_reports_exactly_one_case CHECK (num_nonnulls(diagnosis_case_id,it_management_diagnosis_case_v2_id)=1);
CREATE UNIQUE INDEX diagnosis_reports_vs1_case_version ON diagnosis_reports(it_management_diagnosis_case_v2_id,version) WHERE it_management_diagnosis_case_v2_id IS NOT NULL;

ALTER TABLE management_feedback_decisions ADD COLUMN it_management_diagnosis_case_v2_id UUID REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT;
ALTER TABLE management_feedback_decisions ALTER COLUMN diagnosis_case_id DROP NOT NULL;
ALTER TABLE management_feedback_decisions ADD CONSTRAINT management_feedback_decisions_exactly_one_case CHECK (num_nonnulls(diagnosis_case_id,it_management_diagnosis_case_v2_id)=1);
CREATE UNIQUE INDEX management_feedback_vs1_case_version ON management_feedback_decisions(it_management_diagnosis_case_v2_id,version) WHERE it_management_diagnosis_case_v2_id IS NOT NULL;

ALTER TABLE it_management_diagnosis_case_v2 DROP CONSTRAINT it_management_diagnosis_case_v2_status_check;
ALTER TABLE it_management_diagnosis_case_v2 ADD CONSTRAINT it_management_diagnosis_case_v2_status_check CHECK (status IN ('APPLICATION_STARTED','INTAKE_IN_PROGRESS','INTAKE_COMPLETED','FOCUS_SELECTED','BOOKING_PENDING','PREPARATION_IN_PROGRESS','HEARING_IN_PROGRESS','HEARING_ORGANIZING','HEARING_COMPLETED','RULE_ANALYSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','ANALYSIS_REJECTED','ANALYSIS_APPROVED','PRELIMINARY_SCOPE_READY','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED','CLOSED'));
ALTER TABLE it_management_diagnosis_case_v2 ADD COLUMN feedback_report_id UUID;
ALTER TABLE it_management_diagnosis_case_v2 ADD COLUMN feedback_started_at TIMESTAMPTZ;
ALTER TABLE it_management_diagnosis_case_v2 ADD COLUMN feedback_started_by_user_id TEXT;
ALTER TABLE it_management_diagnosis_case_v2 ADD COLUMN feedback_completed_at TIMESTAMPTZ;

CREATE TABLE it_management_diagnosis_case_v2_audit (
 id UUID PRIMARY KEY, case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
 command TEXT NOT NULL, actor_user_id TEXT NOT NULL, detail_json JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX it_management_diagnosis_case_v2_audit_case_idx ON it_management_diagnosis_case_v2_audit(case_id,created_at);
COMMIT;
