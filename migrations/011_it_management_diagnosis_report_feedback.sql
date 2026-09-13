-- Slice 5: report versions and frozen approval; no legacy/Raw Source rewrites.
ALTER TABLE diagnosis_cases DROP CONSTRAINT diagnosis_cases_diagnosis_status_check;
ALTER TABLE diagnosis_cases ADD CONSTRAINT diagnosis_cases_diagnosis_status_check CHECK (diagnosis_status IN ('APPLICATION_STARTED','SURVEY_IN_PROGRESS','SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED'));
ALTER TABLE ai_executions DROP CONSTRAINT ai_executions_process_type_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_process_type_check CHECK (process_type IN ('PRE_DIAGNOSIS_ORGANIZER','INTERVIEW_ASSISTANT','POST_DIAGNOSIS_STRUCTURER','REPORT_DRAFT_GENERATOR'));
ALTER TABLE source_records DROP CONSTRAINT source_records_source_type_check;
ALTER TABLE source_records ADD CONSTRAINT source_records_source_type_check CHECK (source_type IN ('INTERVIEW_STATEMENT','OPERATOR_NOTE','TRANSCRIPT','SCREEN_SHARED_INFORMATION','DOCUMENT_EXISTENCE_OBSERVED','FEEDBACK_STATEMENT'));
CREATE TABLE diagnosis_reports (
 id UUID PRIMARY KEY, diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
 version INTEGER NOT NULL CHECK (version>0), content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version>0),
 status TEXT NOT NULL CHECK (status IN ('DRAFT','REVIEW_REQUIRED','REVISION_REQUIRED','APPROVED','DELIVERED')),
 content_json JSONB NOT NULL, rendered_html TEXT, snapshot_json JSONB,
 context_json JSONB NOT NULL, context_hash TEXT NOT NULL,
 source_ai_execution_id UUID, prompt_version TEXT NOT NULL, policy_version TEXT NOT NULL,
 created_by TEXT NOT NULL CHECK (created_by IN ('AI','HUMAN')), created_by_user_id TEXT NOT NULL,
 approved_by_user_id TEXT, approved_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
 revision_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,diagnosis_case_id), UNIQUE(diagnosis_case_id,version), UNIQUE(source_ai_execution_id),
 FOREIGN KEY(source_ai_execution_id,diagnosis_case_id) REFERENCES ai_executions(id,diagnosis_case_id),
 CHECK (status NOT IN ('APPROVED','DELIVERED') OR (snapshot_json IS NOT NULL AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)),
 CHECK (status<>'DELIVERED' OR delivered_at IS NOT NULL)
);
CREATE INDEX diagnosis_reports_case_version ON diagnosis_reports(diagnosis_case_id,version DESC);
ALTER TABLE diagnosis_cases ADD COLUMN feedback_report_id UUID;
ALTER TABLE diagnosis_cases ADD COLUMN feedback_started_at TIMESTAMPTZ;
ALTER TABLE diagnosis_cases ADD COLUMN feedback_started_by_user_id TEXT;
ALTER TABLE diagnosis_cases ADD COLUMN feedback_completed_at TIMESTAMPTZ;
ALTER TABLE diagnosis_cases ADD FOREIGN KEY(feedback_report_id,id) REFERENCES diagnosis_reports(id,diagnosis_case_id);
ALTER TABLE source_records ADD COLUMN feedback_report_id UUID;
ALTER TABLE source_records ADD FOREIGN KEY(feedback_report_id,diagnosis_case_id) REFERENCES diagnosis_reports(id,diagnosis_case_id);
ALTER TABLE source_records ADD CONSTRAINT feedback_source_report_required CHECK (source_type<>'FEEDBACK_STATEMENT' OR feedback_report_id IS NOT NULL);

-- Approved content/context/snapshot are immutable, including against accidental SQL writes.
CREATE FUNCTION protect_approved_diagnosis_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('APPROVED','DELIVERED') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Approved report is immutable'; END IF;
  IF (to_jsonb(NEW)-'status'-'delivered_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'delivered_at'-'updated_at')
   OR NOT (NEW.status=OLD.status OR (OLD.status='APPROVED' AND NEW.status='DELIVERED'))
   OR (OLD.status='DELIVERED' AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
  THEN RAISE EXCEPTION 'Approved report is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnosis_reports_freeze BEFORE UPDATE OR DELETE ON diagnosis_reports FOR EACH ROW EXECUTE FUNCTION protect_approved_diagnosis_report();
