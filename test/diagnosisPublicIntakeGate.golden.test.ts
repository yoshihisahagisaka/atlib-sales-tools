import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createDiagnosisHarness } from './support/diagnosisHarness';

const body = { companyName: 'Gate fixture', contactName: 'Fixture', email: 'gate@example.test', phone: '03-0000-0000' };

// Phase 1 default: public WEB intake is refused server-side, independent of the LP's
// own client-side "Gate OFF" button. Only a recognized staff session may still create
// a WEB-channel test case through this exact code path.
let closed: Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async () => { closed = await createDiagnosisHarness(undefined, undefined, undefined, undefined, undefined, false); });
after(async () => { await closed?.close(); });

test('an anonymous exact-origin POST is refused while publicIntake.enabled is false', async () => {
  const response = await fetch(`${closed.url}/api/it-management-diagnosis/cases`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.atlib.jp' }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'PUBLIC_INTAKE_DISABLED' });
});

test('a direct POST without the exact LP origin is refused regardless of the gate', async () => {
  const noOrigin = await fetch(`${closed.url}/api/it-management-diagnosis/cases`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(noOrigin.status, 403); assert.deepEqual(await noOrigin.json(), { error: 'ORIGIN_NOT_ALLOWED' });
  const wrongOrigin = await fetch(`${closed.url}/api/it-management-diagnosis/cases`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify(body),
  });
  assert.equal(wrongOrigin.status, 403); assert.deepEqual(await wrongOrigin.json(), { error: 'ORIGIN_NOT_ALLOWED' });
});

test('a recognized staff session bypasses the gate and the origin check to create a WEB test case', async () => {
  const before = await closed.db.query<{ count: number }>('SELECT count(*)::int AS count FROM diagnosis_cases');
  const response = await fetch(`${closed.url}/api/it-management-diagnosis/cases`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: closed.staffCookie }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
  const created = await response.json() as { id: string; access_token: string };
  assert.ok(created.access_token);
  const after = await closed.db.query<{ count: number }>('SELECT count(*)::int AS count FROM diagnosis_cases');
  assert.equal(after.rows[0]!.count, before.rows[0]!.count + 1);
  const stored = await closed.db.query<{ entry_channel: string; acknowledged_by_type: string }>(
    `SELECT c.entry_channel, a.acknowledged_by_type FROM diagnosis_cases c
     JOIN diagnosis_policy_acknowledgements a ON a.diagnosis_case_id = c.id WHERE c.id = $1`, [created.id]);
  assert.equal(stored.rows[0]!.entry_channel, 'WEB');
  // The staff bypass exercises the exact customer-facing code path with staff-supplied
  // test data; it does not relabel the resulting acknowledgement as staff-authored.
  assert.equal(stored.rows[0]!.acknowledged_by_type, 'CUSTOMER');
});

// Control: the existing default (enabled: true, used by every other diagnosis test)
// still allows a real exact-origin public request through, unaffected by this file.
let open: Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async () => { open = await createDiagnosisHarness(); });
after(async () => { await open?.close(); });

test('control: an exact-origin POST still succeeds when publicIntake.enabled is true', async () => {
  const response = await fetch(`${open.url}/api/it-management-diagnosis/cases`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.atlib.jp' }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 201);
});
