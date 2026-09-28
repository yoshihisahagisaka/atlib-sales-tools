import type { QueryResult } from 'pg';
import { deletionPostTickReconciliationSql, type ReconciliationWindow } from './deletionPostTickReconciliationVerifier';

type Client = { query(sql: string, values?: readonly unknown[]): Promise<unknown>; release(): void };
type Pool = { connect(): Promise<Client> };
type Row = Record<string, unknown>;

export type DeletionReconciliationPhase =
  | 'CONNECT'
  | 'BEGIN_READ_ONLY'
  | 'SET_STATEMENT_TIMEOUT'
  | 'STATUS_AGGREGATE'
  | 'WINDOW_AGGREGATE'
  | 'AUDIT_TOMBSTONE_AGGREGATE'
  | 'INTEGRITY_JOIN'
  | 'PRIVILEGE_CHECK'
  | 'ROW_SHAPE'
  | 'ROLLBACK'
  | 'POOL_CLOSE';

export class DeletionReconciliationPhaseDiagnosticError extends Error {
  constructor(readonly phase: DeletionReconciliationPhase) { super('DELETION_RECONCILIATION_PHASE_DIAGNOSTIC_FAILED'); }
}

const ACTOR = 'system:scheduler-deletion-worker';
const fail = (phase: DeletionReconciliationPhase): never => { throw new DeletionReconciliationPhaseDiagnosticError(phase); };
const rows = (result: unknown): readonly Row[] => {
  const value = result as QueryResult<Row>;
  if (!Array.isArray(value?.rows)) fail('ROW_SHAPE');
  return value.rows;
};
const text = (value: unknown): string => { if (typeof value !== 'string') fail('ROW_SHAPE'); return value as string; };
const keyed = (result: unknown, key: string): void => {
  for (const row of rows(result)) {
    if (Object.keys(row).sort().join(',') !== [key, 'count'].sort().join(',')) fail('ROW_SHAPE');
    text(row[key]); text(row.count);
  }
};
const one = (result: unknown, keys: readonly string[]): void => {
  const row = rows(result)[0];
  if (!row || Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) fail('ROW_SHAPE');
  const valid = row as Row;
  for (const key of keys) text(valid[key]);
};
const observed = (result: unknown): void => {
  const row = rows(result)[0];
  if (!row || Object.keys(row).join(',') !== 'observed_at_utc' || !(row.observed_at_utc instanceof Date || typeof row.observed_at_utc === 'string')) fail('ROW_SHAPE');
};
const privileges = (result: unknown): void => {
  const row = rows(result)[0];
  const keys = ['can_select_audit_logs', 'can_select_deletion_requests', 'can_select_tombstones', 'runtime_role'];
  if (!row || Object.keys(row).sort().join(',') !== keys.join(',') || typeof row.runtime_role !== 'string' || typeof row.can_select_deletion_requests !== 'boolean' || typeof row.can_select_audit_logs !== 'boolean' || typeof row.can_select_tombstones !== 'boolean') fail('ROW_SHAPE');
};

/** Executes the P2-54 fixed SELECT sequence but emits phase-only evidence. */
export async function diagnoseDeletionReconciliationPhase(pool: Pool, window: ReconciliationWindow): Promise<'PRIVILEGE_CHECK'> {
  const values = [window.start_utc, window.end_utc, ACTOR] as const;
  let client: Client;
  try { client = await pool.connect(); } catch { return fail('CONNECT'); }
  let begun = false;
  let phase: DeletionReconciliationPhase = 'BEGIN_READ_ONLY';
  try {
    await client.query(deletionPostTickReconciliationSql.BEGIN_READ_ONLY); begun = true;
    phase = 'SET_STATEMENT_TIMEOUT'; await client.query(deletionPostTickReconciliationSql.SET_STATEMENT_TIMEOUT);
    phase = 'STATUS_AGGREGATE'; keyed(await client.query(deletionPostTickReconciliationSql.STATUS_COUNTS), 'status'); observed(await client.query(deletionPostTickReconciliationSql.OBSERVED_AT));
    phase = 'WINDOW_AGGREGATE'; keyed(await client.query(deletionPostTickReconciliationSql.WINDOW_OUTCOME_COUNTS, values), 'status'); keyed(await client.query(deletionPostTickReconciliationSql.WINDOW_FAILURE_COUNTS, values), 'failure_code'); keyed(await client.query(deletionPostTickReconciliationSql.PROCESSED_SCOPE_CLASS_COUNTS, values), 'data_class');
    phase = 'AUDIT_TOMBSTONE_AGGREGATE'; keyed(await client.query(deletionPostTickReconciliationSql.RESTRICTED_RETAIN_TOMBSTONE_COUNTS, values), 'data_class');
    phase = 'INTEGRITY_JOIN'; one(await client.query(deletionPostTickReconciliationSql.INTEGRITY, values), ['processed_request_count', 'processed_without_single_audit_count', 'audit_without_processed_request_count', 'tombstone_audit_count_mismatch_count']);
    phase = 'PRIVILEGE_CHECK'; privileges(await client.query(deletionPostTickReconciliationSql.PRIVILEGES));
    phase = 'ROLLBACK'; await client.query(deletionPostTickReconciliationSql.ROLLBACK); begun = false;
    return 'PRIVILEGE_CHECK';
  } catch (error) {
    if (begun) { try { await client.query(deletionPostTickReconciliationSql.ROLLBACK); } catch { phase = 'ROLLBACK'; } }
    if (error instanceof DeletionReconciliationPhaseDiagnosticError) throw error;
    return fail(phase);
  } finally { client.release(); }
}
