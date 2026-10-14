-- DESIGN DRAFT ONLY. NOT A RUNNABLE NUMBERED MIGRATION.
-- Coordinate next migration number and Production deploy with Business KAIZEN lane.
-- IT経営KAIZEN anonymous questionnaire: aggregated counters, no event ledger or identity.
CREATE TABLE it_kaizen_survey_monthly_counts (
  month_jst DATE NOT NULL CHECK (EXTRACT(DAY FROM month_jst)=1),
  service_key TEXT NOT NULL DEFAULT 'IT_KAIZEN' CHECK (service_key='IT_KAIZEN'),
  -- Resolved once at count time. Null means unmatched/no registered initiative.
  initiative_id UUID REFERENCES marketing_initiative(initiative_id) ON DELETE RESTRICT,
  attribution_bucket TEXT NOT NULL,
  started_count BIGINT NOT NULL DEFAULT 0 CHECK (started_count>=0),
  completed_count BIGINT NOT NULL DEFAULT 0 CHECK (completed_count>=0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month_jst,service_key,attribution_bucket),
  CHECK (
    (initiative_id IS NULL AND attribution_bucket='UNMATCHED')
    OR (initiative_id IS NOT NULL AND attribution_bucket='INITIATIVE:'||initiative_id::text)
  )
);
-- Runtime privileges and historical Production default ACL must be explicitly
-- reviewed, following Migration 036's append-only/least-privilege lessons.
-- No per-visitor, per-browser, per-attempt, personal or survey-answer columns.
