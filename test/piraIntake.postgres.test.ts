import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { PiraJwtVerifier, HttpJwksProvider } from '../src/piraIntake/piraJwtVerifier';
import { PiraIntakeService } from '../src/piraIntake/piraIntakeService';
import { createPublicPiraIntakeRouter, createUrlPiraContextResolver } from '../src/routes/publicPiraIntake';

const pool = new Pool({ host: '127.0.0.1', port: 55437, database: 'pira_e1_test', user: 'otp_test', password: 'otp_test' });
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'e1-test', alg: 'RS256', use: 'sig' };
const issuer = 'https://otp.example.test';
const jwksApp = express(); jwksApp.get('/.well-known/jwks.json', (_req, res) => res.json({ keys: [jwk] }));
const jwksServer = jwksApp.listen(0, '127.0.0.1');
let base = ''; let jwksUrl = '';
const service = new PiraIntakeService(pool, true);
function token(serviceId: string, email = 'verified@example.test', overrides: jwt.SignOptions = {}) { return jwt.sign({ email }, privateKey, { algorithm: 'RS256', keyid: 'e1-test', issuer, audience: serviceId, subject: 'otp-session', jwtid: randomUUID(), expiresIn: 300, ...overrides }); }
function payload(kind: 'UNION' | 'GENERAL', key = randomUUID()) { return { initiativeCode: kind === 'UNION' ? 'pira-union' : 'pira-general', companyName: '  PIRA株式会社 ', contactName: '担当者', websiteUrl: 'https://example.test/', phone: '03-0000-0000', ...(kind === 'UNION' ? { unionName: '国連協', address: '東京都千代田区' } : {}), accepted: true, consentVersion: kind === 'UNION' ? 'PIRA-UNION-CONSENT-V1.0' : 'ATLIB-GENERAL-CONSENT-DRAFT-V0.1', idempotencyKey: key }; }
let api: ReturnType<typeof express>; let server: ReturnType<typeof api.listen>;
async function reset() { await pool.query('TRUNCATE pira.pira_consumed_jti,pira.pira_submission,pira.pira_initiative CASCADE'); await pool.query("INSERT INTO pira.pira_initiative(initiative_code,initiative_kind,display_name) VALUES('pira-union','UNION','国連協'),('pira-union-alt','UNION','国連協別施策'),('pira-general','GENERAL','一般')"); }
function endpoint(host: string, path: string) { return `${base}${host === 'www.atlib.jp' ? '/security-check' : ''}/api/public/pira/v1${path}`; }
async function post(path: string, body: unknown, bearer?: string, host = 'pira.atlib.jp') { const r = await fetch(endpoint(host, path), { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-host': host, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) }); return { r, body: await r.json() as any }; }

test.before(async () => {
  if (!jwksServer.listening) await new Promise<void>(resolve => jwksServer.once('listening', resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/.well-known/jwks.json`;
  const verifier = new PiraJwtVerifier(new HttpJwksProvider(jwksUrl), issuer);
  api = express(); api.set('trust proxy', true); api.use(express.json());
  const resolver = createUrlPiraContextResolver([{ hostname: 'pira.atlib.jp', pathPrefix: '/api/public/pira/v1', context: { serviceId: 'pira-union', initiativeCode: 'pira-union', kind: 'UNION' } }, { hostname: 'www.atlib.jp', pathPrefix: '/security-check/api/public/pira/v1', context: { serviceId: 'pira-general', initiativeCode: 'pira-general', kind: 'GENERAL' } }]);
  const router = createPublicPiraIntakeRouter(service, verifier, resolver);
  api.use('/api/public/pira/v1', router); api.use('/security-check/api/public/pira/v1', router);
  server = api.listen(0, '127.0.0.1'); if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test('UNION and GENERAL accept verified JWT email only and persist no answers or report', async () => {
  await reset(); const u = await post('/submissions', payload('UNION'), token('pira-union')); assert.equal(u.r.status, 201);
  const gResponse = await post('/submissions', payload('GENERAL'), token('pira-general', 'general@example.test'), 'www.atlib.jp'); assert.equal(gResponse.r.status, 201);
  const row = await pool.query<{ verified_email: string; sales_use_allowed: boolean; column_name: string }>("SELECT verified_email,sales_use_allowed,''::text AS column_name FROM pira.pira_submission ORDER BY verified_email LIMIT 1"); assert.equal(row.rows[0]?.verified_email, 'general@example.test'); assert.equal((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='pira' AND table_name='pira_submission' AND column_name IN ('answers','report','pdf','c_mode_result')")).rowCount, 0);
});

test('strict form rules, mail substitution, consent and JWT failures are rejected', async () => {
  await reset(); const withEmail = { ...payload('UNION'), email: 'attacker@example.test' }; assert.equal((await post('/submissions', withEmail, token('pira-union'))).r.status, 422);
  assert.equal((await post('/submissions', { ...payload('GENERAL'), unionName: 'forbidden' }, token('pira-general'), 'www.atlib.jp')).r.status, 422);
  assert.equal((await post('/submissions', payload('UNION'), token('wrong-audience'))).r.status, 401);
  const unknown = jwt.sign({ email: 'verified@example.test' }, privateKey, { algorithm: 'RS256', keyid: 'unknown', issuer, audience: 'pira-union', subject: 's', jwtid: randomUUID(), expiresIn: 300 }); assert.equal((await post('/submissions', payload('UNION'), unknown)).r.status, 401);
});

test('jti is one-time, but a same-key same-input retry is idempotent', async () => {
  await reset(); const key = randomUUID(); const jwtValue = token('pira-union'); const first = await post('/submissions', payload('UNION', key), jwtValue); const second = await post('/submissions', payload('UNION', key), jwtValue); assert.equal(first.r.status, 201); assert.equal(second.r.status, 200); assert.equal(first.body.receiptId, second.body.receiptId);
  const replay = await post('/submissions', payload('UNION'), jwtValue); assert.equal(replay.r.status, 409); assert.equal(replay.body.error.code, 'JWT_REPLAYED');
  const conflict = await post('/submissions', { ...payload('UNION', key), companyName: '別会社' }, token('pira-union')); assert.equal(conflict.r.status, 409);
});

test('idempotency never returns a receipt to another verified person or initiative', async () => {
  await reset(); const key = randomUUID(); const first = await post('/submissions', payload('UNION', key), token('pira-union', 'owner@example.test')); assert.equal(first.r.status, 201);
  const otherPerson = await post('/submissions', payload('UNION', key), token('pira-union', 'other@example.test')); assert.equal(otherPerson.r.status, 409); assert.equal(otherPerson.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const otherInitiative = await post('/submissions', payload('GENERAL', key), token('pira-general', 'owner@example.test'), 'www.atlib.jp'); assert.equal(otherInitiative.r.status, 409); assert.equal(otherInitiative.body.error.code, 'IDEMPOTENCY_CONFLICT');
});

test('parallel jti consumption permits one receipt only', async () => {
  await reset(); const one = token('pira-union'); const [a, b] = await Promise.all([post('/submissions', payload('UNION'), one), post('/submissions', payload('UNION'), one)]); assert.equal([a, b].filter(x => x.r.status === 201).length, 1); assert.equal([a, b].filter(x => x.body.error?.code === 'JWT_REPLAYED').length, 1);
});

test('state transition needs new JWT, rejects reverse transition, and enforces completed 24 hour limit', async () => {
  await reset(); const created = await post('/submissions', payload('UNION'), token('pira-union')); const receipt = created.body.receiptId;
  await assert.rejects(service.updateState({ serviceId: 'pira-union', initiativeCode: 'pira-union-alt', kind: 'UNION' }, { iss: issuer, aud: 'pira-union', sub: 'session', jti: randomUUID(), iat: 1, exp: 9_999_999_999, email: 'verified@example.test' }, receipt, 'ANSWERING'), (error: any) => error?.code === 'RECEIPT_NOT_FOUND');
  const answering = await post(`/submissions/${receipt}/state`, { state: 'ANSWERING' }, token('pira-union')); assert.equal(answering.r.status, 200);
  const completed = await post(`/submissions/${receipt}/state`, { state: 'COMPLETED' }, token('pira-union')); assert.equal(completed.r.status, 200);
  const backward = await post(`/submissions/${receipt}/state`, { state: 'ANSWERING' }, token('pira-union')); assert.equal(backward.r.status, 409);
  const blocked = await post('/submissions', payload('UNION'), token('pira-union')); assert.equal(blocked.r.status, 409); assert.equal(blocked.body.error.code, 'RETRY_RESTRICTED');
});

test('consent must be explicitly accepted with the context-specific version and audience', async () => {
  await reset();
  assert.equal((await post('/submissions', { ...payload('UNION'), accepted: false }, token('pira-union'))).r.status, 422);
  const missing = payload('UNION') as Record<string, unknown>; delete missing.accepted; assert.equal((await post('/submissions', missing, token('pira-union'))).r.status, 422);
  assert.equal((await post('/submissions', { ...payload('UNION'), consentVersion: 'wrong' }, token('pira-union'))).r.status, 422);
  const crossAudience = await post('/submissions', payload('GENERAL'), token('pira-union'), 'www.atlib.jp'); assert.equal(crossAudience.r.status, 401);
  const crossAudienceReverse = await post('/submissions', payload('UNION'), token('pira-general')); assert.equal(crossAudienceReverse.r.status, 401);
});

test('contract endpoint requires the canonical UNION/GENERAL URL and path pairing', async () => { await reset(); const union = await fetch(endpoint('pira.atlib.jp', '/intake-contract'), { headers: { 'x-forwarded-host': 'pira.atlib.jp' } }).then(r => r.json()) as any; assert.equal(union.consent.version, 'PIRA-UNION-CONSENT-V1.0'); const general = await fetch(endpoint('www.atlib.jp', '/intake-contract'), { headers: { 'x-forwarded-host': 'www.atlib.jp' } }).then(r => r.json()) as any; assert.equal(general.consent.status, 'DRAFT'); const wrongPath = await fetch(`${base}/api/public/pira/v1/intake-contract`, { headers: { 'x-forwarded-host': 'www.atlib.jp' } }); assert.equal(wrongPath.status, 404); });
test.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await new Promise<void>(resolve => jwksServer.close(() => resolve())); await pool.end(); });
