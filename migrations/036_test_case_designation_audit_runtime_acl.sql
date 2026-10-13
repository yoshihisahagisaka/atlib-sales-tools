-- Correct the runtime ACL for the append-only test-case designation audit table.
BEGIN;

REVOKE UPDATE, DELETE
ON TABLE it_management_diagnosis_test_case_designation_audit
FROM sales_tools_app;

COMMIT;
