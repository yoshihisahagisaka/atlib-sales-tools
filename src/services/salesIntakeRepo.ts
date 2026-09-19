import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {DiagnosisError,SURVEY_QUESTIONS,hasAnswer,type Actor} from '../domain/itManagementDiagnosis';
import {parseSalesIntake,salesConsentSchema,SALES_CONSENT_VERSION} from '../domain/salesIntake';
import {ItManagementDiagnosisRepo} from './itManagementDiagnosisRepo';

export class SalesIntakeRepo {
 constructor(private readonly pool:Pool){}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId?.trim())throw new DiagnosisError(403,'スタッフ認証が必要です。');return actor.userId;}
 private async tx<T>(work:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private async audit(c:PoolClient,id:string,command:string,actor:string,version:number,caseId:string|null=null){await c.query('INSERT INTO sales_intake_audit_logs(id,intake_id,command,actor_user_id,intake_version,diagnosis_case_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,command,actor,version,caseId]);}
 async save(actor:Actor,raw:unknown,id?:string,expectedVersion?:number){
  const staff=this.staff(actor),p=parseSalesIntake(raw);
  return this.tx(async c=>{
   if(id){const row=(await c.query('SELECT version,consent_state FROM sales_conversation_intakes WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new DiagnosisError(404,'営業会話の記録が見つかりません。');if(row.version!==expectedVersion||row.consent_state!=='NOT_RECORDED')throw new DiagnosisError(409,'記録が更新済み、または無料診断へ引継ぎ済みです。再読み込みしてください。');}
   const key=id??randomUUID(),values=[key,JSON.stringify(p.customer),JSON.stringify(p.customerStatements),JSON.stringify(p.unknowns),JSON.stringify(p.salespersonNotes),JSON.stringify(p.surveyAnswers),staff,p.conversationAt??null];
   const sql=id?`UPDATE sales_conversation_intakes SET customer_json=$2,customer_statements=$3,unknowns=$4,salesperson_notes=$5,survey_answers=$6,updated_by_user_id=$7,conversation_at=$8,updated_at=now(),version=version+1 WHERE id=$1 RETURNING id,version`:
    `INSERT INTO sales_conversation_intakes(id,customer_json,customer_statements,unknowns,salesperson_notes,survey_answers,created_by_user_id,updated_by_user_id,conversation_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING id,version`;
   const row=(await c.query(sql,values)).rows[0];await this.audit(c,key,id?'UpdateSalesIntake':'CreateSalesIntake',staff,row.version);return row;
  });
 }
 async read(id:string,actor:Actor){this.staff(actor);const row=(await this.pool.query('SELECT * FROM sales_conversation_intakes WHERE id=$1',[id])).rows[0];if(!row)throw new DiagnosisError(404,'営業会話の記録が見つかりません。');return row;}
 async list(actor:Actor){this.staff(actor);return (await this.pool.query(`SELECT id,customer_json->>'companyName' AS company_name,consent_state,diagnosis_case_id,updated_at FROM sales_conversation_intakes ORDER BY updated_at DESC,id LIMIT 100`)).rows;}
 async forCase(id:string,actor:Actor){this.staff(actor);const row=(await this.pool.query('SELECT sales_intake_id FROM diagnosis_cases WHERE id=$1',[id])).rows[0];if(!row)throw new DiagnosisError(404,'案件が見つかりません。');return row.sales_intake_id?this.read(row.sales_intake_id,actor):null;}
 async consentAndStart(id:string,actor:Actor,raw:unknown){
  const staff=this.staff(actor),parsed=salesConsentSchema.safeParse(raw);if(!parsed.success)throw new DiagnosisError(422,'分析して返すことへの顧客同意と、同意した方を明示してください。');const input=parsed.data;
  return this.tx(async c=>{
   const row=(await c.query('SELECT * FROM sales_conversation_intakes WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new DiagnosisError(404,'営業会話の記録が見つかりません。');
   if(row.diagnosis_case_id)return {id:row.diagnosis_case_id,intake_id:id,replayed:true};
   if(row.version!==input.expectedVersion)throw new DiagnosisError(409,'記録が更新されています。保存内容を再確認してください。');
   await c.query(`UPDATE sales_conversation_intakes SET consent_state='CONSENTED',consent_customer_reference=$2,consent_recorded_by_user_id=$3,consent_recorded_at=now(),consent_wording_version=$4 WHERE id=$1`,[id,input.customerReference,staff,SALES_CONSENT_VERSION]);
   const created=await new ItManagementDiagnosisRepo(this.pool).createCaseInTransaction(c,row.customer_json,'SALES_VISIT',actor,undefined,id);
   const participant=(await c.query("SELECT id FROM participants WHERE diagnosis_case_id=$1",[created.id])).rows[0];
   for(const q of SURVEY_QUESTIONS){const value=row.survey_answers[q.question_code];if(!hasAnswer(value))continue;
    await c.query(`INSERT INTO survey_responses(id,diagnosis_case_id,question_id,question_version,respondent_participant_id,raw_value_json,entry_channel,entered_by_user_id,answered_at,intake_origin_id,intake_origin_version,intake_origin_recorded_at)
     SELECT $1,$2,id,version,$3,$4,'SALES_VISIT',$5,$6,$7,$8,$6 FROM survey_questions WHERE question_code=$9 AND version=$10`,[randomUUID(),created.id,participant.id,JSON.stringify(value),row.updated_by_user_id,row.updated_at,id,row.version,q.question_code,q.version]);
   }
   await c.query('UPDATE sales_conversation_intakes SET diagnosis_case_id=$2,version=version+1 WHERE id=$1',[id,created.id]);
   await this.audit(c,id,'ConsentAndStartDiagnosis',staff,row.version+1,created.id);
   await c.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json) VALUES($1,$2,'ImportSalesConversation','STAFF',$3,$4)`,[randomUUID(),created.id,staff,JSON.stringify({intake_id:id,intake_version:row.version,consent_wording_version:SALES_CONSENT_VERSION})]);
   return {...created,intake_id:id,replayed:false};
  });
 }
}
