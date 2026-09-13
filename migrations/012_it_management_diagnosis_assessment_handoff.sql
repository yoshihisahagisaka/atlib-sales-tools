-- Slice 6: independent sales lifecycle, deterministic handoff, explicit Human close.
ALTER TABLE diagnosis_cases DROP CONSTRAINT diagnosis_cases_diagnosis_status_check;
ALTER TABLE diagnosis_cases ADD CONSTRAINT diagnosis_cases_diagnosis_status_check CHECK (diagnosis_status IN ('APPLICATION_STARTED','SURVEY_IN_PROGRESS','SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED','REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED','CLOSED'));
ALTER TABLE diagnosis_cases ADD COLUMN assessment_metadata_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE diagnosis_cases ADD COLUMN closed_at TIMESTAMPTZ;
ALTER TABLE diagnosis_cases ADD COLUMN closed_by_user_id TEXT;
ALTER TABLE diagnosis_cases ADD CONSTRAINT diagnosis_close_metadata CHECK (diagnosis_status<>'CLOSED' OR (closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL));
CREATE TABLE assessment_handoffs (
 id UUID PRIMARY KEY, diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
 version INTEGER NOT NULL CHECK (version>0),
 status TEXT NOT NULL CHECK (status IN ('DRAFT','READY','TRANSFERRED','ACCEPTED')),
 report_id UUID NOT NULL,
 snapshot_json JSONB NOT NULL, snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
 created_by_user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 transferred_by_user_id TEXT, transferred_at TIMESTAMPTZ,
 accepted_by_user_id TEXT, accepted_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,diagnosis_case_id), UNIQUE(diagnosis_case_id,version),
 FOREIGN KEY(report_id,diagnosis_case_id) REFERENCES diagnosis_reports(id,diagnosis_case_id),
 CHECK (status NOT IN ('TRANSFERRED','ACCEPTED') OR (transferred_by_user_id IS NOT NULL AND transferred_at IS NOT NULL)),
 CHECK (status<>'ACCEPTED' OR (accepted_by_user_id IS NOT NULL AND accepted_at IS NOT NULL))
);
CREATE FUNCTION protect_assessment_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('READY','TRANSFERRED','ACCEPTED') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Handoff is immutable'; END IF;
  IF (to_jsonb(NEW)-'status'-'transferred_by_user_id'-'transferred_at'-'accepted_by_user_id'-'accepted_at'-'updated_at') IS DISTINCT FROM
     (to_jsonb(OLD)-'status'-'transferred_by_user_id'-'transferred_at'-'accepted_by_user_id'-'accepted_at'-'updated_at')
   OR NOT (NEW.status=OLD.status OR (OLD.status='READY' AND NEW.status='TRANSFERRED') OR (OLD.status='TRANSFERRED' AND NEW.status='ACCEPTED'))
   OR (OLD.status IN ('TRANSFERRED','ACCEPTED') AND (NEW.transferred_at IS DISTINCT FROM OLD.transferred_at OR NEW.transferred_by_user_id IS DISTINCT FROM OLD.transferred_by_user_id))
   OR (OLD.status='ACCEPTED' AND (NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.accepted_by_user_id IS DISTINCT FROM OLD.accepted_by_user_id))
  THEN RAISE EXCEPTION 'Handoff is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_handoffs_freeze BEFORE UPDATE OR DELETE ON assessment_handoffs FOR EACH ROW EXECUTE FUNCTION protect_assessment_handoff();
