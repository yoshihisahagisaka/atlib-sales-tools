import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { FakePreparationProvider,completedCase,operator,validOutput } from './support/preparationFixtures';
import { ORGANIZER_JSON_SCHEMA, organizerOutputSchema,validateOrganizerOutput } from '../src/domain/diagnosisPreparation';
import { SURVEY_QUESTIONS, SURVEY_VERSION } from '../src/domain/itManagementDiagnosis';
import { PreDiagnosisWorker } from '../src/services/preDiagnosisWorker';
import { AnthropicPreDiagnosisProvider } from '../src/services/preDiagnosisProvider';

const provider=new FakePreparationProvider();
let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{ h=await createDiagnosisHarness(undefined,provider); });
after(async()=>{ await h?.close(); });
async function run(id:string) { const e=await h.preparation.enqueue(id,operator,provider.provider,provider.model); await h.worker.tick(); return e; }
const themeInput={title:'人間が選んだテーマ',description:'ヒアリングで確認する',future_relation:'顧客の未来との関係'};
const planInput={text:'どの情報が判断に必要ですか？',purpose:'対話で確認',item_type:'QUESTION' as const,diagnosis_theme_id:null};
async function humanPlan(id:string) { await h.preparation.addTheme(id,operator,themeInput); await h.preparation.addPlan(id,operator,planInput); }
const statusError=(status:number)=>(e:unknown)=>!!e && (e as {status:number}).status===status;
async function post(id:string,suffix:string,body:unknown={},auth=true,header=true,token?:string) {
  return fetch(`${h.url}/api/admin/it-management-diagnosis/cases/${id}/preparation${suffix}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:h.staffCookie}:{}),...(header?{'X-Diagnosis-Command':'1'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
}

test('AI-01: 非同期execution成功→提案のみ保存、Case状態・Theme・Plan・Future意味は不変',async()=>{
  const c=await completedCase(h); const before=await h.repo.getSurvey(c.id,operator);
  const e=await run(c.id); const data=await h.preparation.read(c.id,operator);
  assert.equal(data.executions[0].status,'SUCCEEDED'); assert.equal(data.executions[0].validation_status,'VALID');
  assert.equal(data.diagnosis_status,'SURVEY_COMPLETED'); assert.equal(data.themes.length,0); assert.equal(data.plan_items.length,0);
  assert.deepEqual(data.proposals.map(p=>p.proposal_type).sort(),['THEME','UNKNOWN','HYPOTHESIS','QUESTION','EVIDENCE_CANDIDATE'].sort());
  assert.ok(data.proposals.every(p=>p.status==='GENERATED' && p.sources.length));
  assert.equal((await h.repo.getSurvey(c.id,operator)).responses.length,before.responses.length);
  assert.equal((await h.db.query('SELECT * FROM case_transitions WHERE diagnosis_case_id=$1',[c.id])).rows.length,3);
  const execution=await h.db.query<{input_snapshot_json:object;raw_output_json:object}>('SELECT input_snapshot_json,raw_output_json FROM ai_executions WHERE id=$1',[e.execution_id]);
  const context=JSON.stringify(execution.rows[0]!.input_snapshot_json);
  for (const forbidden of [c.access_token!,'private@example.test','PRIVATE_PHONE','access_token','staff_session','suggested_services','scores']) assert.ok(!context.includes(forbidden));
  assert.ok(context.includes('SURVEY_STATED')); assert.ok(context.includes('完全に把握')); assert.ok(context.includes('分からない'));
  assert.ok(execution.rows[0]!.raw_output_json);
  await assert.rejects(h.preparation.accept(c.id,data.proposals[0].id,operator),statusError(409));
});

test('Human Gate: 編集採用でもAI原文維持、別提案の質問/Evidence採用、手動追加・並べ替え・確定',async()=>{
  const c=await completedCase(h); await run(c.id); await h.preparation.start(c.id,operator);
  let data=await h.preparation.read(c.id,operator); assert.equal(data.diagnosis_status,'PREPARATION_IN_PROGRESS');
  const p=data.proposals.find(p=>p.proposal_type==='THEME'); const original=p.content_json;
  const t=await h.preparation.accept(c.id,p.id,operator,themeInput);
  data=await h.preparation.read(c.id,operator);
  assert.equal(data.themes[0].title,themeInput.title); assert.equal(data.proposals.find(x=>x.id===p.id).status,'ACCEPTED_WITH_EDIT');
  assert.deepEqual(data.proposals.find(x=>x.id===p.id).content_json,original);
  const question=data.proposals.find(p=>p.proposal_type==='QUESTION'); await h.preparation.accept(c.id,question.id,operator);
  const evidence=data.proposals.find(p=>p.proposal_type==='EVIDENCE_CANDIDATE'); await h.preparation.accept(c.id,evidence.id,operator);
  const rejected=data.proposals.find(p=>p.proposal_type==='HYPOTHESIS'); await h.preparation.reject(c.id,rejected.id,operator);
  await assert.rejects(h.preparation.accept(c.id,rejected.id,operator),statusError(409));
  await assert.rejects(h.preparation.accept(c.id,question.id,operator),statusError(409));
  await h.preparation.addTheme(c.id,operator,{...themeInput,title:'第二テーマ'});
  await h.preparation.addPlan(c.id,operator,{...planInput,diagnosis_theme_id:t.id});
  data=await h.preparation.read(c.id,operator);
  assert.equal(data.plan_items.find(i=>i.source_ai_proposal_id===evidence.id).item_type,'EVIDENCE_CANDIDATE_CHECK');
  assert.equal(data.plan_items.some(i=>i.source_ai_proposal_id===rejected.id),false);
  const oldVersion=data.version;
  const ids=data.themes.map(t=>t.id).reverse(); await h.preparation.reorder(c.id,operator,ids,data.plan_items.map(p=>p.id).reverse());
  await assert.rejects(h.preparation.confirm(c.id,operator,oldVersion),statusError(409));
  data=await h.preparation.read(c.id,operator); assert.deepEqual(data.themes.map(t=>t.id),ids);
  await h.preparation.confirm(c.id,operator,data.version);
  data=await h.preparation.read(c.id,operator);
  assert.equal(data.diagnosis_status,'READY_FOR_DIAGNOSIS'); assert.equal(data.plan_confirmed_by_user_id,'operator@atlib.jp');
  assert.ok(data.plan_snapshot_json); assert.deepEqual(data.plan_snapshot_json.themes.map((t:{id:string})=>t.id),ids);
  assert.equal((await h.repo.getSurvey(c.id,c.actor)).survey.status,'SURVEY_COMPLETED');
  assert.equal((await h.db.query<{intent_status:string}>('SELECT intent_status FROM diagnosis_futures WHERE diagnosis_case_id=$1',[c.id])).rows[0]!.intent_status,'SURVEY_STATED');
  await assert.rejects(h.preparation.addTheme(c.id,operator,themeInput),statusError(409));
  await assert.rejects(h.preparation.enqueue(c.id,operator,'fake','test'),statusError(409));
  const audit=await h.db.query<{actor_user_id:string}>('SELECT actor_user_id FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command=$2',[c.id,'ConfirmDiagnosisPlan']);
  assert.equal(audit.rows[0]!.actor_user_id,'operator@atlib.jp');
});

test('reject ThemeはTheme生成なし、他Case提案・テーマ参照・不正並び替えを拒否',async()=>{
  const a=await completedCase(h),b=await completedCase(h); await run(a.id); await h.preparation.start(a.id,operator); await h.preparation.start(b.id,operator);
  const p=(await h.preparation.read(a.id,operator)).proposals.find(p=>p.proposal_type==='THEME');
  await assert.rejects(h.preparation.accept(b.id,p.id,operator),statusError(404));
  await h.preparation.reject(a.id,p.id,operator); await assert.rejects(h.preparation.accept(a.id,p.id,operator,themeInput),statusError(409));
  assert.equal((await h.preparation.read(a.id,operator)).themes.length,0);
  const t=await h.preparation.addTheme(a.id,operator,themeInput);
  await assert.rejects(h.preparation.addPlan(b.id,operator,{...planInput,diagnosis_theme_id:t.id}),statusError(422));
  await assert.rejects(h.preparation.reorder(a.id,operator,[t.id,t.id],[]),statusError(422));
  await h.preparation.update(a.id,t.id,operator,'themes',{...themeInput,title:'編集したテーマ'});
  await h.preparation.remove(a.id,t.id,operator,'themes');
  assert.equal((await h.preparation.read(a.id,operator)).themes.length,0);
});

test('AI未実行でもFAILEDでもHuman-onlyでREADY、空のPlanは422',async()=>{
  for(const fail of [false,true]) {
    const c=await completedCase(h);
    if(fail) { provider.run=async()=>{throw new Error('SECRET_PROVIDER_ERROR');}; await run(c.id); assert.equal((await h.preparation.read(c.id,operator)).executions[0].status,'FAILED'); }
    await h.preparation.start(c.id,operator);
    let data=await h.preparation.read(c.id,operator); await assert.rejects(h.preparation.confirm(c.id,operator,data.version),statusError(422));
    await humanPlan(c.id); data=await h.preparation.read(c.id,operator); await h.preparation.confirm(c.id,operator,data.version);
    assert.equal((await h.preparation.read(c.id,operator)).diagnosis_status,'READY_FOR_DIAGNOSIS');
  }
  provider.run=async context=>validOutput(context);
});

test('構造化出力: FACT/CONFIRMED_FACT/score/maturity/rating/metadata/不正source/Evidence評価を拒否',async()=>{
  const c=await completedCase(h); const e=await h.preparation.enqueue(c.id,operator,'fake','test');
  const snapshot=await h.db.query<{input_snapshot_json:Parameters<typeof validOutput>[0]}>('SELECT input_snapshot_json FROM ai_executions WHERE id=$1',[e.execution_id]);
  const context=snapshot.rows[0]!.input_snapshot_json; const refs=new Set(context.responses.map(r=>r.id));
  const valid=validOutput(context);
  for(const key of ['FACT','CONFIRMED_FACT','score','maturity','rating','final_root_cause','case_id','generated_at','model','prompt_version']) {
    const output=structuredClone(valid); Object.assign(output.themes[0]!,{[key]:'bad'});
    assert.throws(()=>validateOrganizerOutput(output,refs));
  }
  const invalid=structuredClone(valid); invalid.themes[0]!.available_context[0]!.source_refs[0]!.source_ref_id=randomUUID();
  assert.throws(()=>validateOrganizerOutput(invalid,refs));
  const evidence=structuredClone(valid); evidence.themes[0]!.evidence_candidates[0]!.text='台帳は最新で正確です'; assert.throws(()=>validateOrganizerOutput(evidence,refs));
  const missing=structuredClone(valid) as any; delete missing.themes[0].unknowns[0].unknown_type; assert.throws(()=>validateOrganizerOutput(missing,refs));
  const assertion=structuredClone(valid); assertion.themes[0]!.hypotheses[0]!.text='原因は管理不足です'; assert.throws(()=>validateOrganizerOutput(assertion,refs));
  provider.run=async()=>invalid; await h.worker.tick();
  const result=await h.preparation.read(c.id,operator); assert.equal(result.executions[0].error_code,'AI_SOURCE_REF_INVALID'); assert.equal(result.proposals.length,0);
  assert.equal(result.diagnosis_status,'SURVEY_COMPLETED');
  provider.run=async context=>validOutput(context);
});

test('AI output schemaは追加field不許可、JSON schemaとzodの構造が一致',()=>{
  function compare(json:any,zod:any) {
    if(json.type==='object') { assert.equal(json.additionalProperties,false); assert.deepEqual(Object.keys(json.properties).sort(),Object.keys(zod.shape).sort()); assert.deepEqual([...json.required].sort(),Object.keys(zod.shape).sort());
      for(const key of Object.keys(json.properties)) compare(json.properties[key],zod.shape[key]); }
    if(json.type==='array') compare(json.items,zod.element);
  }
  compare(ORGANIZER_JSON_SCHEMA,organizerOutputSchema);
  assert.doesNotMatch(JSON.stringify(ORGANIZER_JSON_SCHEMA),/FACT|CONFIRMED_FACT|score|maturity|rating|final_root_cause/);
});

test('Provider timeout・未設定・worker中断をFAILEDで保持し、retryは新Execution',async()=>{
  const c=await completedCase(h); const first=await h.preparation.enqueue(c.id,operator,'fake','test');
  provider.run=async()=>new Promise(()=>{});
  await new PreDiagnosisWorker(h.preparation,provider,5).tick();
  assert.equal((await h.preparation.read(c.id,operator)).executions[0].error_code,'AI_TIMEOUT');
  const second=await h.preparation.enqueue(c.id,operator,'anthropic','test');
  await new PreDiagnosisWorker(h.preparation,new AnthropicPreDiagnosisProvider()).tick();
  assert.notEqual(second.execution_id,first.execution_id);
  assert.equal((await h.preparation.read(c.id,operator)).executions[0].error_code,'AI_NOT_CONFIGURED');
  await h.preparation.enqueue(c.id,operator,'fake','test'); await h.preparation.claimExecution();
  await h.db.query(`UPDATE ai_executions SET lease_expires_at=now()-interval '1 second' WHERE diagnosis_case_id=$1 AND status='RUNNING'`,[c.id]);
  await h.preparation.claimExecution();
  assert.equal((await h.preparation.read(c.id,operator)).executions[0].error_code,'AI_WORKER_INTERRUPTED');
  provider.run=async context=>validOutput(context);
});

test('遅延AI出力は確定済みPlanを変更せず、同時runは重複作成しない',async()=>{
  const c=await completedCase(h); await h.preparation.enqueue(c.id,operator,'fake','test');
  await assert.rejects(h.preparation.enqueue(c.id,operator,'fake','test'),statusError(409));
  const execution=await h.preparation.claimExecution(); assert.ok(execution);
  await h.preparation.start(c.id,operator); await humanPlan(c.id);
  const data=await h.preparation.read(c.id,operator); await h.preparation.confirm(c.id,operator,data.version);
  await h.preparation.finishExecution(execution,validOutput(execution.input_snapshot_json),validOutput(execution.input_snapshot_json));
  const finished=await h.preparation.read(c.id,operator); assert.equal(finished.executions[0].error_code,'CASE_STATE_CHANGED'); assert.equal(finished.proposals.length,0);
  assert.equal(finished.diagnosis_status,'READY_FOR_DIAGNOSIS');
});

test('API: staff auth/command header必須、顧客token不可、202を返して非同期実行',async()=>{
  const c=await completedCase(h);
  for(const suffix of ['/start','/ai/run','/confirm','/themes','/plan-items']) {
    assert.equal((await post(c.id,suffix,{},false,true,c.access_token)).status,401);
    assert.equal((await post(c.id,suffix,{},true,false)).status,403);
  }
  await assert.rejects(h.preparation.confirm(c.id,c.actor,1),statusError(403));
  const response=await post(c.id,'/ai/run'); assert.equal(response.status,202);
  for(let i=0;i<100;i++) { if((await h.preparation.read(c.id,operator)).executions[0]?.status==='SUCCEEDED') break; await new Promise(r=>setTimeout(r,10)); }
  assert.equal((await h.preparation.read(c.id,operator)).executions[0].status,'SUCCEEDED');
  assert.equal((await post(c.id,'/start')).status,204);
  const p=(await h.preparation.read(c.id,operator)).proposals.find(p=>p.proposal_type==='THEME');
  assert.equal((await post(c.id,`/proposals/${p.id}/accept`)).status,201);
  assert.equal((await post(c.id,'/plan-items',planInput)).status,201);
  const data=await h.preparation.read(c.id,operator);
  assert.equal((await post(c.id,'/confirm',{expectedVersion:data.version})).status,204);
  const logs=h.logs.join(''); for(const text of [c.access_token!,'SECRET_PROVIDER_ERROR','完全に把握','private@example.test']) assert.ok(!logs.includes(text));
});

test('Survey v2はSSOT文書26の固定snapshotと一致、SourceRecord/FACTテーブルを追加しない',async()=>{
  const canonical=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/diagnosisSurveyV2Canonical.json'),'utf8'));
  assert.equal(canonical.survey_version,SURVEY_VERSION); assert.deepEqual(canonical.questions,SURVEY_QUESTIONS);
  const tables=await h.db.query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
  assert.ok(!tables.rows.some(r=>/^(facts|diagnosis_insights|source_records)$/.test(r.table_name)));
});

test('AI live adapter (opt-in)',{skip:process.env.RUN_DIAGNOSIS_AI_LIVE==='1' && process.env.ANTHROPIC_API_KEY ? false : 'RUN_DIAGNOSIS_AI_LIVE / API key未設定'},async()=>{
  const c=await completedCase(h); await h.preparation.enqueue(c.id,operator,'anthropic','claude-sonnet-5');
  await new PreDiagnosisWorker(h.preparation,new AnthropicPreDiagnosisProvider(process.env.ANTHROPIC_API_KEY)).tick();
  assert.equal((await h.preparation.read(c.id,operator)).executions[0].status,'SUCCEEDED');
});

test('採用Audit失敗は提案状態・Themeをrollbackし、確定Audit失敗はREADYとsnapshotをrollback',async()=>{
  const c=await completedCase(h); await run(c.id); await h.preparation.start(c.id,operator);
  const proposal=(await h.preparation.read(c.id,operator)).proposals.find(p=>p.proposal_type==='THEME');
  await h.db.exec(`CREATE FUNCTION fail_preparation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.command IN ('AcceptAIProposal','ConfirmDiagnosisPlan') THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_preparation BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_preparation_audit();`);
  try {
    await assert.rejects(h.preparation.accept(c.id,proposal.id,operator));
    let data=await h.preparation.read(c.id,operator); assert.equal(data.themes.length,0); assert.equal(data.proposals.find(p=>p.id===proposal.id).status,'GENERATED');
    await humanPlan(c.id); data=await h.preparation.read(c.id,operator); await assert.rejects(h.preparation.confirm(c.id,operator,data.version));
    data=await h.preparation.read(c.id,operator); assert.equal(data.diagnosis_status,'PREPARATION_IN_PROGRESS'); assert.equal(data.plan_snapshot_json,null);
  } finally { await h.db.exec('DROP TRIGGER fail_preparation ON diagnosis_audit_logs; DROP FUNCTION fail_preparation_audit();'); }
});
