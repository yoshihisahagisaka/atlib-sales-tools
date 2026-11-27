-- Human-only preparation selection revisions. Does not store verified FACT, Work or source report content.
-- Existing runner wraps the whole SQL file and schema_migrations insert in its transaction.
CREATE TABLE paid_assessment_preparation_selection_v1 (
  id UUID PRIMARY KEY,
  source_case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  handoff_id UUID NOT NULL REFERENCES paid_assessment_source_handoff_v2(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  selection_json JSONB NOT NULL CHECK (jsonb_typeof(selection_json) = 'object'),
  selection_hash TEXT NOT NULL CHECK (selection_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id TEXT NOT NULL CHECK (btrim(created_by_user_id) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (handoff_id, version)
);

CREATE INDEX paid_assessment_preparation_selection_v1_latest_idx
  ON paid_assessment_preparation_selection_v1(handoff_id, version DESC);

CREATE OR REPLACE FUNCTION prevent_paid_assessment_preparation_selection_v1_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Paid Assessment preparation selection is append-only';
END $$;

CREATE TRIGGER paid_assessment_preparation_selection_v1_immutable BEFORE UPDATE OR DELETE
  ON paid_assessment_preparation_selection_v1 FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_assessment_preparation_selection_v1_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT ON TABLE paid_assessment_preparation_selection_v1 TO sales_tools_runtime;
    REVOKE UPDATE, DELETE ON TABLE paid_assessment_preparation_selection_v1 FROM sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT ON TABLE paid_assessment_preparation_selection_v1 TO sales_tools_app;
    REVOKE UPDATE, DELETE ON TABLE paid_assessment_preparation_selection_v1 FROM sales_tools_app;
  END IF;
END
$$;
