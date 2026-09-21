-- Diagnosis Application record, not a FACTACT Core object. No legacy backfill.
CREATE TABLE sales_conversation_intakes (
 id UUID PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 customer_json JSONB NOT NULL,
 customer_statements JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(customer_statements)='array'),
 unknowns JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(unknowns)='array'),
 salesperson_notes JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(salesperson_notes)='array'),
 survey_answers JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(survey_answers)='object'),
 created_by_user_id TEXT NOT NULL, updated_by_user_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 conversation_at TIMESTAMPTZ, raw_redacted_at TIMESTAMPTZ,
 consent_state TEXT NOT NULL DEFAULT 'NOT_RECORDED' CHECK(consent_state IN ('NOT_RECORDED','CONSENTED')),
 consent_customer_reference TEXT, consent_recorded_by_user_id TEXT, consent_recorded_at TIMESTAMPTZ,
 consent_wording_version TEXT, diagnosis_case_id UUID UNIQUE REFERENCES diagnosis_cases(id),
 CHECK ((consent_state='NOT_RECORDED' AND consent_recorded_by_user_id IS NULL AND consent_recorded_at IS NULL AND diagnosis_case_id IS NULL)
     OR (consent_state='CONSENTED' AND consent_recorded_by_user_id IS NOT NULL AND consent_recorded_at IS NOT NULL AND consent_customer_reference IS NOT NULL AND consent_wording_version IS NOT NULL))
);
CREATE TABLE sales_intake_audit_logs (
 id UUID PRIMARY KEY, intake_id UUID NOT NULL REFERENCES sales_conversation_intakes(id),
 command TEXT NOT NULL CHECK(command IN ('CreateSalesIntake','UpdateSalesIntake','ConsentAndStartDiagnosis')),
 actor_user_id TEXT NOT NULL, intake_version INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 diagnosis_case_id UUID REFERENCES diagnosis_cases(id)
);
ALTER TABLE diagnosis_cases ADD COLUMN sales_intake_id UUID UNIQUE REFERENCES sales_conversation_intakes(id);
ALTER TABLE survey_responses ADD COLUMN intake_origin_id UUID REFERENCES sales_conversation_intakes(id);
ALTER TABLE survey_responses ADD COLUMN intake_origin_version INTEGER;
ALTER TABLE survey_responses ADD COLUMN intake_origin_recorded_at TIMESTAMPTZ;
-- Current answer provenance is cleared by a subsequent explicit Survey edit; the linked original remains.
CREATE FUNCTION guard_sales_intake_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.entry_channel='SALES_VISIT' AND NOT EXISTS (
  SELECT 1 FROM sales_conversation_intakes i WHERE i.id=NEW.sales_intake_id AND i.consent_state='CONSENTED' AND i.diagnosis_case_id IS NULL
 ) THEN RAISE EXCEPTION 'SALES_DIAGNOSIS_CONSENT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_intake_case_consent BEFORE INSERT ON diagnosis_cases FOR EACH ROW EXECUTE FUNCTION guard_sales_intake_case();
