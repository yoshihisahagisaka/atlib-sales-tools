import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const DELETION_RECONCILIATION_MANIFEST_VERSION = 'ITMGMT-DELETION-RECONCILIATION-v1';

export interface DeletionReconciliationEntry {
  tombstone_id: string;
  diagnosis_case_id: string;
  deletion_request_id: string | null;
  data_class: string;
  target_kind: string;
  target_id: string;
  action: 'DELETE' | 'ANONYMIZE' | 'RESTRICT_RETAIN';
  deleted_or_anonymized_at: string;
}
export interface DeletionReconciliationManifest {
  manifest_version: typeof DELETION_RECONCILIATION_MANIFEST_VERSION;
  exported_at: string;
  entries: DeletionReconciliationEntry[];
}

function canonicalPayload(manifest: DeletionReconciliationManifest): string {
  return JSON.stringify({
    manifest_version: manifest.manifest_version,
    entries: [...manifest.entries].sort((a,b) => a.tombstone_id.localeCompare(b.tombstone_id)),
  });
}
export function deletionManifestHash(manifest: DeletionReconciliationManifest): string {
  return createHash('sha256').update(canonicalPayload(manifest)).digest('hex');
}

/**
 * Export the reconciliation set from the live database. The caller/runbook MUST persist
 * this manifest outside the database/backup lineage that may later be restored.
 */
export async function buildDeletionReconciliationManifest(pool: Pool): Promise<DeletionReconciliationManifest> {
  const { rows } = await pool.query<{
    id:string; diagnosis_case_id:string; deletion_request_id:string|null; data_class:string;
    target_kind:string; target_id:string; action:'DELETE'|'ANONYMIZE'|'RESTRICT_RETAIN'; deleted_or_anonymized_at:Date;
  }>(`SELECT id,diagnosis_case_id,deletion_request_id,data_class,target_kind,target_id,action,deleted_or_anonymized_at
      FROM diagnosis_deletion_tombstones ORDER BY id`);
  return {
    manifest_version: DELETION_RECONCILIATION_MANIFEST_VERSION,
    exported_at: new Date().toISOString(),
    entries: rows.map(r => ({
      tombstone_id:r.id, diagnosis_case_id:r.diagnosis_case_id, deletion_request_id:r.deletion_request_id,
      data_class:r.data_class, target_kind:r.target_kind, target_id:r.target_id, action:r.action,
      deleted_or_anonymized_at:new Date(r.deleted_or_anonymized_at).toISOString(),
    })),
  };
}

async function targetExists(c: PoolClient, entry: DeletionReconciliationEntry): Promise<boolean> {
  switch (entry.target_kind) {
    case 'SOURCE_RECORD': return !!(await c.query('SELECT 1 FROM source_records WHERE id=$1 AND diagnosis_case_id=$2',[entry.target_id,entry.diagnosis_case_id])).rows.length;
    case 'AI_EXECUTION_RAW_IO': return !!(await c.query('SELECT 1 FROM ai_executions WHERE id=$1 AND diagnosis_case_id=$2',[entry.target_id,entry.diagnosis_case_id])).rows.length;
    case 'PARTICIPANT_IDENTITY': return !!(await c.query('SELECT 1 FROM participants WHERE id=$1 AND diagnosis_case_id=$2',[entry.target_id,entry.diagnosis_case_id])).rows.length;
    case 'SURVEY_RESPONSE_RAW': return !!(await c.query('SELECT 1 FROM survey_responses WHERE id=$1 AND diagnosis_case_id=$2',[entry.target_id,entry.diagnosis_case_id])).rows.length;
    default: return false;
  }
}

async function applyEntry(c: PoolClient, entry: DeletionReconciliationEntry): Promise<'CHANGED'|'NOOP'|'UNSUPPORTED'> {
  if (entry.action === 'RESTRICT_RETAIN') return 'NOOP';
  // DELETE is intentionally fail-closed until table-by-table dependency semantics are approved/tested.
  if (entry.action === 'DELETE') return 'UNSUPPORTED';
  switch (entry.target_kind) {
    case 'SOURCE_RECORD': {
      const result = await c.query(`UPDATE source_records SET content='[REDACTED]',speaker_participant_id=NULL,external_reference=NULL,updated_at=now()
        WHERE id=$1 AND diagnosis_case_id=$2 AND (content<>'[REDACTED]' OR speaker_participant_id IS NOT NULL OR external_reference IS NOT NULL)`,[entry.target_id,entry.diagnosis_case_id]);
      return result.rowCount ? 'CHANGED' : 'NOOP';
    }
    case 'AI_EXECUTION_RAW_IO': {
      const result = await c.query(`UPDATE ai_executions SET input_snapshot_json='{}'::jsonb,raw_output_json=NULL,updated_at=now()
        WHERE id=$1 AND diagnosis_case_id=$2 AND (input_snapshot_json<>'{}'::jsonb OR raw_output_json IS NOT NULL)`,[entry.target_id,entry.diagnosis_case_id]);
      return result.rowCount ? 'CHANGED' : 'NOOP';
    }
    case 'PARTICIPANT_IDENTITY': {
      const replacement=`deleted+${entry.target_id}@invalid.local`;
      const result = await c.query(`UPDATE participants SET name='削除済み',email=$3,phone=NULL,job_title=NULL,updated_at=now()
        WHERE id=$1 AND diagnosis_case_id=$2 AND (name<>'削除済み' OR email<>$3 OR phone IS NOT NULL OR job_title IS NOT NULL)`,[entry.target_id,entry.diagnosis_case_id,replacement]);
      return result.rowCount ? 'CHANGED' : 'NOOP';
    }
    case 'SURVEY_RESPONSE_RAW': {
      const result = await c.query(`UPDATE survey_responses SET raw_value_json='null'::jsonb
        WHERE id=$1 AND diagnosis_case_id=$2 AND raw_value_json<>'null'::jsonb`,[entry.target_id,entry.diagnosis_case_id]);
      return result.rowCount ? 'CHANGED' : 'NOOP';
    }
    default: return 'UNSUPPORTED';
  }
}

export async function reconcileDeletionManifest(
  pool: Pool,
  manifest: DeletionReconciliationManifest,
  executedByUserId: string,
  mode: 'VERIFY'|'APPLY' = 'VERIFY',
) {
  if (manifest.manifest_version !== DELETION_RECONCILIATION_MANIFEST_VERSION) throw new Error('DELETION_RECONCILIATION_MANIFEST_VERSION_UNSUPPORTED');
  if (!executedByUserId.trim()) throw new Error('RECONCILIATION_ACTOR_REQUIRED');
  const hash = deletionManifestHash(manifest);
  const runId = randomUUID();
  const client = await pool.connect();
  let matched = 0, changed = 0, unsupported = 0;
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO diagnosis_restore_reconciliation_runs
      (id,manifest_version,manifest_hash,mode,status,tombstone_count,executed_by_user_id)
      VALUES($1,$2,$3,$4,'RUNNING',$5,$6)`,[runId,manifest.manifest_version,hash,mode,manifest.entries.length,executedByUserId]);
    for (const entry of manifest.entries) {
      const exists = await targetExists(client,entry);
      if (exists) matched++;
      if (mode === 'VERIFY') {
        if (entry.action === 'DELETE' || !['SOURCE_RECORD','AI_EXECUTION_RAW_IO','PARTICIPANT_IDENTITY','SURVEY_RESPONSE_RAW'].includes(entry.target_kind)) unsupported++;
        continue;
      }
      const result = await applyEntry(client,entry);
      if (result === 'CHANGED') changed++;
      else if (result === 'UNSUPPORTED') unsupported++;
    }
    if (unsupported) throw new Error('DELETION_RECONCILIATION_UNSUPPORTED_TARGET');
    await client.query(`UPDATE diagnosis_restore_reconciliation_runs SET status='SUCCEEDED',matched_count=$2,changed_count=$3,unsupported_count=$4,completed_at=now() WHERE id=$1`,[runId,matched,changed,unsupported]);
    await client.query('COMMIT');
    return { run_id:runId, manifest_hash:hash, mode, tombstone_count:manifest.entries.length, matched_count:matched, changed_count:changed, unsupported_count:unsupported, status:'SUCCEEDED' as const };
  } catch (error) {
    await client.query('ROLLBACK');
    // Record failure in a new transaction because the attempted replay transaction was rolled back.
    const code = error instanceof Error ? error.message.slice(0,200) : 'RECONCILIATION_FAILED';
    await pool.query(`INSERT INTO diagnosis_restore_reconciliation_runs
      (id,manifest_version,manifest_hash,mode,status,tombstone_count,matched_count,changed_count,unsupported_count,error_code,executed_by_user_id,completed_at)
      VALUES($1,$2,$3,$4,'FAILED',$5,$6,$7,$8,$9,$10,now())`,[runId,manifest.manifest_version,hash,mode,manifest.entries.length,matched,changed,unsupported,code,executedByUserId]);
    throw error;
  } finally { client.release(); }
}
