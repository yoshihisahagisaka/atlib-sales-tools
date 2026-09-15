import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {completedCase,operator,FakePreparationProvider} from './support/preparationFixtures';
import {feedbackCase} from './support/assessmentFixtures';
import {reviewCase,FakePostDiagnosisProvider,humanInsight} from './support/reviewFixtures';
import {reportCase} from './support/reportFixtures';
import {instrumentationContinuity} from './support/pilotInstrumentationScenario';
import {PilotInstrumentationRepo} from '../src/services/pilotInstrumentationRepo';
import {PilotEvidenceRepo} from '../src/services/pilotEvidenceRepo';
import {PreDiagnosisWorker} from '../src/services/preDiagnosisWorker';
import {PostDiagnosisWorker} from '../src/services/postDiagnosisWorker';
import type {Actor} from '../src/domain/itManagementDiagnosis';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>,repo:PilotInstrumentationRepo;
before(async()=>{h=await createDiagnosisHarness();repo=new PilotInstrumentationRepo(h.pool);});
after(async()=>{await h?.close();});
const status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;

test('MF-E: AI generated → edited approval / rejection and failed execution derive from authoritative records',async()=>{
 const c=await completedCase(h),provider=new FakePreparationProvider(),worker=new PreDiagnosisWorker(h.preparation,provider);
 await h.preparation.enqueue(c.id,operator,provider.provider,provider.model);await worker.tick();await h.preparation.start(c.id,operator);
 const p=(await h.preparation.read(c.id,operator)).proposals;
 await h.preparation.accept(c.id,p.find(p=>p.proposal_type==='THEME').id,operator,{title:'Human edit',description:'Synthetic correction',future_relation:'Future relation'});
 await h.preparation.reject(c.id,p.find(p=>p.proposal_type==='HYPOTHESIS').id,operator);
 let d=await repo.read(c.id,operator);
 assert.equal(d.metrics.ai_suggestion_count.value,p.length);assert.equal(d.metrics.ai_failure_count.value,0);
 assert.equal(d.metrics.human_ai_correction_count.value,1);assert.equal(d.metrics.human_approval_count.value,1);assert.equal(d.metrics.human_ai_rejection_count.value,1);
 provider.run=async()=>{throw new Error('synthetic provider failure');};await h.preparation.enqueue(c.id,operator,provider.provider,provider.model);await worker.tick();
 d=await repo.read(c.id,operator);assert.equal(d.metrics.ai_failure_count.value,1);
});

test('MF-E: post-review mirrored human_reviews are not double-counted as approvals',async()=>{
 const c=await reviewCase(h),provider=new FakePostDiagnosisProvider();await h.review.enqueue(c.id,operator,provider.provider,provider.model);await new PostDiagnosisWorker(h.preparation,h.review,provider).tick();
 const proposal=(await h.review.read(c.id,operator)).proposals[0];
 await h.review.resolve(c.id,proposal.id,operator,'APPROVE_WITH_EDIT','Human edit',humanInsight(c.source.id));
 const d=await repo.read(c.id,operator);assert.equal(d.metrics.human_ai_correction_count.value,1);assert.equal(d.metrics.human_approval_count.value,2); // ConfirmDiagnosisPlan + edited approval.
});

test('MF-E: A/B/D stay false and C alone is false; only separate Human proposal makes C true',async()=>{
 const c=await feedbackCase(h,{decision:false});
 for(const route of ['DIRECT_ACT','FOCUSED_CONFIRMATION','STOP_HOLD','DESIGN_ASSESSMENT'] as const){
  await h.feedbackDecision.decide(c.id,operator,{expectedVersion:(await h.assessment.read(c.id,operator)).version,route,materialDecision:'Human decision',nextAction:'Next Human action'});
  assert.equal((await repo.read(c.id,operator)).metrics.assessment_proposed_after_route_c.value,false);
 }
 await h.assessment.lifecycle(c.id,operator,'propose',(await h.assessment.read(c.id,operator)).version,'Human proposal');
 assert.equal((await repo.read(c.id,operator)).metrics.assessment_proposed_after_route_c.value,true);
 await h.feedbackDecision.decide(c.id,operator,{expectedVersion:(await h.assessment.read(c.id,operator)).version,route:'DESIGN_ASSESSMENT',materialDecision:'Later decision',nextAction:'Revisit'});
 assert.equal((await repo.read(c.id,operator)).metrics.assessment_proposed_after_route_c.value,false,'old proposal does not satisfy a newer C');
});

test('MF-E: supersession, concurrent pure reads and raw deletion preserve derivable Decision/Audit evidence',async()=>{await instrumentationContinuity(h);});

test('MF-E: raw survey / transcript / restatement / AI / report / contact / arbitrary audit data never enter projection',async()=>{
 const c=await feedbackCase(h,{decision:false}),secret='PRIVATE_RAW_SENTINEL customer@example.test';
 // feedbackCase already includes explicit synthetic Transcript consent.
 await h.pool.query(`INSERT INTO source_records(id,diagnosis_case_id,source_type,entered_by_user_id,content) VALUES($1,$2,'TRANSCRIPT','operator@atlib.jp',$3)`,[randomUUID(),c.id,secret]);
 await h.pool.query('UPDATE source_records SET content=$2 WHERE diagnosis_case_id=$1',[c.id,secret]);
 await h.pool.query('UPDATE survey_responses SET raw_value_json=$2 WHERE diagnosis_case_id=$1',[c.id,JSON.stringify(secret)]);
 await h.pool.query(`INSERT INTO ai_executions(id,diagnosis_case_id,process_type,status,provider,model,prompt_version,policy_version,input_snapshot_json,raw_output_json,requested_by_user_id) VALUES($1,$2,'PRE_DIAGNOSIS_ORGANIZER','FAILED','fake','fake','test','test',$3,$3,'operator@atlib.jp')`,[randomUUID(),c.id,JSON.stringify({raw:secret})]);
 await h.pool.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,'UpdateReportWording','STAFF','operator@atlib.jp',$3)`,[randomUUID(),c.id,JSON.stringify({before:secret,after:secret})]);
 await new PilotEvidenceRepo(h.pool).record(c.id,'operator@atlib.jp',{customer_segment:'synthetic',entry_trigger:'test',future_theme_code:'test',confusing_question_codes:['Q06'],unknown_pattern_codes:['UNRESOLVED'],operator_correction_categories:['CLASSIFICATION'],ai_misclassification_categories:['UNKNOWN_AS_FACT'],management_feedback_reaction:'NEUTRAL',assessment_need_understood:'NOT_ASKED',customer_feedback_signal:'NONE'});
 const d=await repo.read(c.id,operator),json=JSON.stringify(d);
 for(const s of [secret,'private@example.test','PRIVATE_PHONE','operator@atlib.jp',c.access_token!,'分からないことがあります','引き続き分からない点を確認したい','社員が本来の仕事に集中できる会社にしたい'])assert.ok(!json.includes(s),s);
 assert.equal(d.metrics.customer_correction_or_restatement_observed.value,true);assert.equal(d.references.restatements[0]!.id,c.feedbackStatementId);
 assert.equal(d.metrics.existing_coded_pilot_evidence.classification,'MANUAL_CODED');assert.ok(json.includes('UNKNOWN_AS_FACT'));assert.ok(!json.includes('assessment_need_understood'));
});

test('MF-E: missing or ambiguous decision/proposal audit order is incomplete, not an inferred success',async()=>{
 const c=await feedbackCase(h),v=(await h.assessment.read(c.id,operator)).version;
 await h.assessment.lifecycle(c.id,operator,'propose',v,'Separate command');
 await h.pool.query(`UPDATE diagnosis_audit_logs SET created_at='2026-01-01T00:00:00Z' WHERE diagnosis_case_id=$1 AND command IN ('RecordManagementFeedbackDecision','ProposeAssessment')`,[c.id]);
 let d=await repo.read(c.id,operator);assert.equal(d.metrics.assessment_proposed_after_route_c.status,'INCOMPLETE');assert.equal(d.metrics.assessment_proposed_after_route_c.value,null);
 await h.pool.query("DELETE FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command='RecordManagementFeedbackDecision'",[c.id]);
 d=await repo.read(c.id,operator);assert.equal(d.metrics.assessment_proposed_after_route_c.status,'INCOMPLETE');assert.equal(d.metrics.selected_route.value,'DESIGN_ASSESSMENT');
});

test('MF-E: missing timestamps never become zero and actual conversation duration remains not derivable',async()=>{
 const c=await completedCase(h),empty=await repo.read(c.id,operator);
 for(const key of ['feedback_preparation_duration','human_review_duration','recorded_feedback_elapsed'] as const){assert.equal(empty.metrics[key].value,null);assert.equal(empty.metrics[key].status,'NOT_OBSERVED');}
 assert.equal(empty.metrics.ai_failure_count.value,null);assert.equal(empty.metrics.human_approval_count.value,null);
 const r=await reportCase(h);await h.report.manual(r.id,operator,(await h.report.read(r.id,operator)).version);
 const pending=await repo.read(r.id,operator);assert.equal(pending.metrics.feedback_preparation_duration.status,'INCOMPLETE');assert.equal(pending.metrics.feedback_preparation_duration.value,null);
 await h.pool.query("UPDATE diagnosis_reports SET created_at=now()-interval '120 seconds' WHERE diagnosis_case_id=$1",[r.id]);
 const report=await h.report.read(r.id,operator);await h.report.approve(r.id,operator,report.reports[0]!.id,report.version);
 const done=await repo.read(r.id,operator);assert.ok(done.metrics.feedback_preparation_duration.value!>=120);assert.equal(done.metrics.feedback_conversation_duration.status,'NOT_DERIVABLE');assert.equal(done.metrics.feedback_conversation_duration.value,null);
});

test('MF-E: staff-only API; invalid/missing Case and AI/customer boundaries; read never changes state',async()=>{
 const c=await feedbackCase(h,{decision:false}),url=`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/pilot-instrumentation`;
 const before=await repo.read(c.id,operator);
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{authorization:`Bearer ${c.access_token}`}})).status,401);
 const response=await fetch(url,{headers:{cookie:h.staffCookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),before);
 await assert.rejects(repo.read(c.id,{kind:'CUSTOMER',token:c.access_token!}),status(403));
 await assert.rejects(repo.read(c.id,{kind:'AI'} as unknown as Actor),status(403));
 await assert.rejects(h.feedbackDecision.decide(c.id,{kind:'AI'} as unknown as Actor,{expectedVersion:before.case.version,route:'DESIGN_ASSESSMENT',materialDecision:'AI must not decide',nextAction:'forbidden'}),status(403));
 await assert.rejects(repo.read(randomUUID(),operator),status(404));
 assert.equal((await fetch(url.replace(c.id,'invalid'),{headers:{cookie:h.staffCookie}})).status,400);
 assert.deepEqual(await repo.read(c.id,operator),before);
});
