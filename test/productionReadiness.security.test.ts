import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { OAuth2Client } from 'google-auth-library';
import { StaffAuthService } from '../src/services/staffAuthService';
import { createStaffAuthRouter } from '../src/routes/staffAuth';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { safeRequestError } from '../src/middleware/safeRequestError';
import { safeAccessRequest, safeAccessResponse } from '../src/middleware/diagnosisLogging';
import { loadConfig, loadDatabaseConfig } from '../src/config';

const key = 'synthetic-readiness-signing-key-only-123456';
test('JWT purpose separation, malformed / expired / tampered session rejection', () => {
  const auth = new StaffAuthService(key);
  const state = auth.issueOauthStateToken({ nonce: 'nonce', codeVerifier: 'verifier', returnTo: '/admin/test.html' });
  const session = auth.issueSessionToken({ email: 'synthetic@atlib.jp' });
  assert.equal(auth.verifySessionToken(session).email, 'synthetic@atlib.jp');
  assert.throws(() => auth.verifySessionToken(state));
  assert.throws(() => auth.verifyOauthStateToken(session));
  for (const payload of [{ purpose: 'staff_session' }, { email: 'legacy@atlib.jp' }, { purpose: 'staff_session', email: '' }]) {
    assert.throws(() => auth.verifySessionToken(jwt.sign(payload, key)));
  }
  assert.throws(() => auth.verifySessionToken(jwt.sign({ purpose: 'staff_session', email: 'x', exp: 1 }, key)));
  assert.throws(() => auth.verifySessionToken(session + 'x'));
});

test('local OAuth contract (stubbed provider): state, cookies, authorization, logout and safe failure logs', async () => {
  const auth = new StaffAuthService(key), app = express();
  const accessLogs: string[] = [];
  app.use(pinoHttp({logger:pino({}, {write: text => { accessLogs.push(text); }}),serializers:{req:safeAccessRequest,res:safeAccessResponse}}));
  app.use(cookieParser());
  app.use('/auth', createStaffAuthRouter(auth, { staffAuth: { googleClientId: 'synthetic', googleClientSecret: 'synthetic-secret', jwtSecret: key } }, true));
  app.get('/api/admin/probe', requireStaffAuth(auth), (_req, res) => res.sendStatus(204));
  app.get('/admin/probe', requireStaffAuth(auth), (_req, res) => res.sendStatus(204));
  app.use(express.json({ limit: '1kb' }));
  app.post('/parse', (_req, res) => res.sendStatus(204));
  app.use(safeRequestError);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const getToken = OAuth2Client.prototype.getToken, verifyIdToken = OAuth2Client.prototype.verifyIdToken;
  const log = console.error, logs: string[] = [];
  try {
    assert.equal((await fetch(base + '/api/admin/probe')).status, 401);
    assert.equal((await fetch(base + '/admin/probe', { redirect: 'manual' })).status, 302);
    for (const returnTo of ['//evil.example', '/\\evil.example', '/admin/\\evil.example']) {
      const r = await fetch(base + '/auth/login?returnTo=' + encodeURIComponent(returnTo), { redirect: 'manual' });
      const cookie = r.headers.get('set-cookie')!;
      assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
      const token = cookie.split(';')[0]!.split('=')[1]!;
      assert.equal(auth.verifyOauthStateToken(token).returnTo, '/admin/estimates.html');
      assert.equal((await fetch(base + '/api/admin/probe', { headers: { cookie: `staff_session=${token}` } })).status, 401);
    }
    const state = auth.issueOauthStateToken({ nonce: 'nonce', codeVerifier: 'verifier', returnTo: '/admin/probe' });
    const callback = (nonce = 'nonce') => fetch(base + `/auth/callback?code=synthetic-code&state=${nonce}`, { headers: { cookie: `staff_oauth_state=${state}` }, redirect: 'manual' });
    assert.equal((await callback('wrong')).status, 400);
    console.error = (...values: unknown[]) => logs.push(values.join(' '));
    OAuth2Client.prototype.getToken = (async () => { throw Error('PRIVATE_SYNTHETIC_MARKER'); }) as typeof getToken;
    assert.equal((await callback()).status, 400);
    OAuth2Client.prototype.getToken = (async () => ({ tokens: { id_token: 'synthetic' } })) as unknown as typeof getToken;
    for (const [hd, expected] of [['outside.example', 403], ['atlib.jp', 302]] as const) {
      OAuth2Client.prototype.verifyIdToken = (async () => ({ getPayload: () => ({ email: 'synthetic@' + hd, email_verified: true, hd }) })) as unknown as typeof verifyIdToken;
      const r = await callback(); assert.equal(r.status, expected);
      if (expected === 302) {
        const cookie = r.headers.get('set-cookie')!;
        assert.match(cookie, /staff_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/);
      }
    }
    const logout = await fetch(base + '/auth/logout', { redirect: 'manual' });
    assert.match(logout.headers.get('set-cookie')!, /staff_session=;/);
    for (const [body, status] of [['{"PRIVATE_SYNTHETIC_MARKER":', 400], ['x'.repeat(2000), 413]] as const) {
      const r = await fetch(base + '/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      assert.equal(r.status, status); assert.doesNotMatch(await r.text(), /PRIVATE_SYNTHETIC_MARKER/);
    }
    assert.ok(logs.some(s => s.includes('staff_oauth_token_exchange_failed')));
    assert.doesNotMatch(logs.join('\n'), /PRIVATE_SYNTHETIC_MARKER|synthetic-secret|synthetic-code/);
    assert.doesNotMatch(accessLogs.join('\n'), /staff_session=|staff_oauth_state=|synthetic-code|synthetic-secret|PRIVATE_SYNTHETIC_MARKER|code_challenge|set-cookie/i);
  } finally {
    console.error = log; OAuth2Client.prototype.getToken = getToken; OAuth2Client.prototype.verifyIdToken = verifyIdToken;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('production config fail-fast; migration only needs DB config; Human-only configuration without AI key', async () => {
  const before = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: 'production', DB_NAME: 'synthetic', DB_USER: 'synthetic', DB_PASSWORD: 'synthetic', SMTP_HOST: 'example.test', SMTP_USER: 'synthetic', SMTP_FROM: 'synthetic@example.test', SMTP_PASSWORD: 'synthetic', GOOGLE_OAUTH_CLIENT_ID: 'synthetic', GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic', STAFF_JWT_SECRET: key, PORTAL_BASE_URL: 'https://example.test', DIAGNOSTIC_NOTIFY_EMAIL: 'synthetic@example.test' });
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal((await loadConfig()).aiAssist.anthropicApiKey, undefined);
    process.env.PORTAL_BASE_URL = 'http://example.test'; await assert.rejects(loadConfig(), /HTTPS/);
    process.env.PORTAL_BASE_URL = 'https://example.test'; process.env.STAFF_JWT_SECRET = 'short'; await assert.rejects(loadConfig(), /strong signing key/);
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET; delete process.env.SMTP_PASSWORD;
    assert.equal((await loadDatabaseConfig()).name, 'synthetic');
    delete process.env.DB_NAME; await assert.rejects(loadDatabaseConfig(), /DB_NAME/);
  } finally { for (const name of Object.keys(process.env)) if (!(name in before)) delete process.env[name]; Object.assign(process.env, before); }
});
