-- Run using a read-only operational identity. No Raw Source, AI output, contact data or tokens.
BEGIN READ ONLY;
SELECT filename, applied_at FROM schema_migrations ORDER BY filename;
SELECT diagnosis_status, assessment_status, count(*) FROM diagnosis_cases GROUP BY 1,2 ORDER BY 1,2;
SELECT process_type, status, count(*), min(created_at) AS oldest_created_at,
       max(EXTRACT(EPOCH FROM (now()-created_at)))::bigint AS oldest_age_seconds
FROM ai_executions WHERE status IN ('PENDING','RUNNING') GROUP BY 1,2 ORDER BY 1,2;
SELECT process_type, error_code, count(*) FROM ai_executions
WHERE status='FAILED' AND completed_at>now()-interval '24 hours' GROUP BY 1,2 ORDER BY 1,2;
SELECT process_type, count(*) AS expired_running FROM ai_executions
WHERE status='RUNNING' AND lease_expires_at<now() GROUP BY 1;
SELECT command, count(*), max(created_at) AS latest_event FROM diagnosis_audit_logs
WHERE created_at>now()-interval '24 hours' GROUP BY command ORDER BY command;
SELECT count(*) AS total_connections, count(*) FILTER (WHERE state='active') AS active_connections
FROM pg_stat_activity WHERE datname=current_database();
COMMIT;
