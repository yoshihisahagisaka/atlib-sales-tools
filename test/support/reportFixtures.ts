import { manualReport,type ReportContext } from '../../src/domain/diagnosisReport';
import type { ReportDraftProvider } from '../../src/services/reportDraftProvider';
import { reviewCase,humanInsight } from './reviewFixtures';
import { operator } from './preparationFixtures';
import type { createDiagnosisHarness } from './diagnosisHarness';
export class FakeReportProvider implements ReportDraftProvider {
 readonly provider='fake';readonly model='deterministic-report';calls=0;inputs:ReportContext[]=[];
 run:(c:ReportContext,s:AbortSignal)=>Promise<unknown>=async c=>manualReport(c);
 draft(c:ReportContext,s:AbortSignal){this.calls++;this.inputs.push(c);return this.run(c,s);}
}
export async function reportCase(h:Awaited<ReturnType<typeof createDiagnosisHarness>>){
 const c=await reviewCase(h);
 // Report regression fixtures exercise the CUSTOMER_STATED path. MF-A UNKNOWN behavior has a separate synthetic Golden test.
 await h.db.query("UPDATE diagnosis_futures SET statement='社員が本来の仕事に集中できる会社にしたい' WHERE diagnosis_case_id=$1 AND is_current",[c.id]);
 const unknown=await h.review.createInsight(c.id,operator,humanInsight(c.source.id));
 const hypothesis=await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),semantic_type:'HYPOTHESIS',unknown_type:null,title:'情報共有の仮説',content:'情報共有の方法に差がある可能性がある'});
 await h.review.createInsight(c.id,operator,{...humanInsight(c.source.id),semantic_type:'ROOT_CAUSE_HYPOTHESIS',unknown_type:null,title:'背景の仮説',content:'役割分担が背景にある可能性がある'});
 await h.review.createAssessment(c.id,operator,{title:'更新方法を確認する',purpose:'Assessmentで必要な情報を確認する',priority:1,diagnosis_theme_id:null,related_insight_id:unknown.id,related_evidence_candidate_id:null,source_ai_proposal_id:null,source_ai_execution_id:null,source_candidate_index:null});
 await h.review.complete(c.id,operator,(await h.review.read(c.id,operator)).version,false);
 return {...c,unknown,hypothesis};
}
