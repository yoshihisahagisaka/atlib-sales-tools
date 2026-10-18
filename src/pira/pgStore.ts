import type { Pool, PoolClient } from 'pg';
import type { Kind, RecordRow, Filter, Store, Transaction } from './model';
import { check } from './model';
import type { SalesReferences } from './salesReferences';

const kinds: Kind[] = ['association','principal','membership','affiliation','identity','external_link','terms','application','order','audit','outbox'];
const table = (kind: Kind) => { check(kinds.includes(kind), 'INVALID_TABLE'); return 'pira_' + kind; };
function map(r: any): RecordRow { return { id: r.id, version: r.version, associationId: r.association_id, companyId: r.company_id, data: r.data }; }
export class PgPiraStore implements Store {
  constructor(private pool: Pool, private references?: SalesReferences, private notifier=false) {}
  async transaction<T>(lock: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SET LOCAL statement_timeout='15s'");
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 182026))', [lock]);
      const result = await work(new PgTransaction(c,this.references,this.notifier)); await c.query('COMMIT'); return result;
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
}
class PgTransaction implements Transaction {
  constructor(private c: PoolClient, private references?: SalesReferences, private notifier=false) {}
  async get(kind: Kind, id: string) { if(this.notifier)check(['outbox','association'].includes(kind),'NOTIFIER_SCOPE_DENIED',403); const r = await this.c.query(`SELECT * FROM ${table(kind)} WHERE id=$1`, [id]); return r.rows[0] ? map(r.rows[0]) : null; }
  async list(kind: Kind, f: Filter = {}) {
    if(this.notifier)check(kind==='outbox','NOTIFIER_SCOPE_DENIED',403);
    const r = await this.c.query(`SELECT * FROM ${table(kind)} WHERE ($1::text IS NULL OR association_id=$1) AND ($2::uuid IS NULL OR company_id=$2) ORDER BY id LIMIT 1001`, [f.associationId ?? null, f.companyId ?? null]);
    check(r.rows.length <= 1000, 'RESULT_LIMIT_EXCEEDED', 413); return r.rows.map(map);
  }
  async save(kind: Kind, r: RecordRow) {
    if(this.notifier){
      check(['outbox','audit'].includes(kind),'NOTIFIER_SCOPE_DENIED',403);
      if(kind==='outbox'){
        const result=await this.c.query('UPDATE pira_outbox SET version=$2,data=$5 WHERE id=$1 AND version=$2-1 AND association_id IS NOT DISTINCT FROM $3 AND company_id IS NOT DISTINCT FROM $4 RETURNING id',[r.id,r.version,r.associationId,r.companyId,r.data]);
        check(result.rowCount===1,'VERSION_CONFLICT');return;
      }
    }
    // Append-only facts never use UPSERT. A uniqueness conflict aborts the business transaction.
    if (['audit','order','terms'].includes(kind)) {
      await this.c.query(`INSERT INTO ${table(kind)}(id,version,association_id,company_id,data) VALUES($1,$2,$3,$4,$5)`, [r.id,r.version,r.associationId,r.companyId,r.data]); return;
    }
    const result = await this.c.query(`INSERT INTO ${table(kind)}(id,version,association_id,company_id,data) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,data=EXCLUDED.data
      WHERE ${table(kind)}.version=EXCLUDED.version-1 AND ${table(kind)}.association_id IS NOT DISTINCT FROM EXCLUDED.association_id AND ${table(kind)}.company_id IS NOT DISTINCT FROM EXCLUDED.company_id RETURNING id`, [r.id,r.version,r.associationId,r.companyId,r.data]);
    check(result.rowCount === 1, 'VERSION_CONFLICT');
  }
  async company(id: string) { if(this.references)return this.references.company(this.c,id); const r = await this.c.query('SELECT id,name,corporate_number FROM company WHERE id=$1', [id]); return r.rows[0] ? { id:r.rows[0].id,name:r.rows[0].name,corporateNumber:r.rows[0].corporate_number } : null; }
  async searchCompanies(term: string) { if(this.references)return this.references.search(this.c,term); const r = await this.c.query("SELECT id,name,corporate_number FROM company WHERE name ILIKE '%' || $1 || '%' OR regexp_replace(coalesce(corporate_number,''),'[^0-9]','','g')=$1 ORDER BY (regexp_replace(coalesce(corporate_number,''),'[^0-9]','','g')=$1) DESC,id LIMIT 30",[term]); return r.rows.map(x=>({id:x.id,name:x.name,corporateNumber:x.corporate_number})); }
  async createCompany(id: string, name: string, number: string | null, actor: string) { if(this.references)return this.references.create(this.c,id,name,number,actor); await this.c.query('INSERT INTO company(id,name,corporate_number,created_by_user_id,owner_user_id) VALUES($1,$2,$3,$4,$4)', [id,name,number,actor]); }
  async confirmedEstimate(id: string, companyId?:string) { if(this.references)return this.references.estimate(this.c,id,companyId); const r=await this.c.query("SELECT id,updated_at::text AS revision FROM estimates WHERE id=$1 AND status='confirmed'",[id]); return r.rows[0] ?? null; }
}
