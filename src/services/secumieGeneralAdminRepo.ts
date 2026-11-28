import type { Pool } from 'pg';

export const generalKinds = ['WEB','INSIGHT'] as const;
export const generalSalesStates = ['NEW','CONTACTED','PROPOSAL','WON','LOST','CLOSED'] as const;
export type GeneralKind = typeof generalKinds[number];
export type GeneralSalesState = typeof generalSalesStates[number];
export type GeneralLeadFilters = { kind?:GeneralKind; companyName?:string; diagnosisStatus?:'RECEIVED'|'COMPLETED'|'FAILED'; consultationStatus?:'NONE'|'REQUESTED'; salesStatus?:GeneralSalesState; limit:number; offset:number };

const columns = 'id,kind,received_at,company_name,person_name,target_url,diagnosis_status,consultation_status,notification_status,sales_status,sales_contact_allowed,is_test';
export class SecumieGeneralAdminRepo {
 constructor(private readonly pool:Pool){}
 async list(input:GeneralLeadFilters){
  const clauses=['TRUE'],values:unknown[]=[];
  const add=(column:string,value:string,like=false)=>{values.push(like?'%'+value+'%':value);clauses.push(column+(like?' ILIKE ':'=')+'$'+values.length);};
  if(input.kind)add('kind',input.kind);
  if(input.companyName)add('company_name',input.companyName,true);
  if(input.diagnosisStatus)add('diagnosis_status',input.diagnosisStatus);
  if(input.consultationStatus)add('consultation_status',input.consultationStatus);
  if(input.salesStatus)add('sales_status',input.salesStatus);
  const where=clauses.join(' AND ');
  const count=await this.pool.query('SELECT count(*)::int AS total FROM secumie_general.lead WHERE '+where,values);
  const rows=await this.pool.query('SELECT '+columns+' FROM secumie_general.lead WHERE '+where+' ORDER BY received_at DESC,id LIMIT $'+(values.length+1)+' OFFSET $'+(values.length+2),[...values,input.limit,input.offset]);
  const summary=await this.pool.query("SELECT count(*)::int AS received,count(*) FILTER (WHERE diagnosis_status='COMPLETED')::int AS completed,count(*) FILTER (WHERE consultation_status='REQUESTED')::int AS consultations,count(*) FILTER (WHERE sales_status='NEW')::int AS new_leads,count(*) FILTER (WHERE kind='WEB' AND diagnosis_status='COMPLETED')::int AS web_completed,count(*) FILTER (WHERE kind='INSIGHT' AND diagnosis_status='COMPLETED')::int AS insight_completed FROM secumie_general.lead WHERE NOT is_test");
  return {items:rows.rows,total:count.rows[0].total,summary:summary.rows[0]};
 }
 async detail(kind:GeneralKind,id:string){
  const q=await this.pool.query('SELECT '+columns+',department,position,email,phone,consent_version,consented_at,diagnosis_result,completed_at,consultation_note,consultation_requested_at,consultation_consent_version,staff_note,updated_at FROM secumie_general.lead WHERE kind=$1 AND id=$2',[kind,id]);
  return q.rows[0]??null;
 }
 async updateSales(kind:GeneralKind,id:string,input:{status:GeneralSalesState;note:string;actor:string}){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const old=(await client.query('SELECT sales_status,staff_note FROM secumie_general.lead WHERE kind=$1 AND id=$2 FOR UPDATE',[kind,id])).rows[0];
   if(!old){await client.query('ROLLBACK');return false;}
   if(old.sales_status!==input.status||old.staff_note!==input.note){
    await client.query('UPDATE secumie_general.lead SET sales_status=$3,staff_note=$4,updated_at=now() WHERE kind=$1 AND id=$2',[kind,id,input.status,input.note]);
    await client.query('INSERT INTO secumie_general.staff_change(lead_id,actor,previous_status,next_status,previous_note,next_note) VALUES($1,$2,$3,$4,$5,$6)',[id,input.actor,old.sales_status,input.status,old.staff_note,input.note]);
   }
   await client.query('COMMIT');return true;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
}
