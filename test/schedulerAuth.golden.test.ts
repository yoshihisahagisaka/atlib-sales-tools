import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { requireSchedulerIdentity } from '../src/middleware/schedulerAuth';

const AUDIENCE = 'https://example.test/internal/workers/ai/tick';
const ALLOWED_SA = 'ai-scheduler@msp-zabbix.iam.gserviceaccount.com';
const SECRET_TOKEN = 'super-secret-id-token-value-should-never-be-logged';

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

// Captures every structured log call made via req.log, standing in for the real
// request-scoped pino logger (injected by pino-http in server.ts) without needing
// a real logger/transport in this unit test.
function captureLogApp() {
  const calls: Array<{ level: 'info' | 'warn'; fields: Record<string, unknown> }> = [];
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = {
      info: (fields: Record<string, unknown>) => calls.push({ level: 'info', fields }),
      warn: (fields: Record<string, unknown>) => calls.push({ level: 'warn', fields }),
    };
    next();
  });
  app.post('/internal/workers/ai/tick', requireSchedulerIdentity(ALLOWED_SA, AUDIENCE), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return { app, calls };
}

async function start(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test('schedulerAuth: missing token logs a REJECTED audit event, never the credential itself', async () => {
  const { app, calls } = captureLogApp();
  const { server, base } = await start(app);
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', { method: 'POST' });
    assert.equal(r.status, 401);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.level, 'warn');
    assert.equal(calls[0]!.fields.event, 'scheduler_auth');
    assert.equal(calls[0]!.fields.endpoint, '/internal/workers/ai/tick');
    assert.equal(calls[0]!.fields.authorizationResult, 'REJECTED');
    assert.equal(calls[0]!.fields.rejectionReason, 'MISSING_TOKEN');
    assert.equal(JSON.stringify(calls).includes(SECRET_TOKEN), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('schedulerAuth: wrong identity logs REJECTED with the rejected identity, not the token', async () => {
  const { app, calls } = captureLogApp();
  const { server, base } = await start(app);
  const original = stubToken('someone-else@example.test');
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET_TOKEN}` },
    });
    assert.equal(r.status, 403);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.level, 'warn');
    assert.equal(calls[0]!.fields.authorizationResult, 'REJECTED');
    assert.equal(calls[0]!.fields.rejectedIdentity, 'someone-else@example.test');
    assert.equal(calls[0]!.fields.rejectionReason, 'IDENTITY_NOT_ALLOWED');
    assert.equal(JSON.stringify(calls).includes(SECRET_TOKEN), false);
    assert.equal('authorization' in calls[0]!.fields, false);
    assert.equal('token' in calls[0]!.fields, false);
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('schedulerAuth: correct identity logs AUTHORIZED with the verified identity, not the token', async () => {
  const { app, calls } = captureLogApp();
  const { server, base } = await start(app);
  const original = stubToken(ALLOWED_SA);
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET_TOKEN}` },
    });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.level, 'info');
    assert.equal(calls[0]!.fields.event, 'scheduler_auth');
    assert.equal(calls[0]!.fields.endpoint, '/internal/workers/ai/tick');
    assert.equal(calls[0]!.fields.authorizationResult, 'AUTHORIZED');
    assert.equal(calls[0]!.fields.verifiedIdentity, ALLOWED_SA);
    assert.equal(JSON.stringify(calls).includes(SECRET_TOKEN), false);
  } finally {
    restoreToken(original);
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('schedulerAuth: token verification failure (invalid signature) logs REJECTED, not authenticated', async () => {
  const { app, calls } = captureLogApp();
  const { server, base } = await start(app);
  const verifyIdToken = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = (async () => { throw new Error('invalid_token'); }) as unknown as typeof verifyIdToken;
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET_TOKEN}` },
    });
    assert.equal(r.status, 401);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.fields.authorizationResult, 'REJECTED');
    assert.equal(calls[0]!.fields.rejectionReason, 'TOKEN_VERIFICATION_FAILED');
    assert.equal(JSON.stringify(calls).includes(SECRET_TOKEN), false);
  } finally {
    OAuth2Client.prototype.verifyIdToken = verifyIdToken;
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('schedulerAuth: does not crash when req.log is absent (no pino-http mounted)', async () => {
  const app = express();
  app.post('/internal/workers/ai/tick', requireSchedulerIdentity(ALLOWED_SA, AUDIENCE), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  const { server, base } = await start(app);
  try {
    const r = await fetch(base + '/internal/workers/ai/tick', { method: 'POST' });
    assert.equal(r.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
