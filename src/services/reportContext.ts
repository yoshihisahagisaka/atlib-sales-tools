import type { PoolClient } from 'pg';
import { companyDisplayName,DiagnosisError } from '../domain/itManagementDiagnosis';
import { futureKnowledgeStatus,futureReportText,insightReportText,whyConnectionReportText,type ReportContext,type ReportInsight } from '../domain/diagnosisReport';
/** Explicit SQL whitelist. Never query Raw SurveyResponse, SourceRecord, AIProposal, or raw customer text here. */
export async function buildReportContext(c:PoolClient,id:string):Promise<ReportContext>{
 const {rows:org}=await c.query('SELECT o.name FROM organizations o JOIN diagnosis_cases c ON c.organization_id=o.id WHERE c.id=$1',[id]);if(!org[0])throw new DiagnosisError(404,'案件が見つかりません。');
 const {rows:futures}=await c.query('SELECT id,version,statement,time_horizon,intent_status FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current',[id]);const future=futures[0];if(!future)throw new DiagnosisError(409,'Futureが必要です。');
 const {rows:rawInsights}=await c.query<Omit<ReportInsight,'report_text'|'why_connection'>>(`SELECT id,version,semantic_type,title,content,unknown_type,area_tag,improvement_lens FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' ORDER BY created_at,id`,[id]);
 const {rows:rawItems}=await c.query<{id:string;title:string;purpose:string;priority:number;status:'OPEN';related_insight_id:string|null}>(`SELECT id,title,purpose,priority,status,related_insight_id FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 AND status='OPEN' ORDER BY priority,created_at,id`,[id]);
 const {rows:sources}=await c.query<{diagnosis_insight_id:string;source_ref_type:'SURVEY_RESPONSE'|'SOURCE_RECORD';source_ref_id:string;relation:'SUPPORTS'|'CONTRADICTS'|'RELATED'}>(`SELECT diagnosis_insight_id,source_ref_type,source_ref_id,relation FROM insight_sources WHERE diagnosis_case_id=$1 ORDER BY diagnosis_insight_id,source_ref_type,source_ref_id,relation`,[id]);
 const baseInsights:ReportInsight[]=rawInsights.map(i=>({...i,report_text:insightReportText(i)}));
 const items=rawItems.map(({related_insight_id:_,...a})=>({...a,report_text:`Assessmentでの確認候補：${a.title}\n確認目的：${a.purpose}`}));
 const sourceKeys=new Map<string,Set<string>>();
 for(const source of sources){if(source.relation==='CONTRADICTS')continue;const set=sourceKeys.get(source.diagnosis_insight_id)??new Set<string>();set.add(`${source.source_ref_type}:${source.source_ref_id}`);sourceKeys.set(source.diagnosis_insight_id,set);}
 const observations=baseInsights.filter(i=>i.semantic_type==='OBSERVATION');
 const insights=baseInsights.map(hypothesis=>{
  if(!['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(hypothesis.semantic_type))return hypothesis;
  const hypothesisKeys=sourceKeys.get(hypothesis.id)??new Set<string>();
  const supporting=observations.filter(observation=>{const observationKeys=sourceKeys.get(observation.id);return observationKeys?[...hypothesisKeys].some(key=>observationKeys.has(key)):false;});
  const evidence=rawItems.filter(item=>item.related_insight_id===hypothesis.id);
  return {...hypothesis,why_connection:{supporting_insight_refs:supporting.map(i=>i.id),evidence_confirmation_refs:evidence.map(i=>i.id)},report_text:whyConnectionReportText(hypothesis,supporting,evidence)};
 });
 const knowledgeStatus=futureKnowledgeStatus(future.statement);
 return {organization_display_name:companyDisplayName(org[0].name),provider_display_name:'atLIB株式会社',future:{...future,knowledge_status:knowledgeStatus,report_text:futureReportText({...future,knowledge_status:knowledgeStatus})},insights,assessment_confirmation_items:items};
}
