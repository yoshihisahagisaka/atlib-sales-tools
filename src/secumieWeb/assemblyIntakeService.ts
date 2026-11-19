import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PiraJwtClaims } from '../piraIntake/piraJwtVerifier';

export type AssemblyIntakeInput = {
  unionId: string;
  companyName: string;
  registeredAddress: string;
  websiteUrl: string;
  contactName: string;
  contactPhone: string;
  consentVersion: string;
  accepted: true;
  idempotencyKey: string;
};
export type AssemblyReception = {
  code: string;
  organizerName: string;
  consentVersion: string;
};
export class AssemblyIntakeError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
const digest = (input: AssemblyIntakeInput) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

export class AssemblyIntakeService {
  constructor(private readonly pool: Pool, private readonly reception: AssemblyReception) {}

  async create(claims: PiraJwtClaims, input: AssemblyIntakeInput) {
    if (!input.accepted || input.consentVersion !== this.reception.consentVersion ||
        !input.companyName.trim() || !input.registeredAddress.trim() ||
        !input.contactName.trim() || !input.contactPhone.trim() ||
        input.contactName.length > 200 || input.contactPhone.length > 50 ||
        !/^[+0-9()\-\s]{6,50}$/.test(input.contactPhone.trim()) ||
        input.companyName.length > 200 || input.registeredAddress.length > 500 ||
        input.websiteUrl.length > 2000) throw new AssemblyIntakeError(422, 'INVALID_REQUEST');
    let url: URL;
    try { url = new URL(input.websiteUrl); } catch { throw new AssemblyIntakeError(422, 'INVALID_URL'); }
    if (url.protocol !== 'https:' || !url.hostname) throw new AssemblyIntakeError(422, 'INVALID_URL');

    if (!/^\\S+@\\S+\\.\\S+$/.test(claims.email)) throw new AssemblyIntakeError(401, 'JWT_INVALID');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.createInTransaction(client, claims, input);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async createInTransaction(client: PoolClient, claims: PiraJwtClaims, input: AssemblyIntakeInput) {
    const hash = digest(input);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.idempotencyKey]);
    const existing = await client.query<{ intake_id: string; receipt_number: string; payload_hash: string; auth_session_id: string }>(
      'SELECT intake_id,receipt_number,payload_hash,auth_session_id FROM secumie_web.assembly_intake WHERE idempotency_key=$1 FOR UPDATE',
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].payload_hash !== hash || existing.rows[0].auth_session_id !== claims.sub) throw new AssemblyIntakeError(409, 'IDEMPOTENCY_CONFLICT');
      return { receiptId: existing.rows[0].receipt_number, replayed: true };
    }
    const union = await client.query<{ official_name: string }>(
      'SELECT official_name FROM secumie_web.assembly_union_master WHERE union_id=$1 AND active=true', [input.unionId],
    );
    if (!union.rows[0]) throw new AssemblyIntakeError(422, 'UNION_NOT_FOUND');
    const intakeId = randomUUID();
    const receiptNumber = `SMW-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${randomUUID().slice(0,8).toUpperCase()}`;
    await client.query(
      `INSERT INTO secumie_web.assembly_intake
       (intake_id,receipt_number,reception_code,organizer_name,union_id,union_name_snapshot,company_name,registered_address,website_url,
        contact_name,contact_email,contact_phone,consent_version,consented_at,idempotency_key,payload_hash,auth_session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14,$15,$16)`,
      [intakeId,receiptNumber,this.reception.code,this.reception.organizerName,input.unionId,union.rows[0].official_name,input.companyName.trim(),
       input.registeredAddress.trim(),input.websiteUrl.trim(),input.contactName.trim(),claims.email,input.contactPhone.trim(),
       input.consentVersion,input.idempotencyKey,hash,claims.sub],
    );
    try {
      await client.query(
        'INSERT INTO secumie_web.assembly_consumed_jti(jti,intake_id,expires_at) VALUES($1,$2,$3)',
        [claims.jti,intakeId,new Date(claims.exp * 1000)],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new AssemblyIntakeError(409, 'JWT_REPLAYED');
      throw error;
    }
    await client.query('INSERT INTO secumie_web.assembly_notification_outbox(intake_id) VALUES($1)', [intakeId]);
    await client.query("INSERT INTO secumie_web.assembly_status_history(intake_id,from_status,to_status,changed_by) VALUES($1,NULL,'RECEIVED','system')", [intakeId]);
    return { receiptId: receiptNumber, replayed: false };
  }
}
