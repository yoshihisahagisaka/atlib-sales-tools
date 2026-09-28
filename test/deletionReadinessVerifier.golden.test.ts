import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { deletionReadinessSql, verifyDeletionReadiness } from '../src/db/deletionReadinessVerifier';
import { runDeletionReadinessVerifierCli } from '../src/db/deletionReadinessVerifierCli';

function fixture(responses: Array<unknown>) {
  const queries: string[] = []; let released = false;
  const client = { query: async (sql: string) => { queries.push(sql); const next = responses.shift(); if (next instanceof Error) throw next; return next; }, release: () => { released = true; } };
  return { pool: { connect: async () => client }, queries, released: () => released };
}
const successRows = [
  undefined, undefined,
  { rows: [{ status: 'APPROVED', count: '21' }, { status: 'FAILED', count: '2' }] },
  { rows: [{ count: '21' }] }, { rows: [{ count: '20' }] },
  { rows: [{ data_class: 'GENERAL_RAW_DIAGNOSIS', count: '9' }, { data_class: 'APPROVED_DECISION_EVIDENCE', count: '3' }] },
  { rows: [{ hold_state: 'HAS_ACTIVE_HOLD', count: '1' }, { hold_state: 'NO_ACTIVE_HOLD', count: '19' }] },
  { rows: [{ restricted_retention: 'HAS_RESTRICTED_RETENTION', count: '2' }, { restricted_retention: 'NO_RESTRICTED_RETENTION', count: '18' }] },
  { rows: [{ hour_utc: new Date('2026-09-28T00:00:00.000Z'), count: '4' }] },
  { rows: [{ status: 'FAILED', count: '2' }] },
  { rows: [{ action: 'POTENTIAL_RAW_ANONYMIZATION_SCOPE', count: '7' }, { action: 'RESTRICT_RETAIN_SCOPE', count: '4' }, { action: 'SHARED_ORGANIZATION_FAIL_CLOSED_REQUEST', count: '1' }] },
  { rows: [{ runtime_role: 'sales_tools_runtime', can_select_deletion_requests: true, can_select_retention_holds: true, can_select_cases: true }] },
  undefined,
];

test('deletion verifier uses the worker-equivalent first-20 aggregate contract in one read-only transaction', async () => {
  const db = fixture([...successRows]); const result = await verifyDeletionReadiness(db.pool);
  assert.equal(result.schema, 'public.diagnosis_deletion_requests');
  assert.equal(result.approved_total, '21'); assert.equal(result.first_tick_candidate_count, '20');
  assert.deepEqual(result.candidate_action_counts, [
    { action: 'POTENTIAL_RAW_ANONYMIZATION_SCOPE', count: '7' },
    { action: 'RESTRICT_RETAIN_SCOPE', count: '4' },
    { action: 'SHARED_ORGANIZATION_FAIL_CLOSED_REQUEST', count: '1' },
  ]);
  assert.deepEqual(db.queries, Object.values(deletionReadinessSql)); assert.equal(db.released(), true);
  const sql = db.queries.join('\n');
  assert.match(sql, /WHERE status='APPROVED'[\s\S]*ORDER BY approved_at ASC[\s\S]*LIMIT 20/);
  assert.match(sql, /APPROVED_DECISION_EVIDENCE/); assert.match(sql, /SHARED_ORGANIZATION_FAIL_CLOSED_REQUEST/);
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMIT)\b/im);
  assert.match(sql, /BEGIN READ ONLY/); assert.match(sql, /statement_timeout = '5s'/); assert.match(sql, /ROLLBACK/);
});

test('deletion verifier supports zero candidates and preserves explicit zero action aggregates', async () => {
  const rows = [...successRows]; rows[2] = { rows: [{ status: 'FAILED', count: '2' }] }; rows[3] = { rows: [{ count: '0' }] }; rows[4] = { rows: [{ count: '0' }] };
  rows[5] = { rows: [] }; rows[6] = { rows: [] }; rows[7] = { rows: [] }; rows[8] = { rows: [] };
  rows[10] = { rows: [
    { action: 'POTENTIAL_RAW_ANONYMIZATION_SCOPE', count: '0' },
    { action: 'RESTRICT_RETAIN_SCOPE', count: '0' },
    { action: 'SHARED_ORGANIZATION_FAIL_CLOSED_REQUEST', count: '0' },
  ] };
  const result = await verifyDeletionReadiness(fixture(rows).pool);
  assert.equal(result.first_tick_candidate_count, '0'); assert.deepEqual(result.candidate_scope_class_counts, []);
  assert.deepEqual(result.candidate_action_counts, [
    { action: 'POTENTIAL_RAW_ANONYMIZATION_SCOPE', count: '0' },
    { action: 'RESTRICT_RETAIN_SCOPE', count: '0' },
    { action: 'SHARED_ORGANIZATION_FAIL_CLOSED_REQUEST', count: '0' },
  ]);
});

test('deletion verifier rolls back, releases, and fails closed on SQL or unexpected row shapes', async () => {
  const failed = fixture([undefined, undefined, new Error('must not escape'), undefined]);
  await assert.rejects(verifyDeletionReadiness(failed.pool), /DELETION_READINESS_VERIFICATION_FAILED/);
  assert.deepEqual(failed.queries, [deletionReadinessSql.BEGIN_READ_ONLY, deletionReadinessSql.SET_STATEMENT_TIMEOUT, deletionReadinessSql.STATUS_COUNTS, deletionReadinessSql.ROLLBACK]); assert.equal(failed.released(), true);
  const malformed = fixture([undefined, undefined, { rows: [{ status: 'APPROVED', count: '1', id: 'forbidden' }] }, undefined]);
  await assert.rejects(verifyDeletionReadiness(malformed.pool), /DELETION_READINESS_VERIFICATION_FAILED/); assert.equal(malformed.released(), true);
});

test('runtime CLI emits only the sanctioned aggregate schema and closes its pool', async () => {
  const db = fixture([...successRows]); const output: string[] = []; let ended = false;
  await runDeletionReadinessVerifierCli({
    loadDatabaseConfig: async () => ({ name: 'sales_tools_staging_f4', user: 'sales_tools_runtime', password: 'must-not-appear', host: '127.0.0.1', port: 5432 }),
    createPool: () => ({ ...db.pool, end: async () => { ended = true; } }), stdout: { write: (chunk: string) => { output.push(chunk); return true; } },
  });
  const rendered = output.join(''); assert.match(rendered, /"schema":"public.diagnosis_deletion_requests"/);
  assert.doesNotMatch(rendered, /must-not-appear|password|127\.0\.0\.1|requester_reference|diagnosis_case_id|organization_id/i); assert.equal(ended, true);
});

test('artifact is isolated from migration and worker execution paths and builds from source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/db/deletionReadinessVerifier.ts'), 'utf8');
  const cli = fs.readFileSync(path.resolve(__dirname, '../src/db/deletionReadinessVerifierCli.ts'), 'utf8');
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile.deletion-readiness'), 'utf8');
  assert.doesNotMatch(source, /executeApprovedRequest|markFailed|migrateCli|runMigrations|pg_advisory/i);
  assert.doesNotMatch(cli, /loadDatabaseConfig\('migration'\)|MIGRATIONS_DIR/i);
  assert.match(dockerfile, /dist\/db\/deletionReadinessVerifierCli\.js/); assert.match(dockerfile, /COPY src \.\/src/); assert.match(dockerfile, /RUN npm run build/);
  assert.doesNotMatch(dockerfile, /^COPY dist \.\/dist$/m); assert.doesNotMatch(dockerfile, /migrations|migrateCli/i);
});
