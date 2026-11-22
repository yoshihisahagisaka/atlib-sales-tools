import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { BusinessKaizenProxyService } from '../src/services/businessKaizenProxyService';
import { diagnoseBusinessKaizenSnapshot, type BusinessKaizenAnswers } from '../src/domain/businessKaizenDiagnosis';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
before(async () => { h = await createFreeDiagnosisRuleBasedV1Harness({ includeDesignV2: true, includeBusinessKaizen: true }); });
after(async () => { await h?.close(); });
const request = (path:string, method='GET', body?:unknown, auth=true) => fetch(h.url + path, {
  method, headers:{'Content-Type':'application/json', ...(auth ? {Cookie:h.staffCookie}:{})},
  body: body === undefined ? undefined : JSON.stringify(body), redirect:'manual',
});

async function activity(service:'BUSINESS_WEB'|'IT_KAIZEN'='BUSINESS_WEB', mismatched=false) {
  const companyId=randomUUID(), otherCompanyId=randomUUID(), contactId=randomUUID(), activityId=randomUUID();
  await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'Proxy Company','seed','owner@atlib.jp'),($2,'Other','seed','seed')`,[companyId,otherCompanyId]);
  await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Proxy Contact')`,[contactId,mismatched?otherCompanyId:companyId]);
  await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,$4,'seed','owner@atlib.jp')`,[activityId,companyId,contactId,service]);
  return {companyId,otherCompanyId,contactId,activityId};
}
const T05:BusinessKaizenAnswers={Q01:'MANAGER',Q02:['FIT_FOR_BUSINESS','SMOOTH_WORKFLOW','SHARED_INFORMATION'],Q03:'CONDITIONAL',Q04:2,Q05:2,Q06:2,Q07:3,Q08:1,Q09:2,Q10:2,Q11:1,Q12:['LOW_CODE_NO_CODE'],Q13:3,Q14:3,Q15:'CONNECTED'};
const T10:BusinessKaizenAnswers={Q01:'EXECUTIVE',Q02:['SHARED_INFORMATION','TRANSFERABLE_WORK','SCALABLE_OPERATION'],Q03:'OPEN',Q04:3,Q05:3,Q06:3,Q07:3,Q08:3,Q09:3,Q10:3,Q11:3,Q12:['EXCEL'],Q13:1,Q14:2,Q15:'UNKNOWN'};

test('staff auth, BUSINESS_WEB service and Contact membership fail closed without CRM growth',async()=>{
  assert.equal((await request('/api/admin/business-kaizen/diagnoses/proxy-drafts','POST',{salesActivityId:randomUUID()},false)).status,401);
  for(const record of [await activity('IT_KAIZEN'),await activity('BUSINESS_WEB',true)]){
    const before=await h.pool.query(`SELECT (SELECT count(*) FROM company)::int c,(SELECT count(*) FROM contact)::int t,(SELECT count(*) FROM sales_activity)::int a`);
    const response=await request('/api/admin/business-kaizen/diagnoses/proxy-drafts','POST',{salesActivityId:record.activityId});
    assert.equal(response.status,409);
    const after=await h.pool.query(`SELECT (SELECT count(*) FROM company)::int c,(SELECT count(*) FROM contact)::int t,(SELECT count(*) FROM sales_activity)::int a`);
    assert.deepEqual(after.rows[0],before.rows[0]);
  }
});

test('draft create/resume, partial replacement and optimistic revision',async()=>{
  const record=await activity(),first=await request('/api/admin/business-kaizen/diagnoses/proxy-drafts','POST',{salesActivityId:record.activityId});
  assert.equal(first.status,201);const created=await first.json() as any;
  const resumed=await request('/api/admin/business-kaizen/diagnoses/proxy-drafts','POST',{salesActivityId:record.activityId});
  assert.equal(resumed.status,200);assert.equal((await resumed.json() as any).diagnosisId,created.diagnosisId);
  const saved=await request(`/api/admin/business-kaizen/diagnoses/${created.diagnosisId}/draft-answers`,'PUT',{expectedRevision:1,answers:{Q01:'MANAGER',Q02:['UNKNOWN'],Q11:'N_A'}});
  assert.equal(saved.status,200);assert.equal((await saved.json() as any).revision,2);
  const conflict=await request(`/api/admin/business-kaizen/diagnoses/${created.diagnosisId}/draft-answers`,'PUT',{expectedRevision:1,answers:{Q01:'IT'}});
  assert.equal(conflict.status,409);
  assert.equal((await request(`/api/admin/business-kaizen/diagnoses/${created.diagnosisId}/draft-answers`,'PUT',{expectedRevision:2,answers:{Q99:'UNKNOWN'}})).status,400);
  assert.equal((await request(`/api/admin/business-kaizen/diagnoses/${created.diagnosisId}/draft-answers`,'PUT',{expectedRevision:2,answers:{Q02:['UNKNOWN','SMOOTH_WORKFLOW']}})).status,400);
  const detail=await (await request(`/api/admin/business-kaizen/diagnoses/${created.diagnosisId}`)).json() as any;
  assert.deepEqual(detail.currentAnswers,{Q01:'MANAGER',Q02:['UNKNOWN'],Q11:'N_A'});
  assert.equal(detail.companyName,'Proxy Company');assert.equal(detail.selectedService,'BUSINESS_WEB');assert.equal(detail.ownerUserEmail,'owner@atlib.jp');
  assert.equal((await request(`/api/admin/business-kaizen/diagnoses/${created.diagnosisId}/complete`,'POST',{expectedRevision:2,purposeConfirmed:true,privacyHandlingConfirmed:true,consentWordingVersion:'business_kaizen_staff_proxy_consent_v1'})).status,400);
});

for(const [name,answers] of [['T05',T05],['T10',T10]] as const)test(`${name} completes with the shared SELF snapshot and no ACCEPTED stage`,async()=>{
  const record=await activity();const draft=await (await request('/api/admin/business-kaizen/diagnoses/proxy-drafts','POST',{salesActivityId:record.activityId})).json() as any;
  const saved=await (await request(`/api/admin/business-kaizen/diagnoses/${draft.diagnosisId}/draft-answers`,'PUT',{expectedRevision:1,answers})).json() as any;
  const noConsent=await request(`/api/admin/business-kaizen/diagnoses/${draft.diagnosisId}/complete`,'POST',{expectedRevision:saved.revision,purposeConfirmed:false,privacyHandlingConfirmed:true,consentWordingVersion:'business_kaizen_staff_proxy_consent_v1'});assert.equal(noConsent.status,400);
  const complete=await request(`/api/admin/business-kaizen/diagnoses/${draft.diagnosisId}/complete`,'POST',{expectedRevision:saved.revision,purposeConfirmed:true,privacyHandlingConfirmed:true,consentWordingVersion:'business_kaizen_staff_proxy_consent_v1'});assert.equal(complete.status,200);const result=await complete.json() as any;
  assert.deepEqual(result.diagnosisSnapshot,diagnoseBusinessKaizenSnapshot(answers));
  const stored=await h.pool.query('SELECT original_answers,current_answers,input_state,revision FROM business_kaizen_diagnoses WHERE id=$1',[draft.diagnosisId]);
  assert.deepEqual(stored.rows[0].original_answers,answers);assert.deepEqual(stored.rows[0].current_answers,answers);assert.equal(stored.rows[0].input_state,'COMPLETED');
  assert.equal(Number((await h.pool.query('SELECT count(*) n FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1',[draft.diagnosisId])).rows[0].n),0);
  const completionAudit=(await h.pool.query(`SELECT actor_user_email,metadata_json FROM business_kaizen_diagnosis_audit WHERE diagnosis_id=$1 AND operation='DIAGNOSIS_COMPLETED'`,[draft.diagnosisId])).rows[0];
  assert.equal(completionAudit.actor_user_email,'operator@atlib.jp');
  assert.deepEqual(completionAudit.metadata_json,{consentWordingVersion:'business_kaizen_staff_proxy_consent_v1',privacyHandlingConfirmed:true,purposeConfirmed:true,fromRevision:2,toRevision:3});
  assert.equal(Object.hasOwn(completionAudit.metadata_json,'answers'),false);
  await assert.rejects(h.pool.query(`UPDATE business_kaizen_diagnosis_audit SET actor_user_email='changed@example.com' WHERE diagnosis_id=$1`,[draft.diagnosisId]),/diagnosis audit is append-only/);
  await assert.rejects(h.pool.query(`DELETE FROM business_kaizen_diagnosis_audit WHERE diagnosis_id=$1`,[draft.diagnosisId]),/diagnosis audit is append-only/);
  const retry=await request(`/api/admin/business-kaizen/diagnoses/${draft.diagnosisId}/complete`,'POST',{expectedRevision:saved.revision,purposeConfirmed:true,privacyHandlingConfirmed:true,consentWordingVersion:'business_kaizen_staff_proxy_consent_v1'});assert.equal(retry.status,200);assert.equal((await retry.json() as any).created,false);
  assert.equal((await request(`/api/admin/business-kaizen/diagnoses/${draft.diagnosisId}/draft-answers`,'PUT',{expectedRevision:result.revision,answers})).status,409);
});

test('analysis and completion-audit failures roll back completion and preserve Original NULL',async()=>{
  const record=await activity(),draft=await h.businessKaizenProxy.createOrResume(record.activityId,'operator@atlib.jp');
  await h.businessKaizenProxy.saveDraft(draft.diagnosisId,T05,1,'operator@atlib.jp');
  const failing=new BusinessKaizenProxyService(h.pool,()=>{throw new Error('analysis failure')});
  await assert.rejects(failing.complete(draft.diagnosisId,2,'operator@atlib.jp','business_kaizen_staff_proxy_consent_v1'),/analysis failure/);
  let row=(await h.pool.query('SELECT input_state,original_answers,revision FROM business_kaizen_diagnoses WHERE id=$1',[draft.diagnosisId])).rows[0];assert.deepEqual(row,{input_state:'DRAFT',original_answers:null,revision:2});
  await h.pool.query(`CREATE FUNCTION fail_bk_complete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='DIAGNOSIS_COMPLETED' THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END $$`);
  await h.pool.query(`CREATE TRIGGER fail_bk_complete_audit BEFORE INSERT ON business_kaizen_diagnosis_audit FOR EACH ROW EXECUTE FUNCTION fail_bk_complete_audit()`);
  await assert.rejects(h.businessKaizenProxy.complete(draft.diagnosisId,2,'operator@atlib.jp','business_kaizen_staff_proxy_consent_v1'),/audit failure/);
  row=(await h.pool.query('SELECT input_state,original_answers,revision FROM business_kaizen_diagnoses WHERE id=$1',[draft.diagnosisId])).rows[0];assert.deepEqual(row,{input_state:'DRAFT',original_answers:null,revision:2});
  await h.pool.query('DROP TRIGGER fail_bk_complete_audit ON business_kaizen_diagnosis_audit');await h.pool.query('DROP FUNCTION fail_bk_complete_audit()');
});
