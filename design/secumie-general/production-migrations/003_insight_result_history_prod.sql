-- Production-only equivalent of immutable staging migration; target guards are mandatory.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF current_database() <> 'secumie_general'
 OR current_user <> 'secumie_general_migration_prod'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 THEN RAISE EXCEPTION 'GENERAL_PRODUCTION_CONTEXT_STOP'; END IF;
END $guard$;
CREATE TABLE secumie_general.insight_result_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES secumie_general.lead(id),
 diagnosis_result jsonb NOT NULL,
 completed_at timestamptz NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX insight_result_history_lead_idx ON secumie_general.insight_result_history(lead_id,archived_at DESC,id);
REVOKE ALL ON secumie_general.insight_result_history FROM PUBLIC;
