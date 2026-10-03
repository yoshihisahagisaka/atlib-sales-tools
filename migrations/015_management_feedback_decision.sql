CREATE TABLE management_feedback_decisions (
  id uuid PRIMARY KEY,
  diagnosis_case_id uuid NOT NULL REFERENCES diagnosis_cases(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  route_code text NOT NULL CHECK (route_code IN ('DIRECT_ACT','FOCUSED_CONFIRMATION','DESIGN_ASSESSMENT','STOP_HOLD')),
  material_decision text NOT NULL CHECK (length(trim(material_decision)) > 0),
  next_action text NOT NULL CHECK (length(trim(next_action)) > 0),
  customer_restatement_source_id uuid NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  context_snapshot_json jsonb NOT NULL,
  context_hash text NOT NULL CHECK (context_hash ~ '^[0-9a-f]{64}$'),
  supersedes_decision_id uuid NULL REFERENCES management_feedback_decisions(id) ON DELETE RESTRICT,
  decided_by_user_id text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(diagnosis_case_id, version)
);

CREATE INDEX idx_management_feedback_decisions_case_latest
  ON management_feedback_decisions(diagnosis_case_id, version DESC);

CREATE OR REPLACE FUNCTION prevent_management_feedback_decision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'management_feedback_decisions are immutable';
END $$;

CREATE TRIGGER trg_management_feedback_decision_immutable
BEFORE UPDATE OR DELETE ON management_feedback_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_management_feedback_decision_mutation();
