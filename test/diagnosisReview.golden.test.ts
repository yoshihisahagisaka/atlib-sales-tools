import assert from 'node:assert/strict';
import { before,after,beforeEach,test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { operator,completedCase } from './support/preparationFixtures';
import { startedCase } from './support/workspaceFixtures';
import { reviewCase,humanInsight,FakePostDiagnosisProvider,structurerOutput } from './support/reviewFixtures';
import { insightInputSchema,INSIGHT_TYPES,STRUCTURER_JSON_SCHEMA,insightFieldsSchema,validateStructurerOutput,type InsightInput } from '../src/domain/diagnosisReview';
import { buildPostDiagnosisContext,postDiagnosisSourceKeys,type PostDiagnosisContext } from '../src/services/postDiagnosisContext';
import { PostDiagnosisWorker } from '../src/services/postDiagnosisWorker';
import { AnthropicPostDiagnosisProvider } from '../src/services/postDiagnosisProvider';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;const provider=new FakePostDiagnosisProvider();
before(async()=>{h=await createDiagnosisHarness(undefined,undefined,undefined,provider);});after(async()=>{await h?.close();});beforeEach(()=>{provider.run=async c=>structurerOutput(c);});
const read=(id:string)=>h.review.read(id,operator),status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;
async function run(id:string){await h.review.enqueue(id,operator,provider.provider,provider.model);await h.postWorker.tick();return read(id);}
async function complete(id:string,leave=true){await h.review.complete(id,operator,(await read(id)).version,leave);}
async function post(id:string,path:string,body:unknown={},auth=true,header=true){return fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${id}/review${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:h.staffCookie}:{}),...(header?{'X-Diagnosis-Command':'1'}:{})},body:JSON.stringify(body)});}
async function context(id:string){const c=await h.pool.connect();try{return await buildPostDiagnosisContext(c,id);}finally{c.release();}}

test('1–2: AI-03 stores proposals and separate assessment candidates only, no authoritative mutation',async()=>{
 const c=await reviewCase(h),before=await h.workspace.read(c.id,operator),d=await run(c.id);
 assert.equal(d.executions[0].status,'SUCCEEDED');assert.equal(d.diagnosis_status,'HUMAN_REVIEW_REQUIRED');assert.equal(d.version,before.version);assert.equal(d.approved_insights.length,0);assert.equal(d.assessment_confirmation_items.length,0);assert.equal(d.proposals.length,7);assert.equal(d.executions[0].assessment_candidates.length,1);
 const after=await h.workspace.read(c.id,operator);assert.deepEqual(after,before);assert.equal(d.reviews.length,0);assert.ok(d.proposals.every(p=>INSIGHT_TYPES.includes(p.proposal_type)));
});

test('3–7: strict enum/fields/UNKNOWN/source/theme/index schema with real foreign Case',async()=>{
 const c=await reviewCase(h),other=await reviewCase(h),ctx=await context(c.id),good=structurerOutput(ctx),sources=postDiagnosisSourceKeys(ctx),themes=new Set(ctx.themes.map(t=>t.id));
 for(const type of ['FACT','CONFIRMED_FACT','DECISION','ASSESSMENT_CONFIRMATION_ITEM']){assert.ok(!INSIGHT_TYPES.includes(type as any));assert.equal(insightInputSchema.safeParse({...good.insight_candidates[0],semantic_type:type}).success,false);assert.throws(()=>validateStructurerOutput({...good,insight_candidates:[{...good.insight_candidates[0],semantic_type:type}]},sources,themes));}
 for(const field of ['score','maturity','rating','final_root_cause','case_id','model','verified','accuracy','currentness','validity','decision'])assert.throws(()=>validateStructurerOutput({...good,insight_candidates:[{...good.insight_candidates[0],[field]:true}]},sources,themes));
 assert.throws(()=>validateStructurerOutput({...good,insight_candidates:[{...good.insight_candidates[0],semantic_type:'UNKNOWN',unknown_type:null}]},sources,themes));
 const foreign=(await h.workspace.read(other.id,operator)).themes[0].id;
 for(const candidate of [{...good.insight_candidates[0],diagnosis_theme_id:foreign},{...good.insight_candidates[0],source_refs:[{source_ref_type:'SOURCE_RECORD',source_ref_id:other.source.id,relation:'RELATED'}]}])assert.throws(()=>validateStructurerOutput({...good,insight_candidates:[candidate]},sources,themes));
 assert.throws(()=>validateStructurerOutput({...good,assessment_confirmation_items:[{...good.assessment_confirmation_items[0],related_candidate_index:99}]},sources,themes));
 provider.run=async()=>({...good,insight_candidates:[{...good.insight_candidates[0],diagnosis_theme_id:foreign}]});assert.equal((await run(c.id)).executions[0].status,'FAILED');
});

test('8–12: Approve preserves Hypothesis; Edit keeps AI original; Convert UNKNOWN; Reject creates no Insight',async()=>{
 const c=await reviewCase(h),d=await run(c.id),hypothesis=d.proposals.find(p=>p.proposal_type==='HYPOTHESIS'),observation=d.proposals.find(p=>p.proposal_type==='OBSERVATION'),gap=d.proposals.find(p=>p.proposal_type==='GAP_CANDIDATE'),root=d.proposals.find(p=>p.proposal_type==='ROOT_CAUSE_HYPOTHESIS');
 await h.review.resolve(c.id,hypothesis.id,operator,'APPROVE','原文を確認した');
 await h.review.resolve(c.id,observation.id,operator,'APPROVE_WITH_EDIT','表現を確認',{...observation.content_json,content:'台帳の存在が対話で記録されている'});
 await h.review.resolve(c.id,gap.id,operator,'CONVERT_TO_UNKNOWN','追加確認が必要',undefined,'CONTRADICTORY');
 await h.review.resolve(c.id,root.id,operator,'REJECT','今回のContextでは採用しない');
 const result=await read(c.id);assert.equal(result.approved_insights.length,3);assert.equal(result.approved_insights.find(i=>i.source_ai_proposal_id===hypothesis.id).semantic_type,'HYPOTHESIS');assert.equal(result.approved_insights.find(i=>i.source_ai_proposal_id===gap.id).unknown_type,'CONTRADICTORY');assert.ok(result.approved_insights.every(i=>i.review_status==='HUMAN_APPROVED'&&i.source_refs.length));
 assert.deepEqual(result.proposals.map(p=>p.content_json),d.proposals.map(p=>p.content_json));assert.equal(result.reviews.length,4);
 await assert.rejects(h.review.resolve(c.id,root.id,operator,'APPROVE',''),status(409));assert.equal(result.approved_insights.some(i=>i.source_ai_proposal_id===root.id),false);
});

test('13–16,24: Human-only and failed AI Review completes with UNKNOWN and SURVEY_STATED; zero Insight allowed',async()=>{
 for(const fail of [false,true]){const c=await reviewCase(h);if(fail){provider.run=async()=>{throw Error('offline secret');};assert.equal((await run(c.id)).executions[0].status,'FAILED');}
  await h.review.createInsight(c.id,operator,humanInsight(c.source.id),'未確認を残す');await complete(c.id,false);const d=await read(c.id);assert.equal(d.diagnosis_status,'REPORT_REVIEW_REQUIRED');assert.equal(d.approved_insights[0].unknown_type,'UNRESOLVED');assert.equal((await h.review.reportContext(c.id,operator)).future.intent_status,'SURVEY_STATED');assert.ok(d.review_completed_at);}
 const empty=await reviewCase(h);await complete(empty.id,false);assert.equal((await read(empty.id)).approved_insights.length,0);
});

test('17–18: Evidence observation is existence only; assessment candidate is a separate Human-created entity',async()=>{
 const c=await reviewCase(h),d=await run(c.id),observation=d.proposals.find(p=>p.proposal_type==='OBSERVATION'),evidence=d.proposals.find(p=>p.proposal_type==='EVIDENCE_CANDIDATE');
 await h.review.resolve(c.id,observation.id,operator,'APPROVE','存在だけを確認');const accepted=await h.review.resolve(c.id,evidence.id,operator,'APPROVE','');
 const input={title:'台帳の更新方法を確認',purpose:'Assessmentで正確性・最新性を確認する必要がある',priority:1,diagnosis_theme_id:null,related_insight_id:null,related_evidence_candidate_id:accepted!.id,source_ai_proposal_id:evidence.id,source_ai_execution_id:d.executions[0].id,source_candidate_index:0};
 await h.review.createAssessment(c.id,operator,input);const result=await read(c.id);assert.equal(result.assessment_confirmation_items.length,1);assert.equal(result.approved_insights.length,2);assert.equal(result.assessment_confirmation_items[0].status,'OPEN');
 await assert.rejects(h.review.createAssessment(c.id,operator,input),status(409));
 for(const content of ['台帳は最新です','台帳は正確である','台帳は実態と一致している','台帳は十分です'])await assert.rejects(h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),semantic_type:'OBSERVATION',unknown_type:null,content}),status(422));
 assert.equal((await post(c.id,'/insights',{insight:{...humanInsight(c.source.id),validity:true}})).status,422);
});

test('19: same-Case source/theme/Insight/assessment links required at repository and DB',async()=>{
 const a=await reviewCase(h),b=await reviewCase(h),foreign=await h.review.createInsight(b.id,operator,humanInsight(b.source.id));
 await assert.rejects(h.review.createInsight(a.id,operator,humanInsight(b.source.id)),status(422));
 await assert.rejects(h.review.createInsight(a.id,operator,{...humanInsight(a.source.id),diagnosis_theme_id:(await h.workspace.read(b.id,operator)).themes[0].id}),status(422));
 const input={title:'確認',purpose:'Assessmentで確認する',priority:1,diagnosis_theme_id:null,related_insight_id:foreign.id,related_evidence_candidate_id:null,source_ai_proposal_id:null,source_ai_execution_id:null,source_candidate_index:null};await assert.rejects(h.review.createAssessment(a.id,operator,input),status(422));
 const local=await h.review.createInsight(a.id,operator,humanInsight(a.source.id));await assert.rejects(h.db.query(`INSERT INTO insight_sources(diagnosis_insight_id,diagnosis_case_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,'SOURCE_RECORD',$3,'RELATED')`,[local.id,a.id,b.source.id]));
 const survey=(await h.repo.getSurvey(a.id,a.actor)).responses[0]!;await h.review.createInsight(a.id,operator,{...humanInsight(a.source.id),source_refs:[{source_ref_type:'SURVEY_RESPONSE',source_ref_id:survey.id,relation:'RELATED'}]});
});

test('20,28: Supersede retains old content/version/refs and report context excludes non-approved history',async()=>{
 const c=await reviewCase(h),old=await h.review.createInsight(c.id,operator,humanInsight(c.source.id));
 const replacement=await h.review.supersede(c.id,old.id,operator,{...humanInsight(c.source.id),content:'担当者と引継ぎ方法は未確認'},'範囲を明確化');
 const d=await read(c.id);assert.equal(d.approved_insights.length,1);assert.equal(d.approved_insights[0].id,replacement.id);assert.equal(d.approved_insights[0].version,2);assert.equal(d.approved_insights[0].previous_insight_id,old.id);assert.equal(d.insight_history.find(i=>i.id===old.id).content,humanInsight(c.source.id).content);
 assert.equal(d.insight_history.find(i=>i.id===old.id).review_status,'SUPERSEDED');assert.equal((await h.db.query('SELECT * FROM insight_sources WHERE diagnosis_insight_id=$1',[old.id])).rows.length,1);
 await assert.rejects(h.review.supersede(c.id,old.id,operator,humanInsight(c.source.id),''),status(409));
 for(const state of ['DRAFT','REJECTED']){const hidden=await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),title:state});await h.db.query('UPDATE diagnosis_insights SET review_status=$2 WHERE id=$1',[hidden.id,state]);}
 const report=await h.review.reportContext(c.id,operator);assert.deepEqual(report.insights.map(i=>i.id),[replacement.id]);assert.ok(!('sources' in report)&&!('proposals' in report));await complete(c.id,false);
});

test('21–23: state, staff, customer token, command-header and cross-site guards',async()=>{
 const c=await reviewCase(h),early=await completedCase(h);
 await assert.rejects(h.review.enqueue(early.id,operator,'fake','test'),status(409));await assert.rejects(h.review.createInsight(early.id,operator,humanInsight(c.source.id)),status(409));
 await assert.rejects(h.review.createInsight(c.id,c.actor,humanInsight(c.source.id)),status(403));await assert.rejects(h.review.complete(c.id,c.actor,(await read(c.id)).version,false),status(403));
 assert.equal((await post(c.id,'/ai/run',{},false)).status,401);assert.equal((await post(c.id,'/ai/run',{},true,false)).status,403);
 const url=`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/review`;
 assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${c.access_token}`}})).status,401);
 assert.equal((await fetch(url+'/ai/run',{method:'POST',headers:{Cookie:h.staffCookie,'X-Diagnosis-Command':'1','Sec-Fetch-Site':'cross-site'}})).status,403);
 await assert.rejects(h.review.read(randomUUID(),operator),status(404));await complete(c.id,false);
 await assert.rejects(h.review.createInsight(c.id,operator,humanInsight(c.source.id)),status(409));await assert.rejects(h.review.enqueue(c.id,operator,'fake','test'),status(409));
});

test('25: INTERVIEW_RECONFIRMED Future remains intention through Review completion',async()=>{
 const c=await startedCase(h),source=await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'採用を増やせる会社'});
 await h.workspace.reconfirm(c.id,operator,{statement:'採用を増やせる会社',time_horizon:null,source_record_id:source.id,expectedVersion:(await h.workspace.read(c.id,operator)).version});await h.workspace.transition(c.id,operator,'FINISH',(await h.workspace.read(c.id,operator)).version);
 await h.review.createInsight(c.id,operator,humanInsight(source.id));await complete(c.id,false);assert.equal((await h.review.reportContext(c.id,operator)).future.intent_status,'INTERVIEW_RECONFIRMED');
});

test('26–27: AI process queues are isolated; duplicates and late results cannot change completed Review',async()=>{
 const c=await reviewCase(h);await h.review.enqueue(c.id,operator,'fake','test');await h.worker.tick();await h.interviewWorker.tick();assert.equal((await read(c.id)).executions[0].status,'PENDING');
 await assert.rejects(h.review.enqueue(c.id,operator,'fake','test'),status(409));const e=await h.preparation.claimExecution<PostDiagnosisContext>('POST_DIAGNOSIS_STRUCTURER');assert.ok(e);await complete(c.id,true);await h.review.finishExecution(e,structurerOutput(e.input_snapshot_json));assert.equal((await read(c.id)).executions[0].error_code,'CASE_STATE_CHANGED');assert.equal((await read(c.id)).proposals.length,0);
 const ai1=await completedCase(h);await h.preparation.enqueue(ai1.id,operator,'fake','test');await h.postWorker.tick();assert.equal((await h.preparation.read(ai1.id,operator)).executions[0].status,'PENDING');await h.worker.tick();
 const ai2=await startedCase(h);await h.workspace.enqueue(ai2.id,operator,'fake','test');await h.postWorker.tick();assert.equal((await h.workspace.read(ai2.id,operator)).executions[0].status,'PENDING');await h.interviewWorker.tick();
});

test('Unreviewed proposals/candidates require explicit leave choice; no count or success minimum',async()=>{
 const c=await reviewCase(h);await run(c.id);const before=await read(c.id);await assert.rejects(h.review.complete(c.id,operator,before.version,false),status(422));await assert.rejects(h.review.complete(c.id,operator,before.version-1,true),status(409));await complete(c.id,true);
 const audit=await h.db.query<{detail_json:any}>(`SELECT detail_json FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command='CompleteHumanReview'`,[c.id]);assert.equal(audit.rows[0]!.detail_json.leave_unreviewed,true);assert.equal(audit.rows[0]!.detail_json.pending.proposal_ids.length,7);
});

test('Audit failure atomically rolls back approval, supersede and Review completion',async()=>{
 const c=await reviewCase(h),d=await run(c.id),old=await h.review.createInsight(c.id,operator,humanInsight(c.source.id));const before=await read(c.id);
 await h.db.exec(`CREATE FUNCTION fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command IN ('ApproveAIProposal','SupersedeInsight','CompleteHumanReview') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_review_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_review_audit();`);
 try{await assert.rejects(h.review.resolve(c.id,d.proposals[0].id,operator,'APPROVE',''));await assert.rejects(h.review.supersede(c.id,old.id,operator,humanInsight(c.source.id),''));await assert.rejects(complete(c.id,true));assert.deepEqual(await read(c.id),before);}finally{await h.db.exec('DROP TRIGGER fail_review_audit ON diagnosis_audit_logs; DROP FUNCTION fail_review_audit();');}
});

test('Context whitelist/excerpts, strict JSON schema parity and forbidden DB enums',async()=>{
 const c=await reviewCase(h);
 await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),content:'HUMAN_REVIEW_ONLY_NOT_AI_INPUT'});
 const ctx=await context(c.id),json=JSON.stringify(ctx);assert.ok(!json.includes('HUMAN_REVIEW_ONLY_NOT_AI_INPUT'));
 for(const secret of [c.access_token!,'private@example.test','operator@atlib.jp','access_token','staff_session','suggested_services','diagnosis_insights'])assert.ok(!json.includes(secret));assert.ok(ctx.sources.length<=20);assert.ok(ctx.sources.every(s=>s.content.length<=2000));
 const shape=(STRUCTURER_JSON_SCHEMA.properties.insight_candidates as any).items;assert.deepEqual(Object.keys(shape.properties).sort(),Object.keys(insightFieldsSchema.shape).sort());assert.equal(shape.additionalProperties,false);assert.equal(STRUCTURER_JSON_SCHEMA.additionalProperties,false);
 const constraints=await h.db.query<{definition:string}>(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='diagnosis_insights'::regclass AND contype='c'`);assert.ok(!/CONFIRMED_FACT|'FACT'|'DECISION'/.test(constraints.rows.map(r=>r.definition).join('')));
});

test('DB rejects forbidden Insight semantics and missing UNKNOWN type even outside the API',async()=>{
 const c=await reviewCase(h),i=await h.review.createInsight(c.id,operator,humanInsight(c.source.id));
 for(const semantic of ['FACT','CONFIRMED_FACT','DECISION','ASSESSMENT_CONFIRMATION_ITEM']){
  await assert.rejects(h.db.query('UPDATE diagnosis_insights SET semantic_type=$2,unknown_type=NULL WHERE id=$1',[i.id,semantic]));
  await assert.rejects(h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),semantic_type:semantic as any}),status(422));
 }
 await assert.rejects(h.db.query('UPDATE diagnosis_insights SET unknown_type=NULL WHERE id=$1',[i.id]));
 assert.equal((await read(c.id)).approved_insights[0].unknown_type,'UNRESOLVED');
});

test('Provider timeout/missing config and interrupted lease support Human-only recovery',async()=>{
 for(const mode of ['timeout','missing','interrupted']){const c=await reviewCase(h);await h.review.enqueue(c.id,operator,'fake','test');
  if(mode==='interrupted'){const e=await h.preparation.claimExecution<PostDiagnosisContext>('POST_DIAGNOSIS_STRUCTURER');await h.db.query(`UPDATE ai_executions SET lease_expires_at=now()-interval '1 minute' WHERE id=$1`,[e!.id]);await h.postWorker.tick();}
  else{const p=new FakePostDiagnosisProvider();p.run=async()=>new Promise(()=>{});await new PostDiagnosisWorker(h.preparation,h.review,mode==='missing'?new AnthropicPostDiagnosisProvider():p,10).tick();}
  assert.equal((await read(c.id)).executions[0].status,'FAILED');await complete(c.id,false);assert.equal((await read(c.id)).diagnosis_status,'REPORT_REVIEW_REQUIRED');}
});

test('AI-03 live (explicit opt-in)',{skip:process.env.RUN_DIAGNOSIS_AI_LIVE!=='1'||!process.env.ANTHROPIC_API_KEY},async()=>{const c=await reviewCase(h),ctx=await context(c.id),p=new AnthropicPostDiagnosisProvider(process.env.ANTHROPIC_API_KEY);validateStructurerOutput(await p.structure(ctx,new AbortController().signal),postDiagnosisSourceKeys(ctx),new Set(ctx.themes.map(t=>t.id)));});
