import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  businessKaizenDraftAnswersSchema,
  diagnoseBusinessKaizenSnapshot,
  type BusinessKaizenAnswers,
} from '../domain/businessKaizenDiagnosis';
import { businessKaizenAnswersSchema, type DiagnosisSnapshot } from '../domain/businessWebConsultation';

export const BUSINESS_KAIZEN_PROXY_CONSENT_VERSION = 'business_kaizen_staff_proxy_consent_v1';

export class BusinessKaizenProxyError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

type Analyzer = (answers: BusinessKaizenAnswers) => DiagnosisSnapshot;

export class BusinessKaizenProxyService {
  constructor(private readonly pool: Pool, private readonly analyzer: Analyzer = diagnoseBusinessKaizenSnapshot) {}

  private async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { try { await client.query('ROLLBACK'); } catch { /* preserve original */ } throw error; }
    finally { client.release(); }
  }

  async createOrResume(salesActivityId: string, actor: string) {
    return this.tx(async client => {
      const locked = await client.query<{
        id:string; company_id:string; primary_contact_id:string|null; selected_service:string; owner_user_id:string;
      }>(`SELECT id,company_id,primary_contact_id,selected_service,owner_user_id
            FROM sales_activity WHERE id=$1 FOR UPDATE`, [salesActivityId]);
      const activity = locked.rows[0];
      if (!activity) throw new BusinessKaizenProxyError(404, 'SALES_ACTIVITY_NOT_FOUND');
      if (activity.selected_service !== 'BUSINESS_WEB') throw new BusinessKaizenProxyError(409, 'SERVICE_MISMATCH');
      if (!activity.primary_contact_id) throw new BusinessKaizenProxyError(409, 'CONTACT_COMPANY_MISMATCH');
      const member = await client.query('SELECT id FROM contact WHERE id=$1 AND company_id=$2', [activity.primary_contact_id, activity.company_id]);
      if (!member.rows[0]) throw new BusinessKaizenProxyError(409, 'CONTACT_COMPANY_MISMATCH');
      const existing = await client.query(
        `SELECT id,input_state,revision FROM business_kaizen_diagnoses
          WHERE sales_activity_id=$1 AND entry_channel='STAFF_PROXY'
          ORDER BY created_at,id LIMIT 1`, [activity.id],
      );
      if (existing.rows[0]) return { ...existing.rows[0], diagnosisId: existing.rows[0].id, created: false };
      const diagnosisId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO business_kaizen_diagnoses
         (id,entry_channel,input_state,sales_activity_id,company_id,contact_id,owner_user_email)
         VALUES($1,'STAFF_PROXY','DRAFT',$2,$3,$4,$5)
         RETURNING id,input_state,revision`,
        [diagnosisId, activity.id, activity.company_id, activity.primary_contact_id, activity.owner_user_id],
      );
      await this.audit(client, diagnosisId, 'DRAFT_CREATED', actor, { salesActivityId: activity.id, revision: 1 });
      return { ...inserted.rows[0], diagnosisId, created: true };
    });
  }

  async get(diagnosisId: string) {
    const result = await this.pool.query(
      `SELECT d.id,d.entry_channel AS "entryChannel",d.input_state AS "inputState",
              d.sales_activity_id AS "salesActivityId",d.company_id AS "companyId",
              c.name AS "companyName",d.contact_id AS "contactId",ct.name AS "contactName",
              s.selected_service AS "selectedService",d.owner_user_email AS "ownerUserEmail",
              d.current_answers AS "currentAnswers",d.diagnosis_snapshot AS "diagnosisSnapshot",
              d.revision,d.completed_at AS "completedAt"
         FROM business_kaizen_diagnoses d
         JOIN sales_activity s ON s.id=d.sales_activity_id
         JOIN company c ON c.id=d.company_id
         JOIN contact ct ON ct.id=d.contact_id
        WHERE d.id=$1 AND d.entry_channel='STAFF_PROXY'`, [diagnosisId],
    );
    if (!result.rows[0]) throw new BusinessKaizenProxyError(404, 'DIAGNOSIS_NOT_FOUND');
    return result.rows[0];
  }

  async saveDraft(diagnosisId: string, answers: unknown, expectedRevision: number, actor: string) {
    const parsed = businessKaizenDraftAnswersSchema.safeParse(answers);
    if (!parsed.success) throw new BusinessKaizenProxyError(400, 'INVALID_ANSWERS');
    return this.tx(async client => {
      const locked = await client.query<{ input_state:string; revision:number }>(
        `SELECT input_state,revision FROM business_kaizen_diagnoses
          WHERE id=$1 AND entry_channel='STAFF_PROXY' FOR UPDATE`, [diagnosisId],
      );
      const diagnosis = locked.rows[0];
      if (!diagnosis) throw new BusinessKaizenProxyError(404, 'DIAGNOSIS_NOT_FOUND');
      if (diagnosis.input_state !== 'DRAFT') throw new BusinessKaizenProxyError(409, 'DIAGNOSIS_ALREADY_COMPLETED');
      if (diagnosis.revision !== expectedRevision) throw new BusinessKaizenProxyError(409, 'REVISION_CONFLICT');
      const updated = await client.query(
        `UPDATE business_kaizen_diagnoses SET current_answers=$2::jsonb,revision=revision+1,updated_at=now()
          WHERE id=$1 RETURNING revision,current_answers AS "currentAnswers"`,
        [diagnosisId, JSON.stringify(parsed.data)],
      );
      await this.audit(client, diagnosisId, 'DRAFT_ANSWERS_REPLACED', actor, {
        fromRevision: expectedRevision, toRevision: expectedRevision + 1, questionIds: Object.keys(parsed.data).sort(),
      });
      return updated.rows[0];
    });
  }

  async complete(diagnosisId: string, expectedRevision: number, actor: string, consentVersion: string) {
    if (consentVersion !== BUSINESS_KAIZEN_PROXY_CONSENT_VERSION) throw new BusinessKaizenProxyError(400, 'CONSENT_REQUIRED');
    return this.tx(async client => {
      const locked = await client.query<{ input_state:string; revision:number; current_answers:unknown; diagnosis_snapshot:unknown }>(
        `SELECT input_state,revision,current_answers,diagnosis_snapshot FROM business_kaizen_diagnoses
          WHERE id=$1 AND entry_channel='STAFF_PROXY' FOR UPDATE`, [diagnosisId],
      );
      const diagnosis = locked.rows[0];
      if (!diagnosis) throw new BusinessKaizenProxyError(404, 'DIAGNOSIS_NOT_FOUND');
      if (diagnosis.input_state === 'COMPLETED') return { created: false, revision: diagnosis.revision, diagnosisSnapshot: diagnosis.diagnosis_snapshot };
      if (diagnosis.revision !== expectedRevision) throw new BusinessKaizenProxyError(409, 'REVISION_CONFLICT');
      const parsed = businessKaizenAnswersSchema.safeParse(diagnosis.current_answers);
      if (!parsed.success) throw new BusinessKaizenProxyError(400, 'INCOMPLETE_ANSWERS');
      const snapshot = this.analyzer(parsed.data);
      const updated = await client.query(
        `UPDATE business_kaizen_diagnoses
            SET original_answers=$2::jsonb,current_answers=$2::jsonb,diagnosis_snapshot=$3::jsonb,
                input_state='COMPLETED',diagnosis_version=$4,logic_version=$5,completed_at=now(),
                revision=revision+1,updated_at=now()
          WHERE id=$1 RETURNING revision,diagnosis_snapshot AS "diagnosisSnapshot",completed_at AS "completedAt"`,
        [diagnosisId, JSON.stringify(parsed.data), JSON.stringify(snapshot), snapshot.diagnosisVersion, snapshot.logicVersion],
      );
      await this.audit(client, diagnosisId, 'DIAGNOSIS_COMPLETED', actor, {
        fromRevision: expectedRevision, toRevision: expectedRevision + 1, consentWordingVersion: consentVersion,
        purposeConfirmed: true, privacyHandlingConfirmed: true,
      });
      return { created: true, ...updated.rows[0] };
    });
  }

  private async audit(client: Pick<PoolClient, 'query'>, diagnosisId: string, operation: string, actor: string, metadata: unknown) {
    await client.query(
      `INSERT INTO business_kaizen_diagnosis_audit(id,diagnosis_id,operation,actor_user_email,metadata_json)
       VALUES($1,$2,$3,$4,$5::jsonb)`,
      [randomUUID(), diagnosisId, operation, actor, JSON.stringify(metadata)],
    );
  }
}
