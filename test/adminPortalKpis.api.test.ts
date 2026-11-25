import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { requireStaffAuth } from '../src/middleware/staffAuth';
import { createAdminPortalKpisRouter } from '../src/routes/adminPortalKpis';
import { ItKaizenPortalKpiAdapter, currentJstFiscalYear, parseFiscalYear } from '../src/services/itKaizenPortalKpiAdapter';
import { StaffAuthService } from '../src/services/staffAuthService';

let db: PGlite;
let server: Server;
let baseUrl: string;
let staffCookie: string;

async function insertCase(id: string, isInternalTest: boolean): Promise<void> {
  await db.query('INSERT INTO it_management_diagnosis_case_v2(id,is_internal_test) VALUES($1,$2)', [id, isInternalTest]);
}

async function insertOriginal(id: string, caseId: string, entryChannel: string, submittedAt: string): Promise<void> {
  await db.query(
    'INSERT INTO it_management_diagnosis_original_survey_snapshot_v2(id,case_id,entry_channel,submitted_at) VALUES($1,$2,$3,$4)',
    [id, caseId, entryChannel, submittedAt],
  );
}

before(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    CREATE TABLE it_management_diagnosis_case_v2 (
      id UUID PRIMARY KEY,
      is_internal_test BOOLEAN NOT NULL
    );
    CREATE TABLE it_management_diagnosis_original_survey_snapshot_v2 (
      id UUID PRIMARY KEY,
      case_id UUID NOT NULL UNIQUE REFERENCES it_management_diagnosis_case_v2(id),
      entry_channel TEXT NOT NULL CHECK(entry_channel IN ('CUSTOMER_SELF','STAFF_PROXY')),
      submitted_at TIMESTAMPTZ NOT NULL
    );
  `);
  const auth = new StaffAuthService('disposable-portal-kpi-test-key');
  staffCookie = `staff_session=${auth.issueSessionToken({ email: 'portal-kpi@test.atlib.jp' })}`;
  const app = express();
  app.use(cookieParser());
  const adapter = new ItKaizenPortalKpiAdapter({ query: (sql: string, params?: unknown[]) => db.query(sql, params) } as never);
  app.use('/api/admin/portal-kpis', requireStaffAuth(auth), createAdminPortalKpisRouter(adapter, () => new Date('2027-01-31T14:59:59.000Z')));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await db.close();
});

test('counts accepted Customer Self and Staff Proxy subjects at JST fiscal boundaries', async () => {
  await insertCase('00000000-0000-4000-8000-000000000001', false);
  await insertOriginal('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'CUSTOMER_SELF', '2026-02-01T00:00:00+09:00');
  await assert.rejects(() => insertOriginal('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000001', 'STAFF_PROXY', '2026-03-01T00:00:00+09:00'));
  await insertCase('00000000-0000-4000-8000-000000000002', false);
  await insertOriginal('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'STAFF_PROXY', '2027-01-31T23:59:59.999+09:00');
  await insertCase('00000000-0000-4000-8000-000000000003', false); // no Original: excluded
  await insertCase('00000000-0000-4000-8000-000000000004', true);
  await insertOriginal('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'CUSTOMER_SELF', '2026-06-01T00:00:00+09:00');
  await insertCase('00000000-0000-4000-8000-000000000005', false);
  await insertOriginal('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', 'CUSTOMER_SELF', '2027-02-01T00:00:00+09:00');

  const response = await fetch(`${baseUrl}/api/admin/portal-kpis?fiscalYear=2026`, { headers: { cookie: staffCookie } });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.services.IT_KAIZEN.acceptedCount.value, 2);
  assert.equal(body.period.from, '2026-02-01T00:00:00+09:00');
  assert.equal(body.period.toExclusive, '2027-02-01T00:00:00+09:00');
  assert.equal(body.common.acceptedCount.value, null);
  assert.equal(body.common.acceptedCount.status, 'PARTIAL');
  assert.equal(body.services.BUSINESS_KAIZEN.status, 'UNCONNECTED');
  assert.equal(body.common.proposedCount.status, 'UNSUPPORTED');
});

test('uses current JST fiscal year when omitted and returns a real zero', async () => {
  const response = await fetch(`${baseUrl}/api/admin/portal-kpis`, { headers: { cookie: staffCookie } });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.period.fiscalYear, 2026);
  assert.equal(body.services.IT_KAIZEN.acceptedCount.value, 2);

  const empty = await fetch(`${baseUrl}/api/admin/portal-kpis?fiscalYear=2025`, { headers: { cookie: staffCookie } });
  assert.equal((await empty.json() as any).services.IT_KAIZEN.acceptedCount.value, 0);
});

test('requires staff authentication and strictly validates fiscalYear', async () => {
  assert.equal((await fetch(`${baseUrl}/api/admin/portal-kpis?fiscalYear=2026`, { redirect: 'manual' })).status, 401);
  for (const value of ['26', '2026.0', '2026x', '1999', '9999']) {
    const response = await fetch(`${baseUrl}/api/admin/portal-kpis?fiscalYear=${encodeURIComponent(value)}`, { headers: { cookie: staffCookie } });
    assert.equal(response.status, 400, value);
    assert.deepEqual(await response.json(), { error: 'INVALID_FISCAL_YEAR' });
  }
});

test('JST fiscal-year resolution changes exactly at February 1', () => {
  assert.equal(currentJstFiscalYear(new Date('2026-01-31T14:59:59.999Z')), 2025);
  assert.equal(currentJstFiscalYear(new Date('2026-01-31T15:00:00.000Z')), 2026);
  assert.equal(parseFiscalYear(undefined, new Date('2026-01-31T15:00:00.000Z')).fiscalYear, 2026);
});

test('hides database failure details and never substitutes zero', async () => {
  const auth = new StaffAuthService('disposable-error-test-key');
  const errorApp = express();
  errorApp.use(cookieParser());
  const failing = new ItKaizenPortalKpiAdapter({ query: async () => { throw new Error('secret database detail'); } } as never);
  errorApp.use('/api/admin/portal-kpis', requireStaffAuth(auth), createAdminPortalKpisRouter(failing));
  const errorServer = errorApp.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => errorServer.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(errorServer.address() as AddressInfo).port}`;
    const cookie = `staff_session=${auth.issueSessionToken({ email: 'staff@test.atlib.jp' })}`;
    const response = await fetch(`${url}/api/admin/portal-kpis?fiscalYear=2026`, { headers: { cookie } });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text.includes('secret database detail'), false);
    const body = JSON.parse(text);
    assert.equal(body.error, 'PORTAL_KPI_UNAVAILABLE');
    assert.equal(body.services.IT_KAIZEN.acceptedCount.value, null);
    assert.equal(body.services.IT_KAIZEN.acceptedCount.status, 'ERROR');
    assert.equal(body.common.acceptedCount.status, 'ERROR');
  } finally {
    await new Promise<void>((resolve, reject) => errorServer.close(error => error ? reject(error) : resolve()));
  }
});
