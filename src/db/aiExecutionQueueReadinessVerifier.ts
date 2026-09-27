import type { QueryResult } from 'pg';

type QueueClient = { query(sql: string): Promise<unknown>; release(): void };
type QueuePool = { connect(): Promise<QueueClient> };

type CountRow = { [key: string]: unknown; count?: unknown };
type PrivilegeRow = { [key: string]: unknown; runtime_role?: unknown; can_select?: unknown; can_insert?: unknown; can_update?: unknown; can_delete?: unknown };

export type QueueReadinessEvidence = Readonly<{
  schema: 'public.ai_executions';
  process_type_counts: readonly Readonly<{ process_type: string; count: string }>[];
  status_counts: readonly Readonly<{ status: string; count: string }>[];
  error_code_counts: readonly Readonly<{ error_code: string; count: string }>[];
  lease_state_counts: readonly Readonly<{ lease_state: string; count: string }>[];
  p225_updated_minute_counts: readonly Readonly<{ minute_utc: string; process_type: string; status: string; count: string }>[];
  runtime_role_privileges: Readonly<{ runtime_role: string; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>;
}>;

const BEGIN_READ_ONLY = 'BEGIN READ ONLY';
const SET_STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '5s'";
const ROLLBACK = 'ROLLBACK';

// Fixed evidence interval: p225 became ready at 06:55:33Z and was retired at 12:23:22Z.
const P225_START = "TIMESTAMPTZ '2026-09-27 06:55:33+00'";
const P225_END_EXCLUSIVE = "TIMESTAMPTZ '2026-09-27 12:23:23+00'";
const PROCESS_TYPE_COUNTS = 'SELECT process_type, count(*)::text AS count FROM public.ai_executions GROUP BY process_type ORDER BY process_type';
const STATUS_COUNTS = 'SELECT status, count(*)::text AS count FROM public.ai_executions GROUP BY status ORDER BY status';
const ERROR_CODE_COUNTS = "SELECT COALESCE(error_code, '(none)') AS error_code, count(*)::text AS count FROM public.ai_executions GROUP BY COALESCE(error_code, '(none)') ORDER BY error_code";
const LEASE_STATE_COUNTS = `SELECT CASE
  WHEN status <> 'RUNNING' THEN 'NOT_RUNNING'
  WHEN lease_expires_at IS NULL THEN 'RUNNING_NO_LEASE'
  WHEN lease_expires_at < clock_timestamp() THEN 'RUNNING_EXPIRED_LEASE'
  ELSE 'RUNNING_ACTIVE_LEASE'
END AS lease_state, count(*)::text AS count
FROM public.ai_executions
GROUP BY 1 ORDER BY 1`;
const P225_UPDATED_MINUTE_COUNTS = `SELECT date_trunc('minute', updated_at) AS minute_utc, process_type, status, count(*)::text AS count
FROM public.ai_executions
WHERE updated_at >= ${P225_START} AND updated_at < ${P225_END_EXCLUSIVE}
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
const PRIVILEGES = "SELECT current_user AS runtime_role, has_table_privilege(current_user, 'public.ai_executions', 'SELECT') AS can_select, has_table_privilege(current_user, 'public.ai_executions', 'INSERT') AS can_insert, has_table_privilege(current_user, 'public.ai_executions', 'UPDATE') AS can_update, has_table_privilege(current_user, 'public.ai_executions', 'DELETE') AS can_delete";

function fail(): never { throw new Error('AI_EXECUTION_QUEUE_READINESS_VERIFICATION_FAILED'); }
function rows(result: unknown): readonly CountRow[] {
  const value = result as QueryResult<CountRow>;
  if (!Array.isArray(value?.rows)) fail();
  return value.rows;
}
function text(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function countRows<T extends readonly string[]>(result: unknown, keys: T): readonly Readonly<Record<T[number], string>>[] {
  return rows(result).map((row) => {
    if (Object.keys(row).sort().join(',') !== [...keys, 'count'].sort().join(',')) fail();
    const value: Record<string, string> = { count: text(row.count) };
    for (const key of keys) value[key] = text(row[key]);
    return Object.freeze(value as Record<T[number], string>);
  });
}
function minuteRows(result: unknown): QueueReadinessEvidence['p225_updated_minute_counts'] {
  return rows(result).map((row) => {
    if (Object.keys(row).sort().join(',') !== 'count,minute_utc,process_type,status') fail();
    const minute = row.minute_utc instanceof Date ? row.minute_utc.toISOString() : text(row.minute_utc);
    return Object.freeze({ minute_utc: minute, process_type: text(row.process_type), status: text(row.status), count: text(row.count) });
  });
}
function privilege(result: unknown): QueueReadinessEvidence['runtime_role_privileges'] {
  const row = rows(result)[0] as PrivilegeRow | undefined;
  if (!row || Object.keys(row).sort().join(',') !== 'can_delete,can_insert,can_select,can_update,runtime_role') fail();
  if (typeof row.runtime_role !== 'string' || typeof row.can_select !== 'boolean' || typeof row.can_insert !== 'boolean' || typeof row.can_update !== 'boolean' || typeof row.can_delete !== 'boolean') fail();
  return Object.freeze({ runtime_role: row.runtime_role, can_select: row.can_select, can_insert: row.can_insert, can_update: row.can_update, can_delete: row.can_delete });
}

/** Aggregate-only operational evidence. It never selects IDs, JSON payloads, or customer fields. */
export async function verifyAiExecutionQueueReadiness(pool: QueuePool): Promise<QueueReadinessEvidence> {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query(BEGIN_READ_ONLY); transactionStarted = true;
    await client.query(SET_STATEMENT_TIMEOUT);
    const process_type_counts = countRows(await client.query(PROCESS_TYPE_COUNTS), ['process_type']) as QueueReadinessEvidence['process_type_counts'];
    const status_counts = countRows(await client.query(STATUS_COUNTS), ['status']) as QueueReadinessEvidence['status_counts'];
    const error_code_counts = countRows(await client.query(ERROR_CODE_COUNTS), ['error_code']) as QueueReadinessEvidence['error_code_counts'];
    const lease_state_counts = countRows(await client.query(LEASE_STATE_COUNTS), ['lease_state']) as QueueReadinessEvidence['lease_state_counts'];
    const p225_updated_minute_counts = minuteRows(await client.query(P225_UPDATED_MINUTE_COUNTS));
    const runtime_role_privileges = privilege(await client.query(PRIVILEGES));
    await client.query(ROLLBACK); transactionStarted = false;
    return Object.freeze({ schema: 'public.ai_executions', process_type_counts, status_counts, error_code_counts, lease_state_counts, p225_updated_minute_counts, runtime_role_privileges });
  } catch {
    if (transactionStarted) { try { await client.query(ROLLBACK); } catch { /* fail closed */ } }
    fail();
  } finally { client.release(); }
}

export const aiExecutionQueueReadinessSql = Object.freeze({ BEGIN_READ_ONLY, SET_STATEMENT_TIMEOUT, PROCESS_TYPE_COUNTS, STATUS_COUNTS, ERROR_CODE_COUNTS, LEASE_STATE_COUNTS, P225_UPDATED_MINUTE_COUNTS, PRIVILEGES, ROLLBACK });
