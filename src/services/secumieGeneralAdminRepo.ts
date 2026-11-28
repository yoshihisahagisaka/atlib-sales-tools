import type { Pool } from 'pg';

export const generalKinds = ['WEB','INSIGHT'] as const;
export const generalSalesStates = ['NEW','CONTACTED','PROPOSAL','WON','LOST','CLOSED'] as const;
export type GeneralKind = typeof generalKinds[number];
export type GeneralSalesState = typeof generalSalesStates[number];
export type GeneralLeadFilters = { kind?:GeneralKind; companyName?:string; diagnosisStatus?:'RECEIVED'|'COMPLETED'|'FAILED'; consultationStatus?:'NONE'|'REQUESTED'; salesStatus?:GeneralSalesState; limit:number; offset:number };

const columns = 'l.id,l.kind,l.received_at,l.company_name,l.person_name,l.target_url,l.diagnosis_status,l.consultation_status,l.notification_status,COALESCE(g.sales_status,l.sales_status) AS sales_status,l.sales_contact_allowed,l.is_test,l.company_group_id,g.company_name AS group_name';
const from=' FROM secumie_general.lead l LEFT JOIN secumie_general.company_group g ON g.id=l.company_group_id';
export class SecumieGeneralAdminRepo {
 constructor(private readonly pool:Pool){}
 async list(input:GeneralLeadFilters){
  const clauses=['TRUE'],values:unknown[]=[];
  const add=(column:string,value:string,like=false)=>{values.push(like?'%'+value+'%':value);clauses.push(column+(like?' ILIKE ':'=')+'$'+values.length);};
  if(input.kind)add('l.kind',input.kind);
  if(input.companyName)add('l.company_name',input.companyName,true);
  if(input.diagnosisStatus)add('l.diagnosis_status',input.diagnosisStatus);
  if(input.consultationStatus)add('l.consultation_status',input.consultationStatus);
  if(input.salesStatus)add('COALESCE(g.sales_status,l.sales_status)',input.salesStatus);
  const where=clauses.join(' AND ');
  const count=await this.pool.query('SELECT count(*)::int AS total'+from+' WHERE '+where,values);
  const rows=await this.pool.query('SELECT '+columns+from+' WHERE '+where+' ORDER BY l.received_at DESC,l.id LIMIT $'+(values.length+1)+' OFFSET $'+(values.length+2),[...values,input.limit,input.offset]);
  const summary=await this.pool.query("SELECT count(*)::int AS received,count(*) FILTER (WHERE l.diagnosis_status='COMPLETED')::int AS completed,count(*) FILTER (WHERE l.consultation_status='REQUESTED')::int AS consultations,count(DISTINCT COALESCE(l.company_group_id,l.id)) FILTER (WHERE COALESCE(g.sales_status,l.sales_status)='NEW')::int AS new_leads,count(*) FILTER (WHERE l.kind='WEB' AND l.diagnosis_status='COMPLETED')::int AS web_completed,count(*) FILTER (WHERE l.kind='INSIGHT' AND l.diagnosis_status='COMPLETED')::int AS insight_completed"+from+" WHERE NOT l.is_test");
  return {items:rows.rows,total:count.rows[0].total,summary:summary.rows[0]};
 }
 async detail(kind:GeneralKind,id:string){
  const q=await this.pool.query('SELECT '+columns+',l.department,l.position,l.email,l.phone,l.consent_version,l.consented_at,l.diagnosis_result,l.completed_at,l.consultation_phone,l.consultation_note,l.consultation_requested_at,l.consultation_consent_version,COALESCE(g.staff_note,l.staff_note) AS staff_note,l.sales_status AS original_sales_status,l.staff_note AS original_staff_note,l.updated_at'+from+' WHERE l.kind=$1 AND l.id=$2',[kind,id]);
  const row=q.rows[0];if(!row)return null;
  const history=kind==='INSIGHT'?await this.pool.query('SELECT diagnosis_result,completed_at,archived_at FROM secumie_general.insight_result_history WHERE lead_id=$1 ORDER BY archived_at DESC,id DESC LIMIT 50',[id]):{rows:[]};
  const related=row.company_group_id?await this.pool.query('SELECT id,kind,company_name,person_name,received_at,diagnosis_status,consultation_status,sales_contact_allowed FROM secumie_general.lead WHERE company_group_id=$1 AND id<>$2 ORDER BY received_at DESC,id LIMIT 100',[row.company_group_id,id]):{rows:[]};
  return {...row,result_history:history.rows,related_leads:related.rows};
 }
 async linkCompany(kind:GeneralKind,id:string,input:{targetKind:GeneralKind;targetId:string;actor:string}){
  if(id===input.targetId)throw Error('SAME_LEAD');
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('SELECT pg_advisory_xact_lock(731904,1)');
   const rows=(await c.query('SELECT id,kind,company_name,is_test,company_group_id,sales_status,staff_note FROM secumie_general.lead WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[id,input.targetId]])).rows;
   const source=rows.find(x=>x.id===id&&x.kind===kind),target=rows.find(x=>x.id===input.targetId&&x.kind===input.targetKind);
   if(!source||!target){await c.query('ROLLBACK');return null;}
   if(source.is_test!==target.is_test)throw Error('TEST_BOUNDARY');
   if(source.company_group_id&&target.company_group_id&&source.company_group_id!==target.company_group_id)throw Error('GROUP_MERGE_NOT_ALLOWED');
   let group=source.company_group_id??target.company_group_id;
   if(!group)group=(await c.query('INSERT INTO secumie_general.company_group(company_name,is_test,sales_status,staff_note) VALUES($1,$2,$3,$4) RETURNING id',[source.company_name,source.is_test,source.sales_status,source.staff_note])).rows[0].id;
   for(const row of [source,target])if(!row.company_group_id){
    await c.query('UPDATE secumie_general.lead SET company_group_id=$2,updated_at=now() WHERE id=$1',[row.id,group]);
    await c.query("INSERT INTO secumie_general.company_group_audit(group_id,lead_id,action,actor,detail) VALUES($1,$2,'LINK',$3,$4::jsonb)",[group,row.id,input.actor,JSON.stringify({originalStatus:row.sales_status,originalNote:row.staff_note})]);
   }
   await c.query('COMMIT');return {groupId:group};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async unlinkCompany(kind:GeneralKind,id:string,actor:string){
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(731904,1)');
   const row=(await c.query('SELECT company_group_id FROM secumie_general.lead WHERE kind=$1 AND id=$2 FOR UPDATE',[kind,id])).rows[0];
   if(!row){await c.query('ROLLBACK');return false;}
   if(row.company_group_id){
    await c.query('UPDATE secumie_general.lead SET company_group_id=NULL,updated_at=now() WHERE kind=$1 AND id=$2',[kind,id]);
    await c.query("INSERT INTO secumie_general.company_group_audit(group_id,lead_id,action,actor,detail) VALUES($1,$2,'UNLINK',$3,'{}'::jsonb)",[row.company_group_id,id,actor]);
   }
   await c.query('COMMIT');return true;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async updateSales(kind:GeneralKind,id:string,input:{status:GeneralSalesState;note:string;actor:string}){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(731904,1)');
   const old=(await client.query('SELECT sales_status,staff_note,company_group_id FROM secumie_general.lead WHERE kind=$1 AND id=$2 FOR UPDATE',[kind,id])).rows[0];
   if(!old){await client.query('ROLLBACK');return false;}
   if(old.company_group_id){
    const group=(await client.query('SELECT sales_status,staff_note FROM secumie_general.company_group WHERE id=$1 FOR UPDATE',[old.company_group_id])).rows[0];
    if(!group)throw Error('GROUP_NOT_FOUND');
    if(group.sales_status!==input.status||group.staff_note!==input.note){
     await client.query('UPDATE secumie_general.company_group SET sales_status=$2,staff_note=$3,updated_at=now() WHERE id=$1',[old.company_group_id,input.status,input.note]);
     await client.query("INSERT INTO secumie_general.company_group_audit(group_id,lead_id,action,actor,detail) VALUES($1,$2,'SALES',$3,$4::jsonb)",[old.company_group_id,id,input.actor,JSON.stringify({previousStatus:group.sales_status,nextStatus:input.status,previousNote:group.staff_note,nextNote:input.note})]);
    }
   }else if(old.sales_status!==input.status||old.staff_note!==input.note){
    await client.query('UPDATE secumie_general.lead SET sales_status=$3,staff_note=$4,updated_at=now() WHERE kind=$1 AND id=$2',[kind,id,input.status,input.note]);
    await client.query('INSERT INTO secumie_general.staff_change(lead_id,actor,previous_status,next_status,previous_note,next_note) VALUES($1,$2,$3,$4,$5,$6)',[id,input.actor,old.sales_status,input.status,old.staff_note,input.note]);
   }
   await client.query('COMMIT');return true;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
}
