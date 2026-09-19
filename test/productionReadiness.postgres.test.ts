import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {consentedSalesCase} from './support/salesIntakeFixtures';
import {salesConsentScenario} from './support/salesIntakeScenario';
import {managementAnalysisScenario} from './support/managementAnalysisScenario';
import {progressiveReuseScenario} from './support/progressiveReuseScenario';
import {Pool} from 'pg';
import {runMigrations} from '../src/db/migrate';
import {ItManagementDiagnosisRepo} from '../src/services/itManagementDiagnosisRepo';
import {DiagnosisPreparationRepo} from '../src/services/diagnosisPreparationRepo';
import {DiagnosisWorkspaceRepo} from '../src/services/diagnosisWorkspaceRepo';
import {DiagnosisReviewRepo} from '../src/services/diagnosisReviewRepo';
import {DiagnosisReportRepo} from '../src/services/diagnosisReportRepo';
import {DiagnosisAssessmentRepo} from '../src/services/diagnosisAssessmentRepo';
import {ManagementFeedbackDecisionRepo} from '../src/services/managementFeedbackDecisionRepo';
import {PreDiagnosisWorker} from '../src/services/preDiagnosisWorker';
import {InterviewAssistantWorker} from '../src/services/interviewAssistantWorker';
import {PostDiagnosisWorker} from '../src/services/postDiagnosisWorker';
import {ReportDraftWorker} from '../src/services/reportDraftWorker';
import {AnthropicPreDiagnosisProvider} from '../src/services/preDiagnosisProvider';
import {AnthropicInterviewProvider} from '../src/services/interviewAssistantProvider';
import {AnthropicPostDiagnosisProvider} from '../src/services/postDiagnosisProvider';
import {AnthropicReportDraftProvider} from '../src/services/reportDraftProvider';
import {SURVEY_QUESTIONS,type Actor} from '../src/domain/itManagementDiagnosis';
import {DIAGNOSIS_POLICY_NOTICE_VERSION} from '../src/routes/itManagementDiagnosis';
import {FakePreparationProvider,operator,completedCase} from './support/preparationFixtures';
import {FakeInterviewProvider} from './support/workspaceFixtures';
import {FakePostDiagnosisProvider,humanInsight} from './support/reviewFixtures';
import {FakeReportProvider,reportCase} from './support/reportFixtures';
import {feedbackCase} from './support/assessmentFixtures';
import {contentHash} from '../src/domain/diagnosisReport';
import {instrumentationContinuity} from './support/pilotInstrumentationScenario';
import type {createDiagnosisHarness} from './support/diagnosisHarness';
const dir=path.resolve(__dirname,'../migrations');
const config={host:'127.0.0.1',port:55436,database:'readiness',user:'postgres',max:5,connectionTimeoutMillis:5000};
// Intentionally fixed loopback/disposable DB. Cannot be pointed at customer DB via environment.
async function setup(migrate=true){const admin=new Pool(config),schema='readiness_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({...config,options:`-c search_path=${schema},public`}),other=new Pool({...config,options:`-c search_path=${schema},public`});
 const services={repo:new ItManagementDiagnosisRepo(pool),preparation:new DiagnosisPreparationRepo(pool),workspace:new DiagnosisWorkspaceRepo(pool),review:new DiagnosisReviewRepo(pool),report:new DiagnosisReportRepo(pool),assessment:new DiagnosisAssessmentRepo(pool),feedbackDecision:new ManagementFeedbackDecisionRepo(pool),pool};
 if(migrate)await runMigrations(pool,dir);return {pool,other,s:services,h:services as Awaited<ReturnType<typeof createDiagnosisHarness>>,close:async()=>{await pool.end();await other.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}};
}
test('Real PostgreSQL readiness: migrations, multi-connection concurrency, WEB / SALES_VISIT', {skip:process.env.RUN_READINESS_PG!=='1'?'BLOCKED_EXTERNAL: explicit disposable PostgreSQL required':false,timeout:180000},async t=>{
 await t.test('current main schema through 012 upgrades additively with customer records preserved',async()=>{
  const x=await setup(false),temp=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-main-upgrade-'));
  try{
   for(const f of fs.readdirSync(dir).filter(f=>/^\d+_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=12))fs.copyFileSync(path.join(dir,f),path.join(temp,f));
   await runMigrations(x.pool,temp);
   // Existing pre-017 sales record: do not fabricate retrospective consent during upgrade.
   const c={id:randomUUID()},org=randomUUID();await x.pool.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[org,'Upgrade Synthetic']);await x.pool.query("INSERT INTO diagnosis_cases(id,organization_id,entry_channel,diagnosis_status,survey_version) VALUES($1,$2,'SALES_VISIT','APPLICATION_STARTED',2)",[c.id,org]);
   await runMigrations(x.pool,dir);await runMigrations(x.pool,dir);
   assert.equal((await x.s.repo.getSurvey(c.id,operator)).organization_display_name,'Upgrade Synthetic様');
   assert.equal((await x.s.repo.getPolicyReadModel(c.id,operator)).policy_acknowledgement,null);
   assert.equal((await x.s.repo.retentionDryRun(c.id,operator)).destructive_execution_enabled,false);
  }finally{fs.rmSync(temp,{recursive:true});await x.close();}
 });
 await t.test('empty DB / simultaneous runners / schema ledger / additive legacy upgrade / rollback / rerun',async()=>{
  const x=await setup(false),temp=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-migrations-'));try{
   for(const f of fs.readdirSync(dir).filter(f=>/^00[1-6]_.*\.sql$/.test(f)))fs.copyFileSync(path.join(dir,f),path.join(temp,f));await runMigrations(x.pool,temp);
   await x.pool.query(`INSERT INTO kaizen_diagnostics(input_source,company_name,question_set_version,answers,scores,suggested_services) VALUES('prospect','Legacy Rehearsal','legacy','[]','{}','[]')`);
   await Promise.all([runMigrations(x.pool,dir),runMigrations(x.other,dir)]);assert.equal((await x.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,fs.readdirSync(dir).filter(f=>/^\d+_.*\.sql$/.test(f)).length);assert.equal((await x.pool.query('SELECT company_name FROM kaizen_diagnostics')).rows[0].company_name,'Legacy Rehearsal');
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
   await x.s.feedbackDecision.decide(c.id,operator,{expectedVersion:(await x.s.assessment.read(c.id,operator)).version,route:'DESIGN_ASSESSMENT',materialDecision:'合成試験のHuman判断',nextAction:'別のHuman操作で提案する'});
   for(const action of ['propose','accept'] as const)await x.s.assessment.lifecycle(c.id,operator,action,(await x.s.assessment.read(c.id,operator)).version,'');const handoff=await x.s.assessment.generate(c.id,operator,(await x.s.assessment.read(c.id,operator)).version,'');await assert.rejects(x.other.query("UPDATE assessment_handoffs SET snapshot_json='{}' WHERE id=$1",[handoff.id]));await assert.rejects(x.s.assessment.close(c.id,operator,(await x.s.assessment.read(c.id,operator)).version,''));
  }finally{await x.close();}
 });
  await t.test('MF-D multi-connection decisions serialize; immutable snapshot and audit rollback preserve history',async()=>{
   const x=await setup();try{
    const c=await feedbackCase(x.h,{decision:false}),other=new ManagementFeedbackDecisionRepo(x.other);
    const input={expectedVersion:(await x.s.assessment.read(c.id,operator)).version,route:'STOP_HOLD' as const,materialDecision:'Synthetic Human decision',nextAction:'Human confirmation'};
    const results=await Promise.allSettled([x.s.feedbackDecision.decide(c.id,operator,input),other.decide(c.id,operator,input)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const before=await other.read(c.id,operator),row=before.latest!;
    assert.equal(row.context_snapshot_json.snapshot_version,2);assert.equal(contentHash(row.context_snapshot_json),row.context_hash);
    assert.equal(row.context_snapshot_json.decision!.decided_at,row.decided_at.toISOString());
    await assert.rejects(x.other.query("UPDATE management_feedback_decisions SET context_snapshot_json='{}' WHERE id=$1",[row.id]));
    await assert.rejects(x.other.query('DELETE FROM management_feedback_decisions WHERE id=$1',[row.id]));
    const currentVersion=(await x.s.assessment.read(c.id,operator)).version;
    await x.pool.query(`CREATE FUNCTION reject_mfd_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='RecordManagementFeedbackDecision' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_mfd_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_mfd_audit();`);
    await assert.rejects(other.decide(c.id,operator,{...input,expectedVersion:currentVersion}),/test audit failure/);
    assert.equal((await x.s.assessment.read(c.id,operator)).version,currentVersion);assert.deepEqual(await other.read(c.id,operator),before);
   }finally{await x.close();}
  });
  await t.test('MF-E concurrent read consistency, supersession, audit and raw deletion continuity',async()=>{
   const x=await setup();try{await instrumentationContinuity(x.h,x.other);}finally{await x.close();}
  });
  await t.test('SL-A2/A3: pre-consent isolation and concurrent consent create exactly one Case with provenance',async()=>{
   const x=await setup();try{await salesConsentScenario(x.pool,x.other);}finally{await x.close();}
  });
  await t.test('SL-A5: analysis reuses reviewed WHY and never exports unreviewed AI candidates',async()=>{const x=await setup();try{await managementAnalysisScenario(x.h);}finally{await x.close();}});
  await t.test('SL-A4: concurrent Human selection reuses one plan and speech reaches review without UNKNOWN resolution',async()=>{
   const x=await setup();try{await progressiveReuseScenario(x.pool,x.other);}finally{await x.close();}
  });
  for(const channel of ['WEB','SALES_VISIT'] as const)await t.test(`${channel} synthetic real-PostgreSQL E2E AI-01–04 / Human Gates / CLOSED`,async()=>{
  const x=await setup();try{const {repo,preparation,workspace,review,report,assessment}=x.s,live=process.env.RUN_READINESS_AI_LIVE==='1';if(live&&!process.env.ANTHROPIC_API_KEY)throw Error('BLOCKED_EXTERNAL: AI key missing');
   const p1=live?new AnthropicPreDiagnosisProvider(process.env.ANTHROPIC_API_KEY):new FakePreparationProvider(),p2=live?new AnthropicInterviewProvider(process.env.ANTHROPIC_API_KEY):new FakeInterviewProvider(),p3=live?new AnthropicPostDiagnosisProvider(process.env.ANTHROPIC_API_KEY):new FakePostDiagnosisProvider(),p4=live?new AnthropicReportDraftProvider(process.env.ANTHROPIC_API_KEY):new FakeReportProvider();
   const customer={companyName:'Pilot Synthetic株式会社',contactName:'Test Operator',email:'synthetic@example.test'};
   const c=channel==='WEB'?await repo.createCase(customer,'WEB',{kind:'CUSTOMER',token:''},{noticeVersion:DIAGNOSIS_POLICY_NOTICE_VERSION}):{...await consentedSalesCase(x.pool,customer),access_token:undefined},actor:Actor=channel==='WEB'?{kind:'CUSTOMER',token:c.access_token!}:operator;
   await repo.startSurvey(c.id,actor);for(const q of SURVEY_QUESTIONS.filter(q=>q.is_required))await repo.submitResponse(c.id,q.question_code,2,q.answer_type==='MULTI_SELECT'?['分からない']:'分からない',actor);await repo.completeSurvey(c.id,actor);
   await preparation.enqueue(c.id,operator,p1.provider,p1.model);await new PreDiagnosisWorker(preparation,p1).tick();assert.equal((await preparation.read(c.id,operator)).executions[0].status,'SUCCEEDED');assert.equal((await preparation.read(c.id,operator)).diagnosis_status,'SURVEY_COMPLETED');
   await preparation.start(c.id,operator);await preparation.addTheme(c.id,operator,{title:'未確認情報',description:'',future_relation:'未来に必要な判断'});await preparation.addPlan(c.id,operator,{text:'現在分からないことは何ですか',purpose:'確認',item_type:'QUESTION',diagnosis_theme_id:null});await preparation.confirm(c.id,operator,(await preparation.read(c.id,operator)).version);await workspace.transition(c.id,operator,'START',(await workspace.read(c.id,operator)).version);
   await repo.recordTranscriptConsent(c.id,operator,{consentVersion:'TEST-v1',consentScope:'synthetic PostgreSQL rehearsal',consentedAt:new Date().toISOString()});
   const source=await workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'担当者は分からない'});const transcript=await workspace.addSource(c.id,operator,'TRANSCRIPT',{content:'分からない。\n'.repeat(2000)});const completedAt=new Date().toISOString();await repo.completeTranscriptPurpose(c.id,transcript.id,operator,completedAt);await repo.completeTranscriptPurpose(c.id,transcript.id,operator,completedAt);assert.equal((await repo.retentionDryRun(c.id,operator)).transcript_purpose_pending_count,0);await workspace.enqueue(c.id,operator,p2.provider,p2.model);await new InterviewAssistantWorker(preparation,workspace,p2).tick();assert.equal((await workspace.read(c.id,operator)).executions[0].status,'SUCCEEDED');await workspace.transition(c.id,operator,'FINISH',(await workspace.read(c.id,operator)).version);
   await review.enqueue(c.id,operator,p3.provider,p3.model);await new PostDiagnosisWorker(preparation,review,p3).tick();assert.equal((await review.read(c.id,operator)).executions[0].status,'SUCCEEDED');assert.equal((await review.read(c.id,operator)).approved_insights.length,0);await review.createInsight(c.id,operator,humanInsight(source.id));await review.complete(c.id,operator,(await review.read(c.id,operator)).version,true);
   await report.enqueue(c.id,operator,p4.provider,p4.model);await new ReportDraftWorker(preparation,report,p4).tick();let r=await report.read(c.id,operator);assert.equal(r.executions[0].status,'SUCCEEDED');assert.equal(r.diagnosis_status,'REPORT_REVIEW_REQUIRED');await report.approve(c.id,operator,r.reports[0]!.id,r.version);r=await report.read(c.id,operator);await report.deliver(c.id,operator,r.reports[0]!.id,r.version);await report.startFeedback(c.id,operator,(await report.read(c.id,operator)).version);await report.feedbackStatement(c.id,operator,{content:'まだ分からない'});await report.completeFeedback(c.id,operator,(await report.read(c.id,operator)).version);
   await assert.rejects(assessment.lifecycle(c.id,operator,'propose',(await assessment.read(c.id,operator)).version,''),/Human Decision/);
   await x.s.feedbackDecision.decide(c.id,operator,{expectedVersion:(await assessment.read(c.id,operator)).version,route:'DESIGN_ASSESSMENT',materialDecision:'合成試験のHuman判断',nextAction:'別のHuman操作で提案する'});
   assert.equal((await assessment.read(c.id,operator)).assessment_status,'NOT_PROPOSED');
   for(const action of ['propose','accept'] as const)await assessment.lifecycle(c.id,operator,action,(await assessment.read(c.id,operator)).version,'');const hh=await assessment.generate(c.id,operator,(await assessment.read(c.id,operator)).version,'');await assessment.transfer(c.id,operator,hh.id,(await assessment.read(c.id,operator)).version,'');await assessment.close(c.id,operator,(await assessment.read(c.id,operator)).version,'');const result=await assessment.read(c.id,operator);assert.equal(result.diagnosis_status,'CLOSED');assert.equal(result.latest_handoff!.snapshot_json.entry_channel,channel);assert.equal(result.latest_handoff!.snapshot_json.insights[0]!.semantic_type,'UNKNOWN');assert.equal(result.organization_display_name,'Pilot Synthetic株式会社様');
  }finally{await x.close();}
 });
});
