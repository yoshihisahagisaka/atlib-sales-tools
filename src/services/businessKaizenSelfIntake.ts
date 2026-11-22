import type { Pool } from 'pg';
import type {
  BusinessWebConsultationLeadInput,
  BusinessWebConsultationLeadRepo,
} from './businessWebConsultationLeadRepo';

export interface BusinessKaizenSelfIntakeResult {
  leadId: string;
  /** Null only when replaying a pre-migration Lead with no Diagnosis. */
  diagnosisId: string | null;
  created: boolean;
}

/** Commits the Lead, Diagnosis and initial Stage atomically. Notifications run in the caller. */
export async function saveBusinessKaizenSelfIntake(
  pool: Pool,
  repo: BusinessWebConsultationLeadRepo,
  input: BusinessWebConsultationLeadInput,
): Promise<BusinessKaizenSelfIntakeResult> {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    const lead = await repo.insertOrGet(input, client);

    // An idempotent replay is not a backfill. In particular, never use a replay
    // payload to invent original evidence for a historical Lead.
    if (!lead.created) {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM business_kaizen_diagnoses WHERE consultation_lead_id=$1',
        [lead.id],
      );
      await client.query('COMMIT');
      inTransaction = false;
      return { leadId: lead.id, diagnosisId: existing.rows[0]?.id ?? null, created: false };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO business_kaizen_diagnoses
       (entry_channel,input_state,consultation_lead_id,original_answers,current_answers,
        diagnosis_snapshot,current_stage,diagnosis_version,logic_version,completed_at)
       VALUES ('CUSTOMER_SELF','COMPLETED',$1,$2::jsonb,$2::jsonb,$3::jsonb,
               'ACCEPTED',$4,$5,now())
       RETURNING id`,
      [
        lead.id,
        JSON.stringify(input.snapshot.originalAnswers),
        JSON.stringify(input.snapshot),
        input.snapshot.diagnosisVersion,
        input.snapshot.logicVersion,
      ],
    );
    const diagnosisId = inserted.rows[0]?.id;
    if (!diagnosisId) throw new Error('business kaizen diagnosis insert failed');

    await client.query(
      `INSERT INTO business_kaizen_diagnosis_stage_history(diagnosis_id,stage)
       VALUES ($1,'ACCEPTED')`,
      [diagnosisId],
    );
    await client.query('COMMIT');
    inTransaction = false;
    return { leadId: lead.id, diagnosisId, created: true };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction failure.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
