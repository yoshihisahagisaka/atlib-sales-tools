import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {createDiagnosisHarness} from './support/diagnosisHarness';
import {operator} from './support/preparationFixtures';
import {reportCase} from './support/reportFixtures';
import {assertWhyConnectionsReady,manualReport,validateReportOutput,type ReportContext} from '../src/domain/diagnosisReport';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async()=>{h=await createDiagnosisHarness();});
after(async()=>{await h?.close();});

test('MF-B: WHY projects reviewed Hypothesis → Supporting Observation → Evidence Needed with provenance refs',async()=>{
 const c=await reportCase(h),view=await h.report.read(c.id,operator),ctx=view.context;
 const hypotheses=ctx.insights.filter(i=>['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(i.semantic_type));
 assert.equal(hypotheses.length,2);
 for(const item of hypotheses){
  assert.ok(item.why_connection);
  assert.ok(item.why_connection!.supporting_insight_refs.includes(c.observation.id));
  assert.ok(item.why_connection!.evidence_confirmation_refs.length>0);
  assert.ok(item.report_text.startsWith(item.semantic_type==='HYPOTHESIS'?'仮説：':'Root Cause仮説：'));
  assert.ok(item.report_text.includes('Supporting Observation / Context：'));
  assert.ok(item.report_text.includes('Evidence Needed：'));
  assert.equal(item.report_text.includes('原因は'),false);
 }
 const report=manualReport(ctx),why=report.sections.find(s=>s.section_key==='ROOT_CAUSE_AND_KAIZEN')!;
 assert.equal(why.blocks.length,2);
 assert.ok(why.blocks.every(b=>b.text.includes('Supporting Observation / Context：')&&b.text.includes('Evidence Needed：')));
 assert.deepEqual(validateReportOutput(report,ctx),report);
 const serialized=JSON.stringify(ctx);
 for(const forbidden of ['source_ref_id','SOURCE_RECORD:','SURVEY_RESPONSE:','raw_value_json','PRIVATE_RAW_TRANSCRIPT'])assert.equal(serialized.includes(forbidden),false,forbidden);
});

test('MF-B: customer-facing approval readiness fails closed when WHY support or Evidence Needed is unreviewed/missing',async()=>{
 const c=await reportCase(h),ctx=(await h.report.read(c.id,operator)).context;
 assert.doesNotThrow(()=>assertWhyConnectionsReady(ctx));
 const missingSupport=structuredClone(ctx) as ReportContext;
 const hypothesis=missingSupport.insights.find(i=>i.semantic_type==='HYPOTHESIS')!;
 hypothesis.why_connection={supporting_insight_refs:[],evidence_confirmation_refs:[c.hypothesisEvidence.id]};
 assert.throws(()=>assertWhyConnectionsReady(missingSupport),(e:unknown)=>(e as {status?:number;message?:string}).status===409&&(e as {message?:string}).message==='WHY_CONNECTION_REVIEW_REQUIRED');
 const missingEvidence=structuredClone(ctx) as ReportContext;
 const root=missingEvidence.insights.find(i=>i.semantic_type==='ROOT_CAUSE_HYPOTHESIS')!;
 root.why_connection={supporting_insight_refs:[c.observation.id],evidence_confirmation_refs:[]};
 assert.throws(()=>assertWhyConnectionsReady(missingEvidence),(e:unknown)=>(e as {status?:number;message?:string}).status===409&&(e as {message?:string}).message==='WHY_CONNECTION_REVIEW_REQUIRED');
});
