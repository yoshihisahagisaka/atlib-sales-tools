import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {DiagnosisError,SURVEY_QUESTIONS,validateAnswer,type Actor} from '../domain/itManagementDiagnosis';

export type HearingInput={questionCode:string;questionVersion:number;expectedVersion:number|null;answer:string|string[]|null;statement:string;unknownNote:string;reason?:string};
const snapshot=(r:{answer_json:unknown;statement:string;unknown_note:string})=>({answer:r.answer_json,statement:r.statement,unknownNote:r.unknown_note});
export class DiagnosisHearingRepo {
 constructor(private readonly pool:Pool){}
 private staff(actor:Actor){if(actor.kind!=='STAFF'||!actor.userId?.trim())throw new DiagnosisError(403,'スタッフ認証が必要です。');return actor.userId;}
 private async caseExists(c:PoolClient,id:string){if(!(await c.query('SELECT id FROM diagnosis_cases WHERE id=$1',[id])).rowCount)throw new DiagnosisError(404,'案件が見つかりません。');}
 async read(id:string,actor:Actor){this.staff(actor);const c=await this.pool.connect();try{
  await this.caseExists(c,id);
  const [hearing,web]=await Promise.all([
   c.query('SELECT * FROM diagnosis_hearing_records WHERE diagnosis_case_id=$1 ORDER BY question_code',[id]),
   c.query(`SELECT q.question_code,q.version AS question_version,s.raw_value_json AS answer,s.entry_channel,s.answered_at,s.intake_origin_id,s.intake_origin_version FROM survey_responses s JOIN survey_questions q ON q.id=s.question_id WHERE s.diagnosis_case_id=$1 ORDER BY q.display_order`,[id])
  ]);
  return {questions:SURVEY_QUESTIONS,hearing:hearing.rows,originalResponses:web.rows};
 }finally{c.release();}}
 async revisions(id:string,questionCode:string,actor:Actor){this.staff(actor);return (await this.pool.query('SELECT r.* FROM diagnosis_hearing_record_revisions r JOIN diagnosis_hearing_records h ON h.id=r.hearing_record_id WHERE h.diagnosis_case_id=$1 AND h.question_code=$2 ORDER BY r.version',[id,questionCode])).rows;}
 async save(id:string,actor:Actor,input:HearingInput){const staff=this.staff(actor);
  const q=SURVEY_QUESTIONS.find(q=>q.question_code===input.questionCode&&q.version===input.questionVersion);
  if(!q)throw new DiagnosisError(422,'設問または設問バージョンが無効です。');
  if(input.answer!==null)validateAnswer(q,input.answer);
  const c=await this.pool.connect();try{await c.query('BEGIN');await this.caseExists(c,id);
   // Serialize concurrent creation as well as updates for this case.
   const caseRow=(await c.query('SELECT survey_version FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(caseRow.survey_version!==input.questionVersion)throw new DiagnosisError(422,'案件の設問バージョンと一致しません。');
   const old=(await c.query('SELECT * FROM diagnosis_hearing_records WHERE diagnosis_case_id=$1 AND question_code=$2 AND question_version=$3 FOR UPDATE',[id,input.questionCode,input.questionVersion])).rows[0];
   if((old?.version??null)!==input.expectedVersion)throw new DiagnosisError(409,'ヒアリング記録が更新されています。再読み込みしてください。');
   const current={answer:input.answer,statement:input.statement,unknownNote:input.unknownNote};
   if(old){if(!input.reason?.trim())throw new DiagnosisError(422,'訂正理由を入力してください。');}
   else if(input.reason)throw new DiagnosisError(422,'新規記録に訂正理由は指定できません。');
   const key=old?.id??randomUUID(),version=old?old.version+1:1;
   if(old)await c.query(`UPDATE diagnosis_hearing_records SET answer_json=$2,statement=$3,unknown_note=$4,updated_by_user_id=$5,updated_at=now(),version=$6 WHERE id=$1`,[key,JSON.stringify(input.answer),input.statement,input.unknownNote,staff,version]);
   else await c.query(`INSERT INTO diagnosis_hearing_records(id,diagnosis_case_id,question_code,question_version,answer_json,statement,unknown_note,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)`,[key,id,input.questionCode,input.questionVersion,JSON.stringify(input.answer),input.statement,input.unknownNote,staff]);
   await c.query(`INSERT INTO diagnosis_hearing_record_revisions(id,hearing_record_id,diagnosis_case_id,version,operation,previous_json,current_json,reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),key,id,version,old?'CORRECT':'CREATE',old?JSON.stringify(snapshot(old)):null,JSON.stringify(current),old?input.reason!.trim():null,staff]);
   await c.query('COMMIT');return {id:key,version};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}
