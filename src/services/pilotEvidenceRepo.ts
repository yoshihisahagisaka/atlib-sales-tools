import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface PilotEvidenceInput {
  customer_segment: string;
  entry_trigger: string;
  future_theme_code: string;
  completion_status?: 'IN_PROGRESS'|'COMPLETED'|'ABANDONED';
  confusing_question_codes: string[];
  unknown_pattern_codes: string[];
  operator_correction_categories: string[];
  ai_misclassification_categories: string[];
  management_feedback_reaction: 'POSITIVE'|'NEUTRAL'|'NEGATIVE'|'NOT_OBSERVED';
  assessment_need_understood: 'YES'|'NO'|'UNCLEAR'|'NOT_ASKED';
  next_action_code?: string;
  customer_feedback_signal: 'POSITIVE'|'NEUTRAL'|'NEGATIVE'|'NONE';
}

export class PilotEvidenceRepo {
  constructor(private readonly pool:Pool){}

  async record(caseId:string,userId:string,input:PilotEvidenceInput){
    if(!userId.trim()) throw new Error('PILOT_EVIDENCE_ACTOR_REQUIRED');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const exists=await client.query('SELECT id FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[caseId]);
      if(!exists.rows.length) throw new Error('DIAGNOSIS_CASE_NOT_FOUND');
      const id=randomUUID();
      // Operational pilot evidence deliberately stores category/coded signals only. Raw customer quotes,
      // contact details, transcript text and free-form operator notes do not belong in this event.
      await client.query(`INSERT INTO diagnosis_audit_logs(id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json)
        VALUES($1,$2,'RecordControlledPilotEvidence','STAFF',$3,$4)`,[id,caseId,userId,JSON.stringify(input)]);
      await client.query('COMMIT');
      return {id,diagnosis_case_id:caseId,recorded:true as const};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release();}
  }

  async list(caseId:string){
    const {rows}=await this.pool.query<{id:string;actor_user_id:string;detail_json:PilotEvidenceInput;created_at:Date}>(`SELECT id,actor_user_id,detail_json,created_at
      FROM diagnosis_audit_logs WHERE diagnosis_case_id=$1 AND command='RecordControlledPilotEvidence' ORDER BY created_at,id`,[caseId]);
    return rows.map(r=>({id:r.id,recorded_by_user_id:r.actor_user_id,evidence:r.detail_json,recorded_at:new Date(r.created_at).toISOString()}));
  }
}
