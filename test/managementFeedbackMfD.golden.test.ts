import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {feedbackCase} from './support/assessmentFixtures';
import {operator} from './support/preparationFixtures';
import {contentHash} from '../src/domain/diagnosisReport';
import {RetentionDeletionWorker} from '../src/services/retentionDeletionWorker';
import type {ManagementFeedbackRoute} from '../src/domain/managementFeedback';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});
after(async()=>{await h?.close();});
const status=(n:number)=>(e:unknown)=>(e as {status:number})?.status===n;
const version=async(id:string)=>(await h.assessment.read(id,operator)).version;
async function decide(id:string,route:ManagementFeedbackRoute='STOP_HOLD',source?:string){
 return h.feedbackDecision.decide(id,operator,{expectedVersion:await version(id),route,materialDecision:'判断を保留し必要な確認を行う',nextAction:'担当者が次の確認内容を相談する',customerRestatementSourceId:source});
}
async function reissue(id:string){
 const report=await h.report.reissue(id,operator,await version(id),'顧客訂正をHumanが確認');
 await h.report.approve(id,operator,report.id,await version(id));
 await h.report.deliver(id,operator,report.id,await version(id));
 await h.report.startFeedback(id,operator,await version(id));
 const source=await h.report.feedbackStatement(id,operator,{content:'PRIVATE_RESTATEMENT_NOT_FOR_SNAPSHOT'});
 await h.report.completeFeedback(id,operator,await version(id));
 return source;
}

test('MF-D: v2 freezes epistemic refs, WHY grounding and complete Human decision under one hash',async()=>{
 const c=await feedbackCase(h,{decision:false});await decide(c.id,'STOP_HOLD',c.feedbackStatementId);
 const row=(await h.feedbackDecision.read(c.id,operator)).latest!,snapshot=row.context_snapshot_json;
 assert.equal(snapshot.snapshot_version,2);assert.equal(contentHash(snapshot),row.context_hash);
 assert.deepEqual(snapshot.decision,{id:row.id,version:row.version,route:row.route_code,material_decision:row.material_decision,next_action:row.next_action,decided_by_user_id:row.decided_by_user_id,decided_at:new Date(row.decided_at).toISOString(),supersedes_decision_id:null});
 assert.equal(snapshot.future!.knowledge_status,'CUSTOMER_STATED');assert.equal(snapshot.future!.statement,null);
 assert.deepEqual(snapshot.observation_refs,[c.observation.id]);assert.deepEqual(snapshot.unknown_refs,[c.unknown.id]);
 assert.ok(snapshot.hypothesis_refs.includes(c.hypothesis.id));assert.ok(snapshot.evidence_needed_refs.includes(c.hypothesisEvidence.id));
 assert.deepEqual(snapshot.why_connections!.find(w=>w.hypothesis_id===c.hypothesis.id),{hypothesis_id:c.hypothesis.id,supporting_insight_refs:[c.observation.id],evidence_confirmation_refs:[c.hypothesisEvidence.id]});
 assert.deepEqual(snapshot.gap_refs,[]);assert.deepEqual(snapshot.evidence_candidate_refs,[]);
 const report=(await h.report.read(c.id,operator)).reports[0]!;
 assert.equal(snapshot.report.content_hash,contentHash(report.content_json));assert.equal(snapshot.report.approval_snapshot_hash,contentHash(report.snapshot_json));
 const serialized=JSON.stringify(snapshot);assert.ok(!serialized.includes('private@example.test'));assert.ok(!serialized.includes('引き続き分からない点を確認したい'));assert.ok(!serialized.includes(c.access_token!));
 const changed=structuredClone(snapshot);changed.decision!.route='DESIGN_ASSESSMENT';assert.notEqual(contentHash(changed),row.context_hash);
 assert.equal((await h.assessment.read(c.id,operator)).assessment_status,'NOT_PROPOSED');
});

test('MF-D: corrected Future / UNKNOWN / OPEN evidence require reapproved feedback; re-decision preserves prior snapshot',async()=>{
 const c=await feedbackCase(h,{decision:false});await decide(c.id,'DESIGN_ASSESSMENT');
 const first=structuredClone((await h.feedbackDecision.read(c.id,operator)).latest!);
 // Simulate a later versioned Context change; the public Decision command must not mix it with the old Report.
 await h.pool.query("UPDATE diagnosis_futures SET statement='分からない',version=version+1 WHERE diagnosis_case_id=$1 AND is_current",[c.id]);
 await h.pool.query("UPDATE diagnosis_insights SET unknown_type='CONTRADICTORY',version=version+1 WHERE id=$1",[c.unknown.id]);
 await h.pool.query("UPDATE assessment_confirmation_items SET status='NOT_REQUIRED' WHERE related_insight_id=$1",[c.unknown.id]);
 const before=await version(c.id);await assert.rejects(decide(c.id),status(409));assert.equal(await version(c.id),before);
 const newSource=await reissue(c.id);await decide(c.id,'FOCUSED_CONFIRMATION',newSource.id);
 const history=(await h.feedbackDecision.read(c.id,operator)).history;
 assert.deepEqual(history[1],first);assert.equal(history[0]!.supersedes_decision_id,first.id);
 const next=history[0]!.context_snapshot_json;
 assert.equal(next.future!.knowledge_status,'UNKNOWN');assert.equal(next.future!.version,first.context_snapshot_json.future!.version+1);
 assert.equal(next.insight_refs.find(i=>i.id===c.unknown.id)!.unknown_type,'CONTRADICTORY');
 assert.ok(next.evidence_needed_refs.length<first.context_snapshot_json.evidence_needed_refs.length);
 assert.notEqual(next.report.id,first.context_snapshot_json.report.id);assert.notEqual(history[0]!.context_hash,first.context_hash);
 assert.ok(!JSON.stringify(next).includes('PRIVATE_RESTATEMENT_NOT_FOR_SNAPSHOT'));
 await assert.rejects(h.assessment.lifecycle(c.id,operator,'propose',await version(c.id),''),status(409));
});

test('MF-D: competing decisions conflict and audit failure rolls back decision, supersession and case version',async()=>{
 const c=await feedbackCase(h,{decision:false}),expectedVersion=await version(c.id);
 const input={expectedVersion,route:'STOP_HOLD' as const,materialDecision:'Human判断',nextAction:'確認する'};
 const results=await Promise.allSettled([h.feedbackDecision.decide(c.id,operator,input),h.feedbackDecision.decide(c.id,operator,input)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await h.feedbackDecision.read(c.id,operator)).history.length,1);
 const before=await h.feedbackDecision.read(c.id,operator),beforeVersion=await version(c.id);
 await h.db.exec(`CREATE FUNCTION reject_mfd_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='RecordManagementFeedbackDecision' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_mfd_audit BEFORE INSERT ON diagnosis_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_mfd_audit();`);
 try{await assert.rejects(decide(c.id),/test audit failure/);}finally{await h.db.exec('DROP TRIGGER reject_mfd_audit ON diagnosis_audit_logs; DROP FUNCTION reject_mfd_audit();');}
 assert.deepEqual(await h.feedbackDecision.read(c.id,operator),before);assert.equal(await version(c.id),beforeVersion);
});

test('MF-D: raw deletion preserves Decision/history and immutable report references; history remains readable after Close',async()=>{
 const c=await feedbackCase(h,{decision:false});await decide(c.id,'DESIGN_ASSESSMENT',c.feedbackStatementId);
 const before=structuredClone(await h.feedbackDecision.read(c.id,operator));
 const worker=new RetentionDeletionWorker(h.pool),req=await h.repo.createDeletionRequest(c.id,operator,'synthetic request');
 await h.repo.scopeDeletionRequest(c.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS','TRANSCRIPT_RECORDING','RAW_AI_IO','APPROVED_DECISION_EVIDENCE']);
 await h.repo.decideDeletionRequest(c.id,req.id,operator,'APPROVE','Human承認');
 assert.equal((await worker.previewPolicyExpiry(c.id)).approved_decision_evidence_inventory.management_feedback_decisions,1);
 const result=await worker.executeApprovedRequest(c.id,req.id,'operator@atlib.jp');assert.equal(result.status,'PARTIALLY_RETAINED');
 assert.deepEqual(await h.feedbackDecision.read(c.id,operator),before);
 const raw=await h.db.query<{content:string}>('SELECT content FROM source_records WHERE id=$1',[c.feedbackStatementId]);assert.equal(raw.rows[0]!.content,'[REDACTED]');
 for(const action of ['propose','decline'] as const)await h.assessment.lifecycle(c.id,operator,action,await version(c.id),'Human操作');
 await h.assessment.close(c.id,operator,await version(c.id),'Human Close');
 assert.deepEqual(await h.feedbackDecision.read(c.id,operator),before);await assert.rejects(decide(c.id),status(409));
});

test('MF-D: legacy v1 is read without fabricated backfill, and superseded by a new v2 row',async()=>{
 const c=await feedbackCase(h,{decision:false}),legacyId=randomUUID();
 const legacy={report:{id:randomUUID(),version:1,content_version:1,content_hash:'a'.repeat(64),approval_snapshot_hash:'b'.repeat(64)},future:null,insight_refs:[],unknown_refs:[],gap_refs:[],hypothesis_refs:[],evidence_needed_refs:[],customer_restatement_source_id:null};
 await h.db.query(`INSERT INTO management_feedback_decisions(id,diagnosis_case_id,version,route_code,material_decision,next_action,context_snapshot_json,context_hash,decided_by_user_id) VALUES($1,$2,1,'STOP_HOLD','legacy decision','legacy action',$3,$4,'operator@atlib.jp')`,[legacyId,c.id,JSON.stringify(legacy),contentHash(legacy)]);
 await decide(c.id);const history=(await h.feedbackDecision.read(c.id,operator)).history;
 assert.deepEqual(history[1]!.context_snapshot_json,legacy);assert.equal(history[0]!.supersedes_decision_id,legacyId);assert.equal(history[0]!.context_snapshot_json.snapshot_version,2);
});
