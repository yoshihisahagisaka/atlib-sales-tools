CREATE TABLE business_web_consultation_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL, person_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, consultation_note TEXT,
  privacy_consent BOOLEAN NOT NULL CHECK (privacy_consent),
  diagnosis_transfer_consent BOOLEAN NOT NULL CHECK (diagnosis_transfer_consent),
  consent_wording_version TEXT NOT NULL, consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key UUID NOT NULL UNIQUE,
  diagnosis_snapshot JSONB NOT NULL, preparation_result JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','scheduled','completed','closed')),
  scheduled_at TIMESTAMPTZ,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  cta_source TEXT, landing_url TEXT, referrer TEXT, source_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_business_web_consultation_leads_created_at ON business_web_consultation_leads(created_at DESC);
CREATE INDEX idx_business_web_consultation_leads_status ON business_web_consultation_leads(status);
