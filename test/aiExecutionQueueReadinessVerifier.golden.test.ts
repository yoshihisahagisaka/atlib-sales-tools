import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { aiExecutionQueueReadinessSql, verifyAiExecutionQueueReadiness } from '../src/db/aiExecutionQueueReadinessVerifier';
import { runAiExecutionQueueReadinessVerifierCli } from '../src/db/aiExecutionQueueReadinessVerifierCli';

function fixture(responses: Array<unknown>) {
  const queries: string[] = [];
  let released = false;
  const client = { query: async (sql: string) => { queries.push(sql); const next = responses.shift(); if (next instanceof Error) throw next; return next; }, release: () => { released = true; } };
  return { pool: { connect: async () => client }, queries, released: () => released };
}
const successRows = [
  undefined,
  undefined,
  { rows: [{ process_type: 'POST_DIAGNOSIS_STRUCTURER', count: '2' }] },
  { rows: [{ status: 'FAILED', count: '1' }] },
  { rows: [{ error_code: '(none)', count: '1' }] },
  { rows: [{ lease_state: 'NOT_RUNNING', count: '2' }] },
  { rows: [{ minute_utc: new Date('2026-09-27T07:00:00.000Z'), process_type: 'POST_DIAGNOSIS_STRUCTURER', status: 'FAILED', count: '1' }] },
  { rows: [{ runtime_role: 'sales_tools_runtime', can_select: true, can_insert: true, can_update: true, can_delete: false }] },
  undefined,
];

test('queue verifier uses runtime-safe aggregate-only SQL in one read-only transaction', async () => {
  const db = fixture([...successRows]);
  const result = await verifyAiExecutionQueueReadiness(db.pool);
  assert.equal(result.schema, 'public.ai_executions');
  assert.deepEqual(result.process_type_counts, [{ process_type: 'POST_DIAGNOSIS_STRUCTURER', count: '2' }]);
  assert.deepEqual(result.runtime_role_privileges, { runtime_role: 'sales_tools_runtime', can_select: true, can_insert: true, can_update: true, can_delete: false });
  assert.deepEqual(db.queries, Object.values(aiExecutionQueueReadinessSql));
  assert.equal(db.released(), true);
  const sql = db.queries.join('\n');
  assert.doesNotMatch(sql, /\b(id|diagnosis_case_id|input_snapshot_json|raw_output_json|content|prompt|response|transcript|report)\b/i);
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMIT)\b/im);
  assert.match(sql, /BEGIN READ ONLY/);
  assert.match(sql, /statement_timeout = '5s'/);
  assert.match(sql, /ROLLBACK/);
});

test('queue verifier rolls back, releases the connection, and fails closed', async () => {
  const db = fixture([undefined, undefined, new Error('credential must not escape'), undefined]);
  await assert.rejects(verifyAiExecutionQueueReadiness(db.pool), /AI_EXECUTION_QUEUE_READINESS_VERIFICATION_FAILED/);
  assert.deepEqual(db.queries, [aiExecutionQueueReadinessSql.BEGIN_READ_ONLY, aiExecutionQueueReadinessSql.SET_STATEMENT_TIMEOUT, aiExecutionQueueReadinessSql.PROCESS_TYPE_COUNTS, aiExecutionQueueReadinessSql.ROLLBACK]);
  assert.equal(db.released(), true);
});

test('queue verifier rejects row shapes that could add non-aggregate data', async () => {
  const db = fixture([undefined, undefined, { rows: [{ process_type: 'X', count: '1', diagnosis_case_id: 'forbidden' }] }, undefined]);
  await assert.rejects(verifyAiExecutionQueueReadiness(db.pool), /AI_EXECUTION_QUEUE_READINESS_VERIFICATION_FAILED/);
  assert.equal(db.released(), true);
});

test('runtime CLI uses default runtime config and emits only sanitized evidence JSON', async () => {
  const db = fixture([...successRows]); let ended = false; const output: string[] = [];
  await runAiExecutionQueueReadinessVerifierCli({
    loadDatabaseConfig: async () => ({ name: 'sales_tools_staging_f4', user: 'sales_tools_runtime', password: 'credential-must-not-appear', host: '127.0.0.1', port: 5432 }),
    createPool: () => ({ ...db.pool, end: async () => { ended = true; } }),
    stdout: { write: (chunk: string) => { output.push(chunk); return true; } },
  });
  assert.match(output.join(''), /"schema":"public.ai_executions"/);
  assert.doesNotMatch(output.join(''), /credential|password|127\.0\.0\.1/i);
  assert.equal(ended, true);
});

test('artifact has no migration runner or raw-data import path', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/db/aiExecutionQueueReadinessVerifier.ts'), 'utf8');
  const cli = fs.readFileSync(path.resolve(__dirname, '../src/db/aiExecutionQueueReadinessVerifierCli.ts'), 'utf8');
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile.ai-execution-queue-readiness'), 'utf8');
  assert.doesNotMatch(source, /migrateCli|runMigrations|readFile|readdir|pg_advisory/i);
  assert.doesNotMatch(cli, /loadDatabaseConfig\('migration'\)|MIGRATIONS_DIR/i);
  assert.match(dockerfile, /dist\/db\/aiExecutionQueueReadinessVerifierCli\.js/);
  assert.match(dockerfile, /CMD \["node", "dist\/db\/aiExecutionQueueReadinessVerifierCli\.js"\]/);
  assert.doesNotMatch(dockerfile, /migrations|migrateCli/i);
});
