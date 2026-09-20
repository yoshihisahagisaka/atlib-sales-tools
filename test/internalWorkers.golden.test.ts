import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { createInternalAiWorkerRouter, createInternalDeletionWorkerRouter, SCHEDULER_DELETION_ACTOR } from '../src/routes/internalWorkers';
import { RetentionDeletionWorker } from '../src/services/retentionDeletionWorker';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { operator } from './support/preparationFixtures';
import { startedCase } from './support/workspaceFixtures';

const AUDIENCE_AI = 'https://example.test/internal/workers/ai/tick';
const AUDIENCE_DELETION = 'https://example.test/internal/workers/deletion/tick';
const ALLOWED_AI_SA = 'ai-scheduler@msp-zabbix.iam.gserviceaccount.com';
const ALLOWED_DELETION_SA = 'deletion-scheduler@msp-zabbix.iam.gserviceaccount.com';

function stubToken(email: string | null, emailVerified = true) {
  const verifyIdToken = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = (async () => ({
    getPayload: () => (email ? { email, email_verified: emailVerified } : undefined),
  })) as unknown as typeof verifyIdToken;
  return verifyIdToken;
}
function restoreToken(original: typeof OAuth2Client.prototype.verifyIdToken) {
  OAuth2Client.prototype.verifyIdToken = original;
}

// --- AI worker endpoint: bounded-drain dispatch logic, tested against controllable fake workers ---
function fakeWorker(remaining: { count: number }) {
  const calls: number[] = [];
  return {
    calls,
    tick: async (): Promise<boolean> => {
      calls.push(Date.now());
      if (remaining.count > 0) { remaining.count--; return true; }
      return false;
    },
  };
}

test('AI internal endpoint: auth rejects unauthenticated/wrong identity, accepts correct Scheduler identity', async () => {
  const remaining = { count: 0 };
  const w = fakeWorker(remaining);
  const app = express();
  app.use(createInternalAiWorkerRouter([w as any, w as any, w as any, w as any], ALLOWED_AI_SA, AUDIENCE_AI));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(base + '/internal/workers/ai/tick', { method: 'POST' })).status, 401);
    assert.equal((await fetch(base + '/internal/workers/ai/tick', { method: 'POST', headers: { authorization: 'Bearer garbage' } })).status, 401);
    let original = stubToken('someone-else@example.test');
    try {
      assert.equal((await fetch(base + '/internal/workers/ai/tick', { method: 'POST', headers: { authorization: 'Bearer x' } })).status, 403);
    } finally { restoreToken(original); }
    original = stubToken(ALLOWED_AI_SA);
    try {
      const r = await fetch(base + '/internal/workers/ai/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
      assert.equal(r.status, 200);
    } finally { restoreToken(original); }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('AI internal endpoint: bounded drain stops at max 3 jobs even when more are pending', async () => {
  const remaining = { count: 10 };
  const w = fakeWorker(remaining);
  const app = express();
  app.use(createInternalAiWorkerRouter([w as any, w as any, w as any, w as any], ALLOWED_AI_SA, AUDIENCE_AI));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const original = stubToken(ALLOWED_AI_SA);
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    const body = await r.json() as { processed: number };
    assert.equal(body.processed, 3);
    assert.equal(remaining.count, 7); // 10 - 3 claimed
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('AI internal endpoint: empty queue returns processed=0 without error', async () => {
  const remaining = { count: 0 };
  const w = fakeWorker(remaining);
  const app = express();
  app.use(createInternalAiWorkerRouter([w as any, w as any, w as any, w as any], ALLOWED_AI_SA, AUDIENCE_AI));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const original = stubToken(ALLOWED_AI_SA);
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    assert.equal((await r.json() as { processed: number }).processed, 0);
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

// --- Deletion worker endpoint: real DB (PGlite), real RetentionDeletionWorker, real schema state ---
let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
let worker: RetentionDeletionWorker;
before(async () => { h = await createDiagnosisHarness(); worker = new RetentionDeletionWorker(h.pool); });
after(async () => { await h?.close(); });

async function approvedRequest() {
  const c = await startedCase(h);
  await h.workspace.addSource(c.id, operator, 'OPERATOR_NOTE', { content: '削除対象', external_reference: 'ref' });
  const req = await h.repo.createDeletionRequest(c.id, operator, 'customer-request');
  await h.repo.scopeDeletionRequest(c.id, req.id, operator, ['GENERAL_RAW_DIAGNOSIS'], []);
  await h.repo.decideDeletionRequest(c.id, req.id, operator, 'APPROVE', '本人確認済み');
  return { caseId: c.id, requestId: req.id };
}

function deletionApp() {
  const app = express();
  app.use(createInternalDeletionWorkerRouter(worker, ALLOWED_DELETION_SA, AUDIENCE_DELETION));
  return app;
}
async function startServer(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test('Deletion internal endpoint: unapproved request is never executed, only APPROVED is', async () => {
  const c = await startedCase(h);
  const req = await h.repo.createDeletionRequest(c.id, operator, 'customer-request-unapproved');
  await h.repo.scopeDeletionRequest(c.id, req.id, operator, ['GENERAL_RAW_DIAGNOSIS'], []);
  // Deliberately NOT approved (still SCOPED).
  const approved = await approvedRequest();
  const { server, base } = await startServer(deletionApp());
  const original = stubToken(ALLOWED_DELETION_SA);
  try {
    const r = await fetch(base + '/internal/workers/deletion/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    const body = await r.json() as { processed: number; failed: number; candidates: number };
    assert.equal(body.processed, 1); // only the approved one
    assert.equal(body.candidates, 1); // the unapproved one was never even a candidate
    const unapprovedRow = (await h.db.query<{ status: string }>('SELECT status FROM diagnosis_deletion_requests WHERE id=$1', [req.id])).rows[0]!;
    assert.equal(unapprovedRow.status, 'SCOPED'); // untouched
    const approvedRow = (await h.db.query<{ status: string; executed_by_user_id: string }>('SELECT status,executed_by_user_id FROM diagnosis_deletion_requests WHERE id=$1', [approved.requestId])).rows[0]!;
    assert.equal(approvedRow.status, 'COMPLETED');
    assert.equal(approvedRow.executed_by_user_id, SCHEDULER_DELETION_ACTOR);
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('Deletion internal endpoint: repeated invocation is idempotent (no double-apply)', async () => {
  const approved = await approvedRequest();
  const { server, base } = await startServer(deletionApp());
  const original = stubToken(ALLOWED_DELETION_SA);
  try {
    const first = await fetch(base + '/internal/workers/deletion/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    assert.equal((await first.json() as { processed: number }).processed, 1);
    const second = await fetch(base + '/internal/workers/deletion/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    // Second invocation finds zero APPROVED candidates (already COMPLETED), so nothing re-executes.
    const secondBody = await second.json() as { processed: number; candidates: number };
    assert.equal(secondBody.candidates, 0);
    assert.equal(secondBody.processed, 0);
    const row = (await h.db.query<{ status: string }>('SELECT status FROM diagnosis_deletion_requests WHERE id=$1', [approved.requestId])).rows[0]!;
    assert.equal(row.status, 'COMPLETED');
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('Deletion internal endpoint: one failure does not block remaining approved requests, and records FAILED using existing schema state', async () => {
  const bad = await approvedRequest();
  const good = await approvedRequest();
  // Force the first request's execution to fail deterministically by corrupting its scoped_data_classes
  // to something executeApprovedRequest() rejects (empty scope -> DELETION_SCOPE_EMPTY), without inventing
  // any new status: this exercises the real thrown-error path.
  await h.db.query(`UPDATE diagnosis_deletion_requests SET scoped_data_classes='[]'::jsonb WHERE id=$1`, [bad.requestId]);
  const { server, base } = await startServer(deletionApp());
  const original = stubToken(ALLOWED_DELETION_SA);
  try {
    const r = await fetch(base + '/internal/workers/deletion/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    const body = await r.json() as { processed: number; failed: number; candidates: number };
    assert.equal(body.candidates, 2);
    assert.equal(body.failed, 1);
    assert.equal(body.processed, 1);
    const badRow = (await h.db.query<{ status: string; failure_code: string }>('SELECT status,failure_code FROM diagnosis_deletion_requests WHERE id=$1', [bad.requestId])).rows[0]!;
    assert.equal(badRow.status, 'FAILED'); // existing schema enum value, not invented
    assert.equal(badRow.failure_code, 'DELETION_WORKER_INTERRUPTED');
    const goodRow = (await h.db.query<{ status: string }>('SELECT status FROM diagnosis_deletion_requests WHERE id=$1', [good.requestId])).rows[0]!;
    assert.equal(goodRow.status, 'COMPLETED'); // unaffected by the other request's failure
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('Deletion internal endpoint: processing order is approved_at ASC (oldest first)', async () => {
  const first = await approvedRequest();
  const second = await approvedRequest();
  const { server, base } = await startServer(deletionApp());
  const original = stubToken(ALLOWED_DELETION_SA);
  try {
    await fetch(base + '/internal/workers/deletion/tick', { method: 'POST', headers: { authorization: 'Bearer x' } });
    const rows = (await h.db.query<{ id: string; executed_at: string }>(
      'SELECT id,executed_at FROM diagnosis_deletion_requests WHERE id=ANY($1) ORDER BY executed_at ASC', [[first.requestId, second.requestId]],
    )).rows;
    assert.equal(rows[0]!.id, first.requestId);
    assert.equal(rows[1]!.id, second.requestId);
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
