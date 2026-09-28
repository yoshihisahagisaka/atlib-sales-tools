import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionReconciliationPermissionSql, DeletionReconciliationPermissionDiagnosticError, verifyDeletionReconciliationPermissions } from '../src/db/deletionReconciliationPermissionVerifier';
import { runDeletionReconciliationPermissionVerifierCli } from '../src/db/deletionReconciliationPermissionVerifierCli';

function fixture(responses: Array<unknown>) {
  const queries: string[] = []; let released = false;
  const client = { query: async (sql: string) => { queries.push(sql); const next = responses.shift(); if (next instanceof Error) throw next; return next; }, release: () => { released = true; } };
  return { pool: { connect: async () => client }, queries, released: () => released };
}
const successRows = [undefined, undefined, { rows: [{ runtime_role: 'sales_tools_runtime', diagnosis_deletion_requests_exists: true, diagnosis_deletion_requests_can_select: true, diagnosis_audit_logs_exists: true, diagnosis_audit_logs_can_select: false, diagnosis_deletion_tombstones_exists: true, diagnosis_deletion_tombstones_can_select: false }] }, undefined];

test('permission diagnostic uses one read-only catalog-only query and exposes only fixed booleans', async () => {
  const db = fixture([...successRows]); const result = await verifyDeletionReconciliationPermissions(db.pool);
  assert.equal(result.phase, 'PRIVILEGE_CHECK_COMPLETE');
  assert.deepEqual(result.tables.diagnosis_audit_logs, { exists: true, can_select: false });
  assert.deepEqual(db.queries, Object.values(deletionReconciliationPermissionSql)); assert.equal(db.released(), true);
  const sql = db.queries.join('\n');
  assert.doesNotMatch(sql, /\b(id|diagnosis_case_id|detail_json|content|prompt|response|transcript|report)\b/i);
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMIT)\b/im);
  assert.match(sql, /BEGIN READ ONLY/); assert.match(sql, /statement_timeout = '5s'/); assert.match(sql, /has_table_privilege/);
});

test('missing table and missing SELECT remain distinguishable without a row query', async () => {
  const rows = [...successRows]; rows[2] = { rows: [{ runtime_role: 'sales_tools_runtime', diagnosis_deletion_requests_exists: true, diagnosis_deletion_requests_can_select: true, diagnosis_audit_logs_exists: false, diagnosis_audit_logs_can_select: false, diagnosis_deletion_tombstones_exists: true, diagnosis_deletion_tombstones_can_select: true }] };
  const result = await verifyDeletionReconciliationPermissions(fixture(rows).pool);
  assert.deepEqual(result.tables.diagnosis_audit_logs, { exists: false, can_select: false });
});

test('query failure rolls back, releases, and reports only a fixed phase', async () => {
  const db = fixture([undefined, undefined, new Error('permission denied for confidential detail'), undefined]);
  await assert.rejects(verifyDeletionReconciliationPermissions(db.pool), (error: unknown) => error instanceof DeletionReconciliationPermissionDiagnosticError && error.phase === 'PRIVILEGE_CHECK');
  assert.deepEqual(db.queries, [deletionReconciliationPermissionSql.BEGIN_READ_ONLY, deletionReconciliationPermissionSql.SET_STATEMENT_TIMEOUT, deletionReconciliationPermissionSql.PRIVILEGES, deletionReconciliationPermissionSql.ROLLBACK]);
  assert.equal(db.released(), true);
});

test('CLI uses runtime config and sanitizes failures without configuration or database error text', async () => {
  const db = fixture([...successRows]); const stdout: string[] = []; const stderr: string[] = []; let ended = false;
  await runDeletionReconciliationPermissionVerifierCli({ loadDatabaseConfig: async () => ({ name: 'safe', user: 'sales_tools_runtime', password: 'must-not-appear', host: '127.0.0.1', port: 5432 }), createPool: () => ({ ...db.pool, end: async () => { ended = true; } }), stdout: { write: (value: string) => { stdout.push(value); return true; } }, stderr: { write: (value: string) => { stderr.push(value); return true; } } });
  assert.match(stdout.join(''), /"PRIVILEGE_CHECK_COMPLETE"/); assert.doesNotMatch(stdout.join(''), /must-not-appear|password|127\.0\.0\.1/i); assert.equal(stderr.join(''), ''); assert.equal(ended, true);
  const failed = fixture([undefined, undefined, new Error('permission denied for secret')]); const failedStderr: string[] = [];
  await assert.rejects(runDeletionReconciliationPermissionVerifierCli({ loadDatabaseConfig: async () => ({} as never), createPool: () => ({ ...failed.pool, end: async () => undefined }), stdout: { write: () => true }, stderr: { write: (value: string) => { failedStderr.push(value); return true; } } }));
  assert.equal(failedStderr.join(''), 'DELETION_RECONCILIATION_PERMISSION_DIAGNOSTIC_FAILED:PRIVILEGE_CHECK\n');
});
