import type { QueryResult } from 'pg';

type Client = { query(sql: string, values?: readonly unknown[]): Promise<unknown>; release(): void };
type Pool = { connect(): Promise<Client> };
type Row = Record<string, unknown>;

export type ReconciliationWindow = Readonly<{ start_utc: string; end_utc: string }>;
export type DeletionPostTickReconciliationEvidence = Readonly<{
  schema: 'public.diagnosis_deletion_requests|public.diagnosis_audit_logs|public.diagnosis_deletion_tombstones';
  window: ReconciliationWindow;
  observed_at_utc: string;
  status_counts: readonly Readonly<{ status: string; count: string }>[];
  window_outcome_counts: readonly Readonly<{ status: string; count: string }>[];
  window_failure_counts: readonly Readonly<{ failure_code: string; count: string }>[];
  processed_scope_class_counts: readonly Readonly<{ data_class: string; count: string }>[];
  restricted_retain_tombstone_counts: readonly Readonly<{ data_class: string; count: string }>[];
  request_audit_tombstone_integrity: Readonly<{
    processed_request_count: string;
    processed_without_single_audit_count: string;
    audit_without_processed_request_count: string;
    tombstone_audit_count_mismatch_count: string;
  }>;
  shared_organization_failure_attribution_supported: false;
  runtime_role_privileges: Readonly<{ runtime_role: string; can_select_deletion_requests: boolean; can_select_audit_logs: boolean; can_select_tombstones: boolean }>;
}>;

const BEGIN_READ_ONLY = 'BEGIN READ ONLY';
const SET_STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '5s'";
const ROLLBACK = 'ROLLBACK';
const SCHEDULER_ACTOR = 'system:scheduler-deletion-worker';
const STATUS_COUNTS = "SELECT status, count(*)::text AS count FROM public.diagnosis_deletion_requests GROUP BY status ORDER BY status";
const OBSERVED_AT = 'SELECT now() AS observed_at_utc';
const WINDOW_OUTCOME_COUNTS = `SELECT status, count(*)::text AS count
  FROM public.diagnosis_deletion_requests
  WHERE executed_by_user_id=$3 AND executed_at >= $1 AND executed_at < $2
    AND status IN ('COMPLETED','PARTIALLY_RETAINED')
  GROUP BY status ORDER BY status`;
const WINDOW_FAILURE_COUNTS = `SELECT failure_code, count(*)::text AS count
  FROM public.diagnosis_deletion_requests
  WHERE status='FAILED' AND failure_code='DELETION_WORKER_INTERRUPTED'
    AND updated_at >= $1 AND updated_at < $2
  GROUP BY failure_code ORDER BY failure_code`;
const PROCESSED_SCOPE_CLASS_COUNTS = `WITH processed AS (
  SELECT id, scoped_data_classes FROM public.diagnosis_deletion_requests
  WHERE executed_by_user_id=$3 AND executed_at >= $1 AND executed_at < $2
    AND status IN ('COMPLETED','PARTIALLY_RETAINED')
) SELECT scope.value AS data_class, count(*)::text AS count
  FROM processed p CROSS JOIN LATERAL jsonb_array_elements_text(p.scoped_data_classes) AS scope(value)
  GROUP BY scope.value ORDER BY scope.value`;
const RESTRICTED_RETAIN_TOMBSTONE_COUNTS = `SELECT data_class, count(*)::text AS count
  FROM public.diagnosis_deletion_tombstones
  WHERE created_by_user_id=$3 AND created_at >= $1 AND created_at < $2 AND action='RESTRICT_RETAIN'
  GROUP BY data_class ORDER BY data_class`;
const INTEGRITY = `WITH processed AS (
  SELECT id FROM public.diagnosis_deletion_requests
  WHERE executed_by_user_id=$3 AND executed_at >= $1 AND executed_at < $2
    AND status IN ('COMPLETED','PARTIALLY_RETAINED')
), audits AS (
  SELECT (detail_json->>'deletion_request_id')::uuid AS deletion_request_id,
    count(*)::bigint AS audit_count,
    max((detail_json->>'tombstones_written')::bigint) AS tombstones_written
  FROM public.diagnosis_audit_logs
  WHERE command='ExecuteDeletionRequest' AND actor_user_id=$3 AND created_at >= $1 AND created_at < $2
  GROUP BY (detail_json->>'deletion_request_id')::uuid
), tombstones AS (
  SELECT deletion_request_id, count(*)::bigint AS tombstone_count
  FROM public.diagnosis_deletion_tombstones
  WHERE created_by_user_id=$3 AND created_at >= $1 AND created_at < $2
  GROUP BY deletion_request_id
), request_checks AS (
  SELECT p.id, coalesce(a.audit_count,0) AS audit_count, a.tombstones_written, coalesce(t.tombstone_count,0) AS tombstone_count
  FROM processed p LEFT JOIN audits a ON a.deletion_request_id=p.id LEFT JOIN tombstones t ON t.deletion_request_id=p.id
) SELECT
  (SELECT count(*)::text FROM processed) AS processed_request_count,
  (SELECT count(*)::text FROM request_checks WHERE audit_count<>1) AS processed_without_single_audit_count,
  (SELECT count(*)::text FROM audits a LEFT JOIN processed p ON p.id=a.deletion_request_id WHERE p.id IS NULL) AS audit_without_processed_request_count,
  (SELECT count(*)::text FROM request_checks WHERE audit_count<>1 OR tombstones_written IS NULL OR tombstone_count<>tombstones_written) AS tombstone_audit_count_mismatch_count`;
const PRIVILEGES = "SELECT current_user AS runtime_role, has_table_privilege(current_user, 'public.diagnosis_deletion_requests', 'SELECT') AS can_select_deletion_requests, has_table_privilege(current_user, 'public.diagnosis_audit_logs', 'SELECT') AS can_select_audit_logs, has_table_privilege(current_user, 'public.diagnosis_deletion_tombstones', 'SELECT') AS can_select_tombstones";

function fail(): never { throw new Error('DELETION_POST_TICK_RECONCILIATION_FAILED'); }
function rows(result: unknown): readonly Row[] { const value = result as QueryResult<Row>; if (!Array.isArray(value?.rows)) fail(); return value.rows; }
function text(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function timestamp(value: unknown): string { if (value instanceof Date) return value.toISOString(); return text(value); }
function keyed(result: unknown, key: string): readonly Readonly<Record<string, string>>[] {
  return rows(result).map((row) => { if (Object.keys(row).sort().join(',') !== [key, 'count'].sort().join(',')) fail(); return Object.freeze({ [key]: text(row[key]), count: text(row.count) }); });
}
function one(result: unknown, keys: readonly string[]): Readonly<Record<string, string>> {
  const row = rows(result)[0]; if (!row || Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) fail();
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, text(row[key])])));
}
function observed(result: unknown): string { const row = rows(result)[0]; if (!row || Object.keys(row).join(',') !== 'observed_at_utc') fail(); return timestamp(row.observed_at_utc); }
function privileges(result: unknown): DeletionPostTickReconciliationEvidence['runtime_role_privileges'] {
  const row = rows(result)[0]; const keys=['can_select_audit_logs','can_select_deletion_requests','can_select_tombstones','runtime_role'];
  if (!row || Object.keys(row).sort().join(',') !== keys.join(',')) fail();
  if (typeof row.runtime_role !== 'string' || typeof row.can_select_deletion_requests !== 'boolean' || typeof row.can_select_audit_logs !== 'boolean' || typeof row.can_select_tombstones !== 'boolean') fail();
  return Object.freeze({ runtime_role:row.runtime_role, can_select_deletion_requests:row.can_select_deletion_requests, can_select_audit_logs:row.can_select_audit_logs, can_select_tombstones:row.can_select_tombstones });
}
const STRICT_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;
type StrictInstant = Readonly<{ raw:string; ordering_key:string }>;
function strictUtc(value: string): StrictInstant {
  const match=STRICT_UTC.exec(value); if(!match) fail();
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
  const fraction=(match[7]??'').padEnd(9,'0');
  const instant=new Date(`${value.slice(0,19)}.${fraction.slice(0,3)}Z`);
  if(!Number.isFinite(instant.getTime()) || instant.getUTCFullYear()!==year || instant.getUTCMonth()+1!==month || instant.getUTCDate()!==day || instant.getUTCHours()!==hour || instant.getUTCMinutes()!==minute || instant.getUTCSeconds()!==second) fail();
  return Object.freeze({raw:value,ordering_key:`${value.slice(0,19)}.${fraction}Z`});
}
/** Strict RFC3339 UTC only. Values remain verbatim so valid sub-millisecond bounds are never silently truncated. */
export function validateDeletionPostTickWindow(window: ReconciliationWindow, now: Date = new Date()): ReconciliationWindow {
  if(typeof window.start_utc!=='string' || typeof window.end_utc!=='string' || !Number.isFinite(now.getTime())) fail();
  const start=strictUtc(window.start_utc), end=strictUtc(window.end_utc);
  const current=strictUtc(now.toISOString());
  if(start.ordering_key>=end.ordering_key || end.ordering_key>current.ordering_key) fail();
  return Object.freeze({start_utc:start.raw,end_utc:end.raw});
}
function windowValues(window: ReconciliationWindow, now: Date): readonly string[] {
  const validated=validateDeletionPostTickWindow(window,now);
  return [validated.start_utc, validated.end_utc, SCHEDULER_ACTOR];
}

/** Aggregate-only post-window snapshot. A caller must retain the pre-resume snapshot separately; no request identifier leaves the database. */
export async function verifyDeletionPostTickReconciliation(pool: Pool, window: ReconciliationWindow, now: Date = new Date()): Promise<DeletionPostTickReconciliationEvidence> {
  const values=windowValues(window,now); const client=await pool.connect(); let started=false;
  try {
    await client.query(BEGIN_READ_ONLY); started=true; await client.query(SET_STATEMENT_TIMEOUT);
    const status_counts=keyed(await client.query(STATUS_COUNTS),'status') as DeletionPostTickReconciliationEvidence['status_counts'];
    const observed_at_utc=observed(await client.query(OBSERVED_AT));
    const window_outcome_counts=keyed(await client.query(WINDOW_OUTCOME_COUNTS,values),'status') as DeletionPostTickReconciliationEvidence['window_outcome_counts'];
    const window_failure_counts=keyed(await client.query(WINDOW_FAILURE_COUNTS,values),'failure_code') as DeletionPostTickReconciliationEvidence['window_failure_counts'];
    const processed_scope_class_counts=keyed(await client.query(PROCESSED_SCOPE_CLASS_COUNTS,values),'data_class') as DeletionPostTickReconciliationEvidence['processed_scope_class_counts'];
    const restricted_retain_tombstone_counts=keyed(await client.query(RESTRICTED_RETAIN_TOMBSTONE_COUNTS,values),'data_class') as DeletionPostTickReconciliationEvidence['restricted_retain_tombstone_counts'];
    const request_audit_tombstone_integrity=one(await client.query(INTEGRITY,values),['processed_request_count','processed_without_single_audit_count','audit_without_processed_request_count','tombstone_audit_count_mismatch_count']) as DeletionPostTickReconciliationEvidence['request_audit_tombstone_integrity'];
    const runtime_role_privileges=privileges(await client.query(PRIVILEGES));
    await client.query(ROLLBACK); started=false;
    return Object.freeze({ schema:'public.diagnosis_deletion_requests|public.diagnosis_audit_logs|public.diagnosis_deletion_tombstones', window:Object.freeze({start_utc:values[0]!,end_utc:values[1]!}), observed_at_utc, status_counts, window_outcome_counts, window_failure_counts, processed_scope_class_counts, restricted_retain_tombstone_counts, request_audit_tombstone_integrity, shared_organization_failure_attribution_supported:false, runtime_role_privileges });
  } catch { if(started){try{await client.query(ROLLBACK);}catch{/* fail closed */}} fail(); } finally { client.release(); }
}

export const deletionPostTickReconciliationSql=Object.freeze({ BEGIN_READ_ONLY, SET_STATEMENT_TIMEOUT, STATUS_COUNTS, OBSERVED_AT, WINDOW_OUTCOME_COUNTS, WINDOW_FAILURE_COUNTS, PROCESSED_SCOPE_CLASS_COUNTS, RESTRICTED_RETAIN_TOMBSTONE_COUNTS, INTEGRITY, PRIVILEGES, ROLLBACK });
