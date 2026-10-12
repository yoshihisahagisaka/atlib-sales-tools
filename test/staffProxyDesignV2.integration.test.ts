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
  activity: { name, contact: { name: '営業ヒアリング担当', email: 'proxy@example.test' }, selectedService: 'IT_KAIZEN' as const }, survey: structuredClone(survey) });

describe('E4-C Staff Proxy to Design v2', () => {
  const hPromise = createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true });
  let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
  before(async () => { h = await hPromise; }); after(async () => { await h.close(); });

  const post = (body: unknown, authenticated = true) => fetch(h.url + '/api/admin/free-diagnosis-v1/design-v2/staff-proxy-submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: h.staffCookie } : {}) }, body: JSON.stringify(body) });

  test('requires Staff authentication', async () => { assert.equal((await post(input('Unauthorized'), false)).status, 401); });

  test('creates one canonical Staff Proxy workspace and intake-completed Case', async () => {
    const response = await post(input('E4-C正常株式会社')); assert.equal(response.status, 201); const result = await response.json() as { caseId: string };
    const kase = (await h.pool.query<any>('SELECT status FROM it_management_diagnosis_case_v2 WHERE id=$1', [result.caseId])).rows[0]; assert.equal(kase.status, 'INTAKE_COMPLETED');
    const original = (await h.pool.query<any>('SELECT entry_channel,entered_by_user_id,answered_by_role FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [result.caseId])).rows[0];
    assert.deepEqual(original, { entry_channel: 'STAFF_PROXY', entered_by_user_id: 'operator@atlib.jp', answered_by_role: 'MANAGEMENT' });
    for (const table of ['it_management_diagnosis_current_state_revision_v2','it_management_diagnosis_analysis_result_v2','it_management_diagnosis_generated_narrative_v2']) assert.equal((await h.pool.query(`SELECT id FROM ${table} WHERE case_id=$1`, [result.caseId])).rowCount, 1);
    assert.equal((await h.pool.query('SELECT id FROM hearing_intake_response_v2 WHERE case_id=$1', [result.caseId])).rowCount, 0);
    const workspace = await fetch(h.url + `/api/admin/free-diagnosis-v1/cases/${result.caseId}/design-v2/post-hearing-analysis`, { headers: { Cookie: h.staffCookie } }); assert.equal(workspace.status, 200);
  });

  test('same key converges and a different payload conflicts', async () => {
    const body = input('E4-C再送株式会社'); const [a,b] = await Promise.all([post(body),post(body)]); assert.ok([200,201].includes(a.status)); assert.ok([200,201].includes(b.status));
    const ar = await a.json() as { caseId:string }; const br = await b.json() as { caseId:string }; assert.equal(ar.caseId, br.caseId);
    assert.equal((await h.pool.query("SELECT id FROM company WHERE name='E4-C再送株式会社'")).rowCount, 1);
    assert.equal((await post({ ...body, activity: { ...body.activity, name: '別内容株式会社' } })).status, 409);
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

  test('analyzer failure rolls back Company, Contact, Activity, Case and Design v2 artifacts', async () => {
    const failing = new FreeDiagnosisDesignV2PersistenceRepo(h.pool, () => { throw new Error('injected analyzer failure'); });
    const service = new StaffProxyDesignV2SubmissionService(h.pool, new FreeDiagnosisDesignV2EntryAdapter(failing));
    await assert.rejects(service.submit(input('E4-Cロールバック株式会社'), 'operator@atlib.jp'), /injected analyzer failure/);
    assert.equal((await h.pool.query("SELECT id FROM company WHERE name='E4-Cロールバック株式会社'")).rowCount,0);
  });
});
