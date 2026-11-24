-- Package A source draft: UNNUMBERED. Production migration is NOT authorized.
CREATE TABLE business_kaizen_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_channel TEXT NOT NULL CHECK (entry_channel IN ('CUSTOMER_SELF','STAFF_PROXY')),
  input_state TEXT NOT NULL CHECK (input_state IN ('DRAFT','COMPLETED')),
  consultation_lead_id UUID REFERENCES business_web_consultation_leads(id),
  sales_activity_id UUID REFERENCES sales_activity(id),
  company_id UUID REFERENCES company(id),
  contact_id UUID REFERENCES contact(id),
  owner_user_email TEXT,
  original_answers JSONB,
  current_answers JSONB,
  diagnosis_snapshot JSONB,
  current_stage TEXT CHECK (current_stage IN ('ACCEPTED','SCHEDULING','SCHEDULED','MEETING_COMPLETED','PROPOSAL_IN_PROGRESS','PROPOSED')),
  scheduled_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('WON','COMPLETED_NO_PROPOSAL','NOT_PROCEEDED','LOST')),
  outcome_reason TEXT,
  outcome_note TEXT,
  closed_at TIMESTAMPTZ,
  diagnosis_version TEXT,
  logic_version TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_kaizen_entry_reference_check CHECK (
    (entry_channel = 'CUSTOMER_SELF' AND consultation_lead_id IS NOT NULL AND sales_activity_id IS NULL)
    OR (entry_channel = 'STAFF_PROXY' AND sales_activity_id IS NOT NULL AND consultation_lead_id IS NULL AND company_id IS NOT NULL AND contact_id IS NOT NULL)
  ),
  CONSTRAINT business_kaizen_completed_data_check CHECK (
    input_state <> 'COMPLETED' OR
    (original_answers IS NOT NULL AND current_answers IS NOT NULL AND diagnosis_snapshot IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX business_kaizen_diagnoses_self_lead_unique
  ON business_kaizen_diagnoses(consultation_lead_id)
  WHERE consultation_lead_id IS NOT NULL;
-- Deliberately no UNIQUE(sales_activity_id): repeat diagnosis policy remains undecided.
CREATE INDEX business_kaizen_diagnoses_created_at_idx ON business_kaizen_diagnoses(created_at DESC);
CREATE INDEX business_kaizen_diagnoses_sales_activity_idx
  ON business_kaizen_diagnoses(sales_activity_id) WHERE sales_activity_id IS NOT NULL;

CREATE TABLE business_kaizen_diagnosis_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES business_kaizen_diagnoses(id),
  stage TEXT NOT NULL CHECK (stage IN ('ACCEPTED','SCHEDULING','SCHEDULED','MEETING_COMPLETED','PROPOSAL_IN_PROGRESS','PROPOSED')),
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A stage may be reached again. The first ACCEPTED remains the entry fact and is
-- resolved with min(reached_at); later rows remain immutable sales history.
CREATE INDEX business_kaizen_stage_history_stage_reached_idx
  ON business_kaizen_diagnosis_stage_history(diagnosis_id, stage, reached_at, id);
CREATE INDEX business_kaizen_stage_history_diagnosis_idx
  ON business_kaizen_diagnosis_stage_history(diagnosis_id, reached_at);

CREATE FUNCTION business_kaizen_reject_stage_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'business kaizen stage history is append-only';
END;
$$;
CREATE TRIGGER business_kaizen_stage_history_append_only
  BEFORE UPDATE OR DELETE ON business_kaizen_diagnosis_stage_history
  FOR EACH ROW EXECUTE FUNCTION business_kaizen_reject_stage_history_mutation();

CREATE FUNCTION business_kaizen_protect_original_answers() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.original_answers IS NOT NULL
     AND NEW.original_answers IS DISTINCT FROM OLD.original_answers THEN
    RAISE EXCEPTION 'business kaizen original answers are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_kaizen_original_answers_immutable
  BEFORE UPDATE OF original_answers ON business_kaizen_diagnoses
  FOR EACH ROW EXECUTE FUNCTION business_kaizen_protect_original_answers();

CREATE TABLE business_kaizen_diagnosis_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES business_kaizen_diagnoses(id),
  operation TEXT NOT NULL CHECK (operation IN (
    'DRAFT_CREATED','DRAFT_ANSWERS_REPLACED','DIAGNOSIS_COMPLETED',
    'STAGE_CHANGED','SCHEDULE_CHANGED','OUTCOME_CHANGED','COMMERCIAL_EVENT_CREATED'
  )),
  actor_user_email TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX business_kaizen_diagnosis_audit_diagnosis_idx
  ON business_kaizen_diagnosis_audit(diagnosis_id, occurred_at);
CREATE FUNCTION business_kaizen_reject_diagnosis_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'business kaizen diagnosis audit is append-only';
END;
$$;
CREATE TRIGGER business_kaizen_diagnosis_audit_append_only
  BEFORE UPDATE OR DELETE ON business_kaizen_diagnosis_audit
  FOR EACH ROW EXECUTE FUNCTION business_kaizen_reject_diagnosis_audit_mutation();

CREATE TABLE business_kaizen_commercial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES business_kaizen_diagnoses(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('PROPOSED','WON')),
  service_name TEXT NOT NULL CHECK (btrim(service_name) <> ''),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  amount NUMERIC(14,2) CHECK (amount IS NULL OR amount >= 0),
  currency TEXT NOT NULL DEFAULT 'JPY' CHECK (currency = 'JPY'),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_by_user_email TEXT NOT NULL,
  idempotency_key UUID NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX business_kaizen_commercial_events_diagnosis_idx
  ON business_kaizen_commercial_events(diagnosis_id, occurred_at DESC, id DESC);
CREATE FUNCTION business_kaizen_reject_commercial_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'business kaizen commercial events are append-only';
END;
$$;
CREATE TRIGGER business_kaizen_commercial_events_append_only
  BEFORE UPDATE OR DELETE ON business_kaizen_commercial_events
  FOR EACH ROW EXECUTE FUNCTION business_kaizen_reject_commercial_event_mutation();

-- Role-exists-safe runtime grants. The draft MUST NOT be applied to Production.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_kaizen_diagnoses TO sales_tools_runtime;
    GRANT SELECT, INSERT ON TABLE business_kaizen_diagnosis_stage_history TO sales_tools_runtime;
    REVOKE UPDATE, DELETE ON TABLE business_kaizen_diagnosis_stage_history FROM sales_tools_runtime;
    GRANT SELECT, INSERT ON TABLE business_kaizen_diagnosis_audit TO sales_tools_runtime;
    REVOKE UPDATE, DELETE ON TABLE business_kaizen_diagnosis_audit FROM sales_tools_runtime;
    GRANT SELECT, INSERT ON TABLE business_kaizen_commercial_events TO sales_tools_runtime;
    REVOKE UPDATE, DELETE ON TABLE business_kaizen_commercial_events FROM sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_kaizen_diagnoses TO sales_tools_app;
    GRANT SELECT, INSERT ON TABLE business_kaizen_diagnosis_stage_history TO sales_tools_app;
    REVOKE UPDATE, DELETE ON TABLE business_kaizen_diagnosis_stage_history FROM sales_tools_app;
    GRANT SELECT, INSERT ON TABLE business_kaizen_diagnosis_audit TO sales_tools_app;
    REVOKE UPDATE, DELETE ON TABLE business_kaizen_diagnosis_audit FROM sales_tools_app;
    GRANT SELECT, INSERT ON TABLE business_kaizen_commercial_events TO sales_tools_app;
    REVOKE UPDATE, DELETE ON TABLE business_kaizen_commercial_events FROM sales_tools_app;
  END IF;
END $$;
