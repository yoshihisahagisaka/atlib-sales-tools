import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator,completedCase} from './support/preparationFixtures';
import {progressiveReuseScenario,reuseSalesCase} from './support/progressiveReuseScenario';
import {reviewCase,humanInsight} from './support/reviewFixtures';
import {startedCase} from './support/workspaceFixtures';
import {RetentionDeletionWorker} from '../src/services/retentionDeletionWorker';
import type {Actor} from '../src/domain/itManagementDiagnosis';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});after(async()=>{await h?.close();});
test('SL-A4: separated reuse -> Human plan -> workspace source -> existing review, without FACT promotion',async()=>{await progressiveReuseScenario(h.pool);});
test('SL-A4: Web/intake provenance, explicit unknown/missing and read purity',async()=>{
 const web=await completedCase(h),sales=await reuseSalesCase(h.pool,false);
 const before=(await h.pool.query('SELECT version FROM diagnosis_cases WHERE id=$1',[web.id])).rows;
 const w=await h.preparation.readReuse(web.id,operator),s=await h.preparation.readReuse(sales.id,operator);
 assert.ok(w.known.some(e=>e.origin_label==='Web回答'&&e.question_code==='Q04_IT_VISIBILITY'));
 assert.ok(s.known.some(e=>e.origin_label==='営業での聞き取り（開始前の回答）'));
 assert.ok(s.unknown.some(e=>e.origin.kind==='SURVEY_QUESTION'));assert.ok(s.unknown.some(e=>e.origin.kind==='SURVEY_RESPONSE'));
 assert.deepEqual((await h.pool.query('SELECT version FROM diagnosis_cases WHERE id=$1',[web.id])).rows,before);
 assert.equal(w.candidates.some(e=>e.question_code==='Q04_IT_VISIBILITY'),false);assert.equal(w.candidates.some(e=>e.question_code==='Q10_FREE_COMMENT'),false);
});
test('SL-A4: UNKNOWN subtypes remain explicit; NOT_REQUIRED_NOW is not automatically a candidate',async()=>{
 const c=await reviewCase(h);
 for(const unknown_type of ['NOT_YET_CONFIRMED','UNRESOLVED','CONTRADICTORY','NOT_REQUIRED_NOW'] as const)await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),unknown_type});
 const d=await h.preparation.readReuse(c.id,operator);
 for(const type of ['NOT_YET_CONFIRMED','UNRESOLVED','CONTRADICTORY','NOT_REQUIRED_NOW'])assert.ok(d.unknown.some(e=>e.unknown_type===type));
 assert.equal(d.candidates.some(e=>e.unknown_type==='NOT_REQUIRED_NOW'),false);
});
test('SL-A4: stale selection, same-case boundaries, cancellation and audit rollback',async()=>{
 const c=await reuseSalesCase(h.pool);await h.preparation.start(c.id,operator);const m=await h.preparation.readReuse(c.id,operator),e=m.candidates[0]!;
 const input={text:'今回確認する内容',purpose:'人が確認する',item_type:'CONFIRMATION' as const,diagnosis_theme_id:null};
 await assert.rejects(h.preparation.selectReuse(c.id,operator,e.key,m.version-1,input),/更新/);
 await assert.rejects(h.preparation.selectReuse(c.id,operator,'insight:'+randomUUID(),m.version,input),/候補/);
 await h.db.exec("CREATE FUNCTION reject_reuse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='SelectReuseConfirmation' THEN RAISE EXCEPTION 'reuse audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_reuse BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_reuse();");
 try{await assert.rejects(h.preparation.selectReuse(c.id,operator,e.key,m.version,input),/reuse audit failure/);}finally{await h.db.exec('DROP TRIGGER reject_reuse ON diagnosis_audit_logs; DROP FUNCTION reject_reuse();');}
 assert.equal((await h.preparation.readReuse(c.id,operator)).plans.length,0);
 const plan=await h.preparation.selectReuse(c.id,operator,e.key,m.version,input);await h.preparation.remove(c.id,plan.id,operator,'plan-items');
 assert.equal((await h.preparation.readReuse(c.id,operator)).candidates.find(c=>c.key===e.key)?.selected_plan_id,null);
 const other=await startedCase(h);
 await assert.rejects(h.workspace.addSource(other.id,operator,'INTERVIEW_STATEMENT',{content:'別案件'},plan.id),/同じ案件/);
});
test('SL-A4: staff-only read/commands, AI rejection and command/cross-site gates',async()=>{
 const c=await completedCase(h),base=h.url+'/api/admin/it-management-diagnosis/cases/'+c.id;
 assert.equal((await fetch(base+'/progressive-reuse')).status,401);
 const auth={Cookie:h.staffCookie,'Content-Type':'application/json'};
 const r=await fetch(base+'/progressive-reuse',{headers:auth});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/progressive-reuse/select',{method:'POST',headers:auth,body:'{}'})).status,403);
 assert.equal((await fetch(base+'/progressive-reuse/select',{method:'POST',headers:{...auth,'X-Diagnosis-Command':'1','Sec-Fetch-Site':'cross-site'},body:'{}'})).status,403);
 for(const actor of [{kind:'CUSTOMER',token:''},{kind:'AI',userId:'AI'}] as unknown as Actor[]){await assert.rejects(h.preparation.readReuse(c.id,actor));await assert.rejects(h.preparation.selectReuse(c.id,actor,'invalid',1,{text:'不正な操作',purpose:'',item_type:'QUESTION',diagnosis_theme_id:null}));}
});
test('SL-A4: redacted original data is not reconstructed as answers or missing questions',async()=>{
 const c=await reuseSalesCase(h.pool),before=await h.preparation.readReuse(c.id,operator);
 const req=await h.repo.createDeletionRequest(c.id,operator,'synthetic deletion');await h.repo.scopeDeletionRequest(c.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS']);await h.repo.decideDeletionRequest(c.id,req.id,operator,'APPROVE','Human');await new RetentionDeletionWorker(h.pool).executeApprovedRequest(c.id,req.id,'operator@atlib.jp');
 const after=await h.preparation.readReuse(c.id,operator);assert.equal(after.intake_redacted,true);assert.deepEqual(after.known,[]);assert.deepEqual(after.hypotheses,[]);assert.deepEqual(after.candidates,[]);
 assert.ok(before.known.length>0);
});
