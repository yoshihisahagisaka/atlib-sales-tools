import assert from 'node:assert/strict';
import type {Pool} from 'pg';
/** Only this run's generated keys may be deleted; unknown data causes rollback. */
export async function cleanupGeneralAcceptance(pool:Pool,keys:string[],company:string){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query("SET LOCAL lock_timeout='2s'");
  await c.query('LOCK TABLE secumie_general.lead,secumie_general.company_group,secumie_general.company_group_audit,secumie_general.staff_change,secumie_general.insight_result_history IN SHARE ROW EXCLUSIVE MODE');
  const leads=(await c.query('SELECT id,idempotency_key,company_name,company_group_id FROM secumie_general.lead')).rows;
  assert.ok(leads.every(x=>keys.includes(x.idempotency_key)&&x.company_name===company),'unexpected lead: cleanup refused');
  const ids=leads.map(x=>x.id);
  const audit=(await c.query('SELECT group_id,lead_id FROM secumie_general.company_group_audit')).rows;
  assert.ok(audit.every(x=>ids.includes(x.lead_id)),'unexpected group audit: cleanup refused');
  const groupIds=[...new Set([...leads.map(x=>x.company_group_id).filter(Boolean),...audit.map(x=>x.group_id)])];
  const groups=(await c.query('SELECT id,company_name FROM secumie_general.company_group')).rows;
  assert.ok(groups.every(x=>groupIds.includes(x.id)&&x.company_name===company),'unexpected group: cleanup refused');
  for(const table of ['staff_change','insight_result_history']){
   const count=(await c.query('SELECT count(*)::int AS n FROM secumie_general.'+table+' WHERE NOT (lead_id=ANY($1::uuid[]))',[ids])).rows[0].n;
   assert.equal(count,0,'unexpected dependent record: cleanup refused');
  }
  await c.query('DELETE FROM secumie_general.company_group_audit WHERE lead_id=ANY($1::uuid[])',[ids]);
  await c.query('DELETE FROM secumie_general.staff_change WHERE lead_id=ANY($1::uuid[])',[ids]);
  await c.query('DELETE FROM secumie_general.insight_result_history WHERE lead_id=ANY($1::uuid[])',[ids]);
  await c.query('DELETE FROM secumie_general.lead WHERE id=ANY($1::uuid[]) AND idempotency_key=ANY($2::uuid[]) AND company_name=$3',[ids,keys,company]);
  await c.query('DELETE FROM secumie_general.company_group WHERE id=ANY($1::uuid[]) AND company_name=$2',[groupIds,company]);
  for(const table of ['lead','company_group','company_group_audit','staff_change','insight_result_history'])assert.equal((await c.query('SELECT count(*)::int AS n FROM secumie_general.'+table)).rows[0].n,0,'residue or unexpected data: cleanup rolled back');
  await c.query('COMMIT');
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
