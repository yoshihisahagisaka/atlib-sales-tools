import type { Pool } from 'pg';

export type AssemblyStatus = 'RECEIVED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
export type AssemblyListFilters = { status?: AssemblyStatus; companyName?: string; unionName?: string; limit?: number; offset?: number };

/** Staff-only service. Do not mount under a public runtime. */
export class AssemblyAdminService {
  constructor(private readonly pool: Pool) {}
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
      if (!row.rows[0]) return undefined;
      const current = row.rows[0].request_status;
      if (current === next) { await client.query('COMMIT'); return { status: current, unchanged: true }; }
      await client.query('UPDATE secumie_web.assembly_intake SET request_status=$2,updated_at=now() WHERE intake_id=$1', [intakeId, next]);
      await client.query('INSERT INTO secumie_web.assembly_status_history(intake_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4)', [intakeId,current,next,actor]);
      await client.query('COMMIT'); return { status: next, unchanged: false };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
}
