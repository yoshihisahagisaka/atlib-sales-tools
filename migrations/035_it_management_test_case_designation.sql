-- IT経営KAIZEN test-case designation audit. Test deletion remains a separate governed operation.
BEGIN;

CREATE TABLE it_management_diagnosis_test_case_designation_audit (
  id UUID PRIMARY KEY,
  -- Deliberately not an FK: the audit must survive a separately approved test-case cleanup.
  case_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('DESIGNATED','RELEASED')),
  actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
  reason TEXT NOT NULL CHECK (btrim(reason) <> '' AND length(reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX it_management_diagnosis_test_case_designation_case_idx
  ON it_management_diagnosis_test_case_designation_audit(case_id,created_at DESC,id DESC);
CREATE INDEX it_management_diagnosis_case_v2_internal_test_idx
  ON it_management_diagnosis_case_v2(is_internal_test,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_test_case_designation_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Test case designation audit is append-only';
END $$;

CREATE TRIGGER test_case_designation_audit_immutable BEFORE UPDATE OR DELETE
  ON it_management_diagnosis_test_case_designation_audit FOR EACH ROW
  EXECUTE FUNCTION prevent_test_case_designation_audit_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT ON TABLE it_management_diagnosis_test_case_designation_audit TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT ON TABLE it_management_diagnosis_test_case_designation_audit TO sales_tools_app;
  END IF;
END
$$;

COMMIT;
