import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createDiagnosisHarness } from './support/diagnosisHarness';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async () => { h = await createDiagnosisHarness(); });
after(async () => { await h?.close(); });
const body = { companyName: 'LP fixture', contactName: 'Fixture', email: 'lp@example.test', phone: '03-0000-0000' };
const key = 'lp-idempotency-key-0001';
let ip = 10;
async function post(payload: unknown = body, idempotencyKey = key, origin = 'https://www.atlib.jp') {
  return fetch(`${h.url}/api/it-management-diagnosis/cases`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ip++}`, origin, 'idempotency-key': idempotencyKey,
  }, body: JSON.stringify(payload) });
}

test('public LP CORS is origin-scoped and preflights the idempotency header', async () => {
  const allowed = await fetch(`${h.url}/api/it-management-diagnosis/cases`, { method: 'OPTIONS', headers: { origin: 'https://www.atlib.jp' } });
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://www.atlib.jp');
  assert.match(allowed.headers.get('access-control-allow-headers') ?? '', /Idempotency-Key/);
  const denied = await fetch(`${h.url}/api/it-management-diagnosis/cases`, { method: 'OPTIONS', headers: { origin: 'https://example.test' } });
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('public LP creates once, never replays its token, and rejects a payload conflict', async () => {
  const first = await post(); assert.equal(first.status, 201); const accepted = await first.json() as { id: string; access_token: string };
  assert.ok(accepted.access_token);
  const adminList = await fetch(`${h.url}/api/admin/it-management-diagnosis/cases?entryChannel=WEB`, { headers: { cookie: h.staffCookie } });
  assert.equal(adminList.status, 200); assert.ok((await adminList.json() as { items: Array<{ id: string }> }).items.some(item => item.id === accepted.id));
  const retry = await post(); assert.equal(retry.status, 202); assert.deepEqual(await retry.json(), { acceptance: 'ACCEPTED_RESUME_LINK_UNAVAILABLE' });
  const conflict = await post({ ...body, companyName: 'different' }); assert.equal(conflict.status, 409);
  const rows = await h.db.query<{ count: number; token_matches: number }>(`SELECT count(*)::int AS count, count(*) FILTER (WHERE payload_hash LIKE '%' || $1 || '%')::int AS token_matches FROM diagnosis_public_application_idempotency`, [accepted.access_token]);
  assert.equal(rows.rows[0]!.count, 1); assert.equal(rows.rows[0]!.token_matches, 0);
});

test('concurrent same-key public LP submissions serialize to one WEB case', async () => {
  const concurrentKey = 'lp-idempotency-key-0003';
  const [a, b] = await Promise.all([post(body, concurrentKey), post(body, concurrentKey)]);
  assert.deepEqual([a.status, b.status].sort(), [201, 202]);
  const rows = await h.db.query<{ count: number }>('SELECT count(*)::int AS count FROM diagnosis_public_application_idempotency WHERE idempotency_key=$1', [concurrentKey]);
  assert.equal(rows.rows[0]!.count, 1);
});

test('an expired idempotency record is a new application, never a token replay', async () => {
  const expiredKey = 'lp-idempotency-key-0004';
  const first = await post(body, expiredKey); assert.equal(first.status, 201);
  await h.db.query('UPDATE diagnosis_public_application_idempotency SET expires_at=now()-interval \'1 second\' WHERE idempotency_key=$1', [expiredKey]);
  const renewed = await post(body, expiredKey); assert.equal(renewed.status, 201);
});

test('honeypot allocates no case and keyless legacy WEB creation remains available', async () => {
  const before = await h.db.query<{ count: number }>('SELECT count(*)::int AS count FROM diagnosis_cases');
  const bot = await post({ ...body, hp: 'filled' }, 'lp-idempotency-key-0002'); assert.equal(bot.status, 204);
  const afterBot = await h.db.query<{ count: number }>('SELECT count(*)::int AS count FROM diagnosis_cases'); assert.equal(afterBot.rows[0]!.count, before.rows[0]!.count);
  const legacy = await fetch(`${h.url}/api/it-management-diagnosis/cases`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.11' }, body: JSON.stringify(body) });
  assert.equal(legacy.status, 201);
});
