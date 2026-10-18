import type { PoolClient } from 'pg';
import { check } from './model';
export interface SalesReferences {
  company(c:PoolClient,id:string):Promise<{id:string;name:string;corporateNumber:string|null}|null>;
  search(c:PoolClient,term:string):Promise<{id:string;name:string;corporateNumber:string|null}[]>;
  create(c:PoolClient,id:string,name:string,number:string|null,actor:string):Promise<void>;
  estimate(c:PoolClient,id:string,companyId?:string):Promise<{id:string;revision:string}|null>;
}
/** Core can only read reviewed projections; company writes stay in the Sales adapter. */
export class LimitedSalesReferences implements SalesReferences {
  async company(c:PoolClient,id:string){const r=await c.query('SELECT id,name,corporate_number FROM pira_company_reference WHERE id=$1',[id]);const x=r.rows[0];return x?{id:x.id,name:x.name,corporateNumber:x.corporate_number}:null;}
  async search(c:PoolClient,term:string){const r=await c.query("SELECT id,name,corporate_number FROM pira_company_reference WHERE name ILIKE '%'||$1||'%' OR regexp_replace(coalesce(corporate_number,''),'[^0-9]','','g')=$1 ORDER BY id LIMIT 30",[term]);return r.rows.map(x=>({id:x.id,name:x.name,corporateNumber:x.corporate_number}));}
  async create(){check(false,'SALES_COMPANY_ID_REQUIRED',400);}
  async estimate(c:PoolClient,id:string,companyId?:string){check(companyId,'ESTIMATE_COMPANY_REQUIRED',400);const r=await c.query('SELECT id,revision FROM pira_estimate_reference WHERE id=$1 AND company_id=$2',[id,companyId]);return r.rows[0]??null;}
}

/** Notification projection deliberately excludes corporate numbers. */
export class LimitedNoticeReferences extends LimitedSalesReferences {
  async company(c:PoolClient,id:string){const r=await c.query('SELECT id,name FROM pira_notice_company_reference WHERE id=$1',[id]);const x=r.rows[0];return x?{id:x.id,name:x.name,corporateNumber:null}:null;}
}
