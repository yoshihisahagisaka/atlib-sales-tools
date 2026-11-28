-- Production-only equivalent of immutable staging migration; target guards are mandatory.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF current_database() <> 'secumie_general'
 OR current_user <> 'secumie_general_migration_prod'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 THEN RAISE EXCEPTION 'GENERAL_PRODUCTION_CONTEXT_STOP'; END IF;
END $guard$;
CREATE TABLE secumie_general.company_group(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_name text NOT NULL,
 is_test boolean NOT NULL,
 sales_status text NOT NULL CHECK(sales_status IN ('NEW','CONTACTED','PROPOSAL','WON','LOST','CLOSED')),
 staff_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE secumie_general.lead ADD COLUMN company_group_id uuid REFERENCES secumie_general.company_group(id);
CREATE INDEX lead_company_group_idx ON secumie_general.lead(company_group_id,received_at DESC,id);
CREATE TABLE secumie_general.company_group_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES secumie_general.company_group(id),
 lead_id uuid REFERENCES secumie_general.lead(id),
 action text NOT NULL CHECK(action IN ('LINK','UNLINK','SALES')),
 actor text NOT NULL,
 detail jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON secumie_general.company_group,secumie_general.company_group_audit FROM PUBLIC;
