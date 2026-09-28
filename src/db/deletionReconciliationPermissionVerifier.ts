import type { QueryResult } from 'pg';

type Client = { query(sql: string): Promise<unknown>; release(): void };
type Pool = { connect(): Promise<Client> };
type Row = Record<string, unknown>;

export type DeletionReconciliationPermissionPhase =
  | 'CONNECT'
  | 'BEGIN_READ_ONLY'
  | 'SET_STATEMENT_TIMEOUT'
  | 'PRIVILEGE_CHECK'
  | 'ROW_SHAPE'
  | 'ROLLBACK'
  | 'POOL_CLOSE';

export type DeletionReconciliationPermissionEvidence = Readonly<{
  schema: 'public.diagnosis_deletion_requests|public.diagnosis_audit_logs|public.diagnosis_deletion_tombstones';
  phase: 'PRIVILEGE_CHECK_COMPLETE';
  runtime_role: string;
  tables: Readonly<{
    diagnosis_deletion_requests: Readonly<{ exists: boolean; can_select: boolean }>;
    diagnosis_audit_logs: Readonly<{ exists: boolean; can_select: boolean }>;
    diagnosis_deletion_tombstones: Readonly<{ exists: boolean; can_select: boolean }>;
  }>;
}>;

export class DeletionReconciliationPermissionDiagnosticError extends Error {
  constructor(readonly phase: DeletionReconciliationPermissionPhase) { super('DELETION_RECONCILIATION_PERMISSION_DIAGNOSTIC_FAILED'); }
}

const BEGIN_READ_ONLY = 'BEGIN READ ONLY';
const SET_STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '5s'";
const ROLLBACK = 'ROLLBACK';
// Catalog/privilege predicates only: this query does not read a business-data row.
const PRIVILEGES = `SELECT current_user AS runtime_role,
  to_regclass('public.diagnosis_deletion_requests') IS NOT NULL AS diagnosis_deletion_requests_exists,
  has_table_privilege(current_user, 'public.diagnosis_deletion_requests', 'SELECT') AS diagnosis_deletion_requests_can_select,
  to_regclass('public.diagnosis_audit_logs') IS NOT NULL AS diagnosis_audit_logs_exists,
  has_table_privilege(current_user, 'public.diagnosis_audit_logs', 'SELECT') AS diagnosis_audit_logs_can_select,
  to_regclass('public.diagnosis_deletion_tombstones') IS NOT NULL AS diagnosis_deletion_tombstones_exists,
  has_table_privilege(current_user, 'public.diagnosis_deletion_tombstones', 'SELECT') AS diagnosis_deletion_tombstones_can_select`;

function fail(phase: DeletionReconciliationPermissionPhase): never { throw new DeletionReconciliationPermissionDiagnosticError(phase); }
function rows(result: unknown): readonly Row[] { const value = result as QueryResult<Row>; if (!Array.isArray(value?.rows)) fail('ROW_SHAPE'); return value.rows; }
function evidence(result: unknown): DeletionReconciliationPermissionEvidence {
  const row = rows(result)[0];
  const keys = ['diagnosis_audit_logs_can_select', 'diagnosis_audit_logs_exists', 'diagnosis_deletion_requests_can_select', 'diagnosis_deletion_requests_exists', 'diagnosis_deletion_tombstones_can_select', 'diagnosis_deletion_tombstones_exists', 'runtime_role'];
  if (!row || Object.keys(row).sort().join(',') !== keys.join(',')) fail('ROW_SHAPE');
  if (typeof row.runtime_role !== 'string' || keys.slice(0, -1).some((key) => typeof row[key] !== 'boolean')) fail('ROW_SHAPE');
  return Object.freeze({
    schema: 'public.diagnosis_deletion_requests|public.diagnosis_audit_logs|public.diagnosis_deletion_tombstones',
    phase: 'PRIVILEGE_CHECK_COMPLETE',
    runtime_role: row.runtime_role,
    tables: Object.freeze({
      diagnosis_deletion_requests: Object.freeze({ exists: row.diagnosis_deletion_requests_exists as boolean, can_select: row.diagnosis_deletion_requests_can_select as boolean }),
      diagnosis_audit_logs: Object.freeze({ exists: row.diagnosis_audit_logs_exists as boolean, can_select: row.diagnosis_audit_logs_can_select as boolean }),
      diagnosis_deletion_tombstones: Object.freeze({ exists: row.diagnosis_deletion_tombstones_exists as boolean, can_select: row.diagnosis_deletion_tombstones_can_select as boolean }),
    }),
  });
}

/** Runtime-role-only, aggregate-only permission diagnostic for the reconciliation tables. */
export async function verifyDeletionReconciliationPermissions(pool: Pool): Promise<DeletionReconciliationPermissionEvidence> {
  let client: Client;
  try { client = await pool.connect(); } catch { return fail('CONNECT'); }
  let started = false;
  let phase: DeletionReconciliationPermissionPhase = 'BEGIN_READ_ONLY';
  try {
    await client.query(BEGIN_READ_ONLY); started = true;
    phase = 'SET_STATEMENT_TIMEOUT'; await client.query(SET_STATEMENT_TIMEOUT);
    phase = 'PRIVILEGE_CHECK'; const result = evidence(await client.query(PRIVILEGES));
    phase = 'ROLLBACK'; await client.query(ROLLBACK); started = false;
    return result;
  } catch (error) {
    if (started) { try { await client.query(ROLLBACK); } catch { phase = 'ROLLBACK'; } }
    if (error instanceof DeletionReconciliationPermissionDiagnosticError) throw error;
    return fail(phase);
  } finally { client.release(); }
}

export const deletionReconciliationPermissionSql = Object.freeze({ BEGIN_READ_ONLY, SET_STATEMENT_TIMEOUT, PRIVILEGES, ROLLBACK });
