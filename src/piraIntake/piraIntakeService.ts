import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PiraJwtClaims } from './piraJwtVerifier';

export type InitiativeKind = 'UNION' | 'GENERAL';
export type SubmissionState = 'RECEIVED' | 'ANSWERING' | 'COMPLETED';
export type PiraContext = { serviceId: string; initiativeCode: string; kind: InitiativeKind };
export type IntakeForm = { companyName: string; contactName: string; websiteUrl: string; phone?: string; unionName?: string; address?: string; accepted: boolean; consentVersion: string; idempotencyKey: string };
export class PiraIntakeError extends Error { constructor(public readonly status: number, public readonly code: string) { super(code); } }

const UNION_CONSENT = 'PIRA-UNION-CONSENT-V1.0';
const GENERAL_CONSENT = 'ATLIB-GENERAL-CONSENT-DRAFT-V0.1';
const normalize = (value: string) => value.trim();
const payloadHash = (input: IntakeForm) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

export class PiraIntakeService {
  constructor(private readonly pool: Pool, private readonly generalDraftAllowed = false, private readonly now = () => new Date()) {}
  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { const c = await this.pool.connect(); try { await c.query('BEGIN'); const out = await work(c); await c.query('COMMIT'); return out; } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); } }
  async contract(context: PiraContext) {
    const row = await this.initiative(context);
    return { initiativeCode: context.initiativeCode, initiativeKind: row.initiative_kind, consent: row.initiative_kind === 'UNION' ? { version: UNION_CONSENT, status: 'APPROVED' } : { version: GENERAL_CONSENT, status: 'DRAFT' }, fields: row.initiative_kind === 'UNION' ? ['F01','F02','F03_JWT','F04','F05','F06','F07'] : ['F01','F02','F03_JWT','F04','F05'] };
  }
  private async initiative(context: PiraContext) {
    const { rows: [row] } = await this.pool.query<{ initiative_id: string; initiative_kind: InitiativeKind }>('SELECT initiative_id,initiative_kind FROM pira.pira_initiative WHERE initiative_code=$1 AND active=true', [context.initiativeCode]);
    if (!row || row.initiative_kind !== context.kind) throw new PiraIntakeError(404, 'INITIATIVE_NOT_FOUND'); return row;
  }
  private validate(context: PiraContext, form: IntakeForm) {
    const required = [form.companyName, form.contactName, form.websiteUrl, form.consentVersion, form.idempotencyKey]; if (!form.accepted || required.some(v => !v || !normalize(v))) throw new PiraIntakeError(422, 'INVALID_REQUEST');
    if (normalize(form.companyName).length > 200 || normalize(form.contactName).length > 200 || form.websiteUrl.length > 2000 || (form.phone?.length ?? 0) > 50) throw new PiraIntakeError(422, 'INVALID_REQUEST');
    let url: URL; try { url = new URL(form.websiteUrl); } catch { throw new PiraIntakeError(422, 'INVALID_REQUEST'); }
    if (!['http:','https:'].includes(url.protocol)) throw new PiraIntakeError(422, 'INVALID_REQUEST');
    if (context.kind === 'UNION') { if (!form.unionName || !form.address || normalize(form.unionName).length > 200 || normalize(form.address).length > 500 || form.consentVersion !== UNION_CONSENT) throw new PiraIntakeError(422, 'INVALID_REQUEST'); }
    else if (form.unionName !== undefined || form.address !== undefined || form.consentVersion !== GENERAL_CONSENT || !this.generalDraftAllowed) throw new PiraIntakeError(422, 'CONSENT_NOT_APPROVED');
  }
  async create(context: PiraContext, claims: PiraJwtClaims, form: IntakeForm) {
    this.validate(context, form); const initiative = await this.initiative(context); const now = this.now(); const hash = payloadHash(form);
    return this.tx(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [form.idempotencyKey]);
      const { rows: [existing] } = await c.query<{ receipt_id: string; payload_hash: string; initiative_id: string; initiative_kind: InitiativeKind; verified_email: string }>('SELECT receipt_id,payload_hash,initiative_id,initiative_kind,verified_email FROM pira.pira_submission WHERE idempotency_key=$1 FOR UPDATE', [form.idempotencyKey]);
      if (existing) {
        if (existing.payload_hash !== hash || existing.initiative_id !== initiative.initiative_id || existing.initiative_kind !== context.kind || existing.verified_email !== claims.email) throw new PiraIntakeError(409, 'IDEMPOTENCY_CONFLICT');
        return { receiptId: existing.receipt_id, replayed: true };
      }
      const duplicate = await c.query(`SELECT 1 FROM pira.pira_submission WHERE initiative_kind=$1 AND company_name_normalized=$2 AND verified_email=$3 AND state='COMPLETED' AND completed_at > $4 LIMIT 1`, [context.kind, normalize(form.companyName), claims.email, new Date(now.getTime() - 24 * 60 * 60_000)]);
      if (duplicate.rowCount) throw new PiraIntakeError(409, 'RETRY_RESTRICTED');
      const receiptId = randomUUID(); const submissionId = randomUUID();
      await c.query(`INSERT INTO pira.pira_submission(submission_id,receipt_id,initiative_id,initiative_kind,company_name,company_name_normalized,contact_name,verified_email,website_url,phone,union_name,address,consent_version,consented_at,sales_use_allowed,idempotency_key,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [submissionId, receiptId, initiative.initiative_id, context.kind, normalize(form.companyName), normalize(form.companyName), normalize(form.contactName), claims.email, form.websiteUrl, form.phone ? normalize(form.phone) : null, context.kind === 'UNION' ? normalize(form.unionName!) : null, context.kind === 'UNION' ? normalize(form.address!) : null, form.consentVersion, now, false, form.idempotencyKey, hash]);
      try { await c.query('INSERT INTO pira.pira_consumed_jti(jti,submission_id,operation,expires_at) VALUES($1,$2,$3,$4)', [claims.jti, submissionId, 'CREATE_SUBMISSION', new Date(claims.exp * 1000)]); }
      catch { throw new PiraIntakeError(409, 'JWT_REPLAYED'); }
      return { receiptId, replayed: false };
    });
  }
  async updateState(context: PiraContext, claims: PiraJwtClaims, receiptId: string, next: SubmissionState) {
    const initiative = await this.initiative(context);
    return this.tx(async c => {
      const { rows: [row] } = await c.query<{ submission_id: string; initiative_id: string; initiative_kind: InitiativeKind; verified_email: string; state: SubmissionState }>('SELECT submission_id,initiative_id,initiative_kind,verified_email,state FROM pira.pira_submission WHERE receipt_id=$1 FOR UPDATE', [receiptId]);
      if (!row || row.initiative_id !== initiative.initiative_id || row.initiative_kind !== context.kind || row.verified_email !== claims.email) throw new PiraIntakeError(404, 'RECEIPT_NOT_FOUND');
      const expected: Record<SubmissionState, SubmissionState | undefined> = { RECEIVED: 'ANSWERING', ANSWERING: 'COMPLETED', COMPLETED: undefined };
      if (expected[row.state] !== next) throw new PiraIntakeError(409, 'INVALID_STATE_TRANSITION');
      try { await c.query('INSERT INTO pira.pira_consumed_jti(jti,submission_id,operation,expires_at) VALUES($1,$2,$3,$4)', [claims.jti, row.submission_id, 'UPDATE_STATE', new Date(claims.exp * 1000)]); }
      catch { throw new PiraIntakeError(409, 'JWT_REPLAYED'); }
      await c.query(`UPDATE pira.pira_submission SET state=$2::pira.submission_state,answering_at=CASE WHEN $2='ANSWERING' THEN $3 ELSE answering_at END,completed_at=CASE WHEN $2='COMPLETED' THEN $3 ELSE completed_at END WHERE submission_id=$1`, [row.submission_id, next, this.now()]);
      return { receiptId, state: next };
    });
  }
}
