import type { PoolClient } from 'pg';
import { companyDisplayName, DiagnosisError, type RawValue, type SurveyQuestion } from '../domain/itManagementDiagnosis';

export interface PreDiagnosisContext {
  organization_display_name: string;
  entry_channel: string;
  future: { statement: string; intent_status: 'SURVEY_STATED' | 'INTERVIEW_RECONFIRMED'; time_horizon: string | null };
  questions: SurveyQuestion[];
  responses: { id: string; question_code: string; question_version: number; raw_value_json: RawValue }[];
}
/** Whitelist only. No token/cookie, contact identity, legacy data, SourceRecord copy. */
export async function buildPreDiagnosisContext(client: PoolClient, caseId: string): Promise<PreDiagnosisContext> {
  const { rows } = await client.query(`SELECT c.entry_channel,c.survey_version,o.name FROM diagnosis_cases c
    JOIN organizations o ON o.id=c.organization_id WHERE c.id=$1`, [caseId]);
  const row = rows[0];
  if (!row || row.survey_version !== 2) throw new DiagnosisError(409, 'Survey v2の完了した案件が必要です。');
  const { rows: futures } = await client.query<PreDiagnosisContext['future']>(`SELECT statement,intent_status,time_horizon
    FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current`, [caseId]);
  if (!futures[0]) throw new DiagnosisError(409, '現在のFutureが必要です。');
  const { rows: questions } = await client.query<SurveyQuestion>(`SELECT question_code,version,display_order,question_text,answer_type,options_json,is_required,is_active
    FROM survey_questions WHERE version=2 ORDER BY display_order`);
  const { rows: responses } = await client.query<PreDiagnosisContext['responses'][number]>(`SELECT r.id,q.question_code,r.question_version,r.raw_value_json
    FROM survey_responses r JOIN survey_questions q ON q.id=r.question_id
    WHERE r.diagnosis_case_id=$1 AND r.question_version=2 ORDER BY q.display_order`, [caseId]);
  return { organization_display_name: companyDisplayName(row.name), entry_channel: row.entry_channel, future: futures[0], questions, responses };
}
