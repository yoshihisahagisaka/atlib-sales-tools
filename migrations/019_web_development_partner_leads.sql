CREATE TABLE web_development_partner_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  consultation_type TEXT,
  inquiry TEXT,
  status TEXT NOT NULL DEFAULT 'schedule_pending'
    CHECK (status IN ('schedule_pending','scheduled','meeting_completed','partnered','lost')),
  timerex_event_id TEXT,
  scheduled_at TIMESTAMPTZ,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  cta_source TEXT, landing_url TEXT, referrer TEXT, source_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_web_development_partner_leads_created_at ON web_development_partner_leads(created_at DESC);
CREATE INDEX idx_web_development_partner_leads_status ON web_development_partner_leads(status);
CREATE UNIQUE INDEX idx_web_development_partner_leads_timerex_event ON web_development_partner_leads(timerex_event_id) WHERE timerex_event_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE web_development_partner_leads TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE web_development_partner_leads TO sales_tools_app;
  END IF;
END
$$;


