-- Bind every PDF artifact to the exact approved report snapshot that authorized it.
ALTER TABLE diagnosis_report_pdf_artifacts
  ADD COLUMN source_content_hash TEXT;
UPDATE diagnosis_report_pdf_artifacts a
   SET source_content_hash = r.snapshot_json->>'content_hash'
  FROM diagnosis_reports r
 WHERE r.id=a.report_id AND r.diagnosis_case_id=a.diagnosis_case_id;
ALTER TABLE diagnosis_report_pdf_artifacts
  ALTER COLUMN source_content_hash SET NOT NULL,
  ADD CONSTRAINT diagnosis_report_pdf_source_content_hash_check
    CHECK (source_content_hash ~ '^[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION protect_diagnosis_report_pdf_artifact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_report RECORD;
BEGIN
  IF TG_OP='DELETE' THEN IF OLD.status='READY' THEN RAISE EXCEPTION 'Ready PDF artifact is immutable'; END IF; RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.status='READY' THEN RAISE EXCEPTION 'Ready PDF artifact is immutable'; END IF;
  SELECT version,status,snapshot_json INTO source_report FROM diagnosis_reports WHERE id=NEW.report_id AND diagnosis_case_id=NEW.diagnosis_case_id;
  IF NOT FOUND OR source_report.status NOT IN ('APPROVED','DELIVERED') OR source_report.snapshot_json IS NULL THEN RAISE EXCEPTION 'PDF artifact requires an approved report'; END IF;
  IF NEW.report_version<>source_report.version THEN RAISE EXCEPTION 'PDF artifact report version mismatch'; END IF;
  IF NEW.source_content_hash<>(source_report.snapshot_json->>'content_hash') THEN RAISE EXCEPTION 'PDF artifact source content hash mismatch'; END IF;
  IF TG_OP='UPDATE' AND (NEW.report_id<>OLD.report_id OR NEW.diagnosis_case_id<>OLD.diagnosis_case_id OR NEW.report_version<>OLD.report_version OR NEW.source_content_hash<>OLD.source_content_hash OR NEW.created_at<>OLD.created_at) THEN RAISE EXCEPTION 'PDF artifact identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
