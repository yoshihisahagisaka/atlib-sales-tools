import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {feedbackCase} from './support/assessmentFixtures';
import {focusedConfirmation} from './support/focusedConfirmation';
import {operator} from './support/preparationFixtures';
import {contentHash} from '../src/domain/diagnosisReport';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});
after(async()=>{await h?.close();});
const status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;

async function decide(id:string,route:'DIRECT_ACT'|'FOCUSED_CONFIRMATION'|'DESIGN_ASSESSMENT'|'STOP_HOLD',restatement?:string|null){
 const d=await h.assessment.read(id,operator);
 return h.feedbackDecision.decide(id,operator,{expectedVersion:d.version,route,materialDecision:`${route}を経営判断`,nextAction:`${route}の次アクション`,customerRestatementSourceId:restatement});
}

test('MF-C: Human-only A/B/C/D decision is append-only and does not auto-start Assessment',async()=>{
 const c=await feedbackCase(h,{decision:false});
 for(const route of ['DIRECT_ACT','STOP_HOLD','DESIGN_ASSESSMENT','FOCUSED_CONFIRMATION'] as const){
  const before=await h.assessment.read(c.id,operator);const result=await decide(c.id,route);const after=await h.assessment.read(c.id,operator);
  assert.equal(after.assessment_status,'NOT_PROPOSED');assert.equal(after.version,before.version+1);assert.equal(result.route,route);
 }
 const read=await h.feedbackDecision.read(c.id,operator);assert.equal(read.history.length,4);assert.equal(read.latest!.route_code,'FOCUSED_CONFIRMATION');assert.equal(read.history[0]!.supersedes_decision_id,read.history[1]!.id);
 const rows=(await h.db.query('SELECT * FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version',[c.id])).rows as any[];
 for(const row of rows)assert.equal(contentHash(row.context_snapshot_json),row.context_hash);
 await assert.rejects(h.db.query("UPDATE management_feedback_decisions SET route_code='DIRECT_ACT' WHERE id=$1",[rows[0]!.id]));
 await assert.rejects(h.db.query('DELETE FROM management_feedback_decisions WHERE id=$1',[rows[0]!.id]));
});

test('MF-C: A/B/D and no decision block Assessment proposal; only latest Human Route C permits proposal',async()=>{
 const undecided=await feedbackCase(h,{decision:false});let u=await h.assessment.read(undecided.id,operator);await assert.rejects(h.assessment.lifecycle(undecided.id,operator,'propose',u.version,'Assessment提案'),status(409));
 for(const route of ['DIRECT_ACT','FOCUSED_CONFIRMATION','STOP_HOLD'] as const){
  const c=await feedbackCase(h,{decision:false});await decide(c.id,route);const d=await h.assessment.read(c.id,operator);await assert.rejects(h.assessment.lifecycle(c.id,operator,'propose',d.version,'Assessment提案'),status(409));assert.equal((await h.assessment.read(c.id,operator)).assessment_status,'NOT_PROPOSED');
 }
 const c=await feedbackCase(h,{decision:false});await decide(c.id,'DESIGN_ASSESSMENT');let d=await h.assessment.read(c.id,operator);await h.assessment.lifecycle(c.id,operator,'propose',d.version,'Human Decisionに基づく提案');d=await h.assessment.read(c.id,operator);assert.equal(d.assessment_status,'PROPOSED');
});

test('MF-C: customer restatement is same-Case Feedback source ref only and decision snapshot freezes reviewed context',async()=>{
 const c=await feedbackCase(h,{decision:false});
 const decision=await decide(c.id,'DESIGN_ASSESSMENT',c.feedbackStatementId);const read=await h.feedbackDecision.read(c.id,operator);const frozen=structuredClone(read.latest!.context_snapshot_json);
 assert.equal(frozen.customer_restatement_source_id,c.feedbackStatementId);assert.equal(contentHash(frozen),decision.context_hash);
 await h.db.query("UPDATE diagnosis_insights SET content='後続で変更された表現' WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' AND id=(SELECT id FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' LIMIT 1)",[c.id]);
 assert.deepEqual((await h.feedbackDecision.read(c.id,operator)).latest!.context_snapshot_json,frozen);
 const other=await feedbackCase(h,{decision:false});await assert.rejects(h.feedbackDecision.decide(other.id,operator,{expectedVersion:(await h.assessment.read(other.id,operator)).version,route:'DESIGN_ASSESSMENT',materialDecision:'x',nextAction:'y',customerRestatementSourceId:c.feedbackStatementId}),status(422));
});

test('MF-C: AI actor cannot commit management decision and API remains staff command gated',async()=>{
 const c=await feedbackCase(h,{decision:false}),d=await h.assessment.read(c.id,operator);
 await assert.rejects(h.feedbackDecision.decide(c.id,{kind:'AI'} as any,{expectedVersion:d.version,route:'DESIGN_ASSESSMENT',materialDecision:'x',nextAction:'y'}),status(403));
 const url=`${h.url}/api/admin/it-management-diagnosis/cases/${c.id}/feedback/decision`,body={expectedVersion:d.version,route:'DESIGN_ASSESSMENT',materialDecision:'経営判断',nextAction:'Assessmentを検討'};
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,401);
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:h.staffCookie},body:JSON.stringify(body)})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:h.staffCookie,'X-Diagnosis-Command':'1'},body:JSON.stringify(body)})).status,201);
});
