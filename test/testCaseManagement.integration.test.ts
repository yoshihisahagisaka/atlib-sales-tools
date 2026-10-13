import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { StaffAuthService } from '../src/services/staffAuthService';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const opened: Array<Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>> = [];
afterEach(async () => { while (opened.length) await opened.pop()!.close(); });

async function harness() { const value = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true }); opened.push(value); return value; }
const initiative = { initiativeName: 'テスト施策', serviceKey: 'IT_KAIZEN' as const, utmSource: 'event', utmCampaign: 'test-case-management' };

async function fixture(h: Awaited<ReturnType<typeof harness>>) {
  const activity = await h.launcher.createSalesActivity({ name: '確認対象株式会社', contact: { name: '確認担当' }, selectedService: 'IT_KAIZEN', attribution: { utmSource: 'event', utmCampaign: 'test-case-management' } }, 'operator@atlib.jp');
  const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp', false);
  const listed = (await h.launcher.listSalesActivities({})).find(item => item.diagnosisCaseId === kase.id)!;
  return { activity, kase, listed };
}

function request(h: Awaited<ReturnType<typeof harness>>, caseId: string, cookie: string, body: unknown, origin?: string) {
  return fetch(`${h.url}/api/admin/free-diagnosis-v1/cases/${caseId}/test-designation`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
  });
}

test('designation is admin-only, same-origin, confirmation-bound and append-only audited', async () => {
  const h = await harness(); const { kase, listed } = await fixture(h);
  const body = { designate: true, reason: 'Production公開前の画面確認に使用するため', confirmation: { caseId: kase.id, companyName: listed.companyName, receivedAt: new Date(listed.receivedAt as string).toISOString() } };
  assert.equal((await request(h, kase.id, h.staffCookie, body)).status, 403);
  const outsider = new StaffAuthService('disposable-test-key-not-a-production-secret').issueSessionToken({ email: 'other@atlib.jp' });
  assert.equal((await request(h, kase.id, `staff_session=${outsider}`, body, h.url)).status, 403);
  const mismatch = structuredClone(body); mismatch.confirmation.companyName = '別会社';
  assert.equal((await request(h, kase.id, h.staffCookie, mismatch, h.url)).status, 409);
  const designated = await request(h, kase.id, h.staffCookie, body, h.url); assert.equal(designated.status, 200);
  assert.equal((await h.cases.getCase(kase.id))!.isInternalTest, true);
  assert.equal((await request(h, kase.id, h.staffCookie, body, h.url)).status, 409);
  const release = { ...body, designate: false, reason: '画面確認が終了し通常案件へ戻すため' };
  assert.equal((await request(h, kase.id, h.staffCookie, release, h.url)).status, 200);
  const audits = await h.pool.query<any>('SELECT action,actor_user_id,reason FROM it_management_diagnosis_test_case_designation_audit WHERE case_id=$1 ORDER BY created_at,id', [kase.id]);
  assert.deepEqual(audits.rows.map(row => row.action), ['DESIGNATED','RELEASED']);
  assert.ok(audits.rows.every(row => row.actor_user_id === 'operator@atlib.jp'));
  await assert.rejects(h.pool.query('UPDATE it_management_diagnosis_test_case_designation_audit SET reason=$2 WHERE case_id=$1', [kase.id,'改ざん']), /append-only/);
  await h.pool.query('DELETE FROM it_management_diagnosis_case_v2 WHERE id=$1', [kase.id]);
  assert.equal((await h.pool.query('SELECT count(*)::int AS count FROM it_management_diagnosis_test_case_designation_audit WHERE case_id=$1', [kase.id])).rows[0].count, 2);
});

test('test designation excludes all initiative KPIs and release restores them', async () => {
  const h = await harness(); const { kase, listed } = await fixture(h); await h.initiatives.create(initiative, 'operator@atlib.jp');
  let kpi = (await h.initiatives.list())[0]!.kpi; assert.equal(kpi.applications, 1);
  const confirmation = { caseId: kase.id, companyName: String(listed.companyName), receivedAt: new Date(listed.receivedAt as string).toISOString() };
  await h.testCases.setDesignation({ caseId: kase.id, designate: true, reason: '自動テスト対象として指定するため', actor: 'operator@atlib.jp', confirmation });
  kpi = (await h.initiatives.list())[0]!.kpi; assert.deepEqual(kpi, { applications: 0, customerSelf: 0, staffProxy: 0, hearingCompleted: 0, reportCreated: 0, reportApproved: 0 });
  const defaultList = await fetch(`${h.url}/api/admin/free-diagnosis-v1/sales-activities`, { headers: { cookie: h.staffCookie } });
  assert.equal(((await defaultList.json()) as { items: unknown[] }).items.length, 0);
  const allList = await fetch(`${h.url}/api/admin/free-diagnosis-v1/sales-activities?testStatus=ALL`, { headers: { cookie: h.staffCookie } });
  assert.equal(((await allList.json()) as { items: unknown[] }).items.length, 1);
  assert.equal((await h.launcher.listSalesActivities({ testStatus: 'TEST' })).length, 1);
  assert.equal((await h.launcher.listSalesActivities({ testStatus: 'NORMAL' })).length, 0);
  await h.testCases.setDesignation({ caseId: kase.id, designate: false, reason: '自動テスト指定を解除するため', actor: 'operator@atlib.jp', confirmation });
  assert.equal((await h.initiatives.list())[0]!.kpi.applications, 1);
  const restoredList = await fetch(`${h.url}/api/admin/free-diagnosis-v1/sales-activities`, { headers: { cookie: h.staffCookie } });
  assert.equal(((await restoredList.json()) as { items: unknown[] }).items.length, 1);
});

test('case list exposes designation controls but no runtime delete action', async () => {
  const h = await harness(); const page = await fetch(`${h.url}/admin/free-diagnosis-v1.html`, { headers: { cookie: h.staffCookie } });
  const html = await page.text(); assert.match(html, /テスト案件に指定/); assert.match(html, /テスト指定を解除/);
  assert.doesNotMatch(html, /テスト案件を削除/);
});
