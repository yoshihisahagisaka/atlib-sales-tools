import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { RuleBasedV1Error, type PublicCustomerSelfSubmission } from '../domain/freeDiagnosisRuleBasedV1';
import { FreeDiagnosisSalesLauncherRepo } from './freeDiagnosisSalesLauncherRepo';
import { FreeDiagnosisRuleBasedCaseRepo } from './freeDiagnosisRuleBasedCaseRepo';

const PUBLIC_ACTOR = 'public-customer-self';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function payloadHash(value: PublicCustomerSelfSubmission): string { return createHash('sha256').update(stable(value)).digest('hex'); }

export class PublicCustomerSelfSubmissionService {
  constructor(private readonly pool: Pool) {}

  async submit(input: PublicCustomerSelfSubmission): Promise<{ caseId: string; created: boolean }> {
    const hash = payloadHash(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ payload_hash: string; it_management_diagnosis_case_v2_id: string }>(
        `SELECT payload_hash,it_management_diagnosis_case_v2_id FROM it_management_public_self_submission WHERE idempotency_key=$1 FOR UPDATE`, [input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].payload_hash !== hash) throw new RuleBasedV1Error(409, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_SUBMISSION');
        await client.query('COMMIT');
        return { caseId: existing.rows[0].it_management_diagnosis_case_v2_id, created: false };
      }

      // A missing row is not protected by SELECT ... FOR UPDATE. Keep all provisional
      // work behind a savepoint so an INSERT conflict can discard it and return the
      // winning submission instead of surfacing a transient 500 to a duplicate POST.
      await client.query('SAVEPOINT create_public_submission');
      const launcher = new FreeDiagnosisSalesLauncherRepo(client as unknown as Pool);
      const cases = new FreeDiagnosisRuleBasedCaseRepo(client as unknown as Pool);
      const hasAttribution = input.attribution.acquisitionSourceType != null;
      const activity = await launcher.createSalesActivity({
        name: input.company.name, corporateNumber: input.company.corporateNumber,
        contact: { name: input.contact.name, email: input.contact.email, phone: input.contact.phone, jobTitle: input.contact.jobTitle }, selectedService: 'IT_KAIZEN',
        referralPersonName: input.referralPersonName,
        attribution: hasAttribution ? {
          acquisitionSourceType: input.attribution.acquisitionSourceType!, acquisitionSourceName: input.attribution.acquisitionSourceName!,
          utmSource: input.attribution.utmSource, utmMedium: input.attribution.utmMedium, utmCampaign: input.attribution.utmCampaign,
          utmContent: input.attribution.utmContent, utmTerm: input.attribution.utmTerm, landingUrl: input.attribution.landingUrl, referrer: input.attribution.referrer,
        } : undefined,
      }, PUBLIC_ACTOR);
      const kase = await cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, PUBLIC_ACTOR, false);
      for (const envelope of input.answers) {
        await cases.recordIntakeAnswer(kase.id, { questionCode: envelope.questionCode, channel: 'SELF', value: { ...envelope, respondent: { ...envelope.respondent, contactId: activity.contactId } } }, PUBLIC_ACTOR);
      }
      const completed = await cases.completeIntake(kase.id, kase.version);
      await cases.initialRule(completed.id); // deterministic validation/connection; presentation remains staff-only.
      const bookingPending = await cases.markBookingPending(completed.id, completed.version);
      const inserted = await client.query<{ it_management_diagnosis_case_v2_id: string }>(
        `INSERT INTO it_management_public_self_submission
         (idempotency_key,payload_hash,company_id,contact_id,sales_activity_id,it_management_diagnosis_case_v2_id,privacy_consent,diagnosis_use_consent,consent_wording_version,consent_provenance)
         VALUES ($1,$2,$3,$4,$5,$6,true,true,$7,'CUSTOMER_SELF')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING it_management_diagnosis_case_v2_id`,
        [input.idempotencyKey, hash, activity.companyId, activity.contactId, activity.salesActivityId, bookingPending.id, input.consent.wordingVersion],
      );
      if (!inserted.rows[0]) {
        await client.query('ROLLBACK TO SAVEPOINT create_public_submission');
        const winner = await client.query<{ payload_hash: string; it_management_diagnosis_case_v2_id: string }>(
          `SELECT payload_hash,it_management_diagnosis_case_v2_id FROM it_management_public_self_submission WHERE idempotency_key=$1`, [input.idempotencyKey],
        );
        if (!winner.rows[0]) throw new Error('IDEMPOTENCY_CONFLICT_WINNER_NOT_FOUND');
        if (winner.rows[0].payload_hash !== hash) throw new RuleBasedV1Error(409, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_SUBMISSION');
        await client.query('COMMIT');
        return { caseId: winner.rows[0].it_management_diagnosis_case_v2_id, created: false };
      }
      await client.query('COMMIT');
      return { caseId: bookingPending.id, created: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
