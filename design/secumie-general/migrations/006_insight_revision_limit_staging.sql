-- Additive staging-only revision bound; no production operation.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF current_database() <> 'secumie_general_staging'
 OR current_user <> 'secumie_general_migration_staging'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 THEN RAISE EXCEPTION 'GENERAL_STAGING_CONTEXT_STOP'; END IF;
END $guard$;
ALTER TABLE secumie_general.lead ADD COLUMN insight_revision_count integer NOT NULL DEFAULT 0 CHECK(insight_revision_count BETWEEN 0 AND 10);
UPDATE secumie_general.lead l SET insight_revision_count=h.n
FROM (SELECT lead_id,count(*)::int AS n FROM secumie_general.insight_result_history GROUP BY lead_id) h
WHERE l.id=h.lead_id AND l.kind='INSIGHT';
ALTER TABLE secumie_general.lead ADD CONSTRAINT web_no_insight_revision CHECK(kind='INSIGHT' OR insight_revision_count=0);
GRANT SELECT(insight_revision_count),UPDATE(insight_revision_count) ON secumie_general.lead TO secumie_general_writer_staging;
