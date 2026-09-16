import type { Pool, PoolClient } from 'pg';
import { DiagnosisError, companyDisplayName, type Actor } from '../domain/itManagementDiagnosis';

export type ScopeKnowledge = 'AVAILABLE' | 'NEEDS_CONFIRMATION' | 'UNKNOWN';
export type LoadSignal = 'NO_MATERIAL_SIGNAL' | 'REVIEW_SIGNAL' | 'INSUFFICIENT_INFORMATION';
export type ScopeDimensionCode = 'TARGET_CORPORATIONS'|'SITES'|'IT_ENVIRONMENT'|'OPERATIONS'|'STAKEHOLDERS'|'MATERIALS_RECORDS'|'SPECIAL_REQUIREMENTS';
export type LoadDimensionCode = 'SCOPE_BOUNDARY'|'INFORMATION_DISPERSION'|'MANAGEMENT_OWNER_DISPERSION'|'EVIDENCE_CONFIRMATION'|'INTERVIEW_LOAD'|'SPECIAL_REQUIREMENTS';
interface CaseRow { id:string; diagnosis_status:string; organization_name:string; }
interface DecisionRow { id:string; version:number; route_code:string; context_hash:string; decided_at:Date; }
/** AS-A2 read projection. Never promotes a statement/approved Insight to Evidence-confirmed FACT. */
export class AssessmentScopeContextRepo {
 constructor(private readonly pool:Pool){}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId)throw new DiagnosisError(403,'スタッフによる操作が必要です。');return actor.userId;}
 private async decision(c:PoolClient,id:string){return (await c.query<DecisionRow>('SELECT id,version,route_code,context_hash,decided_at FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0]??null;}
 async read(id:string,actor:Actor){this.staff(actor);const c=await this.pool.connect();try{
  await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const row=(await c.query<CaseRow>('SELECT c.id,c.diagnosis_status,o.name AS organization_name FROM diagnosis_cases c JOIN organizations o ON o.id=c.organization_id WHERE c.id=$1',[id])).rows[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');
  const decision=await this.decision(c,id);if(!decision||decision.route_code!=='DESIGN_ASSESSMENT')throw new DiagnosisError(409,'Management FeedbackでDesign AssessmentがHuman Decisionされた案件で確認してください。');
  const future=(await c.query<any>('SELECT id,version,intent_status,statement FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1',[id])).rows[0]??null;
  const participants=(await c.query<any>(`SELECT p.id,p.name,array_remove(array_agg(pr.role),NULL) AS roles FROM participants p LEFT JOIN participant_roles pr ON pr.participant_id=p.id WHERE p.diagnosis_case_id=$1 GROUP BY p.id,p.name,p.created_at ORDER BY p.created_at,p.id`,[id])).rows;
  const sources=(await c.query<any>('SELECT id,source_type,parent_source_record_id,external_reference,created_at FROM source_records WHERE diagnosis_case_id=$1 ORDER BY created_at,id',[id])).rows;
  const insights=(await c.query<any>(`SELECT i.id,i.semantic_type,i.unknown_type,i.version,COALESCE(jsonb_agg(jsonb_build_object('source_ref_type',s.source_ref_type,'source_ref_id',s.source_ref_id,'relation',s.relation)) FILTER (WHERE s.source_ref_id IS NOT NULL),'[]'::jsonb) AS source_refs FROM diagnosis_insights i LEFT JOIN insight_sources s ON s.diagnosis_insight_id=i.id AND s.diagnosis_case_id=i.diagnosis_case_id WHERE i.diagnosis_case_id=$1 AND i.review_status='HUMAN_APPROVED' GROUP BY i.id,i.semantic_type,i.unknown_type,i.version,i.created_at ORDER BY i.created_at,i.id`,[id])).rows;
  const confirmationItems=(await c.query<any>(`SELECT id,title,purpose,status,diagnosis_theme_id,related_insight_id,related_evidence_candidate_id FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 ORDER BY created_at,id`,[id])).rows;
  const report=(await c.query<any>(`SELECT id,version,status,context_hash FROM diagnosis_reports WHERE diagnosis_case_id=$1 AND status IN ('APPROVED','DELIVERED') ORDER BY version DESC LIMIT 1`,[id])).rows[0]??null;
  const unknownRefs=insights.filter((x:any)=>x.semantic_type==='UNKNOWN').map((x:any)=>x.id),evidenceCandidateRefs=insights.filter((x:any)=>x.semantic_type==='EVIDENCE_CANDIDATE').map((x:any)=>x.id),participantRefs=participants.map((p:any)=>p.id);
  const materialSourceRefs=sources.filter((s:any)=>['DOCUMENT_EXISTENCE_OBSERVED','SCREEN_SHARED_INFORMATION'].includes(s.source_type)).map((s:any)=>s.id),hasStakeholders=participants.length>0,hasMaterialSignal=materialSourceRefs.length>0||evidenceCandidateRefs.length>0||confirmationItems.length>0;
  const dimension=(code:ScopeDimensionCode,label:string,knowledge:ScopeKnowledge,refs:string[],reason:string)=>({code,label,knowledge,source_refs:refs,reason});
  const scope_dimensions=[
   dimension('TARGET_CORPORATIONS','対象法人','NEEDS_CONFIRMATION',[],'組織は確認済みですが、Assessmentで詳細確認する法人範囲は専用項目として確定していません。'),
   dimension('SITES','拠点','UNKNOWN',[],'Assessment対象拠点を示す構造化済み情報がありません。'),
   dimension('IT_ENVIRONMENT','IT環境',insights.length?'NEEDS_CONFIRMATION':'UNKNOWN',insights.map((x:any)=>x.id),'診断で把握した内容を再利用しますが、Assessment対象IT環境の境界はHuman確認が必要です。'),
   dimension('OPERATIONS','業務・運用',insights.length?'NEEDS_CONFIRMATION':'UNKNOWN',insights.map((x:any)=>x.id),'診断Insightを再利用しますが、個別確認が必要な業務・運用範囲は未確定です。'),
   dimension('STAKEHOLDERS','関係者',hasStakeholders?'AVAILABLE':'UNKNOWN',participantRefs,hasStakeholders?'既存Participant/Roleを再利用できます。':'確認対象となる関係者が構造化されていません。'),
   dimension('MATERIALS_RECORDS','資料・記録',hasMaterialSignal?'NEEDS_CONFIRMATION':'UNKNOWN',[...materialSourceRefs,...evidenceCandidateRefs],'存在・候補の記録だけを再利用し、何を証明するかはAssessmentで確認します。'),
   dimension('SPECIAL_REQUIREMENTS','個別に確認が必要な条件','UNKNOWN',[],'記載がないことを「特殊要件なし」とは扱いません。')];
  const load=(code:LoadDimensionCode,label:string,signal:LoadSignal,refs:string[],reason:string)=>({code,label,signal,source_refs:refs,reason});
  const load_dimensions=[
   load('SCOPE_BOUNDARY','確認する範囲','INSUFFICIENT_INFORMATION',[],'数量ではなく、経営判断に必要な確認範囲を追加確認します。'),
   load('INFORMATION_DISPERSION','情報がどこにあるか','INSUFFICIENT_INFORMATION',sources.map((s:any)=>s.id),'既存Sourceは再利用しますが、情報分散の全体像は推測しません。'),
   load('MANAGEMENT_OWNER_DISPERSION','誰に確認する必要があるか',hasStakeholders?'REVIEW_SIGNAL':'INSUFFICIENT_INFORMATION',participantRefs,hasStakeholders?'既存Participant/Roleを確認材料として提示します。主体の分散度はHuman確認が必要です。':'管理主体を推測できる十分な構造化情報がありません。'),
   load('EVIDENCE_CONFIRMATION','資料・記録の確認方法',hasMaterialSignal?'REVIEW_SIGNAL':'INSUFFICIENT_INFORMATION',[...materialSourceRefs,...evidenceCandidateRefs,...confirmationItems.map((x:any)=>x.id)],hasMaterialSignal?'Evidenceの存在/候補は確認材料にできますが、証明力・整合性・確認難易度はAssessment前に断定しません。':'Evidence確認負荷を推測できる情報が不足しています。'),
   load('INTERVIEW_LOAD','ヒアリングが必要な範囲',hasStakeholders?'REVIEW_SIGNAL':'INSUFFICIENT_INFORMATION',participantRefs,hasStakeholders?'既存関係者を再利用し、追加ヒアリング要否だけを確認します。':'必要なヒアリング対象を推測できません。'),
   load('SPECIAL_REQUIREMENTS','個別に確認が必要な条件','INSUFFICIENT_INFORMATION',[],'無記載を「なし」とせず、Scopeに影響する場合だけ追加確認します。')];
  const missing_items=scope_dimensions.filter(x=>x.knowledge!=='AVAILABLE').map(x=>({dimension:x.code,label:x.label,reason:x.reason}));
  const out={projection_version:1,diagnosis_case_id:id,organization_display_name:companyDisplayName(row.organization_name),provider_display_name:'atLIB株式会社',management_feedback_decision:{id:decision.id,version:decision.version,route:decision.route_code,context_hash:decision.context_hash,decided_at:decision.decided_at},future:future?{id:future.id,version:future.version,intent_status:future.intent_status,statement:future.statement}:null,approved_context:{insight_refs:insights.map((x:any)=>({id:x.id,semantic_type:x.semantic_type,unknown_type:x.unknown_type,version:x.version,source_refs:x.source_refs})),unknown_refs:unknownRefs,assessment_confirmation_item_refs:confirmationItems.map((x:any)=>({id:x.id,status:x.status,title:x.title})),report:report?{id:report.id,version:report.version,status:report.status,context_hash:report.context_hash}:null},scope_dimensions,confirmation_load_dimensions:load_dimensions,missing_items,semantics:{customer_statement_is_fact:false,human_approved_is_evidence_confirmed_fact:false,evidence_existence_is_proof:false,absence_means_none:false}};
  await c.query('COMMIT');return out;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
}
