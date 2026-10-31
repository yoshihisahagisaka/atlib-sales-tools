import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { PostgresOtpReservationRepo } from '../src/publicAuth/postgresOtpReservationRepo';
import { PublicOtpApiService } from '../src/publicAuth/publicOtpApiService';
import { createPublicOtpRouter } from '../src/routes/publicOtp';

const pool = new Pool({ host: '127.0.0.1', port: 55437, database: 'otp_test_final', user: 'otp_test', password: 'otp_test' });
let clock = new Date('2026-11-01T00:00:00.000Z');
let testIp = '198.51.100.1';
const sent: string[] = [];
let turnstile = true;
let delivery: 'ok' | 'failed' | 'unknown' = 'ok';
const api = new PublicOtpApiService(
  new PostgresOtpReservationRepo(pool),
  { sendOtp: async (_to, _name, code) => { if (delivery === 'unknown') throw { deliveryUnknown: true }; if (delivery === 'failed') throw Error('smtp'); sent.push(code); } },
  { verify: async () => turnstile },
  new Map([['pira', { id: 'pira', name: 'PIRA', origins: ['https://pira.example.test'] }]]),
  'test-hmac-key', () => clock,
);
const app = express(); app.set('trust proxy', true); app.use(express.json()); app.use('/v1/otp', createPublicOtpRouter(api));
const server = app.listen(0, '127.0.0.1');
let base = '';
test.before(async () => { if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/otp`; });
async function reset() { clock = new Date('2026-11-01T00:00:00.000Z'); testIp = `198.51.100.${Number(testIp.split('.').pop()) + 1}`; sent.length = 0; turnstile = true; delivery = 'ok'; await pool.query('TRUNCATE public_auth.otp_challenges, public_auth.otp_send_reservations, public_auth.otp_send_locks, public_auth.otp_send_events, public_auth.otp_sessions'); }
async function request(path: string, body: unknown, origin = 'https://pira.example.test', ip = testIp) { const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': ip }, body: JSON.stringify(body) }); return { response, body: await response.json() as any }; }

test('API sends through reservation then verifies an activated challenge once', async () => {
  await reset();
  const created = await request('/challenges', { serviceId: 'pira', email: 'person@example.test', turnstileToken: 'token' });
  assert.equal(created.response.status, 201); assert.equal(sent.length, 1); assert.equal(created.body.code, undefined);
  const verified = await request(`/challenges/${created.body.challengeId}/verify`, { serviceId: 'pira', code: sent[0] });
  assert.equal(verified.response.status, 200); assert.ok(verified.body.sessionToken); assert.equal(verified.body.code, undefined);
  const repeated = await request(`/challenges/${created.body.challengeId}/verify`, { serviceId: 'pira', code: sent[0] });
  assert.equal(repeated.body.error.code, 'CHALLENGE_INVALID');
});

test('strict input, origin, and Turnstile rejection fail before reservation', async () => {
  await reset(); turnstile = false;
  const denied = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' });
  assert.equal(denied.response.status, 403); assert.equal(denied.body.error.code, 'TURNSTILE_DENIED');
  const unknownOrigin = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' }, 'https://other.example.test');
  assert.equal(unknownOrigin.response.status, 404);
  const invalid = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token', extra: true });
  assert.equal(invalid.response.status, 400);
  const { rows } = await pool.query('SELECT reservation_id FROM public_auth.otp_send_reservations'); assert.equal(rows.length, 0);
});

test('SMTP failure and unknown delivery never activate a challenge or report success', async () => {
  await reset(); delivery = 'failed';
  const failed = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' });
  assert.equal(failed.body.error.code, 'MAIL_SEND_FAILED');
  let row = await pool.query<{ status: string; activated_at: Date | null }>('SELECT r.status,c.activated_at FROM public_auth.otp_send_reservations r JOIN public_auth.otp_challenges c ON c.reservation_id=r.reservation_id');
  assert.equal(row.rows[0]?.status, 'FAILED'); assert.equal(row.rows[0]?.activated_at, null);
  const rejected = await request(`/challenges/${(await pool.query<{ challenge_id: string }>('SELECT challenge_id FROM public_auth.otp_challenges')).rows[0]!.challenge_id}/verify`, { serviceId: 'pira', code: '000000' });
  assert.equal(rejected.body.error.code, 'CHALLENGE_INVALID');
  await reset(); delivery = 'unknown';
  const unknown = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' });
  assert.equal(unknown.body.error.code, 'MAIL_SEND_FAILED');
  row = await pool.query<{ status: string; activated_at: Date | null }>('SELECT r.status,c.activated_at FROM public_auth.otp_send_reservations r JOIN public_auth.otp_challenges c ON c.reservation_id=r.reservation_id');
  assert.equal(row.rows[0]?.status, 'UNKNOWN'); assert.equal(row.rows[0]?.activated_at, null);
});

test('resend activates a new code only after its wait and concurrent verification consumes it once', async () => {
  await reset(); const created = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' });
  clock = new Date(clock.getTime() + 60_000);
  const resent = await request(`/challenges/${created.body.challengeId}/resend`, { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' });
  assert.equal(resent.response.status, 201); assert.equal(sent.length, 2);
  const old = await request(`/challenges/${created.body.challengeId}/verify`, { serviceId: 'pira', code: sent[0] }); assert.equal(old.body.error.code, 'CHALLENGE_INVALID');
  const [first, second] = await Promise.all([request(`/challenges/${resent.body.challengeId}/verify`, { serviceId: 'pira', code: sent[1] }), request(`/challenges/${resent.body.challengeId}/verify`, { serviceId: 'pira', code: sent[1] })]);
  assert.equal([first, second].filter(value => value.response.status === 200).length, 1);
  assert.equal([first, second].filter(value => value.body.error?.code === 'CHALLENGE_INVALID').length, 1);
});

test('five invalid codes lock the challenge and active resend observes the 60 second limit', async () => {
  await reset(); const created = await request('/challenges', { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' });
  for (let index = 0; index < 4; index += 1) { const bad = await request(`/challenges/${created.body.challengeId}/verify`, { serviceId: 'pira', code: '000000' }); assert.equal(bad.body.error.code, 'OTP_INVALID'); }
  const locked = await request(`/challenges/${created.body.challengeId}/verify`, { serviceId: 'pira', code: '000000' }); assert.equal(locked.body.error.code, 'CHALLENGE_LOCKED');
  const rapid = await request(`/challenges/${created.body.challengeId}/resend`, { serviceId: 'pira', email: 'a@example.test', turnstileToken: 'token' }); assert.equal(rapid.body.error.code, 'RESEND_COOLDOWN');
});

test('IP limiter returns the Contract machine-readable code on request 21', async () => {
  await reset();
  for (let index = 0; index < 20; index += 1) { const result = await request('/challenges', {}, 'https://pira.example.test', '198.51.100.42'); assert.equal(result.response.status, 400); }
  const limited = await request('/challenges', {}, 'https://pira.example.test', '198.51.100.42');
  assert.equal(limited.response.status, 429); assert.equal(limited.body.error.code, 'IP_RATE_LIMITED');
});

test.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
