import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { RESPONDENT_ROLE, type CreateCompanyInput } from '../domain/freeDiagnosisRuleBasedV1';
import type { CurrentStructuredStateV2 } from '../domain/freeDiagnosisDesignV2';
import { FreeDiagnosisSalesLauncherRepo } from './freeDiagnosisSalesLauncherRepo';
import { FreeDiagnosisRuleBasedCaseRepo } from './freeDiagnosisRuleBasedCaseRepo';
import { FreeDiagnosisDesignV2EntryAdapter } from './freeDiagnosisDesignV2EntryAdapter';

export class StaffProxyDesignV2SubmissionError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); this.name = 'StaffProxyDesignV2SubmissionError'; }
}

interface StaffProxyDesignV2SubmissionBase {
  idempotencyKey: string;
  survey: CurrentStructuredStateV2;
  respondentRole: (typeof RESPONDENT_ROLE)[number];
  consentConfirmed: true;
}

export type StaffProxyDesignV2SubmissionInput = StaffProxyDesignV2SubmissionBase & (
  | { activity: CreateCompanyInput; salesActivityId?: never }
  | { salesActivityId: string; activity?: never }
);

export const STAFF_PROXY_CONSENT_WORDING_VERSION = 'STAFF_PROXY_CONSENT_V1';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`; }
  return JSON.stringify(value);
}

export class StaffProxyDesignV2SubmissionService {
  constructor(private readonly pool: Pool, private readonly entry: FreeDiagnosisDesignV2EntryAdapter) {}

  async submit(input: StaffProxyDesignV2SubmissionInput, authenticatedStaff: string): Promise<{ caseId: string; created: boolean }> {
    if (!authenticatedStaff.trim()) throw new StaffProxyDesignV2SubmissionError(401, 'STAFF_AUTH_REQUIRED');
    if (input.consentConfirmed !== true) throw new StaffProxyDesignV2SubmissionError(422, 'STAFF_PROXY_CONSENT_REQUIRED');
    const payloadHash = createHash('sha256').update(stable(input)).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.idempotencyKey]);
      const existing = await client.query<{ case_id: string; payload_hash: string }>(
        `SELECT case_id,detail_json->>'payload_hash' AS payload_hash
           FROM it_management_diagnosis_case_v2_audit
          WHERE command='CompleteDesignV2StaffProxyEntry'
            AND detail_json->>'idempotency_key'=$1
          ORDER BY created_at DESC LIMIT 1`, [input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].payload_hash !== payloadHash) throw new StaffProxyDesignV2SubmissionError(409, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_SUBMISSION');
        await client.query('COMMIT');
        return { caseId: existing.rows[0].case_id, created: false };
      }
      const launcher = new FreeDiagnosisSalesLauncherRepo(client as unknown as Pool);
      const cases = new FreeDiagnosisRuleBasedCaseRepo(client as unknown as Pool);
      const activity = input.salesActivityId !== undefined
        ? await this.lockExistingActivity(client, input.salesActivityId)
        : await launcher.createSalesActivity(input.activity, authenticatedStaff);
      const kase = await cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, authenticatedStaff, false);
      await client.query(
        `INSERT INTO it_management_diagnosis_case_v2_audit(id,case_id,command,actor_user_id,detail_json)
         VALUES($1,$2,'RecordDesignV2StaffProxyConsent',$3,$4)`,
        [randomUUID(), kase.id, authenticatedStaff, JSON.stringify({
          consent_confirmed: true,
          consent_wording_version: STAFF_PROXY_CONSENT_WORDING_VERSION,
          confirmation_recorded_at: 'SERVER_CREATED_AT',
        })],
      );
      const completed = await this.entry.completeInTransaction(client, {
        caseId: kase.id, answers: input.survey, surveyVersion: 'design-v2-staff-proxy-1',
        entryChannel: 'STAFF_PROXY', answeredByRole: input.respondentRole,
        enteredByUserId: authenticatedStaff, actor: authenticatedStaff,
      });
      if (completed.caseStatus !== 'INTAKE_COMPLETED') throw new Error('UNEXPECTED_STAFF_PROXY_STATUS');
      await client.query(
        `INSERT INTO it_management_diagnosis_case_v2_audit(id,case_id,command,actor_user_id,detail_json)
         VALUES($1,$2,'CompleteDesignV2StaffProxyEntry',$3,$4)`,
        [randomUUID(), kase.id, authenticatedStaff, JSON.stringify({ idempotency_key: input.idempotencyKey, payload_hash: payloadHash, sales_activity_id: activity.salesActivityId })],
      );
      await client.query('COMMIT');
      return { caseId: kase.id, created: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  private async lockExistingActivity(client: import('pg').PoolClient, salesActivityId: string): Promise<{
    salesActivityId: string; companyId: string; contactId: string;
  }> {
    const locked = await client.query<{ id: string; company_id: string; primary_contact_id: string | null; selected_service: string }>(
      `SELECT id,company_id,primary_contact_id,selected_service
         FROM sales_activity WHERE id=$1 FOR UPDATE`, [salesActivityId],
    );
    const activity = locked.rows[0];
    if (!activity) throw new StaffProxyDesignV2SubmissionError(404, 'SALES_ACTIVITY_NOT_FOUND');
    if (activity.selected_service !== 'IT_KAIZEN') throw new StaffProxyDesignV2SubmissionError(409, 'SERVICE_MISMATCH');
    if (!activity.primary_contact_id) throw new StaffProxyDesignV2SubmissionError(409, 'CONTACT_COMPANY_MISMATCH');
    const membership = await client.query(
      'SELECT id FROM contact WHERE id=$1 AND company_id=$2', [activity.primary_contact_id, activity.company_id],
    );
    if (!membership.rows[0]) throw new StaffProxyDesignV2SubmissionError(409, 'CONTACT_COMPANY_MISMATCH');
    const existingCase = await client.query('SELECT id FROM it_management_diagnosis_case_v2 WHERE sales_activity_id=$1 LIMIT 1', [activity.id]);
    if (existingCase.rows[0]) throw new StaffProxyDesignV2SubmissionError(409, 'SALES_ACTIVITY_CASE_ALREADY_EXISTS');
    return { salesActivityId: activity.id, companyId: activity.company_id, contactId: activity.primary_contact_id };
  }
}
