import type {PoolClient} from 'pg';
import {DiagnosisError,hasAnswer,SURVEY_QUESTIONS} from '../domain/itManagementDiagnosis';

export interface ReuseEntry {
 key:string; title:string; text:string; origin:{kind:string;id:string;index?:number;version?:number};
 origin_label:string; recorded_at:string|null; occurred_at:string|null; actor:string|null;
 question_code?:string; unknown_type?:string; candidate:boolean;
}
const date=(v:Date|string|null|undefined)=>v?new Date(v).toISOString():null;
const unknownLabels:Record<string,string>={NOT_YET_CONFIRMED:'まだ確認していない',UNRESOLVED:'確認したがまだ分からない',CONTRADICTORY:'情報が一致していない',NOT_REQUIRED_NOW:'今回は確認しない'};

/** Staff read projection only: no extraction, scoring, semantic resolution or temporal expiry. */
export async function progressiveReuseReadModel(c:PoolClient,id:string){
 const row=(await c.query<{diagnosis_status:string;version:number}>('SELECT diagnosis_status,version FROM diagnosis_cases WHERE id=$1',[id])).rows[0];
 if(!row)throw new DiagnosisError(404,'案件が見つかりません。');
 const known:ReuseEntry[]=[],unknown:ReuseEntry[]=[],hypotheses:ReuseEntry[]=[];
 const add=(group:ReuseEntry[],entry:ReuseEntry)=>group.push(entry);
 const intake=(await c.query('SELECT * FROM sales_conversation_intakes WHERE diagnosis_case_id=$1',[id])).rows[0];
 if(intake&&!intake.raw_redacted_at){
  for(const [field,group,label] of [['customer_statements',known,'営業での聞き取り'],['unknowns',unknown,'営業で未確認と記録'],['salesperson_notes',hypotheses,'営業担当者のメモ']] as const){
   (intake[field] as string[]).forEach((text,index)=>add(group,{key:`intake:${field}:${index}`,title:label,text,
    origin:{kind:field,id:intake.id,index,version:intake.version},origin_label:label,recorded_at:date(intake.updated_at),occurred_at:date(intake.conversation_at),actor:intake.updated_by_user_id,
    candidate:field==='unknowns'}));
  }
 }
 const answers=(await c.query(`SELECT r.*,q.question_code,q.question_text FROM survey_responses r JOIN survey_questions q ON q.id=r.question_id WHERE r.diagnosis_case_id=$1 ORDER BY q.display_order`,[id])).rows;
 // A deleted response remains a record. Do not turn redaction into a new missing-question request.
 for(const q of SURVEY_QUESTIONS){
  const r=answers.find(a=>a.question_code===q.question_code);
  const entry:ReuseEntry={key:`survey:${q.question_code}`,title:q.question_text,text:'回答はまだ記録されていません。',origin:{kind:'SURVEY_QUESTION',id:q.question_code},origin_label:'共通の質問項目',recorded_at:null,occurred_at:null,actor:null,question_code:q.question_code,unknown_type:'NOT_YET_CONFIRMED',candidate:q.is_required};
  if(!r){if(q.is_required)add(unknown,entry);continue;}
  if(r.raw_value_json===null)continue;
  entry.origin={kind:'SURVEY_RESPONSE',id:r.id};entry.recorded_at=date(r.intake_origin_recorded_at??r.answered_at);entry.actor=r.entered_by_user_id;
  entry.origin_label=r.intake_origin_id?'営業での聞き取り（開始前の回答）':r.entry_channel==='WEB'&&!r.entered_by_user_id?'Web回答':'営業での聞き取り（回答）';
  if(!hasAnswer(r.raw_value_json)){add(unknown,entry);continue;}
  const values:string[]=Array.isArray(r.raw_value_json)?r.raw_value_json:[r.raw_value_json];
  // Only the canonical option is an explicit unknown. Free text is never interpreted by this projection.
  const explicit=q.answer_type!=='TEXT'&&values.includes('分からない');
  const stated=explicit?values.filter(v=>v!=='分からない'):values;
  if(stated.length)add(known,{...entry,key:entry.key+':stated',text:stated.join(' / '),unknown_type:undefined,candidate:false});
  if(explicit)add(unknown,{...entry,text:'「分からない」と回答されています。',unknown_type:undefined,candidate:true});
 }
 const sources=(await c.query(`SELECT s.*,a.detail_json->>'plan_item_id' AS follow_up_plan_id FROM source_records s LEFT JOIN diagnosis_audit_logs a ON a.diagnosis_case_id=s.diagnosis_case_id AND a.command='AddInterviewStatement' AND a.detail_json->>'source_record_id'=s.id::text WHERE s.diagnosis_case_id=$1 ORDER BY s.created_at,s.id`,[id])).rows;
 const labels:Record<string,string>={INTERVIEW_STATEMENT:'顧客発言',FEEDBACK_STATEMENT:'経営フィードバックでの顧客発言',OPERATOR_NOTE:'担当者のメモ',SCREEN_SHARED_INFORMATION:'画面共有で確認した記録',DOCUMENT_EXISTENCE_OBSERVED:'資料等の存在の記録'};
 for(const s of sources){
  if(s.source_type==='TRANSCRIPT'||s.content==='[REDACTED]')continue;
  const customer=['INTERVIEW_STATEMENT','FEEDBACK_STATEMENT'].includes(s.source_type);
  add(customer?known:hypotheses,{key:`source:${s.id}`,title:labels[s.source_type]||'担当者の記録',text:s.content,origin:{kind:'SOURCE_RECORD',id:s.id},origin_label:s.follow_up_plan_id?'追加確認での顧客発言':labels[s.source_type]||'担当者の記録',recorded_at:date(s.created_at),occurred_at:date(s.occurred_at),actor:s.entered_by_user_id,candidate:false});
 }
 const insights=(await c.query(`SELECT * FROM diagnosis_insights WHERE diagnosis_case_id=$1 AND review_status='HUMAN_APPROVED' ORDER BY created_at,id`,[id])).rows;
 for(const i of insights)add(i.semantic_type==='UNKNOWN'?unknown:hypotheses,{key:`insight:${i.id}`,title:i.semantic_type==='UNKNOWN'?(unknownLabels[i.unknown_type]||'まだ分かっていないこと'):'担当者が確認した分析内容',text:i.content,origin:{kind:'INSIGHT',id:i.id,version:i.version},origin_label:'分析内容の確認',recorded_at:date(i.created_at),occurred_at:null,actor:i.created_by_user_id,unknown_type:i.unknown_type??undefined,candidate:i.semantic_type==='UNKNOWN'&&i.unknown_type!=='NOT_REQUIRED_NOW'});
 const proposals=(await c.query(`SELECT p.* FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND p.status IN ('GENERATED','UNDER_REVIEW') AND p.proposal_type IN ('UNKNOWN','HYPOTHESIS','OBSERVATION','ROOT_CAUSE_HYPOTHESIS') AND e.status='SUCCEEDED' AND p.title<>'[REDACTED]' ORDER BY p.created_at,p.id`,[id])).rows;
 for(const p of proposals)add(p.proposal_type==='UNKNOWN'?unknown:hypotheses,{key:`proposal:${p.id}`,title:'システム／AIの未採用候補',text:p.content_json.text??p.content_json.content??p.title,origin:{kind:'AI_PROPOSAL',id:p.id},origin_label:'システム／AIの候補（担当者の判断前）',recorded_at:date(p.created_at),occurred_at:null,actor:null,unknown_type:p.content_json.unknown_type??undefined,candidate:p.proposal_type==='UNKNOWN'&&p.content_json.unknown_type!=='NOT_REQUIRED_NOW'});
 const themes=(await c.query<{id:string;title:string;future_relation:string}>(`SELECT id,title,future_relation FROM diagnosis_themes WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order,id`,[id])).rows;
 const plans=(await c.query(`SELECT p.*,a.detail_json->'reuse_origin' AS reuse_origin FROM diagnosis_plan_items p LEFT JOIN diagnosis_audit_logs a ON a.diagnosis_case_id=p.diagnosis_case_id AND a.command='SelectReuseConfirmation' AND a.detail_json->>'id'=p.id::text WHERE p.diagnosis_case_id=$1 AND p.status='ACTIVE' ORDER BY p.priority_order,p.id`,[id])).rows.map(p=>({id:p.id,text:p.text,purpose:p.purpose,theme_id:p.diagnosis_theme_id,future_relation:themes.find(t=>t.id===p.diagnosis_theme_id)?.future_relation??null,reuse_origin:p.reuse_origin,
  results:sources.filter(s=>s.follow_up_plan_id===p.id&&s.content!=='[REDACTED]').map(s=>({id:s.id,text:s.content,recorded_at:date(s.created_at)}))}));
 const future=(await c.query<{statement:string;intent_status:string;created_at:Date}>(`SELECT statement,intent_status,created_at FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current`,[id])).rows[0];
 return {diagnosis_status:row.diagnosis_status,version:row.version,known,unknown,hypotheses,themes,plans,
  candidates:unknown.filter(e=>e.candidate).map(e=>({...e,selected_plan_id:plans.find(p=>p.reuse_origin?.key===e.key)?.id??null})),
  future:future?.statement??null,intake_redacted:!!intake?.raw_redacted_at,
  can_select:['PREPARATION_IN_PROGRESS','DIAGNOSIS_IN_PROGRESS'].includes(row.diagnosis_status),can_remove:row.diagnosis_status==='PREPARATION_IN_PROGRESS'};
}
