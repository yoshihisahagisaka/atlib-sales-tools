import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {runMigrations} from '../src/db/migrate';
import {ItManagementDiagnosisRepo} from '../src/services/itManagementDiagnosisRepo';
import {DiagnosisPreparationRepo} from '../src/services/diagnosisPreparationRepo';
import {DiagnosisWorkspaceRepo} from '../src/services/diagnosisWorkspaceRepo';
import {DiagnosisReviewRepo} from '../src/services/diagnosisReviewRepo';
import {DiagnosisReportRepo} from '../src/services/diagnosisReportRepo';
import {DiagnosisAssessmentRepo} from '../src/services/diagnosisAssessmentRepo';
import {PreDiagnosisWorker} from '../src/services/preDiagnosisWorker';
import {InterviewAssistantWorker} from '../src/services/interviewAssistantWorker';
import {PostDiagnosisWorker} from '../src/services/postDiagnosisWorker';
import {ReportDraftWorker} from '../src/services/reportDraftWorker';
import {AnthropicPreDiagnosisProvider} from '../src/services/preDiagnosisProvider';
import {AnthropicInterviewProvider} from '../src/services/interviewAssistantProvider';
import {AnthropicPostDiagnosisProvider} from '../src/services/postDiagnosisProvider';
import {AnthropicReportDraftProvider} from '../src/services/reportDraftProvider';
import {SURVEY_QUESTIONS,type Actor} from '../src/domain/itManagementDiagnosis';
import {FakePreparationProvider,operator,completedCase} from './support/preparationFixtures';
import {FakeInterviewProvider} from './support/workspaceFixtures';
import {FakePostDiagnosisProvider,humanInsight} from './support/reviewFixtures';
import {FakeReportProvider,reportCase} from './support/reportFixtures';
import type {createDiagnosisHarness} from './support/diagnosisHarness';
const dir=path.resolve(__dirname,'../migrations');
const config={host:'127.0.0.1',port:55436,database:'readiness',user:'postgres',max:5,connectionTimeoutMillis:5000};
// Intentionally fixed loopback/disposable DB. Cannot be pointed at customer DB via environment.
async function setup(migrate=true){const admin=new Pool(config),schema='readiness_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({...config,options:`-c search_path=${schema},public`}),other=new Pool({...config,options:`-c search_path=${schema},public`});
 const services={repo:new ItManagementDiagnosisRepo(pool),preparation:new DiagnosisPreparationRepo(pool),workspace:new DiagnosisWorkspaceRepo(pool),review:new DiagnosisReviewRepo(pool),report:new DiagnosisReportRepo(pool),assessment:new DiagnosisAssessmentRepo(pool),pool};
 if(migrate)await runMigrations(pool,dir);return {pool,other,s:services,h:services as Awaited<ReturnType<typeof createDiagnosisHarness>>,close:async()=>{await pool.end();await other.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}};
}
test('Real PostgreSQL readiness: migrations, multi-connection concurrency, WEB / SALES_VISIT', {skip:process.env.RUN_READINESS_PG!=='1'?'BLOCKED_EXTERNAL: explicit disposable PostgreSQL required':false,timeout:180000},async t=>{
 await t.test('empty DB / simultaneous runners / schema ledger / additive legacy upgrade / rollback / rerun',async()=>{
  const x=await setup(false),temp=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-migrations-'));try{
   for(const f of fs.readdirSync(dir).filter(f=>/^00[1-6]_.*\.sql$/.test(f)))fs.copyFileSync(path.join(dir,f),path.join(temp,f));await runMigrations(x.pool,temp);
   await x.pool.query(`INSERT INTO kaizen_diagnostics(input_source,company_name,question_set_version,answers,scores,suggested_services) VALUES('prospect','Legacy Rehearsal','legacy','[]','{}','[]')`);
   await Promise.all([runMigrations(x.pool,dir),runMigrations(x.other,dir)]);assert.equal((await x.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,12);assert.equal((await x.pool.query('SELECT company_name FROM kaizen_diagnostics')).rows[0].company_name,'Legacy Rehearsal');
   fs.writeFileSync(path.join(temp,'099_failure.sql'),'CREATE TABLE rehearsal_rollback(id int); SELECT 1/0;');await assert.rejects(runMigrations(x.pool,temp));assert.equal((await x.pool.query("SELECT to_regclass('rehearsal_rollback') AS name")).rows[0].name,null);assert.equal((await x.pool.query("SELECT count(*)::int AS n FROM schema_migrations WHERE filename='099_failure.sql'")).rows[0].n,0);await runMigrations(x.pool,dir);
  }finally{fs.rmSync(temp,{recursive:true});await x.close();}
 });
 await t.test('one execution one claim, SKIP LOCKED, process isolation, lease expiry / late result',async()=>{
  const x=await setup();try{const a=await completedCase(x.h),b=await completedCase(x.h);await x.s.preparation.enqueue(a.id,operator,'fake','test');const second=new DiagnosisPreparationRepo(x.other);
   const claimed=await Promise.all([x.s.preparation.claimExecution(),second.claimExecution()]);assert.equal(claimed.filter(Boolean).length,1);const e=claimed.find(Boolean)!;
   await x.pool.query("UPDATE ai_executions SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[e.id]);await second.claimExecution();await x.s.preparation.finishExecution(e,{themes:[]},{themes:[]});assert.equal((await x.pool.query('SELECT status FROM ai_executions WHERE id=$1',[e.id])).rows[0].status,'FAILED');
   const one=await x.s.preparation.enqueue(a.id,operator,'fake','test'),two=await x.s.preparation.enqueue(b.id,operator,'fake','test');assert.equal(await second.claimExecution('REPORT_DRAFT_GENERATOR'),null);
   const lock=await x.pool.connect();try{await lock.query('BEGIN');await lock.query('SELECT id FROM ai_executions WHERE id=$1 FOR UPDATE',[one.execution_id]);assert.equal((await second.claimExecution())!.id,two.execution_id);}finally{await lock.query('ROLLBACK');lock.release();}
  }finally{await x.close();}
 });
 await t.test('concurrent Human commands conflict; rollback; approved Report / READY Handoff triggers',async()=>{
  const x=await setup();try{const c=await reportCase(x.h),d=await x.s.report.read(c.id,operator),other=new DiagnosisReportRepo(x.other),results=await Promise.allSettled([x.s.report.manual(c.id,operator,d.version),other.manual(c.id,operator,d.version)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);let row=await x.s.report.read(c.id,operator);assert.equal(row.reports.length,1);
   await x.s.report.approve(c.id,operator,row.reports[0]!.id,row.version);await assert.rejects(x.other.query("UPDATE diagnosis_reports SET content_json='{}' WHERE id=$1",[row.reports[0]!.id]));row=await x.s.report.read(c.id,operator);await x.s.report.deliver(c.id,operator,row.reports[0]!.id,row.version);await x.s.report.startFeedback(c.id,operator,(await x.s.report.read(c.id,operator)).version);await x.s.report.completeFeedback(c.id,operator,(await x.s.report.read(c.id,operator)).version);
   for(const action of ['propose','accept'] as const)await x.s.assessment.lifecycle(c.id,operator,action,(await x.s.assessment.read(c.id,operator)).version,'');const handoff=await x.s.assessment.generate(c.id,operator,(await x.s.assessment.read(c.id,operator)).version,'');await assert.rejects(x.other.query("UPDATE assessment_handoffs SET snapshot_json='{}' WHERE id=$1",[handoff.id]));await assert.rejects(x.s.assessment.close(c.id,operator,(await x.s.assessment.read(c.id,operator)).version,''));
  }finally{await x.close();}
 });
 for(const channel of ['WEB','SALES_VISIT'] as const)await t.test(`${channel} synthetic real-PostgreSQL E2E AI-01–04 / Human Gates / CLOSED`,async()=>{
  const x=await setup();try{const {repo,preparation,workspace,review,report,assessment}=x.s,live=process.env.RUN_READINESS_AI_LIVE==='1';if(live&&!process.env.ANTHROPIC_API_KEY)throw Error('BLOCKED_EXTERNAL: AI key missing');
   const p1=live?new AnthropicPreDiagnosisProvider(process.env.ANTHROPIC_API_KEY):new FakePreparationProvider(),p2=live?new AnthropicInterviewProvider(process.env.ANTHROPIC_API_KEY):new FakeInterviewProvider(),p3=live?new AnthropicPostDiagnosisProvider(process.env.ANTHROPIC_API_KEY):new FakePostDiagnosisProvider(),p4=live?new AnthropicReportDraftProvider(process.env.ANTHROPIC_API_KEY):new FakeReportProvider();
   const c=await repo.createCase({companyName:'Pilot Synthetic株式会社',contactName:'Test Operator',email:'synthetic@example.test'},channel,channel==='WEB'?{kind:'CUSTOMER',token:''}:operator),actor:Actor=channel==='WEB'?{kind:'CUSTOMER',token:c.access_token!}:operator;
   await repo.startSurvey(c.id,actor);for(const q of SURVEY_QUESTIONS.filter(q=>q.is_required))await repo.submitResponse(c.id,q.question_code,2,q.answer_type==='MULTI_SELECT'?['分からない']:'分からない',actor);await repo.completeSurvey(c.id,actor);
   await preparation.enqueue(c.id,operator,p1.provider,p1.model);await new PreDiagnosisWorker(preparation,p1).tick();assert.equal((await preparation.read(c.id,operator)).executions[0].status,'SUCCEEDED');assert.equal((await preparation.read(c.id,operator)).diagnosis_status,'SURVEY_COMPLETED');
   await preparation.start(c.id,operator);await preparation.addTheme(c.id,operator,{title:'未確認情報',description:'',future_relation:'未来に必要な判断'});await preparation.addPlan(c.id,operator,{text:'現在分からないことは何ですか',purpose:'確認',item_type:'QUESTION',diagnosis_theme_id:null});await preparation.confirm(c.id,operator,(await preparation.read(c.id,operator)).version);await workspace.transition(c.id,operator,'START',(await workspace.read(c.id,operator)).version);
   const source=await workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'担当者は分からない'});await workspace.addSource(c.id,operator,'TRANSCRIPT',{content:'分からない。\n'.repeat(2000)});await workspace.enqueue(c.id,operator,p2.provider,p2.model);await new InterviewAssistantWorker(preparation,workspace,p2).tick();assert.equal((await workspace.read(c.id,operator)).executions[0].status,'SUCCEEDED');await workspace.transition(c.id,operator,'FINISH',(await workspace.read(c.id,operator)).version);
   await review.enqueue(c.id,operator,p3.provider,p3.model);await new PostDiagnosisWorker(preparation,review,p3).tick();assert.equal((await review.read(c.id,operator)).executions[0].status,'SUCCEEDED');assert.equal((await review.read(c.id,operator)).approved_insights.length,0);await review.createInsight(c.id,operator,humanInsight(source.id));await review.complete(c.id,operator,(await review.read(c.id,operator)).version,true);
   await report.enqueue(c.id,operator,p4.provider,p4.model);await new ReportDraftWorker(preparation,report,p4).tick();let r=await report.read(c.id,operator);assert.equal(r.executions[0].status,'SUCCEEDED');assert.equal(r.diagnosis_status,'REPORT_REVIEW_REQUIRED');await report.approve(c.id,operator,r.reports[0]!.id,r.version);r=await report.read(c.id,operator);await report.deliver(c.id,operator,r.reports[0]!.id,r.version);await report.startFeedback(c.id,operator,(await report.read(c.id,operator)).version);await report.feedbackStatement(c.id,operator,{content:'まだ分からない'});await report.completeFeedback(c.id,operator,(await report.read(c.id,operator)).version);
   for(const action of ['propose','accept'] as const)await assessment.lifecycle(c.id,operator,action,(await assessment.read(c.id,operator)).version,'');const hh=await assessment.generate(c.id,operator,(await assessment.read(c.id,operator)).version,'');await assessment.transfer(c.id,operator,hh.id,(await assessment.read(c.id,operator)).version,'');await assessment.close(c.id,operator,(await assessment.read(c.id,operator)).version,'');const result=await assessment.read(c.id,operator);assert.equal(result.diagnosis_status,'CLOSED');assert.equal(result.latest_handoff!.snapshot_json.entry_channel,channel);assert.equal(result.latest_handoff!.snapshot_json.insights[0]!.semantic_type,'UNKNOWN');assert.equal(result.organization_display_name,'Pilot Synthetic株式会社様');
  }finally{await x.close();}
 });
});
