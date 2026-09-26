\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id,name)
VALUES ('20000000-0000-4000-8000-000000000001','PDF lease test organization');

INSERT INTO diagnosis_cases
(id,organization_id,entry_channel,diagnosis_status,survey_version,
 access_token_hash,access_token_expires_at)
VALUES
('20000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000001',
 'WEB','REPORT_APPROVED',1,
 repeat('b',64),now()+interval '1 day');

INSERT INTO diagnosis_reports
(id,diagnosis_case_id,version,status,content_json,snapshot_json,
 context_json,context_hash,prompt_version,policy_version,
 created_by,created_by_user_id,approved_by_user_id,approved_at)
VALUES
('20000000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000002',
 1,'APPROVED','{}','{}','{}','test-context-hash',
 'test-prompt','test-policy','HUMAN','test-staff','test-staff',now());

DO $$
BEGIN
    BEGIN
        INSERT INTO diagnosis_report_pdf_artifacts
        (report_id,diagnosis_case_id,report_version,status)
        VALUES
        ('20000000-0000-4000-8000-000000000003',
         '20000000-0000-4000-8000-000000000002',1,'PENDING');
        RAISE EXCEPTION 'TEST FAILED: PENDING without lease accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: PENDING requires generation token and expiry';
    END;
END;
$$;

INSERT INTO diagnosis_report_pdf_artifacts
(report_id,diagnosis_case_id,report_version,status,generation_token,lease_expires_at)
VALUES
('20000000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000002',1,'PENDING',
 '20000000-0000-4000-8000-000000000004',now()+interval '5 minutes');

UPDATE diagnosis_report_pdf_artifacts
SET generation_token='20000000-0000-4000-8000-000000000005',
    lease_expires_at=now()+interval '5 minutes'
WHERE report_id='20000000-0000-4000-8000-000000000003';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM diagnosis_report_pdf_artifacts
        WHERE report_id='20000000-0000-4000-8000-000000000003'
          AND generation_token='20000000-0000-4000-8000-000000000005'
          AND status='PENDING'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED: lease token replacement';
    END IF;
    RAISE NOTICE 'PASS: PENDING lease token can be replaced';
END;
$$;

UPDATE diagnosis_report_pdf_artifacts
SET status='READY',
    generation_token=NULL,
    lease_expires_at=NULL,
    object_key='diagnosis/test/lease-report-v1.pdf',
    pdf_sha256=repeat('c',64),
    pdf_size_bytes=100,
    completed_at=now()
WHERE report_id='20000000-0000-4000-8000-000000000003'
  AND generation_token='20000000-0000-4000-8000-000000000005';

DO $$
BEGIN
    BEGIN
        UPDATE diagnosis_report_pdf_artifacts
        SET generation_token='20000000-0000-4000-8000-000000000004';
        RAISE EXCEPTION 'TEST FAILED: READY lease update accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='TEST FAILED: READY lease update accepted' THEN RAISE; END IF;
        IF SQLERRM <> 'Ready PDF artifact is immutable' THEN RAISE; END IF;
        RAISE NOTICE 'PASS: READY lease update rejected';
    END;
END;
$$;

ROLLBACK;
