-- Controlled Pilot Closure Slice C: restore/deletion reconciliation execution audit.
-- The authoritative reconciliation manifest must be persisted outside the database
-- being restored; this table records each replay/verification attempt after restore.

CREATE TABLE diagnosis_restore_reconciliation_runs (
  id UUID PRIMARY KEY,
  manifest_version TEXT NOT NULL,
  manifest_hash TEXT NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  mode TEXT NOT NULL CHECK (mode IN ('VERIFY','APPLY')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  tombstone_count INTEGER NOT NULL CHECK (tombstone_count >= 0),
  matched_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  changed_count INTEGER NOT NULL DEFAULT 0 CHECK (changed_count >= 0),
  unsupported_count INTEGER NOT NULL DEFAULT 0 CHECK (unsupported_count >= 0),
  error_code TEXT,
  executed_by_user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status='RUNNING' OR completed_at IS NOT NULL)
);
CREATE INDEX diagnosis_restore_reconciliation_runs_created
  ON diagnosis_restore_reconciliation_runs(created_at DESC,id);

COMMENT ON TABLE diagnosis_restore_reconciliation_runs IS
  'Records restore-time replay/verification of externally persisted deletion reconciliation manifests. The database copy alone is not sufficient to prevent resurrection after restore.';
