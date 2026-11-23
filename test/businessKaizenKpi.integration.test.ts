import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

test('Business KAIZEN KPI separates cohort subjects, activity events and missing facts in JST', async () => {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeBusinessKaizen: true });
  try {
    const self = await seedSelf(h, 'Self KPI', null, '2026-02-02T00:00:00Z');
    await accept(h, self, '2026-01-31T15:00:00Z'); // 2026-02-01 00:00 JST, inclusive.
    const normalClose = await seedSelf(h, 'Normal Close', null, '2026-03-05T00:00:00Z', 'COMPLETED_NO_PROPOSAL');
    await accept(h, normalClose, '2026-02-28T14:59:59Z'); // Last second in the requested JST period.
    const proxy = await seedProxy(h, 'Proxy KPI', 'owner@atlib.jp', null);
    await accept(h, proxy, '2026-02-10T00:00:00Z');

    const stageOnly = await seedProxy(h, 'Stage Only', 'owner@atlib.jp', null);
    await h.pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,'PROPOSED',$3)`, [randomUUID(), stageOnly, '2026-02-10T00:00:00Z']);
    const completedWithoutAccepted = await seedProxy(h, 'No Entry', 'owner@atlib.jp', '2026-02-12T00:00:00Z');
    assert.ok(completedWithoutAccepted);
    const outside = await seedSelf(h, 'Outside Boundary', null, null);
    await accept(h, outside, '2026-02-28T15:00:00Z'); // 2026-03-01 00:00 JST, excluded.
    await seedHistoricalLeadWithoutDiagnosis(h, '2026-02-15T00:00:00Z');

    await event(h, self, 'PROPOSED', 100, '2026-02-03T00:00:00Z');
    await event(h, self, 'PROPOSED', null, '2026-02-04T00:00:00Z');
    await event(h, self, 'WON', 500, '2026-02-06T00:00:00Z');
    await event(h, self, 'PROPOSED', 50, '2026-03-02T00:00:00Z'); // Cohort follow-up, outside Activity period.
    await event(h, proxy, 'PROPOSED', 200, '2026-02-20T00:00:00Z');
    await event(h, proxy, 'PROPOSED', 300, '2026-02-21T00:00:00Z');
    const replayKey = randomUUID();
    const replayInput = { idempotencyKey: replayKey, eventType: 'WON' as const, serviceName: '業務KAIZEN', description: 'replayed win', amount: null, currency: 'JPY' as const, occurredAt: '2026-02-22T00:00:00Z' };
    const first = await h.businessKaizenProxy.createCommercialEvent(proxy, replayInput, 'operator@atlib.jp');
    const replay = await h.businessKaizenProxy.createCommercialEvent(proxy, replayInput, 'operator@atlib.jp');
    assert.equal(first.event.id, replay.event.id);

    const anonymous = await fetch(`${h.url}/api/admin/business-kaizen/kpis?from=2026-02-01&to=2026-02-28`);
    assert.equal(anonymous.status, 401);
    const response = await fetch(`${h.url}/api/admin/business-kaizen/kpis?from=2026-02-01&to=2026-02-28`, { headers: { Cookie: h.staffCookie } });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.deepEqual(body.period, { from: '2026-02-01T00:00:00+09:00', toExclusive: '2026-03-01T00:00:00+09:00', timeZone: 'Asia/Tokyo', fiscalYearStartMonth: 2 });
    assert.deepEqual(body.subject, { businessLine: 'BUSINESS_KAIZEN', subjectType: 'BUSINESS_DIAGNOSIS' });
    assert.deepEqual(body.cohortFunnel, {
      acceptedDiagnosisCount: 3, completedDiagnosisCount: 2,
      proposedDiagnosisCount: 2, wonDiagnosisCount: 2,
      proposedAmountTotal: 650, wonAmountTotal: 500,
      acceptedToWonRate: 2 / 3,
      byEntryChannel: { CUSTOMER_SELF: 2, STAFF_PROXY: 1 },
    });
    assert.deepEqual(body.activityVolume, {
      acceptedDiagnosisCount: 3, completedDiagnosisCount: 2,
      proposedDiagnosisCount: 2, wonDiagnosisCount: 2,
      proposedAmountTotal: 600, wonAmountTotal: 500,
      proposedEventCount: 4, wonEventCount: 2,
    });
    assert.deepEqual(body.dataQuality, {
      acceptedDiagnosisOwnerMissingCount: 2,
      commercialEventAmountUnknownCount: 2,
      completedWithoutAcceptedCount: 1,
      consultationLeadWithoutDiagnosisCount: 1,
    });

    const fiscal = await fetch(`${h.url}/api/admin/business-kaizen/kpis?fiscalYear=2026`, { headers: { Cookie: h.staffCookie } });
    assert.equal(fiscal.status, 200);
    const fiscalBody = await fiscal.json() as any;
    assert.equal(fiscalBody.period.from, '2026-02-01T00:00:00+09:00');
    assert.equal(fiscalBody.period.toExclusive, '2027-02-01T00:00:00+09:00');
    assert.equal(fiscalBody.cohortFunnel.acceptedDiagnosisCount, 4);
    assert.equal((await api(h, 'from=2026-02-30&to=2026-03-01')).status, 400);
    assert.equal((await api(h, 'from=2026-02-01&to=2026-02-28&unexpected=x')).status, 400);
  } finally { await h.close(); }
});

test('Business KAIZEN KPI returns null conversion and preserves all-null amount', async () => {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeBusinessKaizen: true });
  try {
    const empty = await api(h, 'from=2026-01-01&to=2026-01-31');
    const emptyBody = await empty.json() as any;
    assert.equal(emptyBody.cohortFunnel.acceptedToWonRate, null);
    assert.equal(emptyBody.cohortFunnel.proposedAmountTotal, 0);
    const diagnosis = await seedProxy(h, 'Unknown Amount', 'owner@atlib.jp', null);
    await event(h, diagnosis, 'PROPOSED', null, '2026-01-15T00:00:00Z');
    const body = await (await api(h, 'from=2026-01-01&to=2026-01-31')).json() as any;
    assert.equal(body.activityVolume.proposedDiagnosisCount, 1);
    assert.equal(body.activityVolume.proposedAmountTotal, null);
    assert.equal(body.dataQuality.commercialEventAmountUnknownCount, 1);
  } finally { await h.close(); }
});

async function api(h: any, query: string) {
  return fetch(`${h.url}/api/admin/business-kaizen/kpis?${query}`, { headers: { Cookie: h.staffCookie } });
}
async function seedHistoricalLeadWithoutDiagnosis(h: any, createdAt: string) {
  await h.pool.query(`INSERT INTO business_web_consultation_leads(id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result,created_at) VALUES($1,'Historical','Person','historical@example.test',true,true,'v1',$2,'{}','{}',$3)`, [randomUUID(), randomUUID(), createdAt]);
}
async function seedSelf(h: any, name: string, owner: string | null, completedAt: string | null, outcome: string | null = null) {
  const lead = randomUUID(), diagnosis = randomUUID();
  await h.pool.query(`INSERT INTO business_web_consultation_leads(id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result) VALUES($1,$2,'Person','self@example.test',true,true,'v1',$3,'{}','{}')`, [lead, name, randomUUID()]);
  await h.pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,consultation_lead_id,owner_user_email,original_answers,current_answers,diagnosis_snapshot,completed_at,outcome) VALUES($1,'CUSTOMER_SELF',$2,$3,$4,$5,$5,$5,$6,$7)`, [diagnosis, completedAt ? 'COMPLETED' : 'DRAFT', lead, owner, completedAt ? '{}' : null, completedAt, outcome]);
  return diagnosis;
}
async function seedProxy(h: any, name: string, owner: string | null, completedAt: string | null) {
  const company = randomUUID(), contact = randomUUID(), activity = randomUUID(), diagnosis = randomUUID();
  await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,$2,'seed',$3)`, [company, name, owner]);
  await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Person')`, [contact, company]);
  await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'BUSINESS_WEB','seed',$4)`, [activity, company, contact, owner]);
  await h.pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,sales_activity_id,company_id,contact_id,owner_user_email,original_answers,current_answers,diagnosis_snapshot,completed_at) VALUES($1,'STAFF_PROXY',$2,$3,$4,$5,$6,$7,$7,$7,$8)`, [diagnosis, completedAt ? 'COMPLETED' : 'DRAFT', activity, company, contact, owner, completedAt ? '{}' : null, completedAt]);
  return diagnosis;
}
async function accept(h: any, diagnosis: string, reachedAt: string) {
  await h.pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,'ACCEPTED',$3)`, [randomUUID(), diagnosis, reachedAt]);
}
async function event(h: any, diagnosis: string, type: 'PROPOSED' | 'WON', amount: number | null, occurredAt: string) {
  const input = { idempotencyKey: randomUUID(), eventType: type, serviceName: '業務KAIZEN', description: `${type} fact`, amount, currency: 'JPY' as const, occurredAt };
  return h.businessKaizenProxy.createCommercialEvent(diagnosis, input, 'operator@atlib.jp');
}
