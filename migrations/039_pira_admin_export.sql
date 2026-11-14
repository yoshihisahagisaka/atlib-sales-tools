-- PIRA administration/export additions. Migration 038 remains immutable.
ALTER TABLE pira.pira_export_audit
  ADD COLUMN result_count integer NOT NULL DEFAULT 0 CHECK (result_count BETWEEN 0 AND 10000),
  ADD COLUMN success boolean NOT NULL DEFAULT false,
  ADD COLUMN failure_code text,
  ADD COLUMN initiative_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX pira_submission_admin_list_idx
  ON pira.pira_submission(received_at DESC, submission_id);
CREATE INDEX pira_submission_admin_filter_idx
  ON pira.pira_submission(initiative_id, state, received_at DESC);
CREATE INDEX pira_export_audit_retention_idx
  ON pira.pira_export_audit(exported_at);

CREATE OR REPLACE FUNCTION pira.reject_export_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pira export audit is append-only';
END $$;

CREATE TRIGGER pira_export_audit_immutable
BEFORE UPDATE OR DELETE ON pira.pira_export_audit
FOR EACH ROW EXECUTE FUNCTION pira.reject_export_audit_mutation();
