import type {Pool} from 'pg';
import {DiagnosisError,type Actor} from '../domain/itManagementDiagnosis';
export type ScopeRecommendation='COMPACT'|'STANDARD'|'REVIEW'|'EXPANDED';
/** AS-A4 advisory recommendation. Human decides final Scope/price. */
export class AssessmentScopeRecommendationRepo{
 constructor(private readonly pool:Pool){}
 private staff(a:Actor){if(a.kind!=='STAFF'||!a.userId)throw new DiagnosisError(403,'スタッフによる操作が必要です。');}
 async read(id:string,a:Actor){this.staff(a);const c=await this.pool.connect();try{await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const cs=(await c.query<any>('SELECT diagnosis_status FROM diagnosis_cases WHERE id=$1',[id])).rows[0];if(!cs)throw new DiagnosisError(404,'案件が見つかりません。');if(cs.diagnosis_status!=='FEEDBACK_COMPLETED')throw new DiagnosisError(409,'Management Feedback完了後に確認してください。');const d=(await c.query<any>('SELECT id,version,route_code,context_hash FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];if(!d||d.route_code!=='DESIGN_ASSESSMENT')throw new DiagnosisError(409,'Design AssessmentがHuman Decisionされた案件だけが対象です。');const clar=(await c.query<any>('SELECT id,dimension,status,prompt_ja,reason_ja FROM assessment_scope_clarifications WHERE diagnosis_case_id=$1 ORDER BY created_at,id',[id])).rows;const open=clar.filter((x:any)=>x.status==='OPEN');const unresolved=(await c.query<any>(`SELECT id,semantic_type,unknown_type FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' AND semantic_type='UNKNOWN'`,[id])).rows;let candidate:ScopeRecommendation='REVIEW',reason_ja:string[]=[];
 // Safety-first: current structured model does not yet prove “relatively low”, “normal”, or “expanded” confirmation load.
 // Never infer a commercial class from counts. Human-resolved clarification can remove REVIEW, but AS-A4 does not fabricate a class.
 if(open.length||unresolved.length){reason_ja=['Scope判断に必要な情報がまだ残っています。分かっていることは再確認せず、不足している情報だけを確認してください。'];}
 else{reason_ja=['必要な追加確認は完了していますが、現時点の構造化情報だけでは確認負荷をCOMPACT / STANDARD / EXPANDEDのいずれかに自動確定できません。Humanが確認範囲と負荷を確認してください。'];}
 const missing_items=open.map((x:any)=>({id:x.id,dimension:x.dimension,prompt_ja:x.prompt_ja,reason_ja:x.reason_ja}));
 const out={recommendation_version:1,candidate,reason_ja,missing_items,important_known_context:{management_feedback_decision_id:d.id,management_feedback_decision_version:d.version,context_hash:d.context_hash,resolved_clarification_refs:clar.filter((x:any)=>x.status==='RESOLVED').map((x:any)=>x.id),remaining_unknown_refs:unresolved.map((x:any)=>x.id)},human_decision_required:true,price:null,semantics:{recommendation_is_decision:false,recommendation_is_fact:false,no_count_based_classification:true,review_is_internal_safety_state:true}};
 await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
}
