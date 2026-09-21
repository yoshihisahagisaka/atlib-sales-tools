import type { QueryResult } from 'pg';

export type MigrationLedgerEntry = Readonly<{ filename: string; applied_at: string }>;
type LedgerRow = { filename?: unknown; applied_at?: unknown };
type LedgerClient = { query(sql: string): Promise<unknown>; release(): void };
type LedgerPool = { connect(): Promise<LedgerClient> };

const BEGIN_READ_ONLY = 'BEGIN TRANSACTION READ ONLY';
const LEDGER_SELECT = 'SELECT filename, applied_at FROM public.schema_migrations ORDER BY filename';
const ROLLBACK = 'ROLLBACK';

function fail(): never { throw new Error('MIGRATION_LEDGER_VERIFICATION_FAILED'); }

function entryFrom(row: LedgerRow): MigrationLedgerEntry {
  if (Object.keys(row).sort().join(',') !== 'applied_at,filename' || typeof row.filename !== 'string') fail();
  const appliedAt = row.applied_at instanceof Date ? row.applied_at.toISOString() : undefined;
  if (!appliedAt) fail();
  return Object.freeze({ filename: row.filename, applied_at: appliedAt });
}

/** Reads only the ledger; it never imports the migration runner or migration SQL. */
export async function verifyMigrationLedger(pool: LedgerPool): Promise<readonly MigrationLedgerEntry[]> {
  const client: LedgerClient = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query(BEGIN_READ_ONLY);
    transactionStarted = true;
    const result = await client.query(LEDGER_SELECT) as QueryResult<LedgerRow>;
    const entries = result.rows.map(entryFrom);
    await client.query(ROLLBACK);
    transactionStarted = false;
    return Object.freeze(entries);
  } catch {
    if (transactionStarted) {
      try { await client.query(ROLLBACK); } catch { /* Preserve fail-closed result. */ }
    }
    fail();
  } finally {
    client.release();
  }
}

export const migrationLedgerVerificationSql = Object.freeze({ BEGIN_READ_ONLY, LEDGER_SELECT, ROLLBACK });
