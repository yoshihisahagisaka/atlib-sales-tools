import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import type { CurrentStructuredStateV2 } from '../src/domain/freeDiagnosisDesignV2';
import { Q1_EMPLOYEE_RANGES_V2, Q1_SITE_RANGES_V2 } from '../src/domain/publicCustomerSelfDesignV2';

const survey: CurrentStructuredStateV2 = {
  q1CompanyContext: { employeeRange: Q1_EMPLOYEE_RANGES_V2[2], siteRange: Q1_SITE_RANGES_V2[0] },
  q2Future: ['BUSINESS_GROWTH'], q3ItExpectations: ['PRODUCTIVITY'],
  q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL',
  q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AI'],
};

describe('one IT Case per Sales Activity', () => {
  const hPromise = createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true });
  let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
  before(async () => { h = await hPromise; });
  after(async () => { await h.close(); });

  const request = (path: string, body: unknown) => fetch(h.url + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: h.staffCookie }, body: JSON.stringify(body),
  });
  const createActivity = async (service: 'IT_KAIZEN' | 'BUSINESS_WEB' = 'IT_KAIZEN') => {
    const response = await request('/api/admin/free-diagnosis-v1/sales-activities', {
      name: `Case guard ${randomUUID()}`, contact: { name: '担当者', email: 'guard@example.test' }, selectedService: service,
    });
    assert.equal(response.status, 201);
    return response.json() as Promise<{ companyId: string; contactId: string; salesActivityId: string }>;
  };
  const createCase = (activityId: string) => request(`/api/admin/free-diagnosis-v1/sales-activities/${activityId}/cases`, {});
  const staffProxy = (activityId: string) => request('/api/admin/free-diagnosis-v1/design-v2/staff-proxy-submissions', {
    salesActivityId: activityId, idempotencyKey: randomUUID(), respondentRole: 'MANAGEMENT', survey, consentConfirmed: true,
  });
  const crmCounts = async () => (await h.pool.query<any>(`SELECT
    (SELECT count(*) FROM company)::int companies,
    (SELECT count(*) FROM contact)::int contacts,
    (SELECT count(*) FROM sales_activity)::int activities`)).rows[0];
  const caseCount = async (activityId: string) => Number((await h.pool.query<any>(
    'SELECT count(*)::int count FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=$1', [activityId],
  )).rows[0].count);

  test('existing API returns 201 once, then 409 without changing CRM counts', async () => {
    const activity = await createActivity(); const before = await crmCounts();
    assert.equal((await createCase(activity.salesActivityId)).status, 201);
    const duplicate = await createCase(activity.salesActivityId);
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { error: 'SALES_ACTIVITY_CASE_ALREADY_EXISTS' });
    assert.equal(await caseCount(activity.salesActivityId), 1);
    assert.deepEqual(await crmCounts(), before);
  });

  test('Staff Proxy followed by existing API returns 409', async () => {
    const activity = await createActivity(); const before = await crmCounts();
    assert.equal((await staffProxy(activity.salesActivityId)).status, 201);
    assert.equal((await createCase(activity.salesActivityId)).status, 409);
    assert.equal(await caseCount(activity.salesActivityId), 1);
    assert.deepEqual(await crmCounts(), before);
  });

  test('existing API followed by Staff Proxy returns 409', async () => {
    const activity = await createActivity(); const before = await crmCounts();
    assert.equal((await createCase(activity.salesActivityId)).status, 201);
    assert.equal((await staffProxy(activity.salesActivityId)).status, 409);
    assert.equal(await caseCount(activity.salesActivityId), 1);
    assert.deepEqual(await crmCounts(), before);
  });

  test('existing API and Staff Proxy concurrency creates one Case', async () => {
    const activity = await createActivity(); const before = await crmCounts();
    const responses = await Promise.all([createCase(activity.salesActivityId), staffProxy(activity.salesActivityId)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    assert.equal(await caseCount(activity.salesActivityId), 1);
    assert.deepEqual(await crmCounts(), before);
  });

  test('two existing API requests concurrently create one Case', async () => {
    const activity = await createActivity(); const before = await crmCounts();
    const responses = await Promise.all([createCase(activity.salesActivityId), createCase(activity.salesActivityId)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    assert.equal(await caseCount(activity.salesActivityId), 1);
    assert.deepEqual(await crmCounts(), before);
  });

  test('BUSINESS_WEB Activity is rejected without a Case', async () => {
    const activity = await createActivity('BUSINESS_WEB'); const before = await crmCounts();
    const response = await createCase(activity.salesActivityId);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'SERVICE_MISMATCH' });
    assert.equal(await caseCount(activity.salesActivityId), 0);
    assert.deepEqual(await crmCounts(), before);
  });

  test('missing Activity and cross-company Contact fail before Case creation', async () => {
    const missing = await createCase(randomUUID());
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'SALES_ACTIVITY_NOT_FOUND' });

    const activity = await createActivity(); const other = await createActivity(); const before = await crmCounts();
    await h.pool.query('UPDATE sales_activity SET primary_contact_id=$1 WHERE id=$2', [other.contactId, activity.salesActivityId]);
    const mismatch = await createCase(activity.salesActivityId);
    assert.equal(mismatch.status, 409);
    assert.deepEqual(await mismatch.json(), { error: 'CONTACT_COMPANY_MISMATCH' });
    assert.equal(await caseCount(activity.salesActivityId), 0);
    assert.deepEqual(await crmCounts(), before);
  });
});
