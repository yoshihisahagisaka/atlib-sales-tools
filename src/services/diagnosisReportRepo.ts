import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { DiagnosisError,nextAction,type Actor,type DiagnosisStatus } from '../domain/itManagementDiagnosis';
import { rawSourceSchema } from '../domain/diagnosisWorkspace';
import { REPORT_PROMPT_VERSION,REPORT_POLICY_VERSION,assertWhyConnectionsReady,validateReportOutput,manualReport,storeReport,reportOutput,contentHash,wordingSchema,type StoredReport,type ReportContext,type ReportOutput } from '../domain/diagnosisReport';
import { buildReportContext } from './reportContext';
import type { Execution } from './diagnosisPreparationRepo';
interface ReportCase {id:string;version:number;diagnosis_status:DiagnosisStatus;feedback_report_id:string|null;feedback_started_at:Date|null;feedback_completed_at:Date|null;feedback_started_by_user_id:string|null}
interface ReportRow {id:string;diagnosis_case_id:string;version:number;content_version:number;status:string;content_json:StoredReport;context_json:ReportContext;context_hash:string;snapshot_json:any;prompt_version:string;policy_version:string;approved_at:Date|null;delivered_at:Date|null}
export interface ReportExecutionInput {context:ReportContext;case_version:number;latest_report_id:string|null}
export class DiagnosisReportRepo {
 constructor(private readonly pool:Pool){}
 private async tx<T>(work:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId)throw new DiagnosisError(403,'スタッフによる操作が必要です。');return actor.userId;}
 private async locked(c:PoolClient,id:string,actor:Actor,statuses?:string[],version?:number){
  this.staff(actor);const {rows}=await c.query<ReportCase>('SELECT id,version,diagnosis_status,feedback_report_id,feedback_started_at,feedback_completed_at,feedback_started_by_user_id FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[id]);const row=rows[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');
  if(statuses&&!statuses.includes(row.diagnosis_status))throw new DiagnosisError(409,'この案件の状態では操作できません。');if(version!==undefined&&version!==row.version)throw new DiagnosisError(409,'内容が更新されています。再読み込みしてください。');return row;
 }
 private async audit(c:PoolClient,id:string,actor:Actor,command:string,detail:unknown,change=true){if(change)await c.query('UPDATE diagnosis_cases SET version=version+1,updated_at=now() WHERE id=$1',[id]);await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,$3,'STAFF',$4,$5)`,[randomUUID(),id,command,this.staff(actor),JSON.stringify(detail)]);}
 private async transition(c:PoolClient,row:ReportCase,actor:Actor,to:string,command:string,detail:unknown){await c.query('UPDATE diagnosis_cases SET diagnosis_status=$2 WHERE id=$1',[row.id,to]);await c.query(`INSERT INTO case_transitions(id,diagnosis_case_id,from_status,to_status,command,actor_type,actor_user_id) VALUES($1,$2,$3,$4,$5,'STAFF',$6)`,[randomUUID(),row.id,row.diagnosis_status,to,command,this.staff(actor)]);await this.audit(c,row.id,actor,command,detail);}
 private async latest(c:PoolClient,id:string):Promise<ReportRow|null>{const {rows}=await c.query<ReportRow>('SELECT * FROM diagnosis_reports WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id]);return rows[0]??null;}
 private async target(c:PoolClient,id:string,key:string,statuses:string[]){const report=await this.latest(c,id);if(!report||report.id!==key)throw new DiagnosisError(409,'最新Reportを選択してください。');if(!statuses.includes(report.status))throw new DiagnosisError(409,'このReportは編集・承認できません。');return report;}
 private async freshContext(c:PoolClient,id:string,report:ReportRow){const context=await buildReportContext(c,id);if(contentHash(context)!==report.context_hash)throw new DiagnosisError(409,'Human Approved Contextが更新されています。新しいDraftを作成してください。');return context;}
 private async insert(c:PoolClient,id:string,actorId:string,context:ReportContext,output:ReportOutput,executionId:string|null){
  const reportId=randomUUID(),prior=await this.latest(c,id),version=(prior?.version??0)+1;
  await c.query(`INSERT INTO diagnosis_reports(id,diagnosis_case_id,version,status,content_json,context_json,context_hash,source_ai_execution_id,prompt_version,policy_version,created_by,created_by_user_id) VALUES($1,$2,$3,'REVIEW_REQUIRED',$4,$5,$6,$7,$8,$9,$10,$11)`,[reportId,id,version,JSON.stringify(storeReport(output)),JSON.stringify(context),contentHash(context),executionId,executionId?REPORT_PROMPT_VERSION:'human-projection-v1',REPORT_POLICY_VERSION,executionId?'AI':'HUMAN',actorId]);return {id:reportId,version};
 }
 async enqueue(id:string,actor:Actor,provider:string,model:string){return this.tx(async c=>{
  const row=await this.locked(c,id,actor,['REPORT_REVIEW_REQUIRED']);if((await c.query(`SELECT id FROM ai_executions WHERE diagnosis_case_id=$1 AND status IN ('PENDING','RUNNING')`,[id])).rows.length)throw new DiagnosisError(409,'AIは実行待ちまたは実行中です。');
  const input:ReportExecutionInput={context:await buildReportContext(c,id),case_version:row.version,latest_report_id:(await this.latest(c,id))?.id??null},key=randomUUID();
  await c.query(`INSERT INTO ai_executions(id,diagnosis_case_id,process_type,status,provider,model,prompt_version,policy_version,input_snapshot_json,requested_by_user_id) VALUES($1,$2,'REPORT_DRAFT_GENERATOR','PENDING',$3,$4,$5,$6,$7,$8)`,[key,id,provider,model,REPORT_PROMPT_VERSION,REPORT_POLICY_VERSION,JSON.stringify(input),this.staff(actor)]);await this.audit(c,id,actor,'GenerateReportDraft',{execution_id:key},false);return {execution_id:key,status:'PENDING'};
 });}
 async finishExecution(execution:Execution<ReportExecutionInput>,raw:unknown){const output=validateReportOutput(raw,execution.input_snapshot_json.context);await this.tx(async c=>{
  const {rows:cases}=await c.query('SELECT diagnosis_status,version FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[execution.diagnosis_case_id]);
  const {rows:jobs}=await c.query(`SELECT status,requested_by_user_id FROM ai_executions WHERE id=$1 AND process_type='REPORT_DRAFT_GENERATOR' FOR UPDATE`,[execution.id]);if(jobs[0]?.status!=='RUNNING')return;
  const input=execution.input_snapshot_json,latest=await this.latest(c,execution.diagnosis_case_id);
  const changed=cases[0]?.diagnosis_status!=='REPORT_REVIEW_REQUIRED'||cases[0]?.version!==input.case_version||(latest?.id??null)!==input.latest_report_id;
  const context=await buildReportContext(c,execution.diagnosis_case_id);
  if(changed||contentHash(context)!==contentHash(input.context)){await c.query(`UPDATE ai_executions SET status='FAILED',error_code='REPORT_CONTEXT_CHANGED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);return;}
  await this.insert(c,execution.diagnosis_case_id,jobs[0].requested_by_user_id,context,output,execution.id);
  await c.query(`UPDATE ai_executions SET status='SUCCEEDED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);
 });}
 async manual(id:string,actor:Actor,expectedVersion:number){return this.tx(async c=>{
  await this.locked(c,id,actor,['REPORT_REVIEW_REQUIRED'],expectedVersion);const context=await buildReportContext(c,id),output=validateReportOutput(manualReport(context),context);const result=await this.insert(c,id,this.staff(actor),context,output,null);await this.audit(c,id,actor,'CreateHumanReportDraft',{report_id:result.id});return result;
 });}
 async wording(id:string,actor:Actor,raw:unknown){const parsed=wordingSchema.safeParse(raw);if(!parsed.success)throw new DiagnosisError(422,'編集内容を確認してください。');const input=parsed.data;await this.tx(async c=>{
  await this.locked(c,id,actor,['REPORT_REVIEW_REQUIRED'],input.expectedVersion);const report=await this.target(c,id,input.report_id,['DRAFT','REVIEW_REQUIRED','REVISION_REQUIRED']),context=await this.freshContext(c,id,report);
  const content:StoredReport=JSON.parse(JSON.stringify(report.content_json));const edits=new Set<string>();
  for(const edit of input.blocks){if(edits.has(edit.block_id))throw new DiagnosisError(422,'同じblockを重複指定できません。');edits.add(edit.block_id);const block=content.sections.flatMap(s=>s.blocks).find(b=>b.block_id===edit.block_id);if(!block)throw new DiagnosisError(422,'blockがありません。');block.text=edit.text;}
  validateReportOutput(reportOutput(content),context);
  await c.query(`UPDATE diagnosis_reports SET content_json=$2,content_version=content_version+1,status='REVIEW_REQUIRED',updated_at=now() WHERE id=$1`,[report.id,JSON.stringify(content)]);await this.audit(c,id,actor,'UpdateReportWording',{report_id:report.id,before:report.content_json,after:content});
 });}
 async revision(id:string,actor:Actor,key:string,expectedVersion:number,reason:string,returnToReview:boolean){await this.tx(async c=>{
  const row=await this.locked(c,id,actor,['REPORT_REVIEW_REQUIRED'],expectedVersion);const report=await this.target(c,id,key,['DRAFT','REVIEW_REQUIRED','REVISION_REQUIRED']);if(!reason.trim())throw new DiagnosisError(422,'修正理由が必要です。');
  await c.query(`UPDATE diagnosis_reports SET status='REVISION_REQUIRED',revision_reason=$2,updated_at=now() WHERE id=$1`,[report.id,reason]);
  const detail={report_id:key,reason,return_to_review:returnToReview};if(returnToReview){await c.query('UPDATE diagnosis_cases SET review_completed_at=NULL,review_completed_by_user_id=NULL WHERE id=$1',[id]);await this.transition(c,row,actor,'HUMAN_REVIEW_REQUIRED','RequestReportRevision',detail);}else await this.audit(c,id,actor,'RequestReportRevision',detail);
 });}
 async approve(id:string,actor:Actor,key:string,expectedVersion:number){await this.tx(async c=>{
  const row=await this.locked(c,id,actor,['REPORT_REVIEW_REQUIRED'],expectedVersion),report=await this.target(c,id,key,['DRAFT','REVIEW_REQUIRED']),context=await this.freshContext(c,id,report);validateReportOutput(reportOutput(report.content_json),context);assertWhyConnectionsReady(context);
  const approvedAt=new Date().toISOString();const snapshot={future:context.future,insights:context.insights,assessment_confirmation_items:context.assessment_confirmation_items,organization_display_name:context.organization_display_name,provider_display_name:context.provider_display_name,policy_version:report.policy_version,prompt_version:report.prompt_version,report_version:report.version,content_version:report.content_version,content_hash:contentHash(report.content_json),approved_by:this.staff(actor),approved_at:approvedAt};
  await c.query(`UPDATE diagnosis_reports SET status='APPROVED',snapshot_json=$2,approved_by_user_id=$3,approved_at=$4,updated_at=now() WHERE id=$1`,[key,JSON.stringify(snapshot),this.staff(actor),approvedAt]);await this.transition(c,row,actor,'REPORT_APPROVED','ApproveReport',{report_id:key,version:report.version,content_hash:snapshot.content_hash});
 });}
 async deliver(id:string,actor:Actor,key:string,expectedVersion:number){await this.tx(async c=>{
  const row=await this.locked(c,id,actor,['REPORT_APPROVED'],expectedVersion);await this.target(c,id,key,['APPROVED']);
  await c.query(`UPDATE diagnosis_reports SET status='DELIVERED',delivered_at=now(),updated_at=now() WHERE id=$1`,[key]);await c.query('UPDATE diagnosis_cases SET feedback_report_id=$2,feedback_started_at=NULL,feedback_started_by_user_id=NULL,feedback_completed_at=NULL WHERE id=$1',[id,key]);await this.transition(c,row,actor,'FEEDBACK_PENDING','MarkReportDelivered',{report_id:key});
 });}
 async reissue(id:string,actor:Actor,expectedVersion:number,reason:string){return this.tx(async c=>{
  const row=await this.locked(c,id,actor,['REPORT_APPROVED','FEEDBACK_PENDING','FEEDBACK_COMPLETED'],expectedVersion),previous=await this.latest(c,id);if(!previous||!['APPROVED','DELIVERED'].includes(previous.status))throw new DiagnosisError(409,'再発行対象の承認済Reportがありません。');if(!reason.trim())throw new DiagnosisError(422,'再発行理由が必要です。');
  const context=await buildReportContext(c,id),result=await this.insert(c,id,this.staff(actor),context,validateReportOutput(manualReport(context),context),null);await this.transition(c,row,actor,'REPORT_REVIEW_REQUIRED','StartReportReissue',{previous_report_id:previous.id,new_report_id:result.id,reason});return result;
 });}
 async startFeedback(id:string,actor:Actor,expectedVersion:number){await this.tx(async c=>{
  const row=await this.locked(c,id,actor,['FEEDBACK_PENDING'],expectedVersion);if(row.feedback_started_at)throw new DiagnosisError(409,'Feedbackは開始済みです。');
  await c.query('UPDATE diagnosis_cases SET feedback_started_at=now(),feedback_started_by_user_id=$2 WHERE id=$1',[id,this.staff(actor)]);await this.audit(c,id,actor,'StartFeedback',{report_id:row.feedback_report_id});
 });}
 async feedbackStatement(id:string,actor:Actor,raw:unknown){const p=rawSourceSchema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'顧客発言の入力内容を確認してください。');const input=p.data;return this.tx(async c=>{
  const row=await this.locked(c,id,actor,['FEEDBACK_PENDING']);if(!row.feedback_started_at||!row.feedback_report_id)throw new DiagnosisError(409,'Feedbackを開始してください。');
  if(input.speaker_participant_id&&!(await c.query('SELECT id FROM participants WHERE id=$1 AND diagnosis_case_id=$2',[input.speaker_participant_id,id])).rows.length)throw new DiagnosisError(422,'同じ案件の話者を指定してください。');
  if(input.parent_source_record_id&&!(await c.query('SELECT id FROM source_records WHERE id=$1 AND diagnosis_case_id=$2',[input.parent_source_record_id,id])).rows.length)throw new DiagnosisError(422,'同じ案件の出典を指定してください。');
  const key=randomUUID();await c.query(`INSERT INTO source_records(id,diagnosis_case_id,source_type,speaker_participant_id,entered_by_user_id,content,occurred_at,parent_source_record_id,external_reference,feedback_report_id) VALUES($1,$2,'FEEDBACK_STATEMENT',$3,$4,$5,$6,$7,$8,$9)`,[key,id,input.speaker_participant_id,this.staff(actor),input.content,input.occurred_at,input.parent_source_record_id,input.external_reference,row.feedback_report_id]);await this.audit(c,id,actor,'RecordFeedbackStatement',{source_record_id:key,report_id:row.feedback_report_id});return {id:key};
 });}
 async completeFeedback(id:string,actor:Actor,expectedVersion:number){await this.tx(async c=>{
  const row=await this.locked(c,id,actor,['FEEDBACK_PENDING'],expectedVersion);if(!row.feedback_started_at)throw new DiagnosisError(409,'Feedbackを開始してください。');await c.query('UPDATE diagnosis_cases SET feedback_completed_at=now() WHERE id=$1',[id]);await this.transition(c,row,actor,'FEEDBACK_COMPLETED','CompleteFeedback',{report_id:row.feedback_report_id});
 });}
 async read(id:string,actor:Actor){return this.tx(async c=>{
  const row=await this.locked(c,id,actor);const {rows:reports}=await c.query<ReportRow>('SELECT * FROM diagnosis_reports WHERE diagnosis_case_id=$1 ORDER BY version DESC',[id]);
  const {rows:executions}=await c.query(`SELECT id,status,provider,model,prompt_version,policy_version,validation_status,error_code,created_at,completed_at FROM ai_executions WHERE diagnosis_case_id=$1 AND process_type='REPORT_DRAFT_GENERATOR' ORDER BY created_at DESC`,[id]);
  const {rows:feedback}=await c.query(`SELECT * FROM source_records WHERE diagnosis_case_id=$1 AND source_type='FEEDBACK_STATEMENT' ORDER BY created_at,id`,[id]);
  const {rows:participants}=await c.query('SELECT id,name FROM participants WHERE diagnosis_case_id=$1',[id]);
  return {...row,current_next_action:nextAction(row.diagnosis_status),context:await buildReportContext(c,id),reports,executions,feedback,participants};
 });}
}
