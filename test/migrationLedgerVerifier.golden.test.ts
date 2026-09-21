import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { migrationLedgerVerificationSql, verifyMigrationLedger } from '../src/db/migrationLedgerVerifier';
import { runMigrationLedgerVerifierCli } from '../src/db/migrationLedgerVerifierCli';

function fixture(responses: Array<unknown>) {
  const queries: string[] = [];
  let released = false;
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
    release: () => { released = true; },
  };
  return { pool: { connect: async () => client }, queries, released: () => released };
}

test('migration ledger verifier uses one explicit read-only transaction and only ledger SQL', async () => {
  const db = fixture([undefined, { rows: [{ filename: '001_isms_diagnostic.sql', applied_at: new Date('2026-09-20T00:00:00.000Z') }] }, undefined]);
  const actual = await verifyMigrationLedger(db.pool);
  assert.deepEqual(actual, [{ filename: '001_isms_diagnostic.sql', applied_at: '2026-09-20T00:00:00.000Z' }]);
  assert.deepEqual(db.queries, [migrationLedgerVerificationSql.BEGIN_READ_ONLY, migrationLedgerVerificationSql.LEDGER_SELECT, migrationLedgerVerificationSql.ROLLBACK]);
  assert.equal(db.released(), true);
  assert.doesNotMatch(db.queries.join('\n'), /INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|pg_advisory|migrations\//i);
});

test('migration ledger verifier does not import the runner or load migration SQL', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/db/migrationLedgerVerifier.ts'), 'utf8');
  assert.doesNotMatch(source, /runMigrations|migrateCli|readFile|readdir|pg_advisory|migrations\//);
});

test('migration ledger verifier fails closed and rolls back on database failure', async () => {
  const db = fixture([undefined, new Error('credential must not escape'), undefined]);
  await assert.rejects(verifyMigrationLedger(db.pool), /MIGRATION_LEDGER_VERIFICATION_FAILED/);
  assert.deepEqual(db.queries, [migrationLedgerVerificationSql.BEGIN_READ_ONLY, migrationLedgerVerificationSql.LEDGER_SELECT, migrationLedgerVerificationSql.ROLLBACK]);
  assert.equal(db.released(), true);
});

test('migration ledger verifier rejects unexpected result shapes', async () => {
  const db = fixture([undefined, { rows: [{ filename: '001_isms_diagnostic.sql', applied_at: '2026-09-20T00:00:00.000Z', password: 'forbidden' }] }, undefined]);
  await assert.rejects(verifyMigrationLedger(db.pool), /MIGRATION_LEDGER_VERIFICATION_FAILED/);
  assert.deepEqual(db.queries, [migrationLedgerVerificationSql.BEGIN_READ_ONLY, migrationLedgerVerificationSql.LEDGER_SELECT, migrationLedgerVerificationSql.ROLLBACK]);
});

test('migration ledger CLI writes only ledger JSON and never DB credentials', async () => {
  const db = fixture([undefined, { rows: [{ filename: '017_sales_conversation_intake.sql', applied_at: new Date('2026-09-20T00:00:00.000Z') }] }, undefined]);
  let ended = false;
  const output: string[] = [];
  await runMigrationLedgerVerifierCli({
    loadDatabaseConfig: async () => ({ name: 'sales_tools_staging_f4', user: 'sales_tools_readiness_reader', password: 'credential-must-not-appear', host: '127.0.0.1', port: 5432 }),
    createPool: () => ({ ...db.pool, end: async () => { ended = true; } }),
    stdout: { write: (chunk: string) => { output.push(chunk); return true; } },
  });
  assert.equal(output.join(''), '[{"filename":"017_sales_conversation_intake.sql","applied_at":"2026-09-20T00:00:00.000Z"}]\n');
  assert.doesNotMatch(output.join(''), /credential|password|127\.0\.0\.1/i);
  assert.equal(ended, true);
});
