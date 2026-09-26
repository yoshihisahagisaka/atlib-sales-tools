\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id,name)
VALUES ('30000000-0000-4000-8000-000000000001','PDF stale token test');

INSERT INTO diagnosis_cases
(id,organization_id,entry_channel,diagnosis_status,survey_version,
 access_token_hash,access_token_expires_at)
VALUES
('30000000-0000-4000-8000-000000000002',
 '30000000-0000-4000-8000-000000000001',
 'WEB','REPORT_APPROVED',1,
 repeat('d',64),now()+interval '1 day');

INSERT INTO diagnosis_reports
(id,diagnosis_case_id,version,status,content_json,snapshot_json,
 context_json,context_hash,prompt_version,policy_version,
 created_by,created_by_user_id,approved_by_user_id,approved_at)
VALUES
('30000000-0000-4000-8000-000000000003',
 '30000000-0000-4000-8000-000000000002',
 1,'APPROVED','{}','{}','{}','test-context-hash',
 'test-prompt','test-policy','HUMAN','test-staff','test-staff',now());

INSERT INTO diagnosis_report_pdf_artifacts
(report_id,diagnosis_case_id,report_version,status,generation_token,lease_expires_at)
VALUES
('30000000-0000-4000-8000-000000000003',
 '30000000-0000-4000-8000-000000000002',1,'PENDING',
 '30000000-0000-4000-8000-000000000004',now()-interval '1 minute');

-- A new worker replaces the expired lease.
UPDATE diagnosis_report_pdf_artifacts
SET generation_token='30000000-0000-4000-8000-000000000005',
    lease_expires_at=now()+interval '5 minutes'
WHERE report_id='30000000-0000-4000-8000-000000000003'
  AND status='PENDING'
  AND lease_expires_at < now();

DO $$
DECLARE affected integer;
BEGIN
    UPDATE diagnosis_report_pdf_artifacts
       SET status='READY',generation_token=NULL,lease_expires_at=NULL,
           object_key='test/stale.pdf',pdf_sha256=repeat('e',64),
           pdf_size_bytes=100,completed_at=now()
     WHERE report_id='30000000-0000-4000-8000-000000000003'
       AND status='PENDING'
       AND generation_token='30000000-0000-4000-8000-000000000004'
       AND lease_expires_at > now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'TEST FAILED: stale token finalized READY'; END IF;
    RAISE NOTICE 'PASS: stale token cannot finalize READY';

    UPDATE diagnosis_report_pdf_artifacts
       SET status='FAILED',error_code='STALE_WORKER',
           generation_token=NULL,lease_expires_at=NULL
     WHERE report_id='30000000-0000-4000-8000-000000000003'
       AND status='PENDING'
       AND generation_token='30000000-0000-4000-8000-000000000004'
       AND lease_expires_at > now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'TEST FAILED: stale token marked FAILED'; END IF;
    RAISE NOTICE 'PASS: stale token cannot mark FAILED';

    UPDATE diagnosis_report_pdf_artifacts
       SET status='READY',generation_token=NULL,lease_expires_at=NULL,
           object_key='test/expired.pdf',pdf_sha256=repeat('e',64),
           pdf_size_bytes=100,completed_at=now()
     WHERE report_id='30000000-0000-4000-8000-000000000003'
       AND status='PENDING'
       AND generation_token='30000000-0000-4000-8000-000000000005'
       AND lease_expires_at < now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'TEST FAILED: expired lease finalized READY'; END IF;
    RAISE NOTICE 'PASS: expired lease cannot finalize READY';

    IF NOT EXISTS (
        SELECT 1 FROM diagnosis_report_pdf_artifacts
        WHERE report_id='30000000-0000-4000-8000-000000000003'
          AND status='PENDING'
          AND generation_token='30000000-0000-4000-8000-000000000005'
    ) THEN RAISE EXCEPTION 'TEST FAILED: current owner lost'; END IF;
    RAISE NOTICE 'PASS: current owner remains PENDING';
END;
$$;

ROLLBACK;
