import type { PoolClient } from 'pg';
import { companyDisplayName,DiagnosisError } from '../domain/itManagementDiagnosis';
import { insightReportText,type ReportContext,type ReportInsight } from '../domain/diagnosisReport';
/** Explicit SQL whitelist. Never query Raw SurveyResponse, SourceRecord, or AIProposal here. */
export async function buildReportContext(c:PoolClient,id:string):Promise<ReportContext>{
 const {rows:org}=await c.query('SELECT o.name FROM organizations o JOIN diagnosis_cases c ON c.organization_id=o.id WHERE c.id=$1',[id]);if(!org[0])throw new DiagnosisError(404,'案件が見つかりません。');
 const {rows:futures}=await c.query('SELECT id,version,statement,time_horizon,intent_status FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current',[id]);const future=futures[0];if(!future)throw new DiagnosisError(409,'Futureが必要です。');
 const {rows:insights}=await c.query<Omit<ReportInsight,'report_text'>>(`SELECT id,version,semantic_type,title,content,unknown_type,area_tag,improvement_lens FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' ORDER BY created_at,id`,[id]);
 const {rows:items}=await c.query<Omit<ReportContext['assessment_confirmation_items'][number],'report_text'>>(`SELECT id,title,purpose,priority,status FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 AND status='OPEN' ORDER BY priority,created_at,id`,[id]);
 return {organization_display_name:companyDisplayName(org[0].name),provider_display_name:'atLIB株式会社',future:{...future,report_text:`${future.intent_status==='SURVEY_STATED'?'アンケート回答時点の意図':'対話で再確認した意図'}：${future.statement}${future.time_horizon?'（'+future.time_horizon+'）':''}`},insights:insights.map(i=>({...i,report_text:insightReportText(i)})),assessment_confirmation_items:items.map(a=>({...a,report_text:`Assessmentでの確認候補：${a.title}\n確認目的：${a.purpose}`}))};
}
