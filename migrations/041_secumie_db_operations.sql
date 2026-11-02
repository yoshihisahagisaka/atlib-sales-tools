BEGIN;

CREATE SCHEMA IF NOT EXISTS secumie_deployment;
REVOKE ALL ON SCHEMA public_auth, pira, secumie_deployment FROM PUBLIC;

CREATE OR REPLACE FUNCTION public_auth.retention_candidates(reference_at timestamptz DEFAULT clock_timestamp())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public_auth
AS $$
  SELECT jsonb_build_object(
    'challenges', (SELECT count(*) FROM public_auth.otp_challenges WHERE created_at < reference_at - interval '24 hours'),
    'reservations', (SELECT count(*) FROM public_auth.otp_send_reservations WHERE reserved_at < reference_at - interval '24 hours'),
    'sessions', (SELECT count(*) FROM public_auth.otp_sessions WHERE created_at < reference_at - interval '24 hours'),
    'sendEvents', (SELECT count(*) FROM public_auth.otp_send_events WHERE sent_at < reference_at - interval '24 hours'),
    'securityAudit', (SELECT count(*) FROM public_auth.otp_auth_audit WHERE occurred_at < reference_at - interval '30 days'),
    'sendLocks', (SELECT count(*) FROM public_auth.otp_send_locks lock WHERE lock.updated_at < reference_at - interval '24 hours' AND NOT EXISTS (SELECT 1 FROM public_auth.otp_send_reservations reservation WHERE reservation.service_id=lock.service_id AND reservation.email_protected=lock.email_protected AND reservation.reserved_at >= reference_at - interval '24 hours'))
  )
$$;

CREATE OR REPLACE FUNCTION public_auth.purge_retained_data(reference_at timestamptz DEFAULT clock_timestamp())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public_auth
AS $$
DECLARE challenges_count integer; reservations_count integer; sessions_count integer;
DECLARE events_count integer; audit_count integer; locks_count integer;
BEGIN
  DELETE FROM public_auth.otp_challenges WHERE created_at < reference_at - interval '24 hours';
  GET DIAGNOSTICS challenges_count = ROW_COUNT;
  DELETE FROM public_auth.otp_send_reservations WHERE reserved_at < reference_at - interval '24 hours';
  GET DIAGNOSTICS reservations_count = ROW_COUNT;
  DELETE FROM public_auth.otp_sessions WHERE created_at < reference_at - interval '24 hours';
  GET DIAGNOSTICS sessions_count = ROW_COUNT;
  DELETE FROM public_auth.otp_send_events WHERE sent_at < reference_at - interval '24 hours';
  GET DIAGNOSTICS events_count = ROW_COUNT;
  DELETE FROM public_auth.otp_auth_audit WHERE occurred_at < reference_at - interval '30 days';
  GET DIAGNOSTICS audit_count = ROW_COUNT;
  DELETE FROM public_auth.otp_send_locks lock
    WHERE lock.updated_at < reference_at - interval '24 hours'
      AND NOT EXISTS (
      SELECT 1 FROM public_auth.otp_send_reservations reservation
      WHERE reservation.service_id=lock.service_id AND reservation.email_protected=lock.email_protected
    );
  GET DIAGNOSTICS locks_count = ROW_COUNT;
  RETURN jsonb_build_object('challenges',challenges_count,'reservations',reservations_count,'sessions',sessions_count,'sendEvents',events_count,'securityAudit',audit_count,'sendLocks',locks_count);
END $$;

CREATE OR REPLACE FUNCTION pira.retention_candidates(reference_at timestamptz DEFAULT clock_timestamp())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pira
AS $$
  SELECT jsonb_build_object(
    'submissions', (SELECT count(*) FROM pira.pira_submission WHERE received_at < reference_at - interval '2 years'),
    'consumedJti', (SELECT count(*) FROM pira.pira_consumed_jti WHERE expires_at < reference_at),
    'exportAudits', (SELECT count(*) FROM pira.pira_export_audit WHERE exported_at < reference_at - interval '3 years')
  )
$$;

CREATE OR REPLACE FUNCTION pira.purge_retained_data(reference_at timestamptz DEFAULT clock_timestamp())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pira
AS $$
DECLARE submissions_count integer; jti_count integer; audit_count integer;
BEGIN
  DELETE FROM pira.pira_consumed_jti
    WHERE expires_at < reference_at
       OR submission_id IN (SELECT submission_id FROM pira.pira_submission WHERE received_at < reference_at - interval '2 years');
  GET DIAGNOSTICS jti_count = ROW_COUNT;
  DELETE FROM pira.pira_submission WHERE received_at < reference_at - interval '2 years';
  GET DIAGNOSTICS submissions_count = ROW_COUNT;
  SELECT pira.purge_export_audit_before(reference_at - interval '3 years') INTO audit_count;
  RETURN jsonb_build_object('submissions',submissions_count,'consumedJti',jti_count,'exportAudits',audit_count);
END $$;

REVOKE ALL ON FUNCTION public_auth.retention_candidates(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_auth.purge_retained_data(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION pira.retention_candidates(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION pira.purge_retained_data(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION secumie_deployment.configure_roles(
  otp_runtime name,
  pira_runtime name,
  admin_runtime name,
  maintenance_runtime name
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE role_name name;
BEGIN
  IF otp_runtime=pira_runtime OR otp_runtime=admin_runtime OR otp_runtime=maintenance_runtime
     OR pira_runtime=admin_runtime OR pira_runtime=maintenance_runtime OR admin_runtime=maintenance_runtime THEN
    RAISE EXCEPTION 'SECU_RUNTIME_ROLES_MUST_BE_DISTINCT';
  END IF;
  FOREACH role_name IN ARRAY ARRAY[otp_runtime,pira_runtime,admin_runtime,maintenance_runtime] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      RAISE EXCEPTION 'SECU_RUNTIME_ROLE_NOT_FOUND: %', role_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)) THEN
      RAISE EXCEPTION 'SECU_RUNTIME_ROLE_IS_ELEVATED: %', role_name;
    END IF;
    IF role_name=current_user::name THEN
      RAISE EXCEPTION 'SECU_RUNTIME_ROLE_MUST_NOT_BE_MIGRATION_OWNER: %', role_name;
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public_auth, pira FROM %I', role_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public_auth, pira FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON SCHEMA public_auth, pira FROM %I', role_name);
  END LOOP;

  EXECUTE format('GRANT USAGE ON SCHEMA public_auth TO %I', otp_runtime);
  EXECUTE format('GRANT SELECT,INSERT ON public_auth.otp_send_locks TO %I', otp_runtime);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public_auth.otp_send_reservations,public_auth.otp_challenges,public_auth.otp_sessions TO %I', otp_runtime);

  EXECUTE format('GRANT USAGE ON SCHEMA pira TO %I', pira_runtime);
  EXECUTE format('GRANT SELECT ON pira.pira_initiative TO %I', pira_runtime);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON pira.pira_submission TO %I', pira_runtime);
  EXECUTE format('GRANT INSERT ON pira.pira_consumed_jti TO %I', pira_runtime);

  EXECUTE format('GRANT USAGE ON SCHEMA pira TO %I', admin_runtime);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON pira.pira_initiative TO %I', admin_runtime);
  EXECUTE format('GRANT SELECT ON pira.pira_submission,pira.pira_consumed_jti TO %I', admin_runtime);
  EXECUTE format('GRANT SELECT,INSERT ON pira.pira_export_audit TO %I', admin_runtime);

  EXECUTE format('GRANT USAGE ON SCHEMA public_auth,pira TO %I', maintenance_runtime);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public_auth.retention_candidates(timestamptz),public_auth.purge_retained_data(timestamptz),pira.retention_candidates(timestamptz),pira.purge_retained_data(timestamptz) TO %I', maintenance_runtime);
END $$;

REVOKE ALL ON FUNCTION secumie_deployment.configure_roles(name,name,name,name) FROM PUBLIC;
REVOKE ALL ON SCHEMA secumie_deployment FROM PUBLIC;

COMMIT;
