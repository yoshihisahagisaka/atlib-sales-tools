import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { FreeDiagnosisDesignV2PersistenceRepo } from '../src/services/freeDiagnosisDesignV2PersistenceRepo';
import { FreeDiagnosisDesignV2EntryAdapter } from '../src/services/freeDiagnosisDesignV2EntryAdapter';
import { StaffProxyDesignV2SubmissionService } from '../src/services/staffProxyDesignV2SubmissionService';
import type { StaffProxyDesignV2SubmissionInput } from '../src/services/staffProxyDesignV2SubmissionService';
import type { CurrentStructuredStateV2 } from '../src/domain/freeDiagnosisDesignV2';
import { designV2SurveyAnswerSchema } from '../src/domain/publicCustomerSelfDesignV2';

const survey: CurrentStructuredStateV2 = {
  q1CompanyContext: { employeeRange: '31〜50人', siteRange: '2〜3か所' },
  q2Future: ['BUSINESS_GROWTH'], q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
  q4CurrentInterest: 'MANAGEMENT_DECISION', q5Visibility: 'VISIBLE_PARTIAL',
  q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE', q7InterestThemes: ['AI'],
};
const input = (name: string, key = randomUUID()): StaffProxyDesignV2SubmissionInput => ({ idempotencyKey: key, respondentRole: 'MANAGEMENT',
  activity: { name, contact: { name: '営業ヒアリング担当', email: 'proxy@example.test' }, selectedService: 'IT_KAIZEN' as const }, survey: structuredClone(survey), consentConfirmed: true });

describe('E4-C Staff Proxy to Design v2', () => {
  const hPromise = createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true });
  let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
  before(async () => { h = await hPromise; }); after(async () => { await h.close(); });

  const post = (body: unknown, authenticated = true) => fetch(h.url + '/api/admin/free-diagnosis-v1/design-v2/staff-proxy-submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: h.staffCookie } : {}) }, body: JSON.stringify(body) });
  const crm = async (path: string, body: unknown) => {
    const response = await fetch(h.url + '/api/admin/sales-customers' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: h.staffCookie }, body: JSON.stringify(body) });
    assert.equal(response.status, 201); return response.json() as Promise<any>;
  };
  const existingActivity = async (selectedService: 'IT_KAIZEN' | 'BUSINESS_WEB' = 'IT_KAIZEN') => {
    const company = await crm('/companies', { name: `Existing ${randomUUID()}` });
    const contact = await crm(`/companies/${company.id}/contacts`, { name: 'Existing Contact', email: 'existing@example.test' });
    const activity = await crm('/activities', { companyId: company.id, contactId: contact.id, selectedService });
    return { company, contact, activity };
  };
  const existingInput = (salesActivityId: string, idempotencyKey = randomUUID()): StaffProxyDesignV2SubmissionInput => ({
    idempotencyKey, salesActivityId, respondentRole: 'MANAGEMENT', survey: structuredClone(survey), consentConfirmed: true,
  });

  test('requires Staff authentication', async () => { assert.equal((await post(input('Unauthorized'), false)).status, 401); });

  test('requires explicit Staff Proxy consent before any Company or Case is created', async () => {
    for (const body of [{ ...input('E4-C同意false株式会社'), consentConfirmed: false }, (() => { const value: any = input('E4-C同意欠落株式会社'); delete value.consentConfirmed; return value; })(), { ...input('E4-C同意不正株式会社'), consentConfirmed: 'true' }]) assert.equal((await post(body)).status, 400);
    for (const name of ['E4-C同意false株式会社','E4-C同意欠落株式会社','E4-C同意不正株式会社']) assert.equal((await h.pool.query('SELECT id FROM company WHERE name=$1',[name])).rowCount, 0);
  });

  test('creates one canonical Staff Proxy workspace and intake-completed Case', async () => {
    const response = await post(input('E4-C正常株式会社')); assert.equal(response.status, 201); const result = await response.json() as { caseId: string };
    const kase = (await h.pool.query<any>('SELECT status FROM it_management_diagnosis_case_v2 WHERE id=$1', [result.caseId])).rows[0]; assert.equal(kase.status, 'INTAKE_COMPLETED');
    const original = (await h.pool.query<any>('SELECT entry_channel,entered_by_user_id,answered_by_role FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [result.caseId])).rows[0];
    assert.deepEqual(original, { entry_channel: 'STAFF_PROXY', entered_by_user_id: 'operator@atlib.jp', answered_by_role: 'MANAGEMENT' });
    for (const table of ['it_management_diagnosis_current_state_revision_v2','it_management_diagnosis_analysis_result_v2','it_management_diagnosis_generated_narrative_v2']) assert.equal((await h.pool.query(`SELECT id FROM ${table} WHERE case_id=$1`, [result.caseId])).rowCount, 1);
    assert.equal((await h.pool.query('SELECT id FROM hearing_intake_response_v2 WHERE case_id=$1', [result.caseId])).rowCount, 0);
    const consent = (await h.pool.query<any>("SELECT actor_user_id,detail_json,created_at FROM it_management_diagnosis_case_v2_audit WHERE case_id=$1 AND command='RecordDesignV2StaffProxyConsent'", [result.caseId])).rows[0];
    assert.equal(consent.actor_user_id, 'operator@atlib.jp'); assert.ok(consent.created_at); assert.deepEqual(consent.detail_json, { consent_confirmed: true, consent_wording_version: 'STAFF_PROXY_CONSENT_V1', confirmation_recorded_at: 'SERVER_CREATED_AT' });
    const workspace = await fetch(h.url + `/api/admin/free-diagnosis-v1/cases/${result.caseId}/design-v2/post-hearing-analysis`, { headers: { Cookie: h.staffCookie } }); assert.equal(workspace.status, 200);
  });

  test('same key converges and a different payload conflicts', async () => {
    const body = input('E4-C再送株式会社'); const [a,b] = await Promise.all([post(body),post(body)]); assert.ok([200,201].includes(a.status)); assert.ok([200,201].includes(b.status));
    const ar = await a.json() as { caseId:string }; const br = await b.json() as { caseId:string }; assert.equal(ar.caseId, br.caseId);
    assert.equal((await h.pool.query("SELECT id FROM company WHERE name='E4-C再送株式会社'")).rowCount, 1);
    assert.equal((await post({ ...body, activity: { ...body.activity, name: '別内容株式会社' } })).status, 409);
  });

  test('existing Activity creates only one IT Case and Design v2 Original without duplicating CRM records', async () => {
    const existing = await existingActivity();
    const before = (await h.pool.query<any>('SELECT (SELECT count(*) FROM company)::int companies,(SELECT count(*) FROM contact)::int contacts,(SELECT count(*) FROM sales_activity)::int activities')).rows[0];
    const response = await post(existingInput(existing.activity.salesActivityId));
    assert.equal(response.status, 201);
    const result = await response.json() as { caseId: string };
    const after = (await h.pool.query<any>('SELECT (SELECT count(*) FROM company)::int companies,(SELECT count(*) FROM contact)::int contacts,(SELECT count(*) FROM sales_activity)::int activities')).rows[0];
    assert.deepEqual(after, before);
    const kase = (await h.pool.query<any>('SELECT company_id,contact_id,sales_activity_id,status FROM it_management_diagnosis_case_v2 WHERE id=$1', [result.caseId])).rows[0];
    assert.deepEqual(kase, { company_id: existing.company.id, contact_id: existing.contact.id, sales_activity_id: existing.activity.salesActivityId, status: 'INTAKE_COMPLETED' });
    assert.equal((await h.pool.query('SELECT id FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [result.caseId])).rowCount, 1);
  });

  test('existing Activity rejects Business service and cross-company Contact membership', async () => {
    const business = await existingActivity('BUSINESS_WEB');
    assert.equal((await post(existingInput(business.activity.salesActivityId))).status, 409);
    const mismatched = await existingActivity();
    const other = await existingActivity();
    await h.pool.query('UPDATE sales_activity SET primary_contact_id=$1 WHERE id=$2', [other.contact.id, mismatched.activity.salesActivityId]);
    assert.equal((await post(existingInput(mismatched.activity.salesActivityId))).status, 409);
    assert.equal((await h.pool.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=ANY($1::uuid[])', [[business.activity.salesActivityId, mismatched.activity.salesActivityId]])).rowCount, 0);
  });

  test('existing Activity preserves idempotency and rejects a reused key with changed payload', async () => {
    const existing = await existingActivity(); const key = randomUUID(); const body = existingInput(existing.activity.salesActivityId, key);
    const first = await post(body); assert.equal(first.status, 201); const firstResult = await first.json() as { caseId: string };
    const replay = await post(body); assert.equal(replay.status, 200); assert.equal((await replay.json() as { caseId: string }).caseId, firstResult.caseId);
    const changed = { ...body, survey: { ...body.survey, q4CurrentInterest: 'SECURITY_AND_CONTINUITY' as const } };
    assert.equal((await post(changed)).status, 409);
  });

  test('different keys racing for one existing Activity create one Case and reject the other', async () => {
    const existing = await existingActivity();
    const [a, b] = await Promise.all([post(existingInput(existing.activity.salesActivityId)), post(existingInput(existing.activity.salesActivityId))]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal((await h.pool.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=$1', [existing.activity.salesActivityId])).rowCount, 1);
  });

  test('existing Activity requires consent and analyzer failure rolls back new domain records only', async () => {
    const noConsent = await existingActivity(); const missing: any = existingInput(noConsent.activity.salesActivityId); delete missing.consentConfirmed;
    assert.equal((await post(missing)).status, 400);
    assert.equal((await h.pool.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=$1', [noConsent.activity.salesActivityId])).rowCount, 0);

    const existing = await existingActivity();
    const failing = new FreeDiagnosisDesignV2PersistenceRepo(h.pool, () => { throw new Error('injected existing activity analyzer failure'); });
    const service = new StaffProxyDesignV2SubmissionService(h.pool, new FreeDiagnosisDesignV2EntryAdapter(failing));
    await assert.rejects(service.submit(existingInput(existing.activity.salesActivityId), 'operator@atlib.jp'), /injected existing activity analyzer failure/);
    assert.equal((await h.pool.query('SELECT id FROM sales_activity WHERE id=$1', [existing.activity.salesActivityId])).rowCount, 1);
    assert.equal((await h.pool.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=$1', [existing.activity.salesActivityId])).rowCount, 0);
    assert.equal((await h.pool.query("SELECT id FROM it_management_diagnosis_case_v2_audit WHERE detail_json->>'sales_activity_id'=$1", [existing.activity.salesActivityId])).rowCount, 0);
  });

  test('canonical validation rejects invalid answers without partial records', async () => {
    const body:any=input('E4-C不正株式会社'); body.survey.q3ItExpectations=['PRODUCTIVITY','DATA_USE','RESILIENCE']; assert.equal((await post(body)).status,400);
    assert.equal((await h.pool.query("SELECT id FROM company WHERE name='E4-C不正株式会社'")).rowCount,0);
  });

  test('same answers produce the same analysis as Customer Self aside from provenance', async () => {
    const staff=await h.staffProxyDesignV2.submit(input('E4-C同値Staff株式会社'),'operator@atlib.jp');
    const self=await h.publicSelf.submit({idempotencyKey:randomUUID(),company:{name:'E4-C同値Self株式会社'},contact:{name:'本人',email:'self@example.test',respondentRole:'MANAGEMENT'},survey:designV2SurveyAnswerSchema.parse(survey),consent:{privacy:true,diagnosisUse:true,wordingVersion:'it_management_public_self_consent_v1'},attribution:{}});
    const analysis=async(caseId:string)=>(await h.pool.query<any>('SELECT analysis_json FROM it_management_diagnosis_analysis_result_v2 WHERE case_id=$1',[caseId])).rows[0].analysis_json;
    assert.deepEqual(await analysis(staff.caseId),await analysis(self.caseId));
  });

  test('case list uses Original Survey provenance and Design v2 hearing starts without a legacy rule execution', async () => {
    const created = await h.staffProxyDesignV2.submit(input('E4-D一覧株式会社'), 'operator@atlib.jp');
    const listed = (await h.launcher.listSalesActivities({})).find((item: any) => item.diagnosisCaseId === created.caseId) as any;
    assert.equal(listed.isDesignV2, true); assert.equal(listed.entryChannel, 'STAFF_PROXY'); assert.equal(listed.contactName, '営業ヒアリング担当');
    const before = await h.cases.getCase(created.caseId); assert.ok(before);
    const hearing = await h.cases.startDesignV2Hearing(created.caseId, before.version, 'operator@atlib.jp');
    assert.equal(hearing.status, 'HEARING_IN_PROGRESS'); assert.equal(hearing.version, before.version + 2);
    assert.equal((await h.pool.query('SELECT id FROM rule_analysis_execution WHERE case_id=$1', [created.caseId])).rowCount, 0);
    const commands = (await h.pool.query<any>("SELECT command FROM it_management_diagnosis_case_v2_audit WHERE case_id=$1 AND command LIKE 'StartDesignV2%' ORDER BY created_at", [created.caseId])).rows.map((row: any) => row.command);
    assert.deepEqual(commands, ['StartDesignV2Preparation', 'StartDesignV2Hearing']);
  });

  test('analyzer failure rolls back Company, Contact, Activity, Case and Design v2 artifacts', async () => {
    const failing = new FreeDiagnosisDesignV2PersistenceRepo(h.pool, () => { throw new Error('injected analyzer failure'); });
    const service = new StaffProxyDesignV2SubmissionService(h.pool, new FreeDiagnosisDesignV2EntryAdapter(failing));
    await assert.rejects(service.submit(input('E4-Cロールバック株式会社'), 'operator@atlib.jp'), /injected analyzer failure/);
    assert.equal((await h.pool.query("SELECT id FROM company WHERE name='E4-Cロールバック株式会社'")).rowCount,0);
  });

  test('consent audit failure rolls back the complete Staff Proxy registration', async () => {
    await h.db.exec(`CREATE FUNCTION reject_staff_proxy_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='RecordDesignV2StaffProxyConsent' THEN RAISE EXCEPTION 'consent audit failed'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_staff_proxy_consent BEFORE INSERT ON it_management_diagnosis_case_v2_audit FOR EACH ROW EXECUTE FUNCTION reject_staff_proxy_consent();`);
    try { await assert.rejects(h.staffProxyDesignV2.submit(input('E4-C同意ロールバック株式会社'), 'operator@atlib.jp'), /consent audit failed/); }
    finally { await h.db.exec('DROP TRIGGER reject_staff_proxy_consent ON it_management_diagnosis_case_v2_audit; DROP FUNCTION reject_staff_proxy_consent();'); }
    assert.equal((await h.pool.query("SELECT id FROM company WHERE name='E4-C同意ロールバック株式会社'")).rowCount, 0);
  });
});
