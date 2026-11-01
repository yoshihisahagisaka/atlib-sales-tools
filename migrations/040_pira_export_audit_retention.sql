-- Keep runtime audit records append-only while enabling a separately granted,
-- approved retention operation. Deployment grants EXECUTE only to its
-- dedicated maintenance role; PUBLIC and the application runtime get none.
CREATE OR REPLACE FUNCTION pira.purge_export_audit_before(cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pira
AS $$
DECLARE deleted_count integer;
BEGIN
  IF cutoff > clock_timestamp() - interval '3 years' THEN
    RAISE EXCEPTION 'PIRA_EXPORT_AUDIT_RETENTION_NOT_REACHED';
  END IF;
  PERFORM set_config('pira.approved_export_audit_purge', 'on', true);
  DELETE FROM pira.pira_export_audit WHERE exported_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $$;

REVOKE ALL ON FUNCTION pira.purge_export_audit_before(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION pira.reject_export_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('pira.approved_export_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'pira export audit is append-only';
END $$;
