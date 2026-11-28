-- Production-only equivalent of immutable staging migration; target guards are mandatory.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF current_database() <> 'secumie_general'
 OR current_user <> 'secumie_general_migration_prod'
 OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
 THEN RAISE EXCEPTION 'GENERAL_PRODUCTION_CONTEXT_STOP'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('secumie_general_migration_prod','secumie_general_writer_prod','secumie_general_staff_prod'))<>3
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('secumie_general_migration_prod','secumie_general_writer_prod','secumie_general_staff_prod')
 AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('secumie_general_migration_prod','secumie_general_writer_prod','secumie_general_staff_prod'))
 THEN RAISE EXCEPTION 'GENERAL_PRODUCTION_ROLE_STOP'; END IF;
END $guard$;
REVOKE ALL ON SCHEMA secumie_general FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA secumie_general FROM PUBLIC;
GRANT USAGE ON SCHEMA secumie_general TO secumie_general_writer_prod,secumie_general_staff_prod;
GRANT INSERT(kind,idempotency_key,payload_hash,receipt_hash,receipt_expires_at,company_name,person_name,email,department,position,phone,target_url,consent_version,sales_contact_allowed),
 SELECT(id,kind,idempotency_key,payload_hash,receipt_hash,receipt_expires_at,diagnosis_status,diagnosis_result,company_name,person_name,email,target_url,consultation_status,consultation_phone,consultation_note,consultation_requested_at,notification_status,completed_at),
 UPDATE(diagnosis_status,diagnosis_result,completed_at,updated_at,consultation_status,consultation_phone,consultation_note,consultation_consent_version,consultation_requested_at,notification_status)
 ON secumie_general.lead TO secumie_general_writer_prod;
GRANT SELECT(id,kind,received_at,company_name,person_name,target_url,diagnosis_status,consultation_status,notification_status,sales_status,sales_contact_allowed,is_test,company_group_id,department,position,email,phone,consent_version,consented_at,diagnosis_result,completed_at,consultation_phone,consultation_note,consultation_requested_at,consultation_consent_version,staff_note,updated_at),
 UPDATE(sales_status,staff_note,updated_at,company_group_id)
 ON secumie_general.lead TO secumie_general_staff_prod;
GRANT INSERT(lead_id,actor,previous_status,next_status,previous_note,next_note)
 ON secumie_general.staff_change TO secumie_general_staff_prod;
GRANT INSERT(lead_id,diagnosis_result,completed_at) ON secumie_general.insight_result_history TO secumie_general_writer_prod;
GRANT SELECT ON secumie_general.insight_result_history TO secumie_general_staff_prod;
GRANT SELECT,INSERT(company_name,is_test,sales_status,staff_note),UPDATE(sales_status,staff_note,updated_at)
 ON secumie_general.company_group TO secumie_general_staff_prod;
GRANT INSERT(group_id,lead_id,action,actor,detail)
 ON secumie_general.company_group_audit TO secumie_general_staff_prod;
