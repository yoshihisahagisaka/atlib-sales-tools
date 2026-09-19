import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {focusedConfirmation} from './support/focusedConfirmation';
import {operator} from './support/preparationFixtures';
import {managementAnalysisScenario} from './support/managementAnalysisScenario';
import {feedbackCase} from './support/assessmentFixtures';
import {reuseSalesCase} from './support/progressiveReuseScenario';
let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});after(async()=>{await h?.close();});
test('SL-A5: optional lens, WHY trace and AI -> Human -> Report boundaries',async()=>{await managementAnalysisScenario(h);});
test('SL-A5: read-only Human routes never start Assessment',async()=>{
 const c=await feedbackCase(h,{decision:false});
 for(const route of ['DIRECT_ACT','FOCUSED_CONFIRMATION','DESIGN_ASSESSMENT','STOP_HOLD'] as const){
  await h.feedbackDecision.decide(c.id,operator,{expectedVersion:(await h.assessment.read(c.id,operator)).version,route,materialDecision:'人が判断した内容',nextAction:'人が次を確認する'});
  const before=await h.assessment.read(c.id,operator),view=await h.review.analysis(c.id,operator);
  assert.equal(view.decision.route_code,route);assert.equal(view.decision.material_decision,'人が判断した内容');
  assert.equal((await h.assessment.read(c.id,operator)).version,before.version);assert.equal((await h.assessment.read(c.id,operator)).assessment_status,'NOT_PROPOSED');if(route==='FOCUSED_CONFIRMATION')await focusedConfirmation(h,c.id);
 }
});
test('SL-A5: Intake separation, empty lens and staff-only read',async()=>{
 const c=await reuseSalesCase(h.pool),view=await h.review.analysis(c.id,operator);
 assert.ok(view.reuse.known.some(e=>e.origin.kind==='customer_statements'));assert.ok(view.reuse.unknown.some(e=>e.origin.kind==='unknowns'));assert.ok(view.reuse.hypotheses.some(e=>e.origin.kind==='salesperson_notes'));
 assert.deepEqual(view.lens,{cells:[],unclassified:[]});assert.equal(view.items.length,0);
 const url=h.url+'/api/admin/it-management-diagnosis/cases/'+c.id+'/review/analysis';assert.equal((await fetch(url)).status,401);
 const response=await fetch(url,{headers:{Cookie:h.staffCookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 await assert.rejects(h.review.analysis(c.id,{kind:'AI'} as any));await assert.rejects(h.review.analysis(c.id,{kind:'CUSTOMER',token:''}));
});
