import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type AssemblyStatus = 'RECEIVED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
export type AssemblyListFilters = { status?: AssemblyStatus; companyName?: string; unionName?: string; limit?: number; offset?: number };

/** Staff-only service. Do not mount under a public runtime. */
export class AssemblyAdminService {
  constructor(private readonly pool: Pool) {}
  /**
   * Mirror the already accepted corporate-site email intake into the same
   * Web-owned request list. Only the signed internal route can invoke this.
   * No OTP/union-master lookup: the temporary corporate LP uses free-text unions.
   */
  async recordCorporateEmailIntake(input: {
    eventId: string; companyName: string; unionName: string; registeredAddress: string;
    websiteUrl: string; contactName: string; contactEmail: string; contactPhone: string;
  }) {
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize only this eventId; duplicate signed delivery stays idempotent.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.eventId]);
      const existing = await client.query<{ receipt_number: string; payload_hash: string }>(
        'SELECT receipt_number,payload_hash FROM secumie_web.assembly_intake WHERE idempotency_key=$1',
        [input.eventId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].payload_hash !== payloadHash) throw new Error('EVENT_ID_CONFLICT');
        await client.query('COMMIT');
        return { receiptId: existing.rows[0].receipt_number, replayed: true };
      }
      const intakeId = randomUUID();
      const receiptId = `SMW-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomUUID().slice(0,8).toUpperCase()}`;
      await client.query(
        `INSERT INTO secumie_web.assembly_intake
         (intake_id,receipt_number,reception_code,organizer_name,union_id,union_name_snapshot,
          company_name,registered_address,website_url,contact_name,contact_email,contact_phone,
          consent_version,consented_at,idempotency_key,payload_hash,auth_session_id)
         VALUES ($1,$2,'CORPORATE_LP','atLIB株式会社','corporate-temporary',$3,
          $4,$5,$6,$7,$8,$9,'corporate-lp-privacy-20261120',now(),$10,$11,$12)`,
        [intakeId,receiptId,input.unionName,input.companyName,input.registeredAddress,
         input.websiteUrl,input.contactName,input.contactEmail,input.contactPhone,
         input.eventId,payloadHash,'corporate-contact:'+input.eventId],
      );
      await client.query(
        "INSERT INTO secumie_web.assembly_status_history(intake_id,from_status,to_status,changed_by) VALUES($1,NULL,'RECEIVED','corporate-contact')",
        [intakeId],
      );
      await client.query('COMMIT');
      return { receiptId, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async list(filters: AssemblyListFilters = {}) {
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const offset = Math.max(0, filters.offset ?? 0);
    const result = await this.pool.query(
      `SELECT intake_id AS "intakeId", receipt_number AS "receiptId", received_at AS "receivedAt",
              union_name_snapshot AS "unionName", company_name AS "companyName",
              registered_address AS "registeredAddress", website_url AS "websiteUrl",
              contact_name AS "contactName", contact_email AS "contactEmail",
              contact_phone AS "contactPhone", request_status AS "status"
       FROM secumie_web.assembly_intake
       WHERE ($1::text IS NULL OR request_status = $1)
         AND ($2::text IS NULL OR company_name ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR union_name_snapshot ILIKE '%' || $3 || '%')
       ORDER BY received_at DESC, intake_id DESC LIMIT $4 OFFSET $5`,
      [filters.status ?? null, filters.companyName ?? null, filters.unionName ?? null, limit, offset],
    );
    return result.rows;
  }
  async changeStatus(intakeId: string, next: AssemblyStatus, actor: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ request_status: AssemblyStatus }>('SELECT request_status FROM secumie_web.assembly_intake WHERE intake_id=$1 FOR UPDATE', [intakeId]);
      if (!row.rows[0]) { await client.query('ROLLBACK'); return undefined; }
      const current = row.rows[0].request_status;
      if (current === next) { await client.query('COMMIT'); return { status: current, unchanged: true }; }
      await client.query('UPDATE secumie_web.assembly_intake SET request_status=$2,updated_at=now() WHERE intake_id=$1', [intakeId, next]);
      await client.query('INSERT INTO secumie_web.assembly_status_history(intake_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4)', [intakeId,current,next,actor]);
      await client.query('COMMIT'); return { status: next, unchanged: false };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
}
