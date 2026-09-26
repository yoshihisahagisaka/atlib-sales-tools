\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id,name)
VALUES ('10000000-0000-4000-8000-000000000001','PDF artifact test organization');

INSERT INTO diagnosis_cases
(id,organization_id,entry_channel,diagnosis_status,survey_version,
 access_token_hash,access_token_expires_at)
VALUES
('10000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000001',
 'WEB','REPORT_APPROVED',1,
 repeat('a',64),now()+interval '1 day');

INSERT INTO diagnosis_reports
(id,diagnosis_case_id,version,status,content_json,snapshot_json,
 context_json,context_hash,prompt_version,policy_version,
 created_by,created_by_user_id,approved_by_user_id,approved_at)
VALUES
('10000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000002',
 1,'APPROVED','{}','{}','{}','test-context-hash',
 'test-prompt','test-policy','HUMAN','test-staff','test-staff',now());

DO $$
BEGIN
    BEGIN
        INSERT INTO diagnosis_report_pdf_artifacts
        (report_id,diagnosis_case_id,report_version,status)
        VALUES
        ('10000000-0000-4000-8000-000000000003',
         '10000000-0000-4000-8000-000000000002',2,'PENDING');
        RAISE EXCEPTION 'TEST FAILED: version mismatch accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='TEST FAILED: version mismatch accepted' THEN RAISE; END IF;
        IF SQLERRM <> 'PDF artifact report version mismatch' THEN RAISE; END IF;
        RAISE NOTICE 'PASS: version mismatch rejected';
    END;
END;
$$;

INSERT INTO diagnosis_reports
(id,diagnosis_case_id,version,status,content_json,
 context_json,context_hash,prompt_version,policy_version,
 created_by,created_by_user_id)
VALUES
('10000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000002',
 2,'DRAFT','{}','{}','test-draft-context-hash',
 'test-prompt','test-policy','HUMAN','test-staff');

DO $$
BEGIN
    BEGIN
        INSERT INTO diagnosis_report_pdf_artifacts
        (report_id,diagnosis_case_id,report_version,status)
        VALUES
        ('10000000-0000-4000-8000-000000000004',
         '10000000-0000-4000-8000-000000000002',2,'PENDING');
        RAISE EXCEPTION 'TEST FAILED: unapproved report accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='TEST FAILED: unapproved report accepted' THEN RAISE; END IF;
        IF SQLERRM <> 'PDF artifact requires an approved report' THEN RAISE; END IF;
        RAISE NOTICE 'PASS: unapproved report rejected';
    END;
END;
$$;

INSERT INTO diagnosis_report_pdf_artifacts
(report_id,diagnosis_case_id,report_version,status)
VALUES
('10000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000002',1,'PENDING');

UPDATE diagnosis_report_pdf_artifacts
SET status='READY',
    object_key='diagnosis/test/report-v1.pdf',
    pdf_sha256=repeat('a',64),
    pdf_size_bytes=100,
    completed_at=now()
WHERE report_id='10000000-0000-4000-8000-000000000003';

DO $$
BEGIN
    BEGIN
        UPDATE diagnosis_report_pdf_artifacts
        SET object_key='diagnosis/test/overwritten.pdf';
        RAISE EXCEPTION 'TEST FAILED: READY update accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='TEST FAILED: READY update accepted' THEN RAISE; END IF;
        RAISE NOTICE 'PASS: READY update rejected';
    END;

    BEGIN
        DELETE FROM diagnosis_report_pdf_artifacts;
        RAISE EXCEPTION 'TEST FAILED: READY delete accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='TEST FAILED: READY delete accepted' THEN RAISE; END IF;
        RAISE NOTICE 'PASS: READY delete rejected';
    END;
END;
$$;

SELECT status,report_version,pdf_size_bytes
FROM diagnosis_report_pdf_artifacts;

ROLLBACK;
