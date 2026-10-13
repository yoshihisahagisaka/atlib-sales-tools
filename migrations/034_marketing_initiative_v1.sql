-- Lightweight UTM initiative master. Sales Activity remains the attribution source of truth.
BEGIN;

CREATE TABLE marketing_initiative (
  initiative_id UUID PRIMARY KEY,
  initiative_name TEXT NOT NULL CHECK (btrim(initiative_name) <> '' AND length(initiative_name) <= 200),
  service_key TEXT NOT NULL CHECK (service_key IN ('IT_KAIZEN','BUSINESS_WEB')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL CHECK (btrim(created_by) <> ''),
  updated_by TEXT NOT NULL CHECK (btrim(updated_by) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_initiative_has_utm CHECK (num_nonnulls(utm_source,utm_medium,utm_campaign,utm_content,utm_term) > 0),
  CONSTRAINT marketing_initiative_utm_values CHECK (
    (utm_source IS NULL OR (btrim(utm_source) <> '' AND length(utm_source) <= 200)) AND
    (utm_medium IS NULL OR (btrim(utm_medium) <> '' AND length(utm_medium) <= 200)) AND
    (utm_campaign IS NULL OR (btrim(utm_campaign) <> '' AND length(utm_campaign) <= 200)) AND
    (utm_content IS NULL OR (btrim(utm_content) <> '' AND length(utm_content) <= 200)) AND
    (utm_term IS NULL OR (btrim(utm_term) <> '' AND length(utm_term) <= 200))
  )
);

ALTER TABLE marketing_initiative ADD CONSTRAINT marketing_initiative_service_utm_unique
  UNIQUE NULLS NOT DISTINCT (service_key,utm_source,utm_medium,utm_campaign,utm_content,utm_term);
CREATE INDEX marketing_initiative_service_active_idx ON marketing_initiative(service_key,is_active,created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE marketing_initiative TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE marketing_initiative TO sales_tools_app;
  END IF;
END
$$;

COMMIT;
