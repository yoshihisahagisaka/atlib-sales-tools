import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
before(async () => { h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true }); });
after(async () => { await h?.close(); });

async function request(path: string, method = 'GET', body?: unknown, authorized = true) {
  return fetch(h.url + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Cookie: h.staffCookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
}

test('shared customer APIs require staff authentication', async () => {
  assert.equal((await request('/api/admin/sales-customers/companies?q=ABC', 'GET', undefined, false)).status, 401);
  assert.equal((await request(`/api/admin/sales-customers/activities/${randomUUID()}`, 'GET', undefined, false)).status, 401);
  assert.equal((await request('/api/admin/sales-customers/activities', 'POST', {}, false)).status, 401);
});

test('one company and contact can create independent IT and Business activities', async () => {
  const name = `Shared CRM ${randomUUID()}`;
  const created = await request('/api/admin/sales-customers/companies', 'POST', { name });
  assert.equal(created.status, 201);
  const company = await created.json() as { id: string; ownerUserId: string };
  assert.equal(company.ownerUserId, 'operator@atlib.jp');

  const found = await request(`/api/admin/sales-customers/companies?q=${encodeURIComponent(name)}`);
  assert.ok(((await found.json()) as { items: { id: string }[] }).items.some(item => item.id === company.id));

  const contactResponse = await request(`/api/admin/sales-customers/companies/${company.id}/contacts`, 'POST', {
    name: 'Shared Contact', email: 'person@example.jp',
  });
  assert.equal(contactResponse.status, 201);
  const contact = await contactResponse.json() as { id: string };
  const listed = await request(`/api/admin/sales-customers/companies/${company.id}/contacts`);
  assert.ok(((await listed.json()) as { items: { id: string }[] }).items.some(item => item.id === contact.id));

  const activities: Array<{ salesActivityId: string; selectedService: string }> = [];
  for (const selectedService of ['IT_KAIZEN', 'BUSINESS_WEB'] as const) {
    const response = await request('/api/admin/sales-customers/activities', 'POST', {
      companyId: company.id, contactId: contact.id, selectedService,
      attribution: {
        acquisitionSourceType: 'EVENT', acquisitionSourceName: 'Slice 1-A event',
        utmSource: 'event', utmCampaign: 'slice-1-a',
      },
      referralPersonName: 'Introducer',
    });
    assert.equal(response.status, 201);
    activities.push(await response.json() as { salesActivityId: string; selectedService: string });
  }
  assert.deepEqual(activities.map(item => item.selectedService), ['IT_KAIZEN', 'BUSINESS_WEB']);
  assert.notEqual(activities[0]!.salesActivityId, activities[1]!.salesActivityId);

  const activityDetail = await request(`/api/admin/sales-customers/activities/${activities[0]!.salesActivityId}`);
  assert.equal(activityDetail.status, 200);
  const detail = await activityDetail.json() as Record<string, unknown>;
  assert.deepEqual({ ...detail, createdAt: undefined }, {
    id: activities[0]!.salesActivityId, companyId: company.id, companyName: name,
    contactId: contact.id, contactName: 'Shared Contact', contactEmail: 'person@example.jp',
    selectedService: 'IT_KAIZEN', createdAt: undefined,
  });
  assert.equal(typeof detail.createdAt, 'string');

  const counts = await h.pool.query<{ companies: string; contacts: string; activities: string }>(
    `SELECT (SELECT count(*) FROM company WHERE id=$1)::text AS companies,
            (SELECT count(*) FROM contact WHERE id=$2)::text AS contacts,
            (SELECT count(*) FROM sales_activity WHERE company_id=$1)::text AS activities`,
    [company.id, contact.id],
  );
  assert.deepEqual(counts.rows[0]!, { companies: '1', contacts: '1', activities: '2' });

  const stored = await h.pool.query<{ utm_source: string; referral_person_name: string }>(
    'SELECT utm_source,referral_person_name FROM sales_activity WHERE id=$1', [activities[0]!.salesActivityId],
  );
  assert.deepEqual(stored.rows[0]!, { utm_source: 'event', referral_person_name: 'Introducer' });

  const blocked = await request(
    `/api/admin/free-diagnosis-v1/sales-activities/${activities[1]!.salesActivityId}/cases`, 'POST', {},
  );
  assert.equal(blocked.status, 409);
  assert.deepEqual(await blocked.json(), { error: 'SERVICE_MISMATCH' });
  const caseCount = await h.pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=$1',
    [activities[1]!.salesActivityId],
  );
  assert.equal(caseCount.rows[0]!.count, '0');
});

test('cross-company contacts, missing companies, forged owners, and unknown services fail closed', async () => {
  const records: Array<{ companyId: string; contactId: string }> = [];
  for (let index = 0; index < 2; index++) {
    const company = await (await request('/api/admin/sales-customers/companies', 'POST', {
      name: `Boundary ${randomUUID()}`,
    })).json() as { id: string };
    const contact = await (await request(`/api/admin/sales-customers/companies/${company.id}/contacts`, 'POST', {
      name: `Contact ${index}`,
    })).json() as { id: string };
    records.push({ companyId: company.id, contactId: contact.id });
  }
  const base = { companyId: records[0]!.companyId, contactId: records[1]!.contactId, selectedService: 'BUSINESS_WEB' };
  const beforeCount = await h.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_activity');
  const mismatch = await request('/api/admin/sales-customers/activities', 'POST', base);
  assert.equal(mismatch.status, 409);
  assert.deepEqual(await mismatch.json(), { error: 'CONTACT_COMPANY_MISMATCH' });
  assert.equal((await request('/api/admin/sales-customers/activities', 'POST', {
    ...base, companyId: randomUUID(), contactId: records[0]!.contactId,
  })).status, 404);
  assert.equal((await request('/api/admin/sales-customers/activities', 'POST', {
    ...base, contactId: records[0]!.contactId, ownerUserId: 'forged@example.com',
  })).status, 400);
  assert.equal((await request('/api/admin/sales-customers/activities', 'POST', {
    ...base, contactId: records[0]!.contactId, selectedService: 'UNKNOWN',
  })).status, 400);
  const afterCount = await h.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_activity');
  assert.equal(afterCount.rows[0]!.count, beforeCount.rows[0]!.count);
});

test('legacy IT sales activity creation remains compatible', async () => {
  const response = await request('/api/admin/free-diagnosis-v1/sales-activities', 'POST', {
    name: `Legacy ${randomUUID()}`, contact: { name: 'Legacy Contact' }, selectedService: 'IT_KAIZEN',
  });
  assert.equal(response.status, 201);
  const activity = await response.json() as { companyId: string; contactId: string; salesActivityId: string };
  assert.ok(activity.companyId && activity.contactId && activity.salesActivityId);
});
