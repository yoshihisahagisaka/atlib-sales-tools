import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { createSecumieWebPublicRuntime } from '../src/runtime/secumieWebPublicRuntime';

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'prototypes/secumie-web-assembly/intake.html'), 'utf8');

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
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test listener');
    const base = 'http://127.0.0.1:' + address.port;
    const bad = await fetch(base + '/', { headers: { Host: 'unexpected.example' } });
    assert.equal(bad.status, 404);
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    const page = await fetch(base + '/', { headers: { Host: 'web.example.com' } });
    assert.equal(page.status, 200);
    const body = await page.text();
    assert.match(body, /window\.__PUBLIC_AUTH_CONFIG__/);
    assert.match(body, /approved-v1/);
    assert.match(body, /Synthetic consent for contract test only/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
