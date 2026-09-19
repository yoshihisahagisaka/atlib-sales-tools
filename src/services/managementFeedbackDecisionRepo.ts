import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { DiagnosisError,type Actor } from '../domain/itManagementDiagnosis';
import { contentHash } from '../domain/diagnosisReport';
import { managementFeedbackDecisionSchema,type ManagementFeedbackDecisionSnapshot,type ManagementFeedbackRoute } from '../domain/managementFeedback';
import { buildReportContext } from './reportContext';

interface CaseRow {id:string;version:number;diagnosis_status:string;feedback_report_id:string|null}
interface DecisionRow {id:string;diagnosis_case_id:string;version:number;route_code:ManagementFeedbackRoute;material_decision:string;next_action:string;customer_restatement_source_id:string|null;context_snapshot_json:ManagementFeedbackDecisionSnapshot;context_hash:string;supersedes_decision_id:string|null;decided_by_user_id:string;decided_at:Date}

export class ManagementFeedbackDecisionRepo {
 constructor(private readonly pool:Pool){}
 private async tx<T>(work:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const out=await work(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId)throw new DiagnosisError(403,'スタッフによる判断が必要です。');return actor.userId;}
 private async lock(c:PoolClient,id:string,actor:Actor,expectedVersion?:number){this.staff(actor);const {rows}=await c.query<CaseRow>('SELECT id,version,diagnosis_status,feedback_report_id FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[id]);const row=rows[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');if(expectedVersion!==undefined&&row.version!==expectedVersion)throw new DiagnosisError(409,'内容が更新されています。再読み込みしてください。');if(!['FEEDBACK_COMPLETED','CLOSED'].includes(row.diagnosis_status))throw new DiagnosisError(409,'経営フィードバック完了後に判断してください。');if(!row.feedback_report_id)throw new DiagnosisError(409,'Feedback対象Reportがありません。');return row;}
 private async snapshot(c:PoolClient,row:CaseRow,customerRestatementSourceId:string|null):Promise<ManagementFeedbackDecisionSnapshot>{
  if(customerRestatementSourceId){const source=(await c.query(`SELECT id FROM source_records WHERE id=$1 AND diagnosis_case_id=$2 AND source_type='FEEDBACK_STATEMENT'`,[customerRestatementSourceId,row.id])).rows[0];if(!source)throw new DiagnosisError(422,'同じ案件のFeedback顧客発言を指定してください。');}
  const report=(await c.query<any>(`SELECT id,version,content_version,content_json,context_hash,snapshot_json FROM diagnosis_reports WHERE id=$1 AND diagnosis_case_id=$2 AND status IN ('APPROVED','DELIVERED')`,[row.feedback_report_id,row.id])).rows[0];if(!report||!report.snapshot_json)throw new DiagnosisError(409,'承認済みManagement Feedback Reportがありません。');
  const context=await buildReportContext(c,row.id);
  // Do not mix a previously approved Future with newer unpresented Insight/Evidence.
  // Correction requires the existing Human report reissue/approval/feedback loop.
  if(contentHash(context)!==report.context_hash)throw new DiagnosisError(409,'判断に使う情報が更新されています。経営フィードバック資料を再発行・承認し、対話を完了してください。');
  const insights=context.insights,evidence=context.assessment_confirmation_items,future=context.future;
  return {
   snapshot_version:2,
   report:{id:report.id,version:report.version,content_version:report.content_version,content_hash:contentHash(report.content_json),approval_snapshot_hash:contentHash(report.snapshot_json)},
   future:{id:future.id,version:future.version,intent_status:future.intent_status,knowledge_status:future.knowledge_status,statement:null},
   insight_refs:insights.map((i:any)=>({id:i.id,version:i.version,semantic_type:i.semantic_type,unknown_type:i.unknown_type??null})),
   unknown_refs:insights.filter((i:any)=>i.semantic_type==='UNKNOWN').map((i:any)=>i.id),
   gap_refs:insights.filter((i:any)=>i.semantic_type==='GAP_CANDIDATE').map((i:any)=>i.id),
   hypothesis_refs:insights.filter((i:any)=>['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(i.semantic_type)).map((i:any)=>i.id),
   evidence_needed_refs:evidence.map((i:any)=>i.id),
   customer_restatement_source_id:customerRestatementSourceId,
   observation_refs:insights.filter(i=>i.semantic_type==='OBSERVATION').map(i=>i.id),
   evidence_candidate_refs:insights.filter(i=>i.semantic_type==='EVIDENCE_CANDIDATE').map(i=>i.id),
   why_connections:insights.filter(i=>i.why_connection).map(i=>({hypothesis_id:i.id,...i.why_connection!})),
  };
 }
 async decide(id:string,actor:Actor,input:{expectedVersion:number;route:ManagementFeedbackRoute;materialDecision:string;nextAction:string;customerRestatementSourceId?:string|null}){
  this.staff(actor);const parsed=managementFeedbackDecisionSchema.safeParse(input);if(!parsed.success)throw new DiagnosisError(422,'Management Feedback判断の入力内容を確認してください。');input=parsed.data;
  return this.tx(async c=>{
  const row=await this.lock(c,id,actor,input.expectedVersion),previous=(await c.query<DecisionRow>('SELECT * FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0]??null;
  const snapshot=await this.snapshot(c,row,input.customerRestatementSourceId??null),key=randomUUID(),version=(previous?.version??0)+1,decidedBy=this.staff(actor),decidedAt=new Date().toISOString();
  snapshot.decision={id:key,version,route:input.route,material_decision:input.materialDecision,next_action:input.nextAction,decided_by_user_id:decidedBy,decided_at:decidedAt,supersedes_decision_id:previous?.id??null};
  const hash=contentHash(snapshot);
  await c.query(`INSERT INTO management_feedback_decisions(id,diagnosis_case_id,version,route_code,material_decision,next_action,customer_restatement_source_id,context_snapshot_json,context_hash,supersedes_decision_id,decided_by_user_id,decided_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[key,id,version,input.route,input.materialDecision,input.nextAction,input.customerRestatementSourceId??null,JSON.stringify(snapshot),hash,previous?.id??null,decidedBy,decidedAt]);
  const nextStatus=input.route==='FOCUSED_CONFIRMATION'?'DIAGNOSIS_IN_PROGRESS':'CLOSED';
  await c.query("UPDATE diagnosis_cases SET diagnosis_status=$2,closed_at=CASE WHEN $2='CLOSED' THEN now() ELSE NULL END,closed_by_user_id=CASE WHEN $2='CLOSED' THEN $3 ELSE NULL END,completed_at=CASE WHEN $2='DIAGNOSIS_IN_PROGRESS' THEN NULL ELSE completed_at END,review_completed_at=CASE WHEN $2='DIAGNOSIS_IN_PROGRESS' THEN NULL ELSE review_completed_at END,review_completed_by_user_id=CASE WHEN $2='DIAGNOSIS_IN_PROGRESS' THEN NULL ELSE review_completed_by_user_id END,version=version+1,updated_at=now() WHERE id=$1",[id,nextStatus,decidedBy]);
  await c.query("INSERT INTO case_transitions(id,diagnosis_case_id,from_status,to_status,command,actor_type,actor_user_id) VALUES($1,$2,$3,$4,'RecordManagementFeedbackDecision','STAFF',$5)",[randomUUID(),id,row.diagnosis_status,nextStatus,decidedBy]);
  await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,'RecordManagementFeedbackDecision','STAFF',$3,$4)`,[randomUUID(),id,decidedBy,JSON.stringify({decision_id:key,decision_version:version,route:input.route,context_hash:hash,supersedes_decision_id:previous?.id??null})]);
  return {id:key,version,route:input.route,context_hash:hash};
 });}
 async read(id:string,actor:Actor){this.staff(actor);return this.tx(async c=>{
  if(!(await c.query('SELECT id FROM diagnosis_cases WHERE id=$1',[id])).rows.length)throw new DiagnosisError(404,'案件が見つかりません。');
  const history=(await c.query<DecisionRow>('SELECT * FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC',[id])).rows;return {latest:history[0]??null,history};
 });}
 async latestRoute(c:PoolClient,id:string){const row=(await c.query<{route_code:ManagementFeedbackRoute}>('SELECT route_code FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];return row?.route_code??null;}
}
