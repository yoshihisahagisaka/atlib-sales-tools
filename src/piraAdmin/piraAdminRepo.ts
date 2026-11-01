import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type PiraAdminFilters = {
  initiativeCode?: string; initiativeKind?: 'UNION' | 'GENERAL'; companyName?: string; state?: 'RECEIVED' | 'ANSWERING' | 'COMPLETED';
  from?: Date; to?: Date; limit: number; offset: number;
};
export type ExportFormat = 'CSV' | 'XLSX';

const select = `SELECT s.submission_id,s.receipt_id,s.received_at,s.state,s.company_name,s.contact_name,
 s.verified_email,s.website_url,s.phone,s.union_name,s.address,s.consent_version,s.consented_at,
 s.sales_use_allowed,i.initiative_code,i.display_name AS initiative_name,i.initiative_kind
 FROM pira.pira_submission s JOIN pira.pira_initiative i ON i.initiative_id=s.initiative_id`;

function where(filters: PiraAdminFilters) {
  const clauses: string[] = []; const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  if (filters.initiativeCode) add('i.initiative_code=?', filters.initiativeCode);
  if (filters.initiativeKind) add('i.initiative_kind=?::pira.initiative_kind', filters.initiativeKind);
  if (filters.companyName) add('s.company_name ILIKE ?', `%${filters.companyName}%`);
  if (filters.state) add('s.state=?::pira.submission_state', filters.state);
  if (filters.from) add('s.received_at>=?', filters.from);
  if (filters.to) add('s.received_at<?', filters.to);
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}

export class PiraAdminRepo {
  constructor(private readonly pool: Pool) {}
  async initiatives() { return (await this.pool.query('SELECT initiative_id,initiative_code,initiative_kind,display_name,active,created_at FROM pira.pira_initiative ORDER BY created_at,initiative_code')).rows; }
  async createInitiative(input: { code: string; kind: 'UNION' | 'GENERAL'; name: string }) {
    return (await this.pool.query('INSERT INTO pira.pira_initiative(initiative_code,initiative_kind,display_name) VALUES($1,$2,$3) RETURNING *', [input.code,input.kind,input.name])).rows[0];
  }
  async setInitiativeActive(id: string, active: boolean) { return (await this.pool.query('UPDATE pira.pira_initiative SET active=$2 WHERE initiative_id=$1 RETURNING *',[id,active])).rows[0]; }
  async list(filters: PiraAdminFilters) {
    const query = where(filters); const values = [...query.values, filters.limit, filters.offset];
    const rows = await this.pool.query(`${select}${query.sql} ORDER BY s.received_at DESC,s.submission_id LIMIT $${values.length-1} OFFSET $${values.length}`, values);
    const count = await this.pool.query(`SELECT count(*)::int AS count FROM pira.pira_submission s JOIN pira.pira_initiative i ON i.initiative_id=s.initiative_id${query.sql}`, query.values);
    return { items: rows.rows, total: count.rows[0].count as number };
  }
  async detail(id: string) { return (await this.pool.query(`${select} WHERE s.submission_id=$1`,[id])).rows[0]; }
  async exportRows(filters: PiraAdminFilters) {
    const query=where(filters); const result=await this.pool.query(`${select}${query.sql} ORDER BY s.received_at,s.submission_id LIMIT 10001`,query.values);
    if(result.rowCount && result.rowCount>10000) throw Object.assign(new Error('EXPORT_LIMIT_EXCEEDED'),{code:'EXPORT_LIMIT_EXCEEDED'});
    return result.rows;
  }
  async audit(input:{actor:string;format:ExportFormat;filters:unknown;count:number;success:boolean;failureCode?:string;initiativeCodes:string[]}, client?:PoolClient) {
    const db=client??this.pool; await db.query(`INSERT INTO pira.pira_export_audit(audit_id,actor_subject,initiative_code,filter_snapshot,format,result_count,success,failure_code,initiative_ids)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),input.actor,input.initiativeCodes.length===1?input.initiativeCodes[0]:null,JSON.stringify(input.filters),input.format,input.count,input.success,input.failureCode??null,JSON.stringify(input.initiativeCodes)]);
  }
  async retentionCandidates(now=new Date()) {
    return {
      submissions:(await this.pool.query("SELECT submission_id FROM pira.pira_submission WHERE received_at < $1::timestamptz - interval '2 years' ORDER BY received_at",[now])).rows,
      exportAudits:(await this.pool.query("SELECT audit_id FROM pira.pira_export_audit WHERE exported_at < $1::timestamptz - interval '3 years' ORDER BY exported_at",[now])).rows,
    };
  }
}
