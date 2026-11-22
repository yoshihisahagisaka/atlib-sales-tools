import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import type { Pool } from 'pg';
import { createAdminSecumieWebRouter } from '../src/routes/adminSecumieWeb';
import { createInternalSecumieWebMirrorRouter } from '../src/routes/internalSecumieWebMirror';
import { createSecumieWebPublicRuntime } from '../src/runtime/secumieWebPublicRuntime';
import { AssemblyAdminService } from '../src/secumieWeb/assemblyAdminService';

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'prototypes/secumie-web-assembly/intake.html'), 'utf8');

// Node.js fetch may ignore an explicit Host header. Use the HTTP client to
// exercise the real hostname allowlist rather than the loopback listener name.
function getWithHost(url: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, { headers: { Host: host } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.once('error', reject);
  });
}

test('Web public intake template has enabled OTP, union selection and receipt UI', () => {
  for (const id of ['email-form', 'code-form', 'success-screen', 'intake-form', 'union',
    'contact-email', 'consent', 'done-screen', 'receipt-number', 'turnstile']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /<fieldset\s+disabled\b/i);
  assert.match(html, /publicAuthIntakeAdapter/);
  assert.match(html, /api\/public\/secumie-web\/v1\/requests/);
  assert.match(html, /<!-- WEB_RUNTIME_CONFIG -->/);
});

test('Web runtime rejects unapproved host while keeping healthz available', async () => {
  const app = createSecumieWebPublicRuntime({
    pool: {} as Pool, issuer: 'https://issuer.example', jwksUrl: 'https://issuer.example/.well-known/jwks.json',
    host: 'web.example.com', origin: 'https://web.example.com',
    turnstileSiteKey: 'synthetic-key', consentVersion: 'approved-v1',
    consentText: 'Synthetic consent for contract test only',
    receptionCode: 'test-reception', organizerName: 'test-organizer',
    publicAuthScriptPath: path.join(root, 'public/public-service-auth.js'),
    assetDir: path.join(root, 'prototypes/secumie-web-assembly'),
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    // Listening is asynchronous: wait before reading the assigned ephemeral port.
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test listener');
    const base = 'http://127.0.0.1:' + address.port;
    const bad = await getWithHost(base + '/', 'unexpected.example');
    assert.equal(bad.status, 404);
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    const page = await getWithHost(base + '/', 'web.example.com');
    assert.equal(page.status, 200);
    const body = page.body;
    assert.match(body, /window\.__PUBLIC_AUTH_CONFIG__/);
    assert.match(body, /approved-v1/);
    assert.match(body, /Synthetic consent for contract test only/);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});

test('Web staff status update rolls back missing receipt before releasing its DB connection', async () => {
  const queries: string[] = [];
  let released = false;
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [] };
    },
    release: () => { released = true; },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const admin = new AssemblyAdminService(pool);
  const result = await admin.changeStatus('00000000-0000-4000-8000-000000000001', 'IN_PROGRESS', 'staff@atlib.jp');
  assert.equal(result, undefined);
  assert.deepEqual(queries, [
    'BEGIN',
    'SELECT request_status FROM secumie_web.assembly_intake WHERE intake_id=$1 FOR UPDATE',
    'ROLLBACK',
  ]);
  assert.equal(released, true);
});

test('Web staff list reuses established admin items/filter contract without new CRM or DB', async () => {
  const calls: unknown[][] = [];
  const row = {
    intakeId: '00000000-0000-4000-8000-000000000001',
    receiptId: 'SMW-EXAMPLE',
    receivedAt: '2026-11-22T00:00:00Z',
    unionName: 'テスト組合', companyName: '検証株式会社',
    websiteUrl: 'https://example.jp/', contactName: '検証担当',
    contactEmail: 'test@example.jp', status: 'RECEIVED',
  };
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      calls.push(values);
      return { rows: [row] };
    },
  } as unknown as Pool;
  // Router-only contract test; the real server mounts this under adminAuthGate.
  const app = express();
  app.use('/api/admin/secumie-web/v1', createAdminSecumieWebRouter(new AssemblyAdminService(pool)));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test listener');
    const response = await fetch('http://127.0.0.1:' + address.port
      + '/api/admin/secumie-web/v1/requests?status=RECEIVED&companyName=%E6%A4%9C%E8%A8%BC&unionName=%E3%83%86%E3%82%B9%E3%83%88&limit=50&offset=0');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { items: [row] });
    assert.deepEqual(calls, [['RECEIVED', '検証', 'テスト', 50, 0]]);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});

test('signed corporate LP mirror rejects unsigned, expired and malformed requests', async () => {
  const received: unknown[] = [];
  const secret = 'synthetic-key-with-at-least-32-characters';
  const app = express();
  app.use('/api/internal/secumie-web/v1', express.raw({ type: 'application/json', limit: '8kb' }),
    createInternalSecumieWebMirrorRouter({
      recordCorporateEmailIntake: async item => {
        received.push(item);
        return { receiptId: 'SMW-SYNTHETIC', replayed: false };
      },
    }, secret));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test listener');
    const url = 'http://127.0.0.1:' + address.port + '/api/internal/secumie-web/v1/temporary-intakes';
    const record = {
      source: 'secumie_web_temporary',
      eventId: '00000000-0000-4000-8000-000000000004',
      companyName: '検証株式会社', unionName: '検証組合',
      registeredAddress: '千葉県', websiteUrl: 'https://example.jp/',
      contactName: 'テスト担当', contactEmail: 'test@example.jp',
      contactPhone: '0000000000', consented: true,
    };
    const body = JSON.stringify(record);
    const post = async (timestamp: string, signedBody = body, omitSignature = false) => {
      const digest = createHmac('sha256', secret).update(timestamp).update('\n').update(signedBody).digest('hex');
      return fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-secumie-timestamp': timestamp,
          ...(!omitSignature ? { 'x-secumie-signature': digest } : {}),
        },
        body: signedBody,
      });
    };
    assert.equal((await post(String(Date.now()), body, true)).status, 401);
    assert.equal((await post(String(Date.now() - 600_000))).status, 401);
    assert.equal((await post(String(Date.now()), JSON.stringify({ ...record, websiteUrl: 'http://example.jp/' }))).status, 400);
    assert.equal(received.length, 0);
    const response = await post(String(Date.now()));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, receiptId: 'SMW-SYNTHETIC' });
    assert.equal(received.length, 1);
    assert.equal((received[0] as { companyName: string }).companyName, '検証株式会社');
    assert.equal((received[0] as { source?: unknown }).source, undefined);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});
