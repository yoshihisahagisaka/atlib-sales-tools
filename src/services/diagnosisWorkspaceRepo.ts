import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { DiagnosisError,companyDisplayName,nextAction,type Actor,type DiagnosisStatus } from '../domain/itManagementDiagnosis';
import { INTERVIEW_PROMPT_VERSION,INTERVIEW_POLICY_VERSION,rawSourceSchema,evidenceExistenceSchema,reconfirmFutureSchema,resolutionSchema,validateInterviewOutput,type SourceType,type ReconfirmInput } from '../domain/diagnosisWorkspace';
import { humanThemeSchema,humanPlanSchema,type HumanTheme,type HumanPlan } from '../domain/diagnosisPreparation';
import { buildInterviewAssistantContext,interviewSourceKeys,type InterviewContext } from './interviewAssistantContext';
import type { Execution } from './diagnosisPreparationRepo';

interface CaseRow {id:string;diagnosis_status:DiagnosisStatus;version:number;plan_confirmed_by_user_id:string|null;plan_confirmed_at:Date|null;plan_snapshot_json:any;started_at:Date|null;completed_at:Date|null}
/** Raw recording and Human commands only. No classification or Insight writer. */
export class DiagnosisWorkspaceRepo {
 constructor(private readonly pool:Pool) {}
 private async tx<T>(work:(c:PoolClient)=>Promise<T>) {
  const c=await this.pool.connect();
  try {await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}
  catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
 }
 private staff(actor:Actor) {if(actor.kind!=='STAFF'||!actor.userId)throw new DiagnosisError(403,'スタッフによる操作が必要です。');return actor.userId;}
 private async locked(c:PoolClient,id:string,actor:Actor,status?:string,version?:number) {
  this.staff(actor);
  const {rows}=await c.query<CaseRow>('SELECT id,diagnosis_status,version,plan_confirmed_by_user_id,plan_confirmed_at,plan_snapshot_json,started_at,completed_at FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[id]);
  const row=rows[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');
  if(status&&row.diagnosis_status!==status)throw new DiagnosisError(409,'この案件の状態では操作できません。');
  if(version!==undefined&&row.version!==version)throw new DiagnosisError(409,'内容が更新されています。再読み込みして確認してください。');
  return row;
 }
 private async audit(c:PoolClient,id:string,actor:Actor,command:string,detail:unknown,change=true) {
  if(change)await c.query('UPDATE diagnosis_cases SET version=version+1,updated_at=now() WHERE id=$1',[id]);
  await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,$3,'STAFF',$4,$5)`,[randomUUID(),id,command,this.staff(actor),JSON.stringify(detail)]);
 }
 async transition(id:string,actor:Actor,action:'START'|'FINISH',expectedVersion:number) {
  return this.tx(async c=>{
   const from=action==='START'?'READY_FOR_DIAGNOSIS':'DIAGNOSIS_IN_PROGRESS';
   const to=action==='START'?'DIAGNOSIS_IN_PROGRESS':'HUMAN_REVIEW_REQUIRED';
   const row=await this.locked(c,id,actor,from,expectedVersion);
   if(action==='START'&&(!row.plan_confirmed_at||!row.plan_confirmed_by_user_id||!row.plan_snapshot_json?.themes?.length||!row.plan_snapshot_json?.plan_items?.length))throw new DiagnosisError(409,'担当者が確定した診断Planが必要です。');
   const command=action==='START'?'StartDiagnosis':'FinishDiagnosis';
   await c.query(`UPDATE diagnosis_cases SET diagnosis_status=$2,${action==='START'?'started_at':'completed_at'}=now() WHERE id=$1`,[id,to]);
   await c.query(`INSERT INTO case_transitions(id,diagnosis_case_id,from_status,to_status,command,actor_type,actor_user_id) VALUES($1,$2,$3,$4,$5,'STAFF',$6)`,[randomUUID(),id,from,to,command,this.staff(actor)]);
   await this.audit(c,id,actor,command,{expected_version:expectedVersion});
  });
 }
 async addSource(id:string,actor:Actor,type:SourceType,raw:unknown,planItemId?:string) {
  this.staff(actor);
  const parsed=(type==='DOCUMENT_EXISTENCE_OBSERVED'?evidenceExistenceSchema:rawSourceSchema).safeParse(raw);
  if(!parsed.success)throw new DiagnosisError(422,'記録内容を確認してください。Evidenceは自発的な提示の存在のみ記録できます。');
  const input=parsed.data;
  if(type==='OPERATOR_NOTE'&&input.speaker_participant_id)throw new DiagnosisError(422,'担当者メモに顧客の話者を指定できません。');
  return this.tx(async c=>{
   await this.locked(c,id,actor,'DIAGNOSIS_IN_PROGRESS');
   if(planItemId&&(type!=='INTERVIEW_STATEMENT'||!(await c.query("SELECT id FROM diagnosis_plan_items WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'",[planItemId,id])).rows.length))throw new DiagnosisError(422,'同じ案件の確認内容を選択してください。');
   if(input.speaker_participant_id&&!(await c.query('SELECT id FROM participants WHERE id=$1 AND diagnosis_case_id=$2',[input.speaker_participant_id,id])).rows.length)throw new DiagnosisError(422,'同じ案件の話者を指定してください。');
   if(input.parent_source_record_id&&!(await c.query('SELECT id FROM source_records WHERE id=$1 AND diagnosis_case_id=$2',[input.parent_source_record_id,id])).rows.length)throw new DiagnosisError(422,'同じ案件の元記録を指定してください。');
   const key=randomUUID();
   await c.query(`INSERT INTO source_records(id,diagnosis_case_id,source_type,speaker_participant_id,entered_by_user_id,content,occurred_at,parent_source_record_id,external_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[key,id,type,input.speaker_participant_id,this.staff(actor),input.content,input.occurred_at,input.parent_source_record_id,input.external_reference]);
   const command={INTERVIEW_STATEMENT:'AddInterviewStatement',OPERATOR_NOTE:'AddOperatorNote',TRANSCRIPT:'AddTranscript',SCREEN_SHARED_INFORMATION:'RecordScreenSharedInformation',DOCUMENT_EXISTENCE_OBSERVED:'RecordEvidenceExistence'}[type];
   await this.audit(c,id,actor,command,{source_record_id:key,source_type:type,...(planItemId?{plan_item_id:planItemId}:{}),...(type==='DOCUMENT_EXISTENCE_OBSERVED'?{voluntarily_presented:true}:{})});
   return {id:key};
  });
 }
 async reconfirm(id:string,actor:Actor,raw:ReconfirmInput) {
  const parsed=reconfirmFutureSchema.safeParse(raw);if(!parsed.success)throw new DiagnosisError(422,'Futureの入力内容を確認してください。');
  const input=parsed.data;
  return this.tx(async c=>{
   await this.locked(c,id,actor,'DIAGNOSIS_IN_PROGRESS',input.expectedVersion);
   // Reconfirmation is grounded in customer speech, never an operator's private note.
   const source=await c.query(`SELECT id FROM source_records WHERE id=$1 AND diagnosis_case_id=$2 AND source_type IN ('INTERVIEW_STATEMENT','TRANSCRIPT')`,[input.source_record_id,id]);
   if(!source.rows.length)throw new DiagnosisError(422,'この案件の顧客発言またはTranscriptを選択してください。');
   const {rows}=await c.query('SELECT * FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current',[id]);
   const old=rows[0];if(!old)throw new DiagnosisError(409,'現在のFutureがありません。');
   await c.query('UPDATE diagnosis_futures SET is_current=false WHERE id=$1',[old.id]);
   const key=randomUUID();
   await c.query(`INSERT INTO diagnosis_futures(id,diagnosis_case_id,statement,time_horizon,intent_status,source_ref_type,source_ref_id,reconfirmed_by_user_id,reconfirmed_at,version,previous_future_id) VALUES($1,$2,$3,$4,'INTERVIEW_RECONFIRMED','SOURCE_RECORD',$5,$6,now(),$7,$8)`,[key,id,input.statement,input.time_horizon,input.source_record_id,this.staff(actor),old.version+1,old.id]);
   await this.audit(c,id,actor,'ReconfirmFuture',{previous_future_id:old.id,future_id:key,source_record_id:input.source_record_id});
   return {id:key};
  });
 }
 async enqueue(id:string,actor:Actor,provider:string,model:string) {
  return this.tx(async c=>{
   await this.locked(c,id,actor,'DIAGNOSIS_IN_PROGRESS');
   if((await c.query(`SELECT id FROM ai_executions WHERE diagnosis_case_id=$1 AND status IN ('PENDING','RUNNING')`,[id])).rows.length)throw new DiagnosisError(409,'AIは実行待ちまたは実行中です。');
   const context=await buildInterviewAssistantContext(c,id);const key=randomUUID();
   await c.query(`INSERT INTO ai_executions(id,diagnosis_case_id,process_type,status,provider,model,prompt_version,policy_version,input_snapshot_json,requested_by_user_id) VALUES($1,$2,'INTERVIEW_ASSISTANT','PENDING',$3,$4,$5,$6,$7,$8)`,[key,id,provider,model,INTERVIEW_PROMPT_VERSION,INTERVIEW_POLICY_VERSION,JSON.stringify(context),this.staff(actor)]);
   await this.audit(c,id,actor,'RequestInterviewSuggestion',{execution_id:key},false);
   return {execution_id:key,status:'PENDING'};
  });
 }
 async finishExecution(execution:Execution<InterviewContext>,raw:unknown) {
  // Validate against the exact sent snapshot first, then current DB references below.
  const output=validateInterviewOutput(raw,interviewSourceKeys(execution.input_snapshot_json),new Set(execution.input_snapshot_json.themes.map(t=>t.id)));
  await this.tx(async c=>{
   const {rows:cases}=await c.query('SELECT diagnosis_status FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[execution.diagnosis_case_id]);
   const {rows:jobs}=await c.query(`SELECT status FROM ai_executions WHERE id=$1 AND process_type='INTERVIEW_ASSISTANT' FOR UPDATE`,[execution.id]);
   if(jobs[0]?.status!=='RUNNING')return;
   if(cases[0]?.diagnosis_status!=='DIAGNOSIS_IN_PROGRESS') {
    await c.query(`UPDATE ai_executions SET status='FAILED',error_code='CASE_STATE_CHANGED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);return;
   }
   for(let index=0;index<output.suggestions.length;index++) {
    const s=output.suggestions[index]!;
    if(s.related_theme_id&&!(await c.query(`SELECT id FROM diagnosis_themes WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'`,[s.related_theme_id,execution.diagnosis_case_id])).rows.length)throw new DiagnosisError(422,'AI_THEME_REF_INVALID');
    const key=randomUUID();
    await c.query(`INSERT INTO ai_proposals(id,diagnosis_case_id,ai_execution_id,proposal_type,title,content_json,display_order) VALUES($1,$2,$3,$4,$5,$6,$7)`,[key,execution.diagnosis_case_id,execution.id,s.suggestion_type==='NEW_THEME'?'THEME':'QUESTION',s.text,JSON.stringify(s),index+1]);
    for(const ref of s.source_refs)await c.query(`INSERT INTO ai_proposal_sources(ai_proposal_id,diagnosis_case_id,source_ref_type,source_ref_id,relation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[key,execution.diagnosis_case_id,ref.source_ref_type,ref.source_ref_id,ref.relation]);
   }
   await c.query(`UPDATE ai_executions SET status='SUCCEEDED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);
  });
 }
 async resolve(id:string,key:string,actor:Actor,action:'ASK'|'LATER'|'UNNECESSARY') {
  if(!resolutionSchema.safeParse({action}).success)throw new DiagnosisError(422,'判断を選択してください。');
  await this.tx(async c=>{
   await this.locked(c,id,actor,'DIAGNOSIS_IN_PROGRESS');
   const {rows}=await c.query(`SELECT p.status FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.id=$1 AND p.diagnosis_case_id=$2 AND e.process_type='INTERVIEW_ASSISTANT'`,[key,id]);
   if(!rows[0])throw new DiagnosisError(404,'質問候補が見つかりません。');
   if(!['GENERATED','UNDER_REVIEW'].includes(rows[0].status))throw new DiagnosisError(409,'この候補は判断済みです。');
   const status={ASK:'ACCEPTED',LATER:'UNDER_REVIEW',UNNECESSARY:'REJECTED'}[action];
   await c.query('UPDATE ai_proposals SET status=$2,updated_at=now() WHERE id=$1',[key,status]);
   await this.audit(c,id,actor,'ResolveInterviewSuggestion',{proposal_id:key,action,before:rows[0].status,after:status});
  });
 }
 // A separate explicit Human command; ASK itself never inserts these objects.
 async addHumanItem(id:string,actor:Actor,kind:'theme'|'plan',raw:HumanTheme|HumanPlan) {
  const parsed=(kind==='theme'?humanThemeSchema:humanPlanSchema).safeParse(raw);
  if(!parsed.success)throw new DiagnosisError(422,'入力内容を確認してください。');
  return this.tx(async c=>{
   await this.locked(c,id,actor,'DIAGNOSIS_IN_PROGRESS');const key=randomUUID();
   if(kind==='theme') {
    const p=parsed.data as HumanTheme;
    await c.query(`INSERT INTO diagnosis_themes(id,diagnosis_case_id,title,description,future_relation,priority_order,created_by,created_by_user_id) VALUES($1,$2,$3,$4,$5,(SELECT COALESCE(max(priority_order),0)+1 FROM diagnosis_themes WHERE diagnosis_case_id=$2),'HUMAN',$6)`,[key,id,p.title,p.description,p.future_relation,this.staff(actor)]);
   } else {
    const p=parsed.data as HumanPlan;
    if(p.diagnosis_theme_id&&!(await c.query(`SELECT id FROM diagnosis_themes WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'`,[p.diagnosis_theme_id,id])).rows.length)throw new DiagnosisError(422,'同じ案件の有効なテーマを選択してください。');
    await c.query(`INSERT INTO diagnosis_plan_items(id,diagnosis_case_id,diagnosis_theme_id,item_type,text,purpose,priority_order,created_by,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(priority_order),0)+1 FROM diagnosis_plan_items WHERE diagnosis_case_id=$2),'HUMAN',$7)`,[key,id,p.diagnosis_theme_id,p.item_type,p.text,p.purpose,this.staff(actor)]);
   }
   await this.audit(c,id,actor,kind==='theme'?'AddInterviewTheme':'AddInterviewPlanItem',{id:key,input:parsed.data});return {id:key};
  });
 }
 async read(id:string,actor:Actor) {
  return this.tx(async c=>{
   const row=await this.locked(c,id,actor);
   const {rows:org}=await c.query('SELECT o.name FROM organizations o JOIN diagnosis_cases c ON c.organization_id=o.id WHERE c.id=$1',[id]);
   const {rows:futures}=await c.query('SELECT * FROM diagnosis_futures WHERE diagnosis_case_id=$1 ORDER BY version DESC',[id]);
   const {rows:themes}=await c.query(`SELECT * FROM diagnosis_themes WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order`,[id]);
   const {rows:plan_items}=await c.query(`SELECT * FROM diagnosis_plan_items WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order`,[id]);
   const {rows:sources}=await c.query('SELECT * FROM source_records WHERE diagnosis_case_id=$1 ORDER BY created_at,id',[id]);
   const {rows:participants}=await c.query('SELECT id,name FROM participants WHERE diagnosis_case_id=$1',[id]);
   const {rows:responses}=await c.query('SELECT r.id,r.raw_value_json,q.question_code,q.question_text FROM survey_responses r JOIN survey_questions q ON q.id=r.question_id WHERE r.diagnosis_case_id=$1 ORDER BY q.display_order',[id]);
   const {rows:executions}=await c.query(`SELECT id,status,validation_status,error_code,provider,model,created_at,completed_at FROM ai_executions WHERE diagnosis_case_id=$1 AND process_type='INTERVIEW_ASSISTANT' ORDER BY created_at DESC`,[id]);
   const {rows:proposals}=await c.query(`SELECT p.* FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='INTERVIEW_ASSISTANT' ORDER BY p.created_at DESC,p.display_order`,[id]);
   const {rows:resolutions}=await c.query(`SELECT actor_user_id,created_at,detail_json FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command='ResolveInterviewSuggestion' ORDER BY created_at`,[id]);
   return {...row,organization_display_name:companyDisplayName(org[0].name),provider_display_name:'atLIB株式会社',current_next_action:nextAction(row.diagnosis_status),future:futures.find(f=>f.is_current),future_history:futures,themes,plan_items,sources,participants,responses,executions,proposals,resolutions};
  });
 }
}
