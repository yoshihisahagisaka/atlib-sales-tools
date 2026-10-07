-- Marketing Attribution belongs to the Sales Launcher activity, not a service Case.
-- Additive only: pre-existing Sales Activities remain valid without attribution.
BEGIN;

ALTER TABLE sales_activity
  ADD COLUMN acquisition_source_type TEXT,
  ADD COLUMN acquisition_source_name TEXT,
  ADD COLUMN utm_source TEXT,
  ADD COLUMN utm_medium TEXT,
  ADD COLUMN utm_campaign TEXT,
  ADD COLUMN utm_content TEXT,
  ADD COLUMN utm_term TEXT,
  ADD COLUMN landing_url TEXT,
  ADD COLUMN referrer TEXT,
  ADD CONSTRAINT sales_activity_acquisition_source_type_check CHECK (
    acquisition_source_type IS NULL OR acquisition_source_type IN
      ('EVENT','REFERRAL','WEB','OUTBOUND','PARTNER','EXISTING_CUSTOMER','OTHER')
  ),
  ADD CONSTRAINT sales_activity_acquisition_source_pair_check CHECK (
    (acquisition_source_type IS NULL) = (acquisition_source_name IS NULL)
  );

CREATE INDEX sales_activity_acquisition_source_name_idx
  ON sales_activity(acquisition_source_name) WHERE acquisition_source_name IS NOT NULL;
CREATE INDEX sales_activity_utm_campaign_idx
  ON sales_activity(utm_campaign) WHERE utm_campaign IS NOT NULL;

COMMIT;
