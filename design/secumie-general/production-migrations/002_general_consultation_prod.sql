-- Production-only equivalent of immutable staging migration; target guards are mandatory.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF current_database() <> 'secumie_general'
 OR current_user <> 'secumie_general_migration_prod'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 THEN RAISE EXCEPTION 'GENERAL_PRODUCTION_CONTEXT_STOP'; END IF;
END $guard$;
ALTER TABLE secumie_general.lead ADD COLUMN consultation_phone text;
ALTER TABLE secumie_general.lead ADD CONSTRAINT consultation_phone_shape CHECK(
 (consultation_status='NONE' AND consultation_phone IS NULL AND notification_status='NONE')
 OR (consultation_status='REQUESTED' AND consultation_phone IS NOT NULL AND length(btrim(consultation_phone)) BETWEEN 1 AND 50 AND notification_status IN ('PENDING','SENT','FAILED'))
);
