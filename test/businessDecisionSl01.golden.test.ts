import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {feedbackCase} from './support/assessmentFixtures';
import {focusedConfirmation} from './support/focusedConfirmation';
import {operator} from './support/preparationFixtures';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});after(async()=>{await h?.close();});
const decide=async(id:string,route:'DIRECT_ACT'|'FOCUSED_CONFIRMATION'|'DESIGN_ASSESSMENT'|'STOP_HOLD')=>h.feedbackDecision.decide(id,operator,{expectedVersion:(await h.assessment.read(id,operator)).version,route,materialDecision:'経営者と確認した判断',nextAction:'次の会話で確認する'});
test('BD-SL-01: three terminal Human decisions close diagnosis without an Assessment order',async()=>{
 for(const route of ['DIRECT_ACT','DESIGN_ASSESSMENT','STOP_HOLD'] as const){const c=await feedbackCase(h,{decision:false});await decide(c.id,route);const d=await h.assessment.read(c.id,operator);assert.equal(d.diagnosis_status,'CLOSED');assert.equal(d.assessment_status,'NOT_PROPOSED');assert.equal(d.handoffs.length,0);assert.equal(d.closed_by_user_id,'operator@atlib.jp');assert.ok(d.transitions.some(t=>t.command==='RecordManagementFeedbackDecision'&&t.to_status==='CLOSED'));if(route!=='DESIGN_ASSESSMENT')await assert.rejects(h.assessment.lifecycle(c.id,operator,'propose',d.version,''));}
});
test('BD-SL-01: focused continuation preserves UNKNOWN, prior decisions and reports through Re-Decision; stopped case can resume',async()=>{
 const c=await feedbackCase(h,{decision:false});const insights=(await h.review.read(c.id,operator)).approved_insights;
 await decide(c.id,'FOCUSED_CONFIRMATION');const first=await h.feedbackDecision.read(c.id,operator);
 assert.equal((await h.assessment.read(c.id,operator)).diagnosis_status,'DIAGNOSIS_IN_PROGRESS');await assert.rejects(decide(c.id,'DIRECT_ACT'));
 await focusedConfirmation(h,c.id);assert.deepEqual((await h.review.read(c.id,operator)).approved_insights,insights);
 await decide(c.id,'STOP_HOLD');let d=await h.feedbackDecision.read(c.id,operator);assert.equal(d.history.length,2);assert.deepEqual(d.history[1],first.latest);assert.equal(d.latest!.supersedes_decision_id,first.latest!.id);assert.equal((await h.report.read(c.id,operator)).reports.length,2);
 await decide(c.id,'FOCUSED_CONFIRMATION');assert.equal((await h.assessment.read(c.id,operator)).diagnosis_status,'DIAGNOSIS_IN_PROGRESS');assert.equal((await h.feedbackDecision.read(c.id,operator)).history.length,3);
});
test('BD-SL-01: stale/AI commands and audit failure cannot close or overwrite a decision',async()=>{
 const c=await feedbackCase(h,{decision:false}),before=await h.assessment.read(c.id,operator),input={expectedVersion:before.version,route:'DIRECT_ACT' as const,materialDecision:'人による判断',nextAction:'改善の実行を検討'};
 await assert.rejects(h.feedbackDecision.decide(c.id,{kind:'AI'} as any,input));
 await h.db.exec("CREATE FUNCTION reject_bd() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='RecordManagementFeedbackDecision' THEN RAISE EXCEPTION 'reject BD audit'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_bd BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_bd();");
 try{await assert.rejects(h.feedbackDecision.decide(c.id,operator,input));}finally{await h.db.exec('DROP TRIGGER reject_bd ON diagnosis_audit_logs; DROP FUNCTION reject_bd();');}
 assert.deepEqual(await h.assessment.read(c.id,operator),before);assert.equal((await h.feedbackDecision.read(c.id,operator)).history.length,0);
 await h.feedbackDecision.decide(c.id,operator,input);await assert.rejects(h.feedbackDecision.decide(c.id,operator,input));assert.equal((await h.feedbackDecision.read(c.id,operator)).history.length,1);
});
