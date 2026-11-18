import type { Pool } from 'pg';

export type AssemblyListFilters = { status?: 'RECEIVED' | 'IN_PROGRESS' | 'DELIVERED' | 'CANCELLED'; limit?: number; offset?: number };

/** Staff-only service. Do not mount under a public runtime. */
export class AssemblyAdminService {
  constructor(private readonly pool: Pool) {}
  async list(filters: AssemblyListFilters = {}) {
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const offset = Math.max(0, filters.offset ?? 0);
    const result = await this.pool.query(
      `SELECT intake_id AS "receiptId", received_at AS "receivedAt",
              union_name_snapshot AS "unionName", company_name AS "companyName",
              registered_address AS "registeredAddress", website_url AS "websiteUrl",
              contact_name AS "contactName", contact_email AS "contactEmail",
              contact_phone AS "contactPhone", request_status AS "status"
       FROM secumie_web.assembly_intake
       WHERE ($1::text IS NULL OR request_status = $1)
       ORDER BY received_at DESC, intake_id DESC LIMIT $2 OFFSET $3`,
      [filters.status ?? null, limit, offset],
    );
    return result.rows;
  }
}
