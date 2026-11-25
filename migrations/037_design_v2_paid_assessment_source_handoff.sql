-- Immutable projection of an eligible free-diagnosis Design v2 source for paid Assessment.
CREATE TABLE paid_assessment_source_handoff_v2 (
  id UUID PRIMARY KEY,
  source_case_id UUID NOT NULL REFERENCES it_management_diagnosis_case_v2(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  feedback_decision_id UUID NOT NULL REFERENCES management_feedback_decisions(id) ON DELETE RESTRICT,
  report_id UUID NOT NULL REFERENCES diagnosis_reports(id) ON DELETE RESTRICT,
  snapshot_json JSONB NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id TEXT NOT NULL CHECK (btrim(created_by_user_id) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_case_id, version),
  UNIQUE (source_case_id, feedback_decision_id)
);

CREATE INDEX paid_assessment_source_handoff_v2_latest_idx
  ON paid_assessment_source_handoff_v2(source_case_id, version DESC);

CREATE OR REPLACE FUNCTION prevent_paid_assessment_source_handoff_v2_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Paid Assessment source handoff is append-only';
END $$;

CREATE TRIGGER paid_assessment_source_handoff_v2_immutable BEFORE UPDATE OR DELETE
  ON paid_assessment_source_handoff_v2 FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_assessment_source_handoff_v2_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT ON TABLE paid_assessment_source_handoff_v2 TO sales_tools_runtime;
    REVOKE UPDATE, DELETE ON TABLE paid_assessment_source_handoff_v2 FROM sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT ON TABLE paid_assessment_source_handoff_v2 TO sales_tools_app;
    REVOKE UPDATE, DELETE ON TABLE paid_assessment_source_handoff_v2 FROM sales_tools_app;
  END IF;
END
$$;
