import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const opened: Array<Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>> = [];
afterEach(async () => { while (opened.length) await opened.pop()!.close(); });

async function harness() { const value = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true }); opened.push(value); return value; }
const attribution = { utmSource: 'shusei_club', utmMedium: 'flyer', utmCampaign: '202610_shusei', utmContent: 'itkaizen_a4', utmTerm: null };
const initiative = { initiativeName: '守成クラブ 2026年10月配布チラシ', serviceKey: 'IT_KAIZEN' as const,
  utmSource: attribution.utmSource, utmMedium: attribution.utmMedium, utmCampaign: attribution.utmCampaign, utmContent: attribution.utmContent };

async function createActivity(h: Awaited<ReturnType<typeof harness>>, suffix: string, attrs: typeof attribution | null = attribution) {
  return h.launcher.createSalesActivity({ name: `会社${suffix}`, contact: { name: `担当${suffix}` }, selectedService: 'IT_KAIZEN',
    attribution: attrs ? { ...attrs } : undefined }, 'operator@atlib.jp');
}

test('staff auth, validation, registration and NULLS NOT DISTINCT duplicate rejection', async () => {
  const h = await harness();
  assert.equal((await fetch(`${h.url}/api/admin/marketing-initiatives`)).status, 401);
  assert.equal((await fetch(`${h.url}/api/admin/marketing-initiatives`, { method: 'POST', headers: { cookie: h.staffCookie, 'content-type': 'application/json' }, body: JSON.stringify({ initiativeName: 'UTMなし', serviceKey: 'IT_KAIZEN' }) })).status, 400);
  const first = await fetch(`${h.url}/api/admin/marketing-initiatives`, { method: 'POST', headers: { cookie: h.staffCookie, 'content-type': 'application/json' }, body: JSON.stringify(initiative) });
  assert.equal(first.status, 201); const created = await first.json() as any;
  assert.equal(created.createdBy, 'operator@atlib.jp'); assert.equal(created.updatedBy, 'operator@atlib.jp'); assert.equal(created.utmTerm, null);
  const duplicate = await fetch(`${h.url}/api/admin/marketing-initiatives`, { method: 'POST', headers: { cookie: h.staffCookie, 'content-type': 'application/json' }, body: JSON.stringify(initiative) });
  assert.equal(duplicate.status, 409); assert.equal((await duplicate.json() as any).error, 'INITIATIVE_UTM_ALREADY_REGISTERED');
});

test('exact UTM match maps past activities dynamically and unmatched activities remain unregistered', async () => {
  const h = await harness(); const matching = await createActivity(h, '一致'); await createActivity(h, '未一致', { ...attribution, utmContent: 'other' }); await createActivity(h, 'UTMなし', null);
  const created = await h.initiatives.create(initiative, 'operator@atlib.jp');
  const matched = await h.launcher.listSalesActivities({ initiativeId: String(created.initiativeId) });
  assert.deepEqual(matched.map(item => item.id), [matching.salesActivityId]);
  assert.equal(matched[0]!.marketingInitiative?.name, initiative.initiativeName);
  const all = await h.launcher.listSalesActivities({});
  assert.equal(all.find(item => item.companyName === '会社未一致')!.marketingInitiative, null);
  assert.equal(all.find(item => item.companyName === '会社UTMなし')!.marketingInitiative, null);
});

test('inactive initiatives retain historical mapping but do not map later activities', async () => {
  const h = await harness(); const before = await createActivity(h, '以前'); const created = await h.initiatives.create(initiative, 'creator@atlib.jp');
  await h.initiatives.deactivate(String(created.initiativeId), 'closer@atlib.jp');
  await new Promise(resolve => setTimeout(resolve, 5)); const after = await createActivity(h, '以後');
  const matched = await h.launcher.listSalesActivities({ initiativeId: String(created.initiativeId) });
  assert.deepEqual(matched.map(item => item.id), [before.salesActivityId]); assert.notEqual(after.salesActivityId, before.salesActivityId);
  const listed = (await h.initiatives.list())[0]!; assert.equal(listed.isActive, false); assert.equal(listed.updatedBy, 'closer@atlib.jp');
});

test('KPI aggregates distinct cases and only the latest report version', async () => {
  const h = await harness(); const activityA = await createActivity(h, '本人'); const activityB = await createActivity(h, '代理');
  const created = await h.initiatives.create(initiative, 'operator@atlib.jp');
  const caseA = await h.cases.createCase(activityA.companyId, activityA.contactId, activityA.salesActivityId, 'operator@atlib.jp');
  const caseB = await h.cases.createCase(activityB.companyId, activityB.contactId, activityB.salesActivityId, 'operator@atlib.jp');
  await h.pool.query(`UPDATE it_management_diagnosis_case_v2 SET status='HEARING_COMPLETED' WHERE id=$1`, [caseA.id]);
  for (const [caseId, channel] of [[caseA.id,'CUSTOMER_SELF'],[caseB.id,'STAFF_PROXY']] as const) {
    await h.pool.query(`INSERT INTO it_management_diagnosis_original_survey_snapshot_v2
      (id,case_id,survey_version,entry_channel,answered_by_role,entered_by_user_id,answers_json,submitted_at,content_hash)
      VALUES ($1,$2,'v1',$3,'MANAGEMENT',$4,'{}',now(),$5)`, [randomUUID(), caseId, channel, channel === 'STAFF_PROXY' ? 'operator@atlib.jp' : null, 'a'.repeat(64)]);
  }
  const insertReport = async (version: number, status: string) => h.pool.query(`INSERT INTO diagnosis_reports
    (id,diagnosis_case_id,it_management_diagnosis_case_v2_id,version,status,content_json,context_json,context_hash,prompt_version,policy_version,created_by,created_by_user_id,snapshot_json,approved_by_user_id,approved_at)
    VALUES ($1,NULL,$2,$3,$4,'{}','{}','hash','v1','design-v2','HUMAN','operator@atlib.jp',$5,$6,$7)`,
    [randomUUID(),caseA.id,version,status,status==='APPROVED'?{}:null,status==='APPROVED'?'operator@atlib.jp':null,status==='APPROVED'?new Date():null]);
  await insertReport(1, 'APPROVED'); await insertReport(2, 'REVIEW_REQUIRED');
  let kpi = (await h.initiatives.list()).find(item => item.initiativeId === created.initiativeId)!.kpi;
  assert.deepEqual(kpi, { applications: 2, customerSelf: 1, staffProxy: 1, hearingCompleted: 1, reportCreated: 1, reportApproved: 0 });
  await insertReport(3, 'APPROVED');
  kpi = (await h.initiatives.list()).find(item => item.initiativeId === created.initiativeId)!.kpi;
  assert.equal(kpi.reportCreated, 1); assert.equal(kpi.reportApproved, 1);
});

test('admin page exposes initiative management without unsafe HTML rendering', async () => {
  const h = await harness();
  const page = await fetch(`${h.url}/admin/marketing-initiatives.html`, { headers: { cookie: h.staffCookie } });
  assert.equal(page.status, 200); const html = await page.text();
  assert.match(html, /施策管理/); assert.match(html, /該当案件/); assert.doesNotMatch(html, /innerHTML/);
});
