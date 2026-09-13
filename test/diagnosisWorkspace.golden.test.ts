import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { completedCase,operator } from './support/preparationFixtures';
import { FakeInterviewProvider,interviewOutput,readyCase,startedCase } from './support/workspaceFixtures';
import { validateInterviewOutput,INTERVIEW_JSON_SCHEMA,interviewOutputSchema } from '../src/domain/diagnosisWorkspace';
import { buildInterviewAssistantContext,interviewSourceKeys,type InterviewContext } from '../src/services/interviewAssistantContext';
import { InterviewAssistantWorker } from '../src/services/interviewAssistantWorker';
import { AnthropicInterviewProvider } from '../src/services/interviewAssistantProvider';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;const provider=new FakeInterviewProvider();
before(async()=>{h=await createDiagnosisHarness(undefined,undefined,provider);});after(async()=>{await h?.close();});
const status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;
const read=(id:string)=>h.workspace.read(id,operator);
async function finish(id:string){await h.workspace.transition(id,operator,'FINISH',(await read(id)).version);}
async function run(id:string){await h.workspace.enqueue(id,operator,provider.provider,provider.model);await h.interviewWorker.tick();return read(id);}
async function post(id:string,path:string,body:unknown={},auth=true,header=true){return fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${id}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:h.staffCookie}:{}),...(header?{'X-Diagnosis-Command':'1'}:{})},body:JSON.stringify(body)});}

test('1–3,22: Human/state/version/confirmed Plan guards and customer token rejection',async()=>{
 const c=await completedCase(h);await assert.rejects(h.workspace.transition(c.id,operator,'START',1),status(409));
 const ready=await readyCase(h),d=await read(ready.id);
 await assert.rejects(h.workspace.transition(ready.id,ready.actor,'START',d.version),status(403));
 await assert.rejects(h.workspace.transition(ready.id,operator,'START',d.version-1),status(409));
 assert.equal((await post(ready.id,'/diagnosis/start',{expectedVersion:d.version},false)).status,401);
 const tokenResponse=await fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${ready.id}/diagnosis/start`,{method:'POST',headers:{Authorization:`Bearer ${ready.access_token}`,'Content-Type':'application/json','X-Diagnosis-Command':'1'},body:JSON.stringify({expectedVersion:d.version})});assert.equal(tokenResponse.status,401);
 assert.equal((await post(ready.id,'/diagnosis/start',{expectedVersion:d.version},true,false)).status,403);
 await h.db.query('UPDATE diagnosis_cases SET plan_confirmed_at=NULL WHERE id=$1',[ready.id]);
 await assert.rejects(h.workspace.transition(ready.id,operator,'START',d.version),status(409));
 await assert.rejects(h.workspace.read(randomUUID(),operator),status(404));
});

test('4–6,7: raw statements/notes/Transcript remain distinct, exact, traced, no automatic AI',async()=>{
 const c=await startedCase(h),calls=provider.calls;
 const transcript=await h.workspace.addSource(c.id,operator,'TRANSCRIPT',{content:'  顧客：分からない\n担当者：次回確認  '});
 const participant=(await read(c.id)).participants[0].id;
 const statement=await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'  IT環境は完全に把握できています  ',speaker_participant_id:participant,parent_source_record_id:transcript.id});
 await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'作業工程の内訳を次回確認したい'});
 await assert.rejects(h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'私の解釈',speaker_participant_id:participant}),status(422));
 await h.interviewWorker.tick();const d=await read(c.id);
 assert.equal(provider.calls,calls);assert.equal(d.executions.length,0);assert.equal(d.proposals.length,0);assert.equal((await h.db.query('SELECT id FROM diagnosis_insights')).rows.length,0);
 assert.equal(d.sources.find(s=>s.id===statement.id).content,'  IT環境は完全に把握できています  ');
 assert.deepEqual(d.sources.map(s=>s.source_type).sort(),['INTERVIEW_STATEMENT','OPERATOR_NOTE','TRANSCRIPT']);
 assert.equal(d.sources.find(s=>s.id===statement.id).parent_source_record_id,transcript.id);
 assert.ok(d.sources.every(s=>!('semantic_type' in s)));assert.equal(d.future.intent_status,'SURVEY_STATED');
 const tables=await h.db.query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);assert.ok(!tables.rows.some(r=>/^facts?$/.test(r.table_name)));
});

test('8–9,15–17,21,23: AI creates proposals only; Ask/Later/Unnecessary do not adopt semantics; unresolved finish',async()=>{
 const c=await startedCase(h);await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'分からない'});
 const before=await read(c.id);const d=await run(c.id);
 assert.equal(d.executions[0].status,'SUCCEEDED');assert.equal(d.proposals.length,5);assert.equal(d.diagnosis_status,'DIAGNOSIS_IN_PROGRESS');assert.equal(d.version,before.version);
 assert.deepEqual(d.sources,before.sources);assert.deepEqual(d.themes,before.themes);assert.deepEqual(d.plan_items,before.plan_items);assert.deepEqual(d.future,before.future);
 const original=d.proposals.map(p=>p.content_json);
 for(const [index,action] of [[0,'ASK'],[1,'LATER'],[2,'UNNECESSARY'],[4,'ASK']] as const)await h.workspace.resolve(c.id,d.proposals[index].id,operator,action);
 const resolved=await read(c.id);assert.deepEqual(resolved.proposals.map(p=>p.content_json),original);assert.deepEqual(resolved.themes,before.themes);assert.deepEqual(resolved.plan_items,before.plan_items);
 assert.equal(resolved.resolutions.length,4);assert.ok(resolved.proposals.some(p=>p.status==='UNDER_REVIEW'));
 await assert.rejects(h.workspace.resolve(c.id,d.proposals[0].id,operator,'ASK'),status(409));
 await assert.rejects(h.workspace.transition(c.id,c.actor,'FINISH',resolved.version),status(403));
 await finish(c.id);const done=await read(c.id);assert.equal(done.diagnosis_status,'HUMAN_REVIEW_REQUIRED');assert.equal(done.future.intent_status,'SURVEY_STATED');assert.ok(done.started_at&&done.completed_at);
 const ts=await h.db.query<{from_status:string;to_status:string;actor_user_id:string}>(`SELECT from_status,to_status,actor_user_id FROM case_transitions WHERE diagnosis_case_id=$1 AND command='FinishDiagnosis'`,[c.id]);assert.deepEqual(ts.rows[0],{from_status:'DIAGNOSIS_IN_PROGRESS',to_status:'HUMAN_REVIEW_REQUIRED',actor_user_id:operator.kind==='STAFF'?operator.userId:''});
 await assert.rejects(h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'終了後'}),status(409));
 assert.equal((await h.repo.getSurvey(c.id,c.actor)).survey.status,'SURVEY_COMPLETED');
});

test('10–13: strict output/source/theme schema and Evidence boundary, zero suggestions allowed',async()=>{
 const c=await startedCase(h);const client=await h.pool.connect();let context:InterviewContext;try{context=await buildInterviewAssistantContext(client,c.id);}finally{client.release();}
 const refs=interviewSourceKeys(context),themes=new Set(context.themes.map(t=>t.id));const valid=interviewOutput(context);
 assert.deepEqual(validateInterviewOutput({suggestions:[]},refs,themes),{suggestions:[]});
 for(const field of ['FACT','CONFIRMED_FACT','score','maturity','rating','final_root_cause','case_id','model','accurate','current','valid','verified','sufficient','service_recommendation']){
  assert.throws(()=>validateInterviewOutput({suggestions:[{...valid.suggestions[0],[field]:true}]},refs,themes));
 }
 for(const value of ['FACT','CONFIRMED_FACT','score','maturity','rating','Evidenceの正確性を確認する','台帳は最新です','台帳は妥当です','原因は人事連携です','CRMを導入すべきです','CRMを導入してください'])assert.throws(()=>validateInterviewOutput({suggestions:[{...valid.suggestions[0],text:value}]},refs,themes));
 assert.throws(()=>validateInterviewOutput({suggestions:[{...valid.suggestions[0],source_refs:[{source_ref_type:'SOURCE_RECORD',source_ref_id:randomUUID(),relation:'RELATED'}]}]},refs,themes));
 assert.throws(()=>validateInterviewOutput({suggestions:[{...valid.suggestions[0],related_theme_id:randomUUID()}]},refs,themes));
 provider.run=async()=>({suggestions:[{...valid.suggestions[0],related_theme_id:randomUUID()}]});assert.equal((await run(c.id)).executions[0].status,'FAILED');provider.run=async ctx=>interviewOutput(ctx);
});

test('14: provider failure/not configured/timeout permits raw recording and Human-only finish',async()=>{
 for(const mode of ['failure','missing','timeout']){
  const c=await startedCase(h);await h.workspace.enqueue(c.id,operator,'fake','test');
  const failing=new FakeInterviewProvider();failing.run=async()=>{if(mode==='timeout')return new Promise(()=>{});throw Error('private provider error');};
  const worker=new InterviewAssistantWorker(h.preparation,h.workspace,mode==='missing'?new AnthropicInterviewProvider():failing,10);await worker.tick();
  assert.equal((await read(c.id)).executions[0].status,'FAILED');await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'AIなしで確認を続ける'});await finish(c.id);assert.equal((await read(c.id)).diagnosis_status,'HUMAN_REVIEW_REQUIRED');
 }
});

test('18–19: voluntary Evidence existence only; evaluation fields rejected',async()=>{
 const c=await startedCase(h);
 for(const field of ['accurate','current','valid','verified','sufficient','accuracy','currentness','validity','operating','matches_reality'])assert.equal((await post(c.id,'/sources/evidence-existence',{content:'台帳が存在する',voluntarily_presented:true,[field]:true})).status,422);
 assert.equal((await post(c.id,'/sources/evidence-existence',{content:'台帳が存在する'})).status,422);
 assert.equal((await post(c.id,'/sources/evidence-existence',{content:'端末管理台帳が存在することを画面共有で確認した',voluntarily_presented:true})).status,201);
 const d=await read(c.id);assert.equal(d.sources[0].source_type,'DOCUMENT_EXISTENCE_OBSERVED');assert.equal(d.sources.length,1);assert.equal(d.proposals.length,0);
});

test('20: Future reconfirm is explicit, append-only version history, actor/time/source trace',async()=>{
 const c=await startedCase(h),before=await read(c.id);
 const source=await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'採用を増やせる会社を目指す'});
 assert.deepEqual((await read(c.id)).future,before.future);
 const input={statement:'採用を増やせる会社を目指す',time_horizon:'1年',source_record_id:source.id,expectedVersion:(await read(c.id)).version};
 await h.workspace.reconfirm(c.id,operator,input);const d=await read(c.id);
 assert.equal(d.future.intent_status,'INTERVIEW_RECONFIRMED');assert.equal(d.future.previous_future_id,before.future.id);assert.equal(d.future.source_ref_id,source.id);assert.equal(d.future.source_ref_type,'SOURCE_RECORD');assert.equal(d.future.version,2);assert.ok(d.future.reconfirmed_at);assert.equal(d.future_history.length,2);assert.equal(d.future_history[1].statement,before.future.statement);
 await assert.rejects(h.workspace.reconfirm(c.id,operator,input),status(409));
 const note=await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'私の解釈'});await assert.rejects(h.workspace.reconfirm(c.id,operator,{...input,source_record_id:note.id,expectedVersion:(await read(c.id)).version}),status(422));await finish(c.id);
});

test('cross-case source/speaker/parent/Future and resolution guarded at repo and FK',async()=>{
 const a=await startedCase(h),b=await startedCase(h);const source=await h.workspace.addSource(b.id,operator,'INTERVIEW_STATEMENT',{content:'別案件'});
 await assert.rejects(h.workspace.addSource(a.id,operator,'INTERVIEW_STATEMENT',{content:'不正',parent_source_record_id:source.id}),status(422));
 await assert.rejects(h.workspace.addSource(a.id,operator,'INTERVIEW_STATEMENT',{content:'不正',speaker_participant_id:(await read(b.id)).participants[0].id}),status(422));
 await assert.rejects(h.workspace.reconfirm(a.id,operator,{statement:'未来',time_horizon:null,source_record_id:source.id,expectedVersion:(await read(a.id)).version}),status(422));
 const p=(await run(b.id)).proposals[0];await assert.rejects(h.workspace.resolve(a.id,p.id,operator,'ASK'),status(404));
 await assert.rejects(h.db.query(`INSERT INTO ai_proposal_sources(ai_proposal_id,diagnosis_case_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,'SOURCE_RECORD',$3,'RELATED')`,[p.id,b.id,(await h.workspace.addSource(a.id,operator,'OPERATOR_NOTE',{content:'別'})).id]));
});

test('queue isolation, duplicate rejection, lease recovery and late AI after Finish',async()=>{
 const c=await startedCase(h),calls=provider.calls;await h.workspace.enqueue(c.id,operator,'fake','test');
 await h.worker.tick();assert.equal(provider.calls,calls);assert.equal((await read(c.id)).executions[0].status,'PENDING');
 await assert.rejects(h.workspace.enqueue(c.id,operator,'fake','test'),status(409));
 const e=await h.preparation.claimExecution<InterviewContext>('INTERVIEW_ASSISTANT');assert.ok(e);await finish(c.id);await h.workspace.finishExecution(e,interviewOutput(e.input_snapshot_json));
 assert.equal((await read(c.id)).executions[0].error_code,'CASE_STATE_CHANGED');assert.equal((await read(c.id)).proposals.length,0);
 const retry=await startedCase(h);await h.workspace.enqueue(retry.id,operator,'fake','test');const abandoned=await h.preparation.claimExecution<InterviewContext>('INTERVIEW_ASSISTANT');assert.ok(abandoned);
 await h.db.query(`UPDATE ai_executions SET lease_expires_at=now()-interval '1 minute' WHERE id=$1`,[abandoned.id]);await h.interviewWorker.tick();
 assert.equal((await read(retry.id)).executions[0].error_code,'AI_WORKER_INTERRUPTED');await h.workspace.finishExecution(abandoned,interviewOutput(abandoned.input_snapshot_json));assert.equal((await read(retry.id)).proposals.length,0);
 assert.equal((await run(retry.id)).executions[0].status,'SUCCEEDED');
});

test('bounded Context: raw excerpts, selected unresolved Preparation context, no secrets; separate Human additions',async()=>{
 const c=await startedCase(h);for(let i=0;i<22;i++)await h.workspace.addSource(c.id,operator,'TRANSCRIPT',{content:'原文'.repeat(2000)});
 const client=await h.pool.connect();let context:InterviewContext;try{context=await buildInterviewAssistantContext(client,c.id);}finally{client.release();}
 assert.equal(context.sources.length,20);assert.ok(context.sources.every(s=>s.content.length===2000&&s.is_excerpt));
 for(const secret of [c.access_token!,'private@example.test','operator@atlib.jp','staff_session','access_token','suggested_services'])assert.ok(!JSON.stringify(context).includes(secret));
 const before=await read(c.id);const theme=await h.workspace.addHumanItem(c.id,operator,'theme',{title:'追加テーマ',description:'',future_relation:'未来との関係'});
 await h.workspace.addHumanItem(c.id,operator,'plan',{text:'追加確認',purpose:'',item_type:'QUESTION',diagnosis_theme_id:theme.id});const d=await read(c.id);assert.deepEqual(d.plan_snapshot_json,before.plan_snapshot_json);assert.equal(d.themes.length,before.themes.length+1);assert.equal(d.sources[0].content.length,4000);
});

test('24–26: display names, safe read model and legacy regression',async()=>{
 const c=await readyCase(h),d=await read(c.id);assert.equal(d.organization_display_name,'ABC株式会社様');assert.equal(d.provider_display_name,'atLIB株式会社');
 const org=await h.db.query<{name:string}>('SELECT name FROM organizations o JOIN diagnosis_cases c ON c.organization_id=o.id WHERE c.id=$1',[c.id]);assert.equal(org.rows[0]!.name,'ABC株式会社');
 const legacy=await h.db.query('SELECT * FROM kaizen_diagnostics');assert.ok(legacy.rows.length);
 assert.ok(!/"(score|scores|maturity|radar|suggestedServices|actionHint)"/.test(JSON.stringify(d)));
});

test('Audit failure rolls back SourceRecord, Future history, resolution and Finish atomically',async()=>{
 const c=await startedCase(h),source=await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'目指す未来'});
 const before=await run(c.id);
 await h.db.exec(`CREATE FUNCTION fail_workspace_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command IN ('AddOperatorNote','ReconfirmFuture','ResolveInterviewSuggestion','FinishDiagnosis') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_workspace_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_workspace_audit();`);
 try {
  await assert.rejects(h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'取り消される'}));
  await assert.rejects(h.workspace.reconfirm(c.id,operator,{statement:'未来の再確認',time_horizon:null,source_record_id:source.id,expectedVersion:before.version}));
  await assert.rejects(h.workspace.resolve(c.id,before.proposals[0].id,operator,'ASK'));
  await assert.rejects(finish(c.id));
  const after=await read(c.id);assert.deepEqual(after,before);
 } finally {await h.db.exec('DROP TRIGGER fail_workspace_audit ON diagnosis_audit_logs; DROP FUNCTION fail_workspace_audit();');}
 await finish(c.id);assert.equal((await read(c.id)).diagnosis_status,'HUMAN_REVIEW_REQUIRED');
});

test('AI-02 rejects actual foreign Case references and isolates Preparation proposals',async()=>{
 const a=await startedCase(h),b=await startedCase(h);
 const foreign=await h.workspace.addSource(b.id,operator,'INTERVIEW_STATEMENT',{content:'別案件の発言'});
 const foreignTheme=(await read(b.id)).themes[0].id;
 provider.run=async ctx=>({suggestions:[{...interviewOutput(ctx).suggestions[0],source_refs:[{source_ref_type:'SOURCE_RECORD',source_ref_id:foreign.id,relation:'RELATED'}]}]});
 assert.equal((await run(a.id)).executions[0].error_code,'AI_SOURCE_REF_INVALID');
 provider.run=async ctx=>({suggestions:[{...interviewOutput(ctx).suggestions[0],related_theme_id:foreignTheme}]});
 assert.equal((await run(a.id)).executions[0].error_code,'AI_THEME_REF_INVALID');
 provider.run=async ctx=>interviewOutput(ctx);await run(a.id);
 assert.equal((await h.preparation.read(a.id,operator)).proposals.length,0);
 assert.equal((await h.preparation.read(a.id,operator)).executions.length,0);
});

test('AI-02 native JSON schema and strict Zod contract have matching fields',()=>{
 const json=INTERVIEW_JSON_SCHEMA.properties.suggestions as any;
 const zod=interviewOutputSchema.shape.suggestions.element;
 assert.equal(INTERVIEW_JSON_SCHEMA.additionalProperties,false);assert.equal(json.items.additionalProperties,false);
 assert.deepEqual(Object.keys(json.items.properties).sort(),Object.keys(zod.shape).sort());
 assert.deepEqual(json.items.required.sort(),Object.keys(zod.shape).sort());
 assert.equal(json.items.properties.source_refs.items.additionalProperties,false);
});

test('AI-02 live (explicit opt-in only)',{skip:process.env.RUN_DIAGNOSIS_AI_LIVE!=='1'||!process.env.ANTHROPIC_API_KEY},async()=>{
 const c=await startedCase(h),client=await h.pool.connect();let context:InterviewContext;try{context=await buildInterviewAssistantContext(client,c.id);}finally{client.release();}
 const live=new AnthropicInterviewProvider(process.env.ANTHROPIC_API_KEY);const raw=await live.suggest(context,new AbortController().signal);validateInterviewOutput(raw,interviewSourceKeys(context),new Set(context.themes.map(t=>t.id)));
});
