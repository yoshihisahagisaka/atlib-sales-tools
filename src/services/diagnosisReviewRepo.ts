import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { DiagnosisError,nextAction,type Actor,type DiagnosisStatus } from '../domain/itManagementDiagnosis';
import { insightInputSchema,assessmentInputSchema,checkReviewBoundary,validateStructurerOutput,REVIEW_PROMPT_VERSION,REVIEW_POLICY_VERSION,type InsightInput,type AssessmentInput } from '../domain/diagnosisReview';
import { buildPostDiagnosisContext,postDiagnosisSourceKeys,type PostDiagnosisContext } from './postDiagnosisContext';
import type { Execution } from './diagnosisPreparationRepo';
import {managementAnalysisReadModel} from './managementAnalysisReadModel';
interface ReviewCase {id:string;version:number;diagnosis_status:DiagnosisStatus;review_completed_at:Date|null;review_completed_by_user_id:string|null}
type ReviewAction='APPROVE'|'APPROVE_WITH_EDIT'|'CONVERT_TO_UNKNOWN'|'REJECT'|'SUPERSEDE';
export class DiagnosisReviewRepo {
 constructor(private readonly pool:Pool){}
 async analysis(id:string,actor:Actor){return this.tx(async c=>{await this.locked(c,id,actor,false);return managementAnalysisReadModel(c,id);});}
 private async tx<T>(work:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId)throw new DiagnosisError(403,'スタッフによる操作が必要です。');return actor.userId;}
 private async locked(c:PoolClient,id:string,actor:Actor,mutate=true,version?:number){
  this.staff(actor);const {rows}=await c.query<ReviewCase>('SELECT id,version,diagnosis_status,review_completed_at,review_completed_by_user_id FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[id]);const row=rows[0];
  if(!row)throw new DiagnosisError(404,'案件が見つかりません。');if(mutate&&row.diagnosis_status!=='HUMAN_REVIEW_REQUIRED')throw new DiagnosisError(409,'Human Review待ちの案件で操作してください。');
  if(version!==undefined&&row.version!==version)throw new DiagnosisError(409,'内容が更新されています。再読み込みして確認してください。');return row;
 }
 private async audit(c:PoolClient,id:string,actor:Actor,command:string,detail:unknown,changed=true){
  if(changed)await c.query('UPDATE diagnosis_cases SET version=version+1,updated_at=now() WHERE id=$1',[id]);
  await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,$3,'STAFF',$4,$5)`,[randomUUID(),id,command,this.staff(actor),JSON.stringify(detail)]);
 }
 private async review(c:PoolClient,id:string,actor:Actor,targetType:string,key:string,action:ReviewAction,before:unknown,after:unknown,reason:string){
  await c.query('INSERT INTO human_reviews(id,diagnosis_case_id,target_type,target_id,action,before_json,after_json,reason,reviewed_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),id,targetType,key,action,JSON.stringify(before),JSON.stringify(after),reason,this.staff(actor)]);
 }
 private async theme(c:PoolClient,id:string,key:string|null){if(key&&!(await c.query(`SELECT id FROM diagnosis_themes WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'`,[key,id])).rows.length)throw new DiagnosisError(422,'同じ案件の有効なテーマを指定してください。');}
 private async validateInsight(c:PoolClient,id:string,raw:unknown):Promise<InsightInput>{
  const p=insightInputSchema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'Insightの意味区分・出典・UNKNOWN区分を確認してください。');const input=p.data;
  checkReviewBoundary(input.title+' '+input.content);await this.theme(c,id,input.diagnosis_theme_id);
  for(const ref of input.source_refs){const table=ref.source_ref_type==='SURVEY_RESPONSE'?'survey_responses':'source_records';if(!(await c.query(`SELECT id FROM ${table} WHERE id=$1 AND diagnosis_case_id=$2`,[ref.source_ref_id,id])).rows.length)throw new DiagnosisError(422,'同じ案件の実在する出典を指定してください。');}
  return input;
 }
 private async insertInsight(c:PoolClient,id:string,actor:Actor,input:InsightInput,proposalId:string|null,previous?:{id:string;version:number}){
  const key=randomUUID();await c.query(`INSERT INTO diagnosis_insights(id,diagnosis_case_id,diagnosis_theme_id,semantic_type,title,content,unknown_type,area_tag,improvement_lens,review_status,source_ai_proposal_id,previous_insight_id,created_by,created_by_user_id,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'HUMAN_APPROVED',$10,$11,$12,$13,$14)`,[key,id,input.diagnosis_theme_id,input.semantic_type,input.title,input.content,input.unknown_type,input.area_tag,input.improvement_lens,proposalId,previous?.id??null,proposalId&&!previous?'AI_ACCEPTED':'HUMAN',this.staff(actor),previous?previous.version+1:1]);
  for(const ref of input.source_refs)await c.query('INSERT INTO insight_sources(diagnosis_insight_id,diagnosis_case_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[key,id,ref.source_ref_type,ref.source_ref_id,ref.relation]);return key;
 }
 async enqueue(id:string,actor:Actor,provider:string,model:string){return this.tx(async c=>{
  await this.locked(c,id,actor);if((await c.query(`SELECT id FROM ai_executions WHERE diagnosis_case_id=$1 AND status IN ('PENDING','RUNNING')`,[id])).rows.length)throw new DiagnosisError(409,'AIは実行待ちまたは実行中です。');
  const input=await buildPostDiagnosisContext(c,id),key=randomUUID();await c.query(`INSERT INTO ai_executions(id,diagnosis_case_id,process_type,status,provider,model,prompt_version,policy_version,input_snapshot_json,requested_by_user_id) VALUES($1,$2,'POST_DIAGNOSIS_STRUCTURER','PENDING',$3,$4,$5,$6,$7,$8)`,[key,id,provider,model,REVIEW_PROMPT_VERSION,REVIEW_POLICY_VERSION,JSON.stringify(input),this.staff(actor)]);
  await this.audit(c,id,actor,'RunPostDiagnosisStructurer',{execution_id:key},false);return {execution_id:key,status:'PENDING'};
 });}
 async finishExecution(execution:Execution<PostDiagnosisContext>,raw:unknown){
  const output=validateStructurerOutput(raw,postDiagnosisSourceKeys(execution.input_snapshot_json),new Set(execution.input_snapshot_json.themes.map(t=>t.id)));
  await this.tx(async c=>{
   const {rows:cases}=await c.query('SELECT diagnosis_status FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[execution.diagnosis_case_id]);
   const {rows:jobs}=await c.query(`SELECT status FROM ai_executions WHERE id=$1 AND process_type='POST_DIAGNOSIS_STRUCTURER' FOR UPDATE`,[execution.id]);if(jobs[0]?.status!=='RUNNING')return;
   if(cases[0]?.diagnosis_status!=='HUMAN_REVIEW_REQUIRED'){await c.query(`UPDATE ai_executions SET status='FAILED',error_code='CASE_STATE_CHANGED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);return;}
   for(const [index,p] of output.insight_candidates.entries()){
    await this.validateInsight(c,execution.diagnosis_case_id,p);const key=randomUUID();
    await c.query('INSERT INTO ai_proposals(id,diagnosis_case_id,ai_execution_id,proposal_type,title,content_json,display_order) VALUES($1,$2,$3,$4,$5,$6,$7)',[key,execution.diagnosis_case_id,execution.id,p.semantic_type,p.title,JSON.stringify(p),index]);
    for(const ref of p.source_refs)await c.query('INSERT INTO ai_proposal_sources(ai_proposal_id,diagnosis_case_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[key,execution.diagnosis_case_id,ref.source_ref_type,ref.source_ref_id,ref.relation]);
   }
   for(const p of output.assessment_confirmation_items)await this.theme(c,execution.diagnosis_case_id,p.diagnosis_theme_id);
   // Assessment candidates remain only in validated raw output until a Human command.
   await c.query(`UPDATE ai_executions SET status='SUCCEEDED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);
  });
 }
 async resolve(id:string,key:string,actor:Actor,action:Exclude<ReviewAction,'SUPERSEDE'>,reason:string,edit?:InsightInput,unknownType?:InsightInput['unknown_type']){
  return this.tx(async c=>{
   await this.locked(c,id,actor);const {rows}=await c.query(`SELECT p.* FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.id=$1 AND p.diagnosis_case_id=$2 AND e.process_type='POST_DIAGNOSIS_STRUCTURER'`,[key,id]);const p=rows[0];
   if(!p)throw new DiagnosisError(404,'診断後整理の提案が見つかりません。');if(!['GENERATED','UNDER_REVIEW'].includes(p.status))throw new DiagnosisError(409,'この提案は判断済みです。');
   if(!['APPROVE','APPROVE_WITH_EDIT','CONVERT_TO_UNKNOWN','REJECT'].includes(action))throw new DiagnosisError(422,'判断を確認してください。');
   let result:{id:string;insight:InsightInput}|null=null;
   if(action!=='REJECT'){
    if(action==='APPROVE_WITH_EDIT'&&!edit)throw new DiagnosisError(422,'編集後の内容が必要です。');
    const original=p.content_json;
    const input=await this.validateInsight(c,id,action==='APPROVE_WITH_EDIT'?edit:action==='CONVERT_TO_UNKNOWN'?{...original,semantic_type:'UNKNOWN',unknown_type:unknownType}:original);
    const insightId=await this.insertInsight(c,id,actor,input,key);result={id:insightId,insight:input};
   }
   const state=action==='REJECT'?'REJECTED':action==='APPROVE'?'ACCEPTED':'ACCEPTED_WITH_EDIT';await c.query('UPDATE ai_proposals SET status=$2,updated_at=now() WHERE id=$1',[key,state]);
   await this.review(c,id,actor,'AI_PROPOSAL',key,action,p,{proposal_status:state,created_insight:result},reason);
   const command={APPROVE:'ApproveAIProposal',APPROVE_WITH_EDIT:'ApproveAIProposalWithEdit',CONVERT_TO_UNKNOWN:'ConvertProposalToUnknown',REJECT:'RejectAIProposal'}[action];
   await this.audit(c,id,actor,command,{proposal_id:key,insight_id:result?.id??null});return result?{id:result.id}:null;
  });
 }
 async createInsight(id:string,actor:Actor,raw:InsightInput,reason=''){return this.tx(async c=>{
  await this.locked(c,id,actor);const input=await this.validateInsight(c,id,raw);const key=await this.insertInsight(c,id,actor,input,null);
  await this.review(c,id,actor,'DIAGNOSIS_INSIGHT',key,'APPROVE',null,{id:key,...input,review_status:'HUMAN_APPROVED'},reason);await this.audit(c,id,actor,'CreateHumanInsight',{insight_id:key});return {id:key};
 });}
 async supersede(id:string,key:string,actor:Actor,raw:InsightInput,reason:string){return this.tx(async c=>{
  await this.locked(c,id,actor);const {rows}=await c.query(`SELECT * FROM diagnosis_insights WHERE id=$1 AND diagnosis_case_id=$2 AND review_status='HUMAN_APPROVED'`,[key,id]);const old=rows[0];if(!old)throw new DiagnosisError(409,'置換対象のHuman Approved Insightがありません。');
  const input=await this.validateInsight(c,id,raw);const replacement=await this.insertInsight(c,id,actor,input,old.source_ai_proposal_id,old);
  await c.query(`UPDATE diagnosis_insights SET review_status='SUPERSEDED',updated_at=now() WHERE id=$1`,[key]);
  await this.review(c,id,actor,'DIAGNOSIS_INSIGHT',key,'SUPERSEDE',old,{id:replacement,previous_insight_id:key,version:old.version+1,...input},reason);
  await this.audit(c,id,actor,'SupersedeInsight',{previous_insight_id:key,replacement_insight_id:replacement});return {id:replacement};
 });}
 async createAssessment(id:string,actor:Actor,raw:AssessmentInput){return this.tx(async c=>{
  await this.locked(c,id,actor);const parsed=assessmentInputSchema.safeParse(raw);if(!parsed.success)throw new DiagnosisError(422,'Assessment確認項目の入力を確認してください。');const p=parsed.data;
  checkReviewBoundary(p.title+' '+p.purpose);await this.theme(c,id,p.diagnosis_theme_id);
  for(const [key,evidence] of [[p.related_insight_id,false],[p.related_evidence_candidate_id,true]] as const)if(key){const {rows}=await c.query(`SELECT semantic_type FROM diagnosis_insights WHERE id=$1 AND diagnosis_case_id=$2 AND review_status='HUMAN_APPROVED'`,[key,id]);if(!rows[0]||(evidence&&rows[0].semantic_type!=='EVIDENCE_CANDIDATE'))throw new DiagnosisError(422,'同じ案件のHuman Approved Insightを指定してください。');}
  if(p.source_ai_proposal_id&&!(await c.query(`SELECT p.id FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.id=$1 AND p.diagnosis_case_id=$2 AND e.process_type='POST_DIAGNOSIS_STRUCTURER' AND p.status IN ('ACCEPTED','ACCEPTED_WITH_EDIT')`,[p.source_ai_proposal_id,id])).rows.length)throw new DiagnosisError(422,'この案件で採用済みの提案を指定してください。');
  let candidate:unknown=null;
  if(p.source_ai_execution_id){const {rows}=await c.query(`SELECT raw_output_json FROM ai_executions WHERE id=$1 AND diagnosis_case_id=$2 AND process_type='POST_DIAGNOSIS_STRUCTURER' AND status='SUCCEEDED' AND validation_status='VALID'`,[p.source_ai_execution_id,id]);candidate=rows[0]?.raw_output_json?.assessment_confirmation_items?.[p.source_candidate_index!];if(!candidate)throw new DiagnosisError(422,'Assessment確認候補がありません。');if((await c.query('SELECT id FROM assessment_confirmation_items WHERE source_ai_execution_id=$1 AND source_candidate_index=$2',[p.source_ai_execution_id,p.source_candidate_index])).rows.length)throw new DiagnosisError(409,'この確認候補は採用済みです。');}
  const key=randomUUID();await c.query('INSERT INTO assessment_confirmation_items(id,diagnosis_case_id,diagnosis_theme_id,title,purpose,priority,related_insight_id,related_evidence_candidate_id,source_ai_proposal_id,source_ai_execution_id,source_candidate_index,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[key,id,p.diagnosis_theme_id,p.title,p.purpose,p.priority,p.related_insight_id,p.related_evidence_candidate_id,p.source_ai_proposal_id,p.source_ai_execution_id,p.source_candidate_index,this.staff(actor)]);
  await this.review(c,id,actor,'ASSESSMENT_CONFIRMATION_ITEM',key,'APPROVE',candidate,{id:key,...p},'');await this.audit(c,id,actor,'CreateAssessmentConfirmationItem',{id:key});return {id:key};
 });}
 private async approved(c:PoolClient,id:string){
  const {rows:insights}=await c.query(`SELECT i.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('source_ref_type',s.source_ref_type,'source_ref_id',s.source_ref_id,'relation',s.relation)) FROM insight_sources s WHERE s.diagnosis_insight_id=i.id),'[]'::jsonb) AS source_refs FROM diagnosis_insights i WHERE i.diagnosis_case_id=$1 AND i.review_status='HUMAN_APPROVED' ORDER BY i.created_at,i.id`,[id]);return insights;
 }
 async reportContext(id:string,actor:Actor){return this.tx(async c=>{
  await this.locked(c,id,actor,false);const {rows:future}=await c.query('SELECT id,statement,time_horizon,intent_status,version FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current',[id]);
  const insights=await this.approved(c,id);const {rows:assessment_confirmation_items}=await c.query(`SELECT * FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 AND status='OPEN' ORDER BY priority,created_at`,[id]);
  return {future:future[0]??null,insights,assessment_confirmation_items};
 });}
 private async pending(c:PoolClient,id:string){
  const {rows}=await c.query(`SELECT p.id FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='POST_DIAGNOSIS_STRUCTURER' AND p.status IN ('GENERATED','UNDER_REVIEW')`,[id]);
  const {rows:jobs}=await c.query(`SELECT id FROM ai_executions WHERE diagnosis_case_id=$1 AND process_type='POST_DIAGNOSIS_STRUCTURER' AND status IN ('PENDING','RUNNING')`,[id]);
  const {rows:candidates}=await c.query(`SELECT e.id,v.ordinality-1 AS candidate_index FROM ai_executions e CROSS JOIN LATERAL jsonb_array_elements(e.raw_output_json->'assessment_confirmation_items') WITH ORDINALITY AS v(value,ordinality) WHERE e.diagnosis_case_id=$1 AND e.process_type='POST_DIAGNOSIS_STRUCTURER' AND e.status='SUCCEEDED' AND NOT EXISTS (SELECT 1 FROM assessment_confirmation_items a WHERE a.source_ai_execution_id=e.id AND a.source_candidate_index=v.ordinality-1)`,[id]);
  return {proposal_ids:rows.map(p=>p.id),execution_ids:jobs.map(e=>e.id),assessment_candidates:candidates};
 }
 async complete(id:string,actor:Actor,expectedVersion:number,leaveUnreviewed:boolean){await this.tx(async c=>{
  await this.locked(c,id,actor,true,expectedVersion);const pending=await this.pending(c,id);
  if(!leaveUnreviewed&&(pending.proposal_ids.length||pending.execution_ids.length||pending.assessment_candidates.length))throw new DiagnosisError(422,'未処理候補を残して完了する場合は明示してください。');
  const approved=await this.approved(c,id);
  await c.query(`UPDATE diagnosis_cases SET diagnosis_status='REPORT_REVIEW_REQUIRED',review_completed_at=now(),review_completed_by_user_id=$2 WHERE id=$1`,[id,this.staff(actor)]);
  await c.query(`INSERT INTO case_transitions(id,diagnosis_case_id,from_status,to_status,command,actor_type,actor_user_id) VALUES($1,$2,'HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED','CompleteHumanReview','STAFF',$3)`,[randomUUID(),id,this.staff(actor)]);
  await this.audit(c,id,actor,'CompleteHumanReview',{approved_insight_ids:approved.map(i=>i.id),leave_unreviewed:leaveUnreviewed,pending});
 });}
 async read(id:string,actor:Actor){return this.tx(async c=>{
  const row=await this.locked(c,id,actor,false);
  const {rows:proposals}=await c.query(`SELECT p.* FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='POST_DIAGNOSIS_STRUCTURER' ORDER BY p.created_at DESC,p.display_order`,[id]);
  const {rows:executions}=await c.query(`SELECT id,status,provider,model,validation_status,error_code,created_at,completed_at,CASE WHEN status='SUCCEEDED' AND validation_status='VALID' THEN raw_output_json->'assessment_confirmation_items' ELSE '[]'::jsonb END AS assessment_candidates FROM ai_executions WHERE diagnosis_case_id=$1 AND process_type='POST_DIAGNOSIS_STRUCTURER' ORDER BY created_at DESC`,[id]);
  const {rows:history}=await c.query('SELECT id,semantic_type,title,content,version,review_status,previous_insight_id FROM diagnosis_insights WHERE diagnosis_case_id=$1 ORDER BY created_at,id',[id]);
  const {rows:reviews}=await c.query('SELECT target_type,target_id,action,before_json,after_json,reason,reviewed_by_user_id,reviewed_at FROM human_reviews WHERE diagnosis_case_id=$1 ORDER BY reviewed_at,id',[id]);
  const {rows:assessment_confirmation_items}=await c.query('SELECT * FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 ORDER BY priority,created_at',[id]);
  return {...row,current_next_action:nextAction(row.diagnosis_status),proposals,executions,approved_insights:await this.approved(c,id),insight_history:history,reviews,assessment_confirmation_items,pending:await this.pending(c,id)};
 });}
}
