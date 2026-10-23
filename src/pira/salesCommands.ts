import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { check, same, text } from './model';

/** Runs only behind Sales staff authentication AND a successful core admin session check. */
export class SalesCompanyCommands {
  constructor(private pool:Pool){}
  async resolve(input:any,staff:string){
    if(input.companyId)return input;
    const number=typeof input.corporateNumber==='string'?input.corporateNumber.replace(/[-\s]/g,''):null;
    check(!number||/^\d{13}$/.test(number),'INVALID_CORPORATE_NUMBER',400);
    const reference=number?'number:'+number:'reference:'+text(input.verifiedReference);
    const hash=createHash('sha256').update('pira-sales-company:'+reference).digest('hex');
    const id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
    const name=text(input.name),c=await this.pool.connect();
    try{
      await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,182026))',['pira-company:'+reference]);
      const prior=await c.query('SELECT name,corporate_number FROM company WHERE id=$1',[id]);
      if(prior.rows[0])check(same(prior.rows[0],{name,corporate_number:number}),'COMPANY_RETRY_CONFLICT');
      else{
        if(number){const found=await c.query("SELECT count(*)::int AS n FROM company WHERE regexp_replace(coalesce(corporate_number,''),'[^0-9]','','g')=$1",[number]);check(found.rows[0].n===0,'EXISTING_COMPANY_REVIEW_REQUIRED');}
        await c.query('INSERT INTO company(id,name,corporate_number,created_by_user_id,owner_user_id) VALUES($1,$2,$3,$4,$4)',[id,name,number,staff]);
      }
      await c.query('COMMIT');return {...input,companyId:id};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async bindEstimate(input:any,staff:string,evidence:string){
    const c=await this.pool.connect();try{
      await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
      const e=await c.query("SELECT id,updated_at::text AS revision FROM estimates WHERE id=$1 AND status='confirmed' FOR SHARE",[input.estimateId]);check(e.rows[0],'CONFIRMED_ESTIMATE_REQUIRED');
      await c.query('INSERT INTO pira_estimate_company_binding(estimate_id,company_id,revision,evidence,verified_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(estimate_id,revision) DO NOTHING',[input.estimateId,input.companyId,e.rows[0].revision,text(evidence,1000),staff]);
      const b=await c.query('SELECT company_id FROM pira_estimate_company_binding WHERE estimate_id=$1 AND revision=$2',[input.estimateId,e.rows[0].revision]);check(b.rows[0]?.company_id===input.companyId,'ESTIMATE_COMPANY_CONFLICT');await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
}
