-- Package E2b draft only. Do not assign a Production migration number without ledger preflight.
BEGIN;

CREATE TABLE business_kaizen_anonymous_kpi_daily (
  event_date_jst DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('diagnosis_start','diagnosis_complete')),
  environment TEXT NOT NULL CHECK (environment IN ('PRODUCTION','TEST')),
  origin TEXT NOT NULL CHECK (origin ~ '^https://[^/]+$' AND length(origin) <= 300),
  utm_classification TEXT NOT NULL CHECK (utm_classification IN ('REGISTERED','UNATTRIBUTED','OTHER')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  event_count BIGINT NOT NULL DEFAULT 1 CHECK (event_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_kaizen_anonymous_kpi_utm_shape CHECK (
    (utm_classification='REGISTERED' AND num_nonnulls(utm_source,utm_medium,utm_campaign,utm_content,utm_term)>0) OR
    (utm_classification IN ('UNATTRIBUTED','OTHER') AND num_nonnulls(utm_source,utm_medium,utm_campaign,utm_content,utm_term)=0)
  ),
  CONSTRAINT business_kaizen_anonymous_kpi_daily_unique UNIQUE NULLS NOT DISTINCT
    (event_date_jst,event_type,environment,origin,utm_classification,utm_source,utm_medium,utm_campaign,utm_content,utm_term)
);

CREATE INDEX business_kaizen_anonymous_kpi_period_idx
  ON business_kaizen_anonymous_kpi_daily(environment,event_date_jst,event_type);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sales_tools_runtime') THEN
    GRANT SELECT,INSERT,UPDATE ON business_kaizen_anonymous_kpi_daily TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sales_tools_app') THEN
    GRANT SELECT,INSERT,UPDATE ON business_kaizen_anonymous_kpi_daily TO sales_tools_app;
  END IF;
END
$$;

COMMIT;
