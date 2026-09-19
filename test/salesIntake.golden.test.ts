import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator} from './support/preparationFixtures';
import {salesRecord,salesConsentScenario} from './support/salesIntakeScenario';
import {SalesIntakeRepo} from '../src/services/salesIntakeRepo';
import {SURVEY_QUESTIONS,SURVEY_VERSION,type Actor} from '../src/domain/itManagementDiagnosis';
import {RetentionDeletionWorker} from '../src/services/retentionDeletionWorker';
import {buildDeletionReconciliationManifest,reconcileDeletionManifest} from '../src/services/deletionReconciliation';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>,repo:SalesIntakeRepo;
before(async()=>{h=await createDiagnosisHarness();repo=new SalesIntakeRepo(h.pool);});after(async()=>{await h?.close();});
const status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;
test('SL-A2/A3: pre-consent creates no Case; three classes and original provenance survive an exactly-once consent handoff',async()=>{await salesConsentScenario(h.pool);});
test('SL-A2: explicit consent, stale protection, frozen linked record and staff/AI authority guards',async()=>{
 const d=await repo.save(operator,salesRecord),changed=await repo.save(operator,{...salesRecord,unknowns:['確認が必要']},d.id,d.version);
 await assert.rejects(repo.consentAndStart(d.id,operator,{expectedVersion:d.version,customerAgreed:true,customerReference:'顧客役'}),status(409));
 await assert.rejects(repo.consentAndStart(d.id,operator,{expectedVersion:changed.version,customerAgreed:false,customerReference:'顧客役'}),status(422));
 for(const actor of [{kind:'CUSTOMER',token:'test'},{kind:'AI',userId:'ai'}] as unknown as Actor[]){await assert.rejects(repo.read(d.id,actor),status(403));await assert.rejects(repo.save(actor,salesRecord),status(403));await assert.rejects(repo.consentAndStart(d.id,actor,{}),status(403));}
 await assert.rejects(h.repo.createCase(salesRecord.customer,'SALES_VISIT',operator),status(409));
 await repo.consentAndStart(d.id,operator,{expectedVersion:changed.version,customerAgreed:true,customerReference:'顧客役'});
 await assert.rejects(repo.save(operator,salesRecord,d.id,changed.version+1),status(409));
});
test('SL-A2: audit failure rolls consent, Case, answers and link back atomically',async()=>{
 const d=await repo.save(operator,salesRecord),before=await h.pool.query('SELECT id FROM diagnosis_cases ORDER BY id');
 await h.db.exec(`CREATE FUNCTION reject_sales_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='ConsentAndStartDiagnosis' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_sales_consent BEFORE INSERT ON sales_intake_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_sales_consent();`);
 try{await assert.rejects(repo.consentAndStart(d.id,operator,{expectedVersion:d.version,customerAgreed:true,customerReference:'顧客役'}),/synthetic audit failure/);}finally{await h.db.exec('DROP TRIGGER reject_sales_consent ON sales_intake_audit_logs; DROP FUNCTION reject_sales_consent();');}
 const row=await repo.read(d.id,operator);assert.equal(row.consent_state,'NOT_RECORDED');assert.equal(row.consent_recorded_at,null);assert.equal(row.diagnosis_case_id,null);assert.deepEqual((await h.pool.query('SELECT id FROM diagnosis_cases ORDER BY id')).rows,before.rows);
});
test('SL-A3: incomplete contact can be saved, typed UNKNOWN differs from empty, canonical Survey v2 only',async()=>{
 const d=await repo.save(operator,{...salesRecord,customer:{companyName:'会話のみ',contactName:'',email:''},customerStatements:[],surveyAnswers:{}});
 assert.deepEqual((await repo.read(d.id,operator)).unknowns,salesRecord.unknowns);
 await assert.rejects(repo.save(operator,{...salesRecord,unknowns:null}),status(422));await assert.rejects(repo.save(operator,{...salesRecord,surveyAnswers:{Q11_NEW:'invented'}}),status(422));
 await assert.rejects(repo.consentAndStart(d.id,operator,{expectedVersion:d.version,customerAgreed:true,customerReference:'顧客役'}),status(422));assert.equal((await repo.read(d.id,operator)).consent_state,'NOT_RECORDED');
 assert.equal(SURVEY_VERSION,2);assert.equal(SURVEY_QUESTIONS.length,10);assert.deepEqual(SURVEY_QUESTIONS.map(q=>q.display_order),[1,2,3,4,5,6,7,8,9,10]);
});
test('SL-A2: HTTP staff-only, command/cross-site guards and source read are enforced',async()=>{
 const base=h.url+'/api/admin/it-management-diagnosis',call=(path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal((await call('/sales-intakes')).status,401);assert.equal((await call('/sales-intakes','POST',salesRecord,{cookie:h.staffCookie})).status,403);
 const headers={cookie:h.staffCookie,'X-Diagnosis-Command':'1'};assert.equal((await call('/sales-intakes','POST',salesRecord,{...headers,'Sec-Fetch-Site':'cross-site'})).status,403);
 const res=await call('/sales-intakes','POST',salesRecord,headers);assert.equal(res.status,201);const d=await res.json() as {id:string;version:number};
 const record=await call(`/sales-intakes/${d.id}`,'GET',undefined,headers);assert.equal(record.headers.get('cache-control'),'no-store');assert.equal((await record.json() as {diagnosis_case_id:string|null}).diagnosis_case_id,null);
 assert.equal((await call(`/cases/${randomUUID()}/sales-conversation`,'GET',undefined,headers)).status,404);
 assert.equal((await call(`/sales-intakes/${d.id}/consent-and-start`,'POST',{expectedVersion:d.version,customerAgreed:true,customerReference:'顧客役'},headers)).status,200);
});
test('SL-A3: linked raw intake follows approved deletion and restore reconciliation without deleting consent provenance',async()=>{
 const {intakeId,caseId}=await salesConsentScenario(h.pool),original=await repo.read(intakeId,operator);
 const req=await h.repo.createDeletionRequest(caseId,operator,'synthetic deletion');await h.repo.scopeDeletionRequest(caseId,req.id,operator,['GENERAL_RAW_DIAGNOSIS']);await h.repo.decideDeletionRequest(caseId,req.id,operator,'APPROVE','Human');await new RetentionDeletionWorker(h.pool).executeApprovedRequest(caseId,req.id,'operator@atlib.jp');
 const deleted=await repo.read(intakeId,operator);assert.ok(deleted.raw_redacted_at);assert.deepEqual(deleted.unknowns,[]);assert.deepEqual(deleted.customer_json,{});assert.equal(deleted.consent_recorded_by_user_id,original.consent_recorded_by_user_id);
 const manifest=await buildDeletionReconciliationManifest(h.pool);assert.ok(manifest.entries.some(e=>e.target_kind==='SALES_INTAKE_RAW'&&e.target_id===intakeId));
 await h.pool.query('UPDATE sales_conversation_intakes SET customer_json=$2,unknowns=$3,raw_redacted_at=NULL WHERE id=$1',[intakeId,JSON.stringify(original.customer_json),JSON.stringify(original.unknowns)]);
 await reconcileDeletionManifest(h.pool,manifest,'operator@atlib.jp','APPLY');assert.deepEqual((await repo.read(intakeId,operator)).unknowns,[]);
});
