import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { DiagnosisError,type Actor } from '../domain/itManagementDiagnosis';
import { contentHash } from '../domain/diagnosisReport';
import type { ManagementFeedbackDecisionSnapshot,ManagementFeedbackRoute } from '../domain/managementFeedback';

interface CaseRow {id:string;version:number;diagnosis_status:string;feedback_report_id:string|null}
interface DecisionRow {id:string;diagnosis_case_id:string;version:number;route_code:ManagementFeedbackRoute;material_decision:string;next_action:string;customer_restatement_source_id:string|null;context_snapshot_json:ManagementFeedbackDecisionSnapshot;context_hash:string;supersedes_decision_id:string|null;decided_by_user_id:string;decided_at:Date}

export class ManagementFeedbackDecisionRepo {
 constructor(private readonly pool:Pool){}
 private async tx<T>(work:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const out=await work(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId)throw new DiagnosisError(403,'スタッフによる判断が必要です。');return actor.userId;}
 private async lock(c:PoolClient,id:string,actor:Actor,expectedVersion?:number){this.staff(actor);const {rows}=await c.query<CaseRow>('SELECT id,version,diagnosis_status,feedback_report_id FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[id]);const row=rows[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');if(expectedVersion!==undefined&&row.version!==expectedVersion)throw new DiagnosisError(409,'内容が更新されています。再読み込みしてください。');if(row.diagnosis_status!=='FEEDBACK_COMPLETED')throw new DiagnosisError(409,'Management Feedback完了後に判断してください。');if(!row.feedback_report_id)throw new DiagnosisError(409,'Feedback対象Reportがありません。');return row;}
 private async snapshot(c:PoolClient,row:CaseRow,customerRestatementSourceId:string|null):Promise<ManagementFeedbackDecisionSnapshot>{
  if(customerRestatementSourceId){const source=(await c.query(`SELECT id FROM source_records WHERE id=$1 AND diagnosis_case_id=$2 AND source_type='FEEDBACK_STATEMENT'`,[customerRestatementSourceId,row.id])).rows[0];if(!source)throw new DiagnosisError(422,'同じ案件のFeedback顧客発言を指定してください。');}
  const report=(await c.query<any>(`SELECT id,version,content_version,content_json,snapshot_json FROM diagnosis_reports WHERE id=$1 AND diagnosis_case_id=$2 AND status IN ('APPROVED','DELIVERED')`,[row.feedback_report_id,row.id])).rows[0];if(!report||!report.snapshot_json)throw new DiagnosisError(409,'承認済みManagement Feedback Reportがありません。');
  const insights=(await c.query<any>(`SELECT id,version,semantic_type,unknown_type FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' ORDER BY created_at,id`,[row.id])).rows;
  const evidence=(await c.query<any>(`SELECT id FROM assessment_confirmation_items WHERE diagnosis_case_id=$1 AND status='OPEN' ORDER BY priority,id`,[row.id])).rows;
  const future=report.snapshot_json.future??null;
  return {
   report:{id:report.id,version:report.version,content_version:report.content_version,content_hash:contentHash(report.content_json),approval_snapshot_hash:contentHash(report.snapshot_json)},
   future:future?{id:future.id,version:future.version,intent_status:future.intent_status,statement:future.statement??null}:null,
   insight_refs:insights.map((i:any)=>({id:i.id,version:i.version,semantic_type:i.semantic_type,unknown_type:i.unknown_type??null})),
   unknown_refs:insights.filter((i:any)=>i.semantic_type==='UNKNOWN').map((i:any)=>i.id),
   gap_refs:insights.filter((i:any)=>i.semantic_type==='GAP_CANDIDATE').map((i:any)=>i.id),
   hypothesis_refs:insights.filter((i:any)=>['HYPOTHESIS','ROOT_CAUSE_HYPOTHESIS'].includes(i.semantic_type)).map((i:any)=>i.id),
   evidence_needed_refs:evidence.map((i:any)=>i.id),
   customer_restatement_source_id:customerRestatementSourceId,
  };
 }
 async decide(id:string,actor:Actor,input:{expectedVersion:number;route:ManagementFeedbackRoute;materialDecision:string;nextAction:string;customerRestatementSourceId?:string|null}){return this.tx(async c=>{
  const row=await this.lock(c,id,actor,input.expectedVersion),previous=(await c.query<DecisionRow>('SELECT * FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0]??null;
  const snapshot=await this.snapshot(c,row,input.customerRestatementSourceId??null),hash=contentHash(snapshot),key=randomUUID(),version=(previous?.version??0)+1,decidedBy=this.staff(actor);
  await c.query(`INSERT INTO management_feedback_decisions(id,diagnosis_case_id,version,route_code,material_decision,next_action,customer_restatement_source_id,context_snapshot_json,context_hash,supersedes_decision_id,decided_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[key,id,version,input.route,input.materialDecision.trim(),input.nextAction.trim(),input.customerRestatementSourceId??null,JSON.stringify(snapshot),hash,previous?.id??null,decidedBy]);
  await c.query('UPDATE diagnosis_cases SET version=version+1,updated_at=now() WHERE id=$1',[id]);
  await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,'RecordManagementFeedbackDecision','STAFF',$3,$4)`,[randomUUID(),id,decidedBy,JSON.stringify({decision_id:key,decision_version:version,route:input.route,context_hash:hash,supersedes_decision_id:previous?.id??null})]);
  return {id:key,version,route:input.route,context_hash:hash};
 });}
 async read(id:string,actor:Actor){return this.tx(async c=>{await this.lock(c,id,actor);const history=(await c.query<DecisionRow>('SELECT * FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC',[id])).rows;return {latest:history[0]??null,history};});}
 async latestRoute(c:PoolClient,id:string){const row=(await c.query<{route_code:ManagementFeedbackRoute}>('SELECT route_code FROM management_feedback_decisions WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];return row?.route_code??null;}
}
