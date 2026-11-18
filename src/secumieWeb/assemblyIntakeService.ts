import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PiraJwtClaims } from '../piraIntake/piraJwtVerifier';

export type AssemblyIntakeInput = {
  unionId: string;
  companyName: string;
  registeredAddress: string;
  websiteUrl: string;
  consentVersion: string;
  accepted: true;
  idempotencyKey: string;
};
export type AssemblyReception = {
  code: string;
  organizerName: string;
  consentVersion: string;
  unions: ReadonlyMap<string, string>;
};
export class AssemblyIntakeError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
const digest = (input: AssemblyIntakeInput) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

export class AssemblyIntakeService {
  constructor(private readonly pool: Pool, private readonly reception: AssemblyReception) {}

  async create(claims: PiraJwtClaims, input: AssemblyIntakeInput) {
    const unionName = this.reception.unions.get(input.unionId);
    if (!unionName) throw new AssemblyIntakeError(422, 'UNION_NOT_FOUND');
    if (!input.accepted || input.consentVersion !== this.reception.consentVersion ||
        !input.companyName.trim() || !input.registeredAddress.trim() ||
        input.companyName.length > 200 || input.registeredAddress.length > 500 ||
        input.websiteUrl.length > 2000) throw new AssemblyIntakeError(422, 'INVALID_REQUEST');
    let url: URL;
    try { url = new URL(input.websiteUrl); } catch { throw new AssemblyIntakeError(422, 'INVALID_URL'); }
    if (url.protocol !== 'https:' || !url.hostname) throw new AssemblyIntakeError(422, 'INVALID_URL');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.createInTransaction(client, claims, input, unionName);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async createInTransaction(client: PoolClient, claims: PiraJwtClaims, input: AssemblyIntakeInput, unionName: string) {
    const hash = digest(input);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.idempotencyKey]);
    const existing = await client.query<{ intake_id: string; payload_hash: string }>(
      'SELECT intake_id,payload_hash FROM secumie_web.assembly_intake WHERE idempotency_key=$1 FOR UPDATE',
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].payload_hash !== hash) throw new AssemblyIntakeError(409, 'IDEMPOTENCY_CONFLICT');
      return { receiptId: existing.rows[0].intake_id, replayed: true };
    }
    const intakeId = randomUUID();
    await client.query(
      `INSERT INTO secumie_web.assembly_intake
       (intake_id,reception_code,organizer_name,union_id,union_name_snapshot,company_name,registered_address,website_url,
        consent_version,consented_at,idempotency_key,payload_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11)`,
      [intakeId,this.reception.code,this.reception.organizerName,input.unionId,unionName,input.companyName.trim(),
       input.registeredAddress.trim(),input.websiteUrl.trim(),input.consentVersion,input.idempotencyKey,hash],
    );
    try {
      await client.query(
        'INSERT INTO secumie_web.assembly_consumed_jti(jti,intake_id,expires_at) VALUES($1,$2,$3)',
        [claims.jti,intakeId,new Date(claims.exp * 1000)],
      );
    } catch {
      throw new AssemblyIntakeError(409, 'JWT_REPLAYED');
    }
    return { receiptId: intakeId, replayed: false };
  }
}
