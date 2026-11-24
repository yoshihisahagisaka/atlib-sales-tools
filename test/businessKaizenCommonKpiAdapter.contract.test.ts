import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { BusinessKaizenCommonKpiAdapter } from '../src/services/businessKaizenCommonKpiAdapter';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

test('Business KAIZEN common KPI adapter projects accepted SELF/PROXY facts without inference', async () => {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeBusinessKaizen: true });
  try {
    const draft = await seedProxy(h, 'Draft', null, null);
    const self = await seedSelf(h);
    const proxy = await seedProxy(h, 'Proxy', 'owner@atlib.jp', 'WEB');
    await accept(h, self.id, '2026-04-01T01:00:00Z');
    await accept(h, proxy.id, '2026-04-02T01:00:00Z');
    await stage(h, proxy.id, 'PROPOSED', '2026-04-02T02:00:00Z');
    await stage(h, proxy.id, 'MEETING_COMPLETED', '2026-04-02T03:00:00Z');
    await stage(h, proxy.id, 'SCHEDULED', '2026-04-03T01:00:00Z');
    await stage(h, proxy.id, 'SCHEDULED', '2026-04-04T01:00:00Z');
    await event(h, proxy.id, 'PROPOSED', null, 'Custom Service', '2026-04-05T01:00:00Z');
    await event(h, proxy.id, 'PROPOSED', 0, 'Another Service', '2026-04-06T01:00:00Z');
    await event(h, proxy.id, 'WON', 50000, 'Custom Service', '2026-04-07T01:00:00Z');
    await h.pool.query(`UPDATE business_kaizen_diagnoses SET outcome='COMPLETED_NO_PROPOSAL',outcome_reason='consultation complete',closed_at='2026-04-08T01:00:00Z' WHERE id=$1`, [self.id]);

    const before = await counts(h);
    const subjects = await new BusinessKaizenCommonKpiAdapter(h.pool).listAcceptedSubjects();
    assert.equal(subjects.length, 2);
    assert.ok(!subjects.some(subject => subject.ref.subjectId === draft.id));
    assert.equal(new Set(subjects.map(subject => subject.ref.subjectId)).size, 2);
    assert.deepEqual(await counts(h), before, 'read adapter must not create source records');

    const selfSubject = subjects.find(subject => subject.ref.subjectId === self.id)!;
    assert.equal(selfSubject.companyId, null);
    assert.equal(selfSubject.contactId, null);
    assert.equal(selfSubject.ownerId, null);
    assert.equal(selfSubject.acquisitionChannel, null);
    assert.deepEqual(selfSubject.attribution, {
      source: 'newsletter', medium: 'email', campaign: 'self-campaign', content: null,
      term: null, referrer: 'https://referrer.example/', landingPath: '/business-web/self-check/',
    });
    assert.deepEqual(selfSubject.milestones.map(item => item.code), ['ENTRY_ACCEPTED']);
    assert.equal(selfSubject.outcomeCategory, null, 'normal completion must not be guessed as loss or a common outcome');
    assert.equal(selfSubject.dispositionReason, 'consultation complete');

    const proxySubject = subjects.find(subject => subject.ref.subjectId === proxy.id)!;
    assert.equal(proxySubject.companyId, proxy.companyId);
    assert.equal(proxySubject.contactId, proxy.contactId);
    assert.equal(proxySubject.ownerId, 'owner@atlib.jp');
    assert.equal(proxySubject.acquisitionChannel, 'WEB');
    assert.deepEqual(proxySubject.attribution, {
      source: 'google', medium: 'cpc', campaign: 'proxy-campaign', content: 'hero', term: 'kaizen',
      referrer: null, landingPath: '/campaign',
    });
    assert.deepEqual(proxySubject.milestones, [
      { code: 'ENTRY_ACCEPTED', firstReachedAt: '2026-04-02T01:00:00.000Z' },
      { code: 'MEETING_SCHEDULED', firstReachedAt: '2026-04-03T01:00:00.000Z' },
      { code: 'PAID_SERVICE_PROPOSED', firstReachedAt: '2026-04-05T01:00:00.000Z' },
      { code: 'PAID_SERVICE_WON', firstReachedAt: '2026-04-07T01:00:00.000Z' },
    ]);
    assert.equal(proxySubject.milestones.some(item => item.code === ('HEARING_COMPLETED' as any)), false);
    assert.equal(proxySubject.commercialEvents.length, 3);
    assert.deepEqual(proxySubject.commercialEvents.map(event => [event.type,event.amount,event.serviceCode]), [
      ['PROPOSED',null,null],['PROPOSED',0,null],['WON',50000,null],
    ]);
    assert.equal(proxySubject.drillDownPath, `/admin/business-kaizen-diagnosis-detail.html?id=${proxy.id}`);
  } finally { await h.close(); }
});

async function seedSelf(h: any) {
  const lead = randomUUID(), id = randomUUID();
  await h.pool.query(`INSERT INTO business_web_consultation_leads
    (id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result,utm_source,utm_medium,utm_campaign,landing_url,referrer)
    VALUES($1,'Self Company','Self Person','self@example.test',true,true,'v1',$2,'{}','{}','newsletter','email','self-campaign','https://service.atlib.jp/business-web/self-check/?from=mail','https://referrer.example/')`, [lead, randomUUID()]);
  await h.pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,consultation_lead_id) VALUES($1,'CUSTOMER_SELF','DRAFT',$2)`, [id, lead]);
  return { id };
}
async function seedProxy(h: any, name: string, owner: string | null, acquisition: string | null) {
  const companyId = randomUUID(), contactId = randomUUID(), activity = randomUUID(), id = randomUUID();
  await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,$2,'seed','seed')`, [companyId, name]);
  await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Person')`, [contactId, companyId]);
  await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,acquisition_source_type,acquisition_source_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_url)
    VALUES($1,$2,$3,'BUSINESS_WEB','seed','seed',$4,$5,'google','cpc','proxy-campaign','hero','kaizen','https://service.atlib.jp/campaign')`, [activity, companyId, contactId, acquisition, acquisition ? 'web form' : null]);
  await h.pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,sales_activity_id,company_id,contact_id,owner_user_email) VALUES($1,'STAFF_PROXY','DRAFT',$2,$3,$4,$5)`, [id, activity, companyId, contactId, owner]);
  return { id, companyId, contactId };
}
async function accept(h: any, diagnosisId: string, at: string) { await stage(h, diagnosisId, 'ACCEPTED', at); }
async function stage(h: any, diagnosisId: string, value: string, at: string) {
  await h.pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at) VALUES($1,$2,$3,$4)`, [randomUUID(), diagnosisId, value, at]);
}
async function event(h: any, diagnosisId: string, type: string, amount: number | null, service: string, at: string) {
  await h.pool.query(`INSERT INTO business_kaizen_commercial_events(id,diagnosis_id,event_type,service_name,description,amount,currency,occurred_at,created_by_user_email,idempotency_key,payload_hash)
    VALUES($1,$2,$3,$4,'fact',$5,'JPY',$6,'operator@atlib.jp',$7,'hash')`, [randomUUID(), diagnosisId, type, service, amount, at, randomUUID()]);
}
async function counts(h: any) {
  const row = (await h.pool.query(`SELECT
    (SELECT count(*) FROM company) companies,(SELECT count(*) FROM contact) contacts,
    (SELECT count(*) FROM sales_activity) activities,(SELECT count(*) FROM business_web_consultation_leads) leads,
    (SELECT count(*) FROM business_kaizen_diagnoses) diagnoses`)).rows[0];
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [key,Number(value)]));
}
