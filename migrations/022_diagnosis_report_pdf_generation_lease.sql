-- Generation lease for approved report PDF artifacts.
-- READY artifacts remain immutable under migration 021.
ALTER TABLE diagnosis_report_pdf_artifacts ADD COLUMN generation_token UUID, ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE diagnosis_report_pdf_artifacts ADD CONSTRAINT diagnosis_report_pdf_generation_lease_check CHECK ((status='PENDING' AND generation_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status IN ('READY','FAILED') AND generation_token IS NULL AND lease_expires_at IS NULL));
CREATE INDEX diagnosis_report_pdf_pending_lease ON diagnosis_report_pdf_artifacts(lease_expires_at) WHERE status='PENDING';
