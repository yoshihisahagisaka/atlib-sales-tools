import { createHash, randomUUID } from 'node:crypto';
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

export interface BusinessKaizenDiagnosisListInput {
  companyName?: string;
  owner?: string;
  entryChannel?: 'CUSTOMER_SELF' | 'STAFF_PROXY';
  currentStage?: 'ACCEPTED' | 'SCHEDULING' | 'SCHEDULED' | 'MEETING_COMPLETED' | 'PROPOSAL_IN_PROGRESS' | 'PROPOSED';
  page: number;
  limit: number;
}

export type BusinessKaizenStage = 'ACCEPTED' | 'SCHEDULING' | 'SCHEDULED' | 'MEETING_COMPLETED' | 'PROPOSAL_IN_PROGRESS' | 'PROPOSED';
export type BusinessKaizenOutcome = 'WON' | 'COMPLETED_NO_PROPOSAL' | 'NOT_PROCEEDED' | 'LOST';
export interface BusinessKaizenCommercialEventInput {
  idempotencyKey: string;
  eventType: 'PROPOSED' | 'WON';
  serviceName: string;
  description: string;
  amount: number | null;
  currency: 'JPY';
  occurredAt: string;
}

export class BusinessKaizenProxyService {
  constructor(private readonly pool: Pool, private readonly analyzer: Analyzer = diagnoseBusinessKaizenSnapshot) {}

  private async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { try { await client.query('ROLLBACK'); } catch { /* preserve original */ } throw error; }
    finally { client.release(); }
  }

  async list(input: BusinessKaizenDiagnosisListInput) {
    const parameters: unknown[] = [];
    const conditions: string[] = [];
    const parameter = (value: unknown) => { parameters.push(value); return `$${parameters.length}`; };
    if (input.companyName) {
      const value = parameter(input.companyName.toLowerCase());
      conditions.push(`position(${value} in lower(CASE WHEN d.entry_channel='CUSTOMER_SELF' THEN l.company_name ELSE c.name END)) > 0`);
    }
    if (input.owner) conditions.push(`d.owner_user_email=${parameter(input.owner)}`);
    if (input.entryChannel) conditions.push(`d.entry_channel=${parameter(input.entryChannel)}`);
    if (input.currentStage) conditions.push(`d.current_stage=${parameter(input.currentStage)}`);
    const limit = parameter(input.limit + 1);
    const offset = parameter((input.page - 1) * input.limit);
    const result = await this.pool.query(
      `SELECT d.id AS "diagnosisId",d.entry_channel AS "entryChannel",d.input_state AS "inputState",
              CASE WHEN d.entry_channel='CUSTOMER_SELF' THEN l.company_name ELSE c.name END AS "companyName",
              CASE WHEN d.entry_channel='CUSTOMER_SELF' THEN l.person_name ELSE ct.name END AS "contactName",
              d.diagnosis_snapshot->>'direction' AS direction,
              d.diagnosis_snapshot->>'directionStatus' AS "directionStatus",
              d.current_stage AS "currentStage",d.outcome,d.owner_user_email AS "ownerUserEmail",
              d.updated_at AS "updatedAt",d.sales_activity_id AS "salesActivityId",
              d.consultation_lead_id AS "consultationLeadId"
         FROM business_kaizen_diagnoses d
         LEFT JOIN business_web_consultation_leads l
           ON d.entry_channel='CUSTOMER_SELF' AND l.id=d.consultation_lead_id
         LEFT JOIN company c ON d.entry_channel='STAFF_PROXY' AND c.id=d.company_id
         LEFT JOIN contact ct ON d.entry_channel='STAFF_PROXY' AND ct.id=d.contact_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY d.updated_at DESC,d.id DESC LIMIT ${limit} OFFSET ${offset}`,
      parameters,
    );
    return { items: result.rows.slice(0, input.limit), page: input.page, limit: input.limit, hasNext: result.rows.length > input.limit };
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
              CASE WHEN d.entry_channel='CUSTOMER_SELF' THEN l.company_name ELSE c.name END AS "companyName",
              d.contact_id AS "contactId",
              CASE WHEN d.entry_channel='CUSTOMER_SELF' THEN l.person_name ELSE ct.name END AS "contactName",
              s.selected_service AS "selectedService",d.owner_user_email AS "ownerUserEmail",
              d.consultation_lead_id AS "consultationLeadId",d.original_answers AS "originalAnswers",
              d.current_answers AS "currentAnswers",d.diagnosis_snapshot AS "diagnosisSnapshot",
              d.current_stage AS "currentStage",d.outcome,d.outcome_reason AS "outcomeReason",
              d.outcome_note AS "outcomeNote",d.revision,d.created_at AS "createdAt",
              d.updated_at AS "updatedAt",d.completed_at AS "completedAt",d.scheduled_at AS "scheduledAt",
              d.closed_at AS "closedAt",l.consented_at AS "leadConsentedAt",
              l.created_at AS "leadCreatedAt",l.updated_at AS "leadUpdatedAt",
              l.utm_source AS "leadUtmSource",l.utm_medium AS "leadUtmMedium",
              l.utm_campaign AS "leadUtmCampaign",l.utm_content AS "leadUtmContent",
              l.utm_term AS "leadUtmTerm",l.cta_source AS "leadCtaSource",
              l.landing_url AS "leadLandingUrl",l.referrer AS "leadReferrer",
              s.acquisition_source_type AS "activityAcquisitionSourceType",
              s.acquisition_source_name AS "activityAcquisitionSourceName",
              s.utm_source AS "activityUtmSource",s.utm_medium AS "activityUtmMedium",
              s.utm_campaign AS "activityUtmCampaign",s.utm_content AS "activityUtmContent",
              s.utm_term AS "activityUtmTerm",s.landing_url AS "activityLandingUrl",
              s.referrer AS "activityReferrer",s.created_at AS "activityCreatedAt"
         FROM business_kaizen_diagnoses d
         LEFT JOIN business_web_consultation_leads l
           ON d.entry_channel='CUSTOMER_SELF' AND l.id=d.consultation_lead_id
         LEFT JOIN sales_activity s ON d.entry_channel='STAFF_PROXY' AND s.id=d.sales_activity_id
         LEFT JOIN company c ON d.entry_channel='STAFF_PROXY' AND c.id=d.company_id
         LEFT JOIN contact ct ON d.entry_channel='STAFF_PROXY' AND ct.id=d.contact_id
        WHERE d.id=$1`, [diagnosisId],
    );
    if (!result.rows[0]) throw new BusinessKaizenProxyError(404, 'DIAGNOSIS_NOT_FOUND');
    const row = result.rows[0];
    const attribution = row.entryChannel === 'CUSTOMER_SELF'
      ? { utmSource: row.leadUtmSource, utmMedium: row.leadUtmMedium, utmCampaign: row.leadUtmCampaign,
          utmContent: row.leadUtmContent, utmTerm: row.leadUtmTerm, ctaSource: row.leadCtaSource,
          landingUrl: row.leadLandingUrl, referrer: row.leadReferrer }
      : { acquisitionSourceType: row.activityAcquisitionSourceType, acquisitionSourceName: row.activityAcquisitionSourceName,
          utmSource: row.activityUtmSource, utmMedium: row.activityUtmMedium, utmCampaign: row.activityUtmCampaign,
          utmContent: row.activityUtmContent, utmTerm: row.activityUtmTerm,
          landingUrl: row.activityLandingUrl, referrer: row.activityReferrer };
    for (const key of ['leadUtmSource','leadUtmMedium','leadUtmCampaign','leadUtmContent','leadUtmTerm','leadCtaSource','leadLandingUrl','leadReferrer',
      'activityAcquisitionSourceType','activityAcquisitionSourceName','activityUtmSource','activityUtmMedium','activityUtmCampaign','activityUtmContent','activityUtmTerm','activityLandingUrl','activityReferrer']) delete row[key];
    return { ...row, attribution };
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

  async updateStage(diagnosisId: string, stage: BusinessKaizenStage, expectedRevision: number, actor: string) {
    return this.tx(async client => {
      const diagnosis = await this.lockCommercialDiagnosis(client, diagnosisId);
      if (diagnosis.revision !== expectedRevision) throw new BusinessKaizenProxyError(409, 'REVISION_CONFLICT');
      if (diagnosis.current_stage === stage) return { currentStage: stage, revision: diagnosis.revision, changed: false };
      const updated = await client.query(
        `UPDATE business_kaizen_diagnoses SET current_stage=$2,revision=revision+1,updated_at=now()
          WHERE id=$1 RETURNING current_stage AS "currentStage",revision,updated_at AS "updatedAt"`,
        [diagnosisId, stage],
      );
      let history;
      try {
        history = await client.query(
          `INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,changed_by_user_email)
           VALUES($1,$2,$3,$4) RETURNING id,stage,reached_at AS "reachedAt",changed_by_user_email AS "changedByUserEmail"`,
          [randomUUID(), diagnosisId, stage, actor],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new BusinessKaizenProxyError(409, 'STAGE_ALREADY_RECORDED');
        throw error;
      }
      await this.audit(client, diagnosisId, 'STAGE_CHANGED', actor, {
        from: diagnosis.current_stage, to: stage, fromRevision: expectedRevision, toRevision: expectedRevision + 1,
      });
      return { ...updated.rows[0], history: history.rows[0], changed: true };
    });
  }

  async updateSchedule(diagnosisId: string, scheduledAt: string | null, expectedRevision: number, actor: string) {
    return this.tx(async client => {
      const diagnosis = await this.lockCommercialDiagnosis(client, diagnosisId);
      if (diagnosis.revision !== expectedRevision) throw new BusinessKaizenProxyError(409, 'REVISION_CONFLICT');
      const before = this.iso(diagnosis.scheduled_at), after = this.iso(scheduledAt);
      if (before === after) return { scheduledAt: before, revision: diagnosis.revision, changed: false };
      const updated = await client.query(
        `UPDATE business_kaizen_diagnoses SET scheduled_at=$2,revision=revision+1,updated_at=now()
          WHERE id=$1 RETURNING scheduled_at AS "scheduledAt",revision,updated_at AS "updatedAt"`,
        [diagnosisId, scheduledAt],
      );
      await this.audit(client, diagnosisId, 'SCHEDULE_CHANGED', actor, {
        from: before, to: after, fromRevision: expectedRevision, toRevision: expectedRevision + 1,
      });
      return { ...updated.rows[0], changed: true };
    });
  }

  async updateOutcome(diagnosisId: string, outcome: BusinessKaizenOutcome | null, outcomeReason: string | null,
    outcomeNote: string | null, expectedRevision: number, actor: string) {
    return this.tx(async client => {
      const diagnosis = await this.lockCommercialDiagnosis(client, diagnosisId);
      if (diagnosis.revision !== expectedRevision) throw new BusinessKaizenProxyError(409, 'REVISION_CONFLICT');
      const before = { outcome: diagnosis.outcome, outcomeReason: diagnosis.outcome_reason, outcomeNote: diagnosis.outcome_note };
      const after = { outcome, outcomeReason, outcomeNote };
      if (JSON.stringify(before) === JSON.stringify(after)) return { ...after, closedAt: diagnosis.closed_at, revision: diagnosis.revision, changed: false };
      const updated = await client.query(
        `UPDATE business_kaizen_diagnoses
            SET outcome=$2,outcome_reason=$3,outcome_note=$4,
                closed_at=CASE WHEN $2::text IS NOT NULL THEN COALESCE(closed_at,now()) ELSE closed_at END,
                revision=revision+1,updated_at=now()
          WHERE id=$1 RETURNING outcome,outcome_reason AS "outcomeReason",outcome_note AS "outcomeNote",
                                closed_at AS "closedAt",revision,updated_at AS "updatedAt"`,
        [diagnosisId, outcome, outcomeReason, outcomeNote],
      );
      await this.audit(client, diagnosisId, 'OUTCOME_CHANGED', actor, {
        from: before, to: after, fromRevision: expectedRevision, toRevision: expectedRevision + 1,
      });
      return { ...updated.rows[0], changed: true };
    });
  }

  async createCommercialEvent(diagnosisId: string, input: BusinessKaizenCommercialEventInput, actor: string) {
    const payloadHash = createHash('sha256').update(JSON.stringify({ diagnosisId, ...input })).digest('hex');
    return this.tx(async client => {
      await this.lockCommercialDiagnosis(client, diagnosisId);
      const inserted = await client.query(
        `INSERT INTO business_kaizen_commercial_events
          (id,diagnosis_id,event_type,service_name,description,amount,currency,occurred_at,created_by_user_email,idempotency_key,payload_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(idempotency_key) DO NOTHING
         RETURNING id,diagnosis_id AS "diagnosisId",event_type AS "eventType",service_name AS "serviceName",
                   description,amount,currency,occurred_at AS "occurredAt",created_by_user_email AS "createdByUserEmail",
                   idempotency_key AS "idempotencyKey",created_at AS "createdAt"`,
        [randomUUID(), diagnosisId, input.eventType, input.serviceName, input.description, input.amount,
          input.currency, input.occurredAt, actor, input.idempotencyKey, payloadHash],
      );
      if (inserted.rows[0]) {
        await this.audit(client, diagnosisId, 'COMMERCIAL_EVENT_CREATED', actor, {
          commercialEventId: inserted.rows[0].id, eventType: input.eventType, idempotencyKey: input.idempotencyKey,
        });
        return { created: true, event: inserted.rows[0] };
      }
      const existing = await client.query(
        `SELECT id,diagnosis_id AS "diagnosisId",event_type AS "eventType",service_name AS "serviceName",
                description,amount,currency,occurred_at AS "occurredAt",created_by_user_email AS "createdByUserEmail",
                idempotency_key AS "idempotencyKey",created_at AS "createdAt",payload_hash
           FROM business_kaizen_commercial_events WHERE idempotency_key=$1`, [input.idempotencyKey],
      );
      if (!existing.rows[0] || existing.rows[0].payload_hash !== payloadHash) throw new BusinessKaizenProxyError(409, 'IDEMPOTENCY_CONFLICT');
      const { payload_hash: _payloadHash, ...event } = existing.rows[0];
      return { created: false, event };
    });
  }

  async listStageHistory(diagnosisId: string) {
    await this.assertDiagnosis(diagnosisId);
    const result = await this.pool.query(
      `SELECT id,diagnosis_id AS "diagnosisId",stage,reached_at AS "reachedAt",
              changed_by_user_email AS "changedByUserEmail",created_at AS "createdAt"
         FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1 ORDER BY reached_at,id`, [diagnosisId],
    );
    return { items: result.rows };
  }

  async listCommercialEvents(diagnosisId: string) {
    await this.assertDiagnosis(diagnosisId);
    const result = await this.pool.query(
      `SELECT id,diagnosis_id AS "diagnosisId",event_type AS "eventType",service_name AS "serviceName",
              description,amount,currency,occurred_at AS "occurredAt",created_by_user_email AS "createdByUserEmail",
              idempotency_key AS "idempotencyKey",created_at AS "createdAt"
         FROM business_kaizen_commercial_events WHERE diagnosis_id=$1 ORDER BY occurred_at DESC,id DESC`, [diagnosisId],
    );
    return { items: result.rows };
  }

  private async lockCommercialDiagnosis(client: PoolClient, diagnosisId: string) {
    const result = await client.query<{
      revision:number; current_stage:BusinessKaizenStage|null; scheduled_at:Date|string|null;
      outcome:BusinessKaizenOutcome|null; outcome_reason:string|null; outcome_note:string|null; closed_at:Date|string|null;
    }>(`SELECT revision,current_stage,scheduled_at,outcome,outcome_reason,outcome_note,closed_at
          FROM business_kaizen_diagnoses WHERE id=$1 FOR UPDATE`, [diagnosisId]);
    if (!result.rows[0]) throw new BusinessKaizenProxyError(404, 'DIAGNOSIS_NOT_FOUND');
    return result.rows[0];
  }

  private async assertDiagnosis(diagnosisId: string) {
    const result = await this.pool.query('SELECT id FROM business_kaizen_diagnoses WHERE id=$1', [diagnosisId]);
    if (!result.rows[0]) throw new BusinessKaizenProxyError(404, 'DIAGNOSIS_NOT_FOUND');
  }

  private iso(value: Date | string | null): string | null {
    if (value === null) return null;
    return new Date(value).toISOString();
  }

  private async audit(client: Pick<PoolClient, 'query'>, diagnosisId: string, operation: string, actor: string, metadata: unknown) {
    await client.query(
      `INSERT INTO business_kaizen_diagnosis_audit(id,diagnosis_id,operation,actor_user_email,metadata_json)
       VALUES($1,$2,$3,$4,$5::jsonb)`,
      [randomUUID(), diagnosisId, operation, actor, JSON.stringify(metadata)],
    );
  }
}
