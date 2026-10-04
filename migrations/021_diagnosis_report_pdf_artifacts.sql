-- Approved report PDF artifacts are separate from immutable diagnosis_reports.
-- One artifact per report ID; reissued reports receive distinct report IDs.
CREATE TABLE diagnosis_report_pdf_artifacts (
    report_id UUID PRIMARY KEY,
    diagnosis_case_id UUID NOT NULL,
    report_version INTEGER NOT NULL CHECK (report_version > 0),
    status TEXT NOT NULL CHECK (status IN ('PENDING','READY','FAILED')),
    object_key TEXT,
    pdf_sha256 TEXT,
    pdf_size_bytes BIGINT,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (report_id, diagnosis_case_id)
        REFERENCES diagnosis_reports(id, diagnosis_case_id),
    UNIQUE (diagnosis_case_id, report_version),
    CHECK (
        (status = 'READY'
            AND object_key IS NOT NULL
            AND pdf_sha256 ~ '^[a-f0-9]{64}$'
            AND pdf_size_bytes > 0
            AND completed_at IS NOT NULL
            AND error_code IS NULL)
        OR
        (status IN ('PENDING','FAILED')
            AND object_key IS NULL
            AND pdf_sha256 IS NULL
            AND pdf_size_bytes IS NULL
            AND completed_at IS NULL)
    ),
    CHECK (status <> 'PENDING' OR error_code IS NULL)
);

CREATE INDEX diagnosis_report_pdf_artifacts_case
    ON diagnosis_report_pdf_artifacts(diagnosis_case_id, report_version DESC);

-- Validate report identity, version and approval at artifact creation.
-- Once READY, the artifact metadata cannot be changed or deleted.
CREATE FUNCTION protect_diagnosis_report_pdf_artifact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    source_report RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'READY' THEN
            RAISE EXCEPTION 'Ready PDF artifact is immutable';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'READY' THEN
        RAISE EXCEPTION 'Ready PDF artifact is immutable';
    END IF;

    SELECT version, status, snapshot_json
      INTO source_report
      FROM diagnosis_reports
     WHERE id = NEW.report_id
       AND diagnosis_case_id = NEW.diagnosis_case_id;

    IF NOT FOUND
       OR source_report.status NOT IN ('APPROVED','DELIVERED')
       OR source_report.snapshot_json IS NULL THEN
        RAISE EXCEPTION 'PDF artifact requires an approved report';
    END IF;

    IF NEW.report_version <> source_report.version THEN
        RAISE EXCEPTION 'PDF artifact report version mismatch';
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.report_id <> OLD.report_id
        OR NEW.diagnosis_case_id <> OLD.diagnosis_case_id
        OR NEW.report_version <> OLD.report_version
        OR NEW.created_at <> OLD.created_at
    ) THEN
        RAISE EXCEPTION 'PDF artifact identity is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER diagnosis_report_pdf_artifacts_protect
BEFORE INSERT OR UPDATE OR DELETE ON diagnosis_report_pdf_artifacts
FOR EACH ROW EXECUTE FUNCTION protect_diagnosis_report_pdf_artifact();
