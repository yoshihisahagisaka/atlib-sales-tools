import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  applicationSchema, companyDisplayName, createAccessToken, DiagnosisError, futureStatement,
  hasAnswer, hashAccessToken, nextAction, PROVIDER_NAME, SURVEY_QUESTIONS, SURVEY_VERSION,
  tokenMatches, validateAnswer, surveyStatus,
  type Actor, type DiagnosisStatus, type EntryChannel, type RawValue, type SurveyQuestion,
} from '../domain/itManagementDiagnosis';

interface CaseRow {
  id: string; organization_id: string; entry_channel: EntryChannel; diagnosis_status: DiagnosisStatus;
  assessment_status: string; owner_user_id: string | null; survey_version: number; version: number;
  access_token_hash: string | null; access_token_expires_at: Date | null; access_token_revoked_at: Date | null;
  scheduled_at: Date | null; created_at: Date; updated_at: Date;
}
interface QuestionRow extends SurveyQuestion { id: string }
interface ResponseRow {
  id: string; question_code: string; question_version: number; raw_value_json: RawValue;
  respondent_participant_id: string; entry_channel: EntryChannel; entered_by_user_id: string | null; answered_at: Date;
}
interface FutureRow {
  id: string; statement: string; time_horizon: string | null; intent_status: string;
  source_ref_type: string; source_ref_id: string; version: number; is_current: boolean;
}
const staffId = (actor: Actor): string | null => actor.kind === 'STAFF' ? actor.userId : null;

/** Same pg repository pattern as the legacy tools; all commands lock the aggregate.
 * No SurveyResponse is copied into SourceRecord, Insight or an authoritative fact.
 */
export class ItManagementDiagnosisRepo {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async audit(client: PoolClient, id: string, command: string, actor: Actor): Promise<void> {
    await client.query(`INSERT INTO diagnosis_audit_logs (id, diagnosis_case_id, command, actor_type, actor_user_id)
      VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), id, command, actor.kind, staffId(actor)]);
  }

  private async transition(client: PoolClient, id: string, from: DiagnosisStatus | null, to: DiagnosisStatus, command: string, actor: Actor): Promise<void> {
    await client.query(`INSERT INTO case_transitions (id, diagnosis_case_id, from_status, to_status, command, actor_type, actor_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), id, from, to, command, actor.kind, staffId(actor)]);
    await this.audit(client, id, command, actor);
  }

  private async authorizedCase(client: PoolClient, id: string, actor: Actor): Promise<CaseRow> {
    const { rows } = await client.query<CaseRow>('SELECT * FROM diagnosis_cases WHERE id=$1 FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) {
      if (actor.kind === 'CUSTOMER') throw new DiagnosisError(401, '再開リンクが無効または期限切れです。担当者へお問い合わせください。');
      if (!actor.userId) throw new DiagnosisError(401, 'スタッフ認証が必要です。');
      throw new DiagnosisError(404, '案件が見つかりません。');
    }
    if (actor.kind === 'CUSTOMER') {
      if (row.entry_channel !== 'WEB' || row.access_token_revoked_at || !row.access_token_expires_at
        || new Date(row.access_token_expires_at).getTime() <= Date.now() || !tokenMatches(actor.token, row.access_token_hash)) {
        throw new DiagnosisError(401, '再開リンクが無効または期限切れです。担当者へお問い合わせください。');
      }
    } else if (!actor.userId) throw new DiagnosisError(401, 'スタッフ認証が必要です。');
    return row;
  }

  private async questions(client: PoolClient, version: number): Promise<QuestionRow[]> {
    const { rows } = await client.query<QuestionRow>(`SELECT * FROM survey_questions WHERE version=$1 ORDER BY display_order`, [version]);
    return rows;
  }

  async createCase(input: unknown, entryChannel: EntryChannel, actor: Actor) {
    const parsed = applicationSchema.safeParse(input);
    if (!parsed.success) throw new DiagnosisError(422, '会社名・ご担当者名・連絡先を確認してください。');
    if (entryChannel === 'SALES_VISIT' && (actor.kind !== 'STAFF' || !actor.userId)) throw new DiagnosisError(401, 'スタッフ認証が必要です。');
    const application = parsed.data;
    const token = entryChannel === 'WEB' ? createAccessToken() : null;
    const expires = token ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    const id = randomUUID();
    await this.transaction(async client => {
      // Insert immutable catalog versions once. Never rewrite wording used by existing responses.
      for (const q of SURVEY_QUESTIONS) await client.query(`INSERT INTO survey_questions
        (id,question_code,version,display_order,question_text,answer_type,options_json,is_required,is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (question_code,version) DO NOTHING`,
      [randomUUID(), q.question_code, q.version, q.display_order, q.question_text, q.answer_type, JSON.stringify(q.options_json), q.is_required, q.is_active]);
      const organizationId = randomUUID();
      const participantId = randomUUID();
      await client.query('INSERT INTO organizations (id,name) VALUES ($1,$2)', [organizationId, application.companyName]);
      await client.query(`INSERT INTO diagnosis_cases
        (id,organization_id,entry_channel,diagnosis_status,assessment_status,owner_user_id,survey_version,access_token_hash,access_token_expires_at)
        VALUES ($1,$2,$3,'APPLICATION_STARTED','NOT_PROPOSED',$4,$5,$6,$7)`,
      [id, organizationId, entryChannel, staffId(actor), SURVEY_VERSION, token ? hashAccessToken(token) : null, expires]);
      await client.query(`INSERT INTO participants (id,diagnosis_case_id,name,email,phone,job_title) VALUES ($1,$2,$3,$4,$5,$6)`,
        [participantId, id, application.contactName, application.email, application.phone ?? null, application.jobTitle ?? null]);
      await client.query(`INSERT INTO participant_roles (participant_id,role) VALUES ($1,'RESPONDENT')`, [participantId]);
      await this.transition(client, id, null, 'APPLICATION_STARTED', 'CreateDiagnosisCase', actor);
    });
    return { id, organization_display_name: companyDisplayName(application.companyName), provider_name: PROVIDER_NAME,
      entry_channel: entryChannel, diagnosis_status: 'APPLICATION_STARTED' as const, assessment_status: 'NOT_PROPOSED',
      ...(token ? { access_token: token, access_token_expires_at: expires!.toISOString() } : {}) };
  }

  async startSurvey(id: string, actor: Actor): Promise<void> {
    await this.transaction(async client => {
      const row = await this.authorizedCase(client, id, actor);
      if (row.diagnosis_status === 'SURVEY_IN_PROGRESS') return;
      if (row.diagnosis_status !== 'APPLICATION_STARTED') throw new DiagnosisError(409, 'この案件のアンケートは開始できません。');
      await client.query(`UPDATE diagnosis_cases SET diagnosis_status='SURVEY_IN_PROGRESS', started_at=now(), updated_at=now(), version=version+1 WHERE id=$1`, [id]);
      await this.transition(client, id, row.diagnosis_status, 'SURVEY_IN_PROGRESS', 'StartSurvey', actor);
    });
  }

  async submitResponse(id: string, code: string, questionVersion: number, value: RawValue, actor: Actor): Promise<void> {
    await this.transaction(async client => {
      const row = await this.authorizedCase(client, id, actor);
      if (row.diagnosis_status !== 'SURVEY_IN_PROGRESS') throw new DiagnosisError(409, '回答を編集できる状態ではありません。');
      const q = (await this.questions(client, row.survey_version)).find(q => q.question_code === code);
      if (!q || q.version !== questionVersion) throw new DiagnosisError(422, '質問または質問バージョンが一致しません。', [code]);
      validateAnswer(q, value);
      const participant = await client.query<{ id: string }>(`SELECT p.id FROM participants p JOIN participant_roles r ON r.participant_id=p.id
        WHERE p.diagnosis_case_id=$1 AND r.role='RESPONDENT'`, [id]);
      await client.query(`INSERT INTO survey_responses
        (id,diagnosis_case_id,question_id,question_version,respondent_participant_id,raw_value_json,entry_channel,entered_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (diagnosis_case_id,question_id) DO UPDATE SET raw_value_json=EXCLUDED.raw_value_json,
          entered_by_user_id=EXCLUDED.entered_by_user_id, answered_at=now()`,
      [randomUUID(), id, q.id, q.version, participant.rows[0]!.id, JSON.stringify(value), row.entry_channel, staffId(actor)]);
      await client.query('UPDATE diagnosis_cases SET updated_at=now(), version=version+1 WHERE id=$1', [id]);
    });
  }

  async completeSurvey(id: string, actor: Actor): Promise<void> {
    await this.transaction(async client => {
      const row = await this.authorizedCase(client, id, actor);
      if (row.diagnosis_status !== 'SURVEY_IN_PROGRESS') throw new DiagnosisError(409, '回答を完了できる状態ではありません。');
      const questions = await this.questions(client, row.survey_version);
      const { rows: responses } = await client.query<ResponseRow>(`SELECT r.*,q.question_code FROM survey_responses r
        JOIN survey_questions q ON q.id=r.question_id WHERE r.diagnosis_case_id=$1`, [id]);
      const missing = questions.filter(q => q.is_required && !hasAnswer(responses.find(r => r.question_code === q.question_code)?.raw_value_json));
      if (missing.length) throw new DiagnosisError(422, '未回答の必須項目があります。', missing.map(q => q.question_code));
      for (const q of questions) {
        const response = responses.find(r => r.question_code === q.question_code);
        if (response) validateAnswer(q, response.raw_value_json);
      }
      const future = responses.find(r => r.question_code === 'Q01_FUTURE');
      if (!future) throw new DiagnosisError(422, '未来についての回答を確認してください。', ['Q01_FUTURE']);
      await client.query(`INSERT INTO diagnosis_futures
        (id,diagnosis_case_id,statement,time_horizon,intent_status,source_ref_type,source_ref_id)
        VALUES ($1,$2,$3,'1〜3年','SURVEY_STATED','SURVEY_RESPONSE',$4)`,
      [randomUUID(), id, futureStatement(future.raw_value_json), future.id]);
      await client.query(`UPDATE diagnosis_cases SET diagnosis_status='SURVEY_COMPLETED', updated_at=now(), version=version+1 WHERE id=$1`, [id]);
      await this.transition(client, id, row.diagnosis_status, 'SURVEY_COMPLETED', 'CompleteSurvey', actor);
    });
  }

  async revokeAccessToken(id: string, actor: Actor): Promise<void> {
    if (actor.kind !== 'STAFF') throw new DiagnosisError(403, 'スタッフのみ実行できます。');
    await this.transaction(async client => {
      const row = await this.authorizedCase(client, id, actor);
      if (row.entry_channel !== 'WEB') throw new DiagnosisError(409, 'Web申込の案件ではありません。');
      if (row.access_token_revoked_at) return;
      await client.query('UPDATE diagnosis_cases SET access_token_revoked_at=now(), updated_at=now(), version=version+1 WHERE id=$1', [id]);
      await this.audit(client, id, 'RevokeSurveyAccess', actor);
    });
  }

  async getSurvey(id: string, actor: Actor) {
    return this.transaction(async client => {
      const row = await this.authorizedCase(client, id, actor);
      const { rows: organizations } = await client.query<{ name: string }>('SELECT name FROM organizations WHERE id=$1', [row.organization_id]);
      const questions = await this.questions(client, row.survey_version);
      const { rows: responses } = await client.query<ResponseRow>(`SELECT r.id,q.question_code,r.question_version,r.raw_value_json,
        r.respondent_participant_id,r.entry_channel,r.entered_by_user_id,r.answered_at
        FROM survey_responses r JOIN survey_questions q ON q.id=r.question_id WHERE r.diagnosis_case_id=$1 ORDER BY q.display_order`, [id]);
      const { rows: futures } = await client.query<FutureRow>(`SELECT id,statement,time_horizon,intent_status,source_ref_type,source_ref_id,version,is_current
        FROM diagnosis_futures WHERE diagnosis_case_id=$1 AND is_current`, [id]);
      const answered = questions.filter(q => q.is_required && hasAnswer(responses.find(r => r.question_code === q.question_code)?.raw_value_json)).length;
      // Explicit projection: tokens, staff principal, and internal business fields never leak publicly.
      const base = { id, organization_display_name: companyDisplayName(organizations[0]!.name), provider_name: PROVIDER_NAME,
        diagnosis_status: row.diagnosis_status, survey_version: row.survey_version, version: row.version,
        questions, responses: responses.map(r => ({ id: r.id, question_code: r.question_code, question_version: r.question_version,
          raw_value_json: r.raw_value_json, answered_at: r.answered_at })),
        survey: { status: surveyStatus(row.diagnosis_status), answered_required: answered, total_required: questions.filter(q => q.is_required).length } };
      if (actor.kind === 'CUSTOMER') return base;
      const { rows: participants } = await client.query(`SELECT id,name,email,phone,job_title FROM participants WHERE diagnosis_case_id=$1`, [id]);
      const { rows: transitions } = await client.query(`SELECT from_status,to_status,command,actor_type,actor_user_id,created_at
        FROM case_transitions WHERE diagnosis_case_id=$1 ORDER BY created_at`, [id]);
      const {rows:handoffs}=await client.query('SELECT status FROM assessment_handoffs WHERE diagnosis_case_id=$1 ORDER BY version DESC LIMIT 1',[id]);
      return { ...base, responses, entry_channel: row.entry_channel, assessment_status: row.assessment_status,
        owner_user_id: row.owner_user_id, current_next_action: nextAction(row.diagnosis_status,row.assessment_status,handoffs[0]?.status), scheduled_at: row.scheduled_at,
        future: futures[0] ?? null, participants, transitions,
        access: { expires_at: row.access_token_expires_at, revoked_at: row.access_token_revoked_at } };
    });
  }

  async listCases(opts: { status?: DiagnosisStatus; entryChannel?: EntryChannel; limit: number; offset: number }) {
    const params = [opts.status ?? null, opts.entryChannel ?? null];
    const where = `WHERE ($1::text IS NULL OR c.diagnosis_status=$1) AND ($2::text IS NULL OR c.entry_channel=$2)`;
    const { rows: count } = await this.pool.query<{ total: string }>(`SELECT count(*) AS total FROM diagnosis_cases c ${where}`, params);
    const { rows } = await this.pool.query(`SELECT c.id,c.diagnosis_status,c.assessment_status,c.entry_channel,c.owner_user_id,c.scheduled_at,c.created_at,
      o.name AS organization_name,p.name AS contact_name,p.email AS contact_email,
      f.statement AS future_summary,
      (SELECT status FROM assessment_handoffs h WHERE h.diagnosis_case_id=c.id ORDER BY version DESC LIMIT 1) AS handoff_status,
      (SELECT count(*)::int FROM survey_questions q WHERE q.version=c.survey_version AND q.is_required) AS total_required,
      (SELECT count(*)::int FROM survey_responses r JOIN survey_questions q ON q.id=r.question_id
        WHERE r.diagnosis_case_id=c.id AND q.is_required AND r.raw_value_json NOT IN ('[]'::jsonb,'""'::jsonb)) AS answered_required
      FROM diagnosis_cases c JOIN organizations o ON o.id=c.organization_id
      JOIN participants p ON p.diagnosis_case_id=c.id JOIN participant_roles pr ON pr.participant_id=p.id AND pr.role='RESPONDENT'
      LEFT JOIN diagnosis_futures f ON f.diagnosis_case_id=c.id AND f.is_current
      ${where} ORDER BY c.created_at DESC,c.id LIMIT $3 OFFSET $4`, [...params, opts.limit, opts.offset]);
    return { items: rows.map(({ organization_name, ...row }) => ({ ...row,
      organization_display_name: companyDisplayName(organization_name),
      current_next_action: nextAction(row.diagnosis_status,row.assessment_status,row.handoff_status), survey_status: surveyStatus(row.diagnosis_status) })), total: Number(count[0]!.total), provider_name: PROVIDER_NAME };
  }
}
