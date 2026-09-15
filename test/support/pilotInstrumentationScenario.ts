import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import type {createDiagnosisHarness} from './diagnosisHarness';
import {feedbackCase} from './assessmentFixtures';
import {operator} from './preparationFixtures';
import {PilotInstrumentationRepo} from '../../src/services/pilotInstrumentationRepo';
import {RetentionDeletionWorker} from '../../src/services/retentionDeletionWorker';

export async function instrumentationContinuity(h:Awaited<ReturnType<typeof createDiagnosisHarness>>,other:Pool=h.pool){
 const c=await feedbackCase(h,{decision:false}),repo=new PilotInstrumentationRepo(h.pool),reader=new PilotInstrumentationRepo(other);
 const decide=async(route:'DIRECT_ACT'|'DESIGN_ASSESSMENT')=>h.feedbackDecision.decide(c.id,operator,{expectedVersion:(await h.assessment.read(c.id,operator)).version,route,materialDecision:'Synthetic decision',nextAction:'Human next command',customerRestatementSourceId:c.feedbackStatementId});
 await decide('DIRECT_ACT');const old=structuredClone((await h.feedbackDecision.read(c.id,operator)).latest);
 await decide('DESIGN_ASSESSMENT');
 const before=await repo.read(c.id,operator);
 assert.equal(before.metrics.selected_route.value,'DESIGN_ASSESSMENT');assert.equal(before.metrics.redecision_count.value,1);
 assert.equal(before.metrics.assessment_proposed_after_route_c.value,false);
 assert.deepEqual((await h.feedbackDecision.read(c.id,operator)).history[1],old);
 const auditCount=async()=>Number((await h.pool.query('SELECT count(*)::int AS n FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1',[c.id])).rows[0].n);
 const count=await auditCount();
 const reads=await Promise.all([repo.read(c.id,operator),reader.read(c.id,operator),reader.read(c.id,operator)]);
 for(const read of reads)assert.deepEqual(read,before);assert.equal(await auditCount(),count);
 await h.assessment.lifecycle(c.id,operator,'propose',before.case.version,'Separate Human command');
 const proposed=await repo.read(c.id,operator);assert.equal(proposed.metrics.assessment_proposed_after_route_c.value,true);
 assert.ok(proposed.references.events.some(e=>e.command==='ProposeAssessment'));
 const req=await h.repo.createDeletionRequest(c.id,operator,'Synthetic deletion');
 await h.repo.scopeDeletionRequest(c.id,req.id,operator,['GENERAL_RAW_DIAGNOSIS','RAW_AI_IO']);
 await h.repo.decideDeletionRequest(c.id,req.id,operator,'APPROVE','Human decision');
 await new RetentionDeletionWorker(h.pool).executeApprovedRequest(c.id,req.id,'operator@atlib.jp');
 const deleted=await reader.read(c.id,operator);
 assert.deepEqual(deleted.metrics,proposed.metrics);assert.deepEqual(deleted.references,proposed.references);
 assert.equal((await h.pool.query('SELECT content FROM source_records WHERE id=$1',[c.feedbackStatementId])).rows[0].content,'[REDACTED]');
 // Simulate unavailable metadata: never reconstruct approval/elapsed evidence from state alone.
 await h.pool.query("DELETE FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command='StartFeedback'",[c.id]);
 const missing=await reader.read(c.id,operator);
 assert.equal(missing.metrics.recorded_feedback_elapsed.value,null);assert.equal(missing.metrics.recorded_feedback_elapsed.status,'INCOMPLETE');
 assert.equal(missing.metrics.selected_route.value,'DESIGN_ASSESSMENT');assert.equal(missing.metrics.redecision_count.value,1);
}
