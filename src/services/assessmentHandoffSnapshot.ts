import type {PoolClient} from 'pg';
import {companyDisplayName,DiagnosisError} from '../domain/itManagementDiagnosis';
import {contentHash} from '../domain/diagnosisReport';
import {handoffSnapshotSchema,type HandoffSnapshot} from '../domain/diagnosisAssessment';
/** Pure projection of DB records. Clock is supplied by the System; no AI or raw-source copies. */
export async function buildAssessmentHandoffSnapshot(c:PoolClient,id:string,generatedAt:string):Promise<HandoffSnapshot>{
 const {rows:cases}=await c.query(`SELECT c.id,c.entry_channel,c.diagnosis_status,c.assessment_status,o.id AS organization_id,o.name FROM diagnosis_cases c JOIN organizations o ON o.id=c.organization_id WHERE c.id=$1`,[id]);const row=cases[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');
 const {rows:futures}=await c.query('SELECT id,version,statement,time_horizon,intent_status FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current',[id]);
 const {rows:reports}=await c.query('SELECT id,version,status,snapshot_json,content_json FROM diagnosis_reports WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id]);const report=reports[0];
 if(!futures[0]||!report||!['APPROVED','DELIVERED'].includes(report.status)||!report.snapshot_json)throw new DiagnosisError(409,'Current Futureと承認済みReportが必要です。');
 if(contentHash(report.content_json)!==report.snapshot_json.content_hash)throw new DiagnosisError(409,'Reportのhashが一致しません。');
 const {rows:insights}=await c.query(`SELECT i.id,i.version,i.semantic_type,i.title,i.content,i.unknown_type,i.area_tag,i.improvement_lens,i.diagnosis_theme_id,i.review_status,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('source_ref_type',s.source_ref_type,'source_ref_id',s.source_ref_id,'relation',s.relation) ORDER BY s.source_ref_type,s.source_ref_id,s.relation) FROM insight_sources s WHERE s.diagnosis_insight_id=i.id AND s.diagnosis_case_id=i.diagnosis_case_id),'[]'::jsonb) AS source_refs
 FROM diagnosis_insights i WHERE i.diagnosis_case_id=$1 AND i.review_status='HUMAN_APPROVED' ORDER BY i.id`,[id]);
 const {rows:items}=await c.query(`SELECT id,title,purpose,priority,status,diagnosis_theme_id,related_insight_id,related_evidence_candidate_id FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 AND status='OPEN' ORDER BY priority,id`,[id]);
 const {rows:themes}=await c.query('SELECT id,title,future_relation FROM diagnosis_themes WHERE diagnosis_case_id=$1 ORDER BY id',[id]);
 const snapshot={schema_version:1,generated_at:generatedAt,organization:{id:row.organization_id,display_name:companyDisplayName(row.name)},provider_display_name:'atLIB株式会社',diagnosis_case_id:id,entry_channel:row.entry_channel,diagnosis_status:row.diagnosis_status,assessment_status:row.assessment_status,future:futures[0],report:{id:report.id,version:report.version,status:report.status,approval_snapshot_hash:contentHash(report.snapshot_json),content_hash:report.snapshot_json.content_hash},insights,assessment_confirmation_items:items,themes};
 const parsed=handoffSnapshotSchema.safeParse(snapshot);if(!parsed.success)throw new DiagnosisError(409,'Handoff Contextを確認してください。');return parsed.data;
}
