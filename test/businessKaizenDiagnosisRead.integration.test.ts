import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';
import { diagnoseBusinessKaizenSnapshot, type BusinessKaizenAnswers } from '../src/domain/businessKaizenDiagnosis';

let h: Awaited<ReturnType<typeof createFreeDiagnosisRuleBasedV1Harness>>;
let selfDiagnosisId:string, selfLeadId:string, oldLeadId:string, draftDiagnosisId:string, completedDiagnosisId:string;
const answers:BusinessKaizenAnswers={Q01:'MANAGER',Q02:['FIT_FOR_BUSINESS','SMOOTH_WORKFLOW','SHARED_INFORMATION'],Q03:'CONDITIONAL',Q04:2,Q05:2,Q06:2,Q07:3,Q08:1,Q09:2,Q10:2,Q11:1,Q12:['LOW_CODE_NO_CODE'],Q13:3,Q14:3,Q15:'CONNECTED'};
const snapshot=diagnoseBusinessKaizenSnapshot(answers);
const request=(path:string,auth=true)=>fetch(h.url+path,{headers:auth?{Cookie:h.staffCookie}:{}});

async function lead(id:string,company:string,person:string,utm:string){
  await h.pool.query(`INSERT INTO business_web_consultation_leads
    (id,company_name,person_name,email,privacy_consent,diagnosis_transfer_consent,consent_wording_version,idempotency_key,diagnosis_snapshot,preparation_result,utm_source,cta_source,landing_url,referrer)
    VALUES($1,$2,$3,'self@example.test',true,true,'v1',$4,$5,'{}',$6,'self-check','https://self.example/landing','https://self.example/referrer')`,
    [id,company,person,randomUUID(),JSON.stringify(snapshot),utm]);
}
async function proxy(companyName:string,contactName:string,completed:boolean){
  const companyId=randomUUID(),contactId=randomUUID(),activityId=randomUUID();
  await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,$2,'seed','proxy-owner@atlib.jp')`,[companyId,companyName]);
  await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,$3)`,[contactId,companyId,contactName]);
  await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id,acquisition_source_type,acquisition_source_name,utm_source,landing_url,referrer)
    VALUES($1,$2,$3,'BUSINESS_WEB','seed','proxy-owner@atlib.jp','REFERRAL','Partner A','proxy-source','https://proxy.example/landing','https://proxy.example/referrer')`,[activityId,companyId,contactId]);
  const diagnosis=await h.businessKaizenProxy.createOrResume(activityId,'operator@atlib.jp');
  if(completed){await h.businessKaizenProxy.saveDraft(diagnosis.diagnosisId,answers,1,'operator@atlib.jp');await h.businessKaizenProxy.complete(diagnosis.diagnosisId,2,'operator@atlib.jp','business_kaizen_staff_proxy_consent_v1');await h.pool.query(`UPDATE business_kaizen_diagnoses SET current_stage='PROPOSED',outcome='WON' WHERE id=$1`,[diagnosis.diagnosisId]);}
  return diagnosis.diagnosisId;
}

before(async()=>{
  h=await createFreeDiagnosisRuleBasedV1Harness({includeDesignV2:true,includeBusinessKaizen:true});
  selfLeadId=randomUUID();oldLeadId=randomUUID();selfDiagnosisId=randomUUID();
  await lead(selfLeadId,'Self Company','Self Person','self-source');await lead(oldLeadId,'Historical Lead Without Diagnosis','Old Person','old-source');
  await h.pool.query(`INSERT INTO business_kaizen_diagnoses
    (id,entry_channel,input_state,consultation_lead_id,owner_user_email,original_answers,current_answers,diagnosis_snapshot,current_stage,completed_at)
    VALUES($1,'CUSTOMER_SELF','COMPLETED',$2,'self-owner@atlib.jp',$3,$3,$4,'ACCEPTED',now())`,[selfDiagnosisId,selfLeadId,JSON.stringify(answers),JSON.stringify(snapshot)]);
  draftDiagnosisId=await proxy('Proxy Draft Company','Proxy Draft Person',false);
  completedDiagnosisId=await proxy('Proxy Complete Company','Proxy Complete Person',true);
  await h.pool.query(`UPDATE business_kaizen_diagnoses SET updated_at='2026-11-22T00:00:00Z'`);
});
after(async()=>{await h?.close()});

test('list unifies SELF and PROXY without creating or cross-linking source records',async()=>{
  assert.equal((await request('/api/admin/business-kaizen/diagnoses',false)).status,401);
  const before=(await h.pool.query(`SELECT (SELECT count(*) FROM company)::int company,(SELECT count(*) FROM contact)::int contact,(SELECT count(*) FROM sales_activity)::int activity,(SELECT count(*) FROM business_web_consultation_leads)::int lead,(SELECT count(*) FROM business_kaizen_diagnoses)::int diagnosis`)).rows[0];
  const response=await request('/api/admin/business-kaizen/diagnoses?limit=10');assert.equal(response.status,200);const body=await response.json() as any;
  assert.equal(body.items.length,3);assert.deepEqual(body.items.map((item:any)=>item.diagnosisId),[selfDiagnosisId,draftDiagnosisId,completedDiagnosisId].sort().reverse());
  const self=body.items.find((item:any)=>item.diagnosisId===selfDiagnosisId),draft=body.items.find((item:any)=>item.diagnosisId===draftDiagnosisId),completed=body.items.find((item:any)=>item.diagnosisId===completedDiagnosisId);
  assert.deepEqual({company:self.companyName,contact:self.contactName,channel:self.entryChannel,stage:self.currentStage,lead:self.consultationLeadId,activity:self.salesActivityId},{company:'Self Company',contact:'Self Person',channel:'CUSTOMER_SELF',stage:'ACCEPTED',lead:selfLeadId,activity:null});
  assert.deepEqual({company:draft.companyName,contact:draft.contactName,state:draft.inputState},{company:'Proxy Draft Company',contact:'Proxy Draft Person',state:'DRAFT'});
  assert.deepEqual({state:completed.inputState,stage:completed.currentStage,outcome:completed.outcome,owner:completed.ownerUserEmail},{state:'COMPLETED',stage:'PROPOSED',outcome:'WON',owner:'proxy-owner@atlib.jp'});
  assert.equal(body.items.some((item:any)=>item.consultationLeadId===oldLeadId),false);
  const after=(await h.pool.query(`SELECT (SELECT count(*) FROM company)::int company,(SELECT count(*) FROM contact)::int contact,(SELECT count(*) FROM sales_activity)::int activity,(SELECT count(*) FROM business_web_consultation_leads)::int lead,(SELECT count(*) FROM business_kaizen_diagnoses)::int diagnosis`)).rows[0];assert.deepEqual(after,before);
});

test('detail selects identity and attribution only from the entry-channel source',async()=>{
  const self=await (await request(`/api/admin/business-kaizen/diagnoses/${selfDiagnosisId}`)).json() as any;
  assert.equal(self.companyName,'Self Company');assert.equal(self.contactName,'Self Person');assert.equal(self.consultationLeadId,selfLeadId);assert.equal(self.salesActivityId,null);assert.equal(self.companyId,null);assert.equal(self.attribution.utmSource,'self-source');assert.equal(self.attribution.acquisitionSourceType,undefined);assert.deepEqual(self.originalAnswers,answers);assert.deepEqual(self.diagnosisSnapshot,snapshot);
  const proxy=await (await request(`/api/admin/business-kaizen/diagnoses/${completedDiagnosisId}`)).json() as any;
  assert.equal(proxy.companyName,'Proxy Complete Company');assert.equal(proxy.contactName,'Proxy Complete Person');assert.ok(proxy.salesActivityId);assert.equal(proxy.consultationLeadId,null);assert.equal(proxy.selectedService,'BUSINESS_WEB');assert.equal(proxy.attribution.utmSource,'proxy-source');assert.equal(proxy.attribution.acquisitionSourceType,'REFERRAL');assert.equal(proxy.attribution.ctaSource,undefined);
  assert.equal((await request(`/api/admin/business-kaizen/diagnoses/${randomUUID()}`)).status,404);
});

test('validated filters, stable paging and limits use Diagnosis fields',async()=>{
  const cases:[string,(item:any)=>boolean][]=[
    ['companyName=Proxy%20Draft',item=>item.diagnosisId===draftDiagnosisId],
    ['owner=self-owner%40atlib.jp',item=>item.diagnosisId===selfDiagnosisId],
    ['entryChannel=CUSTOMER_SELF',item=>item.diagnosisId===selfDiagnosisId],
    ['currentStage=PROPOSED',item=>item.diagnosisId===completedDiagnosisId],
  ];
  for(const [query,matches] of cases){const body=await (await request(`/api/admin/business-kaizen/diagnoses?${query}`)).json() as any;assert.equal(body.items.length,1);assert.ok(matches(body.items[0]));}
  const page1=await (await request('/api/admin/business-kaizen/diagnoses?limit=2&page=1')).json() as any,page2=await (await request('/api/admin/business-kaizen/diagnoses?limit=2&page=2')).json() as any;
  assert.equal(page1.items.length,2);assert.equal(page1.hasNext,true);assert.equal(page2.items.length,1);assert.equal(page2.hasNext,false);assert.equal(new Set([...page1.items,...page2.items].map((item:any)=>item.diagnosisId)).size,3);
  for(const query of ['entryChannel=INVALID','currentStage=INVALID','limit=101','page=0','companyName='])assert.equal((await request(`/api/admin/business-kaizen/diagnoses?${query}`)).status,400);
});
