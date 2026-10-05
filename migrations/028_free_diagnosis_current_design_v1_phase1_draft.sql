-- DRAFT ONLY — IT経営KAIZEN 無料診断 Current Design v1 Phase 1.
-- This forward-only migration is intentionally NOT executed by this task.
-- It does not modify migration 027, legacy diagnosis_cases, Report, Feedback, or Handoff tables.
-- Nullable additions preserve existing internal-dogfood records without backfill.

BEGIN;

ALTER TABLE hearing_statement_v2
  ADD COLUMN structured_answer_json JSONB;

ALTER TABLE rule_analysis_execution
  ADD COLUMN analysis_stage TEXT CHECK (analysis_stage IN ('INITIAL', 'FINAL')),
  ADD COLUMN input_snapshot_json JSONB;

COMMIT;
