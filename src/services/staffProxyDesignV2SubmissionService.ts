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

export interface StaffProxyDesignV2SubmissionInput {
  idempotencyKey: string;
  activity: CreateCompanyInput;
  survey: CurrentStructuredStateV2;
  respondentRole: (typeof RESPONDENT_ROLE)[number];
  consentConfirmed: true;
}

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
      const activity = await launcher.createSalesActivity(input.activity, authenticatedStaff);
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
}
