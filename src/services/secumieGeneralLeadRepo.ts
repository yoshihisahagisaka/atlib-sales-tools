import {createHash,createHmac} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import type {GeneralKind} from './secumieGeneralAdminRepo';

export const GENERAL_CONSENT_VERSION='SECUMIE-GENERAL-LEAD-V1';
export const generalLeadInputSchema=z.object({
 idempotencyKey:z.string().uuid(), companyName:z.string().trim().min(1).max(150),
 personName:z.string().trim().min(1).max(150),email:z.string().trim().email().max(254),
 department:z.string().trim().max(150).optional(),position:z.string().trim().max(150).optional(),
 phone:z.string().trim().max(50).optional(),accepted:z.literal(true),
 salesContactAllowed:z.boolean().default(false)
}).strict();
export type GeneralLeadInput=z.input<typeof generalLeadInputSchema>;
export type GeneralLeadStart= {id:string;receipt:string;created:boolean;status:'RECEIVED'|'COMPLETED'|'FAILED'};
export const GENERAL_CONSULTATION_CONSENT_VERSION='SECUMIE-GENERAL-CONSULTATION-V1';
export type GeneralConsultationClaim={status:'CLAIMED'|'PENDING'|'SENT'|'FAILED';id:string;companyName:string;personName:string;email:string;phone:string;note:string;targetUrl?:string;report:unknown;receivedAt:string};
export const GENERAL_INSIGHT_REVISION_LIMIT=10;
const receiptPattern=/^[A-Za-z0-9_-]{43}$/;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function normalizeGeneralTarget(kind:GeneralKind,target?:string):string|null{
 if(kind==='INSIGHT'){if(target!==undefined)throw Error('INVALID_TARGET');return null;}
 if(!target||target.length>2000)throw Error('INVALID_TARGET');
 const u=new URL(target);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('INVALID_TARGET');
 return u.href;
}
export class SecumieGeneralLeadRepo{
 constructor(private readonly pool:Pool,private readonly receiptSecret:string){
  if(Buffer.byteLength(receiptSecret,'utf8')<32)throw Error('GENERAL_RECEIPT_SECRET_REQUIRED');
 }
 private receipt(kind:GeneralKind,key:string){return createHmac('sha256',this.receiptSecret).update('secumie-general-lead:v1:'+kind+':'+key.toLowerCase()).digest('base64url');}
 async begin(kind:GeneralKind,input:GeneralLeadInput,target?:string):Promise<GeneralLeadStart>{
  const v=generalLeadInputSchema.parse(input),targetUrl=normalizeGeneralTarget(kind,target);
  const receipt=this.receipt(kind,v.idempotencyKey),receiptHash=digest(receipt);
  const canonical={kind,companyName:v.companyName,personName:v.personName,email:v.email,department:v.department||null,position:v.position||null,phone:v.phone||null,targetUrl,consentVersion:GENERAL_CONSENT_VERSION,salesContactAllowed:v.salesContactAllowed};
  const payloadHash=digest(JSON.stringify(canonical));
  const inserted=await this.pool.query<{id:string;diagnosis_status:GeneralLeadStart['status']}>(`INSERT INTO secumie_general.lead
   (kind,idempotency_key,payload_hash,receipt_hash,receipt_expires_at,company_name,person_name,email,department,position,phone,target_url,consent_version,sales_contact_allowed)
   VALUES($1,$2,$3,$4,clock_timestamp()+interval '2 hours',$5,$6,$7,$8,$9,$10,$11,$12,$13)
   ON CONFLICT(idempotency_key) DO NOTHING RETURNING id,diagnosis_status`,
   [kind,v.idempotencyKey,payloadHash,receiptHash,canonical.companyName,canonical.personName,canonical.email,canonical.department,canonical.position,canonical.phone,targetUrl,canonical.consentVersion,canonical.salesContactAllowed]);
  const row=inserted.rows[0];
  if(row)return {id:row.id,receipt,created:true,status:row.diagnosis_status};
  const found=(await this.pool.query<{id:string;kind:GeneralKind;payload_hash:string;receipt_hash:string;valid:boolean;diagnosis_status:GeneralLeadStart['status']}>(`SELECT id,kind,payload_hash,receipt_hash,receipt_expires_at>clock_timestamp() AS valid,diagnosis_status FROM secumie_general.lead WHERE idempotency_key=$1`,[v.idempotencyKey])).rows[0];
  if(!found||found.kind!==kind||found.payload_hash!==payloadHash||found.receipt_hash!==receiptHash)throw Error('LEAD_IDEMPOTENCY_CONFLICT');
  if(!found.valid)throw Error('RECEIPT_EXPIRED');
  return {id:found.id,receipt,created:false,status:found.diagnosis_status};
 }
 async complete(kind:GeneralKind,receipt:string,result:unknown):Promise<boolean>{
  if(!receiptPattern.test(receipt))return false;
  if(result===null||typeof result!=='object'||Array.isArray(result))throw Error('INVALID_DIAGNOSIS_RESULT');
  const value=JSON.stringify(result);if(Buffer.byteLength(value)>256*1024)throw Error('DIAGNOSIS_RESULT_TOO_LARGE');
  if(kind==='INSIGHT'){
   const client=await this.pool.connect();
   try{
    await client.query('BEGIN');
    const row=(await client.query(`SELECT id,diagnosis_status,consultation_status,diagnosis_result=$3::jsonb AS same,diagnosis_result,completed_at,insight_revision_count
      FROM secumie_general.lead WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() FOR UPDATE`,[kind,digest(receipt),value])).rows[0];
    if(!row){await client.query('ROLLBACK');return false;}
    if(row.diagnosis_status==='COMPLETED'&&row.same){await client.query('COMMIT');return true;}
    if(row.consultation_status!=='NONE'){await client.query('ROLLBACK');return false;}
    if(row.diagnosis_status==='COMPLETED'){
     if(row.insight_revision_count>=GENERAL_INSIGHT_REVISION_LIMIT)throw Error('REVISION_LIMIT');
     await client.query(`INSERT INTO secumie_general.insight_result_history(lead_id,diagnosis_result,completed_at) VALUES($1,$2::jsonb,$3)`,[row.id,JSON.stringify(row.diagnosis_result),row.completed_at]);
    }
    await client.query(`UPDATE secumie_general.lead SET diagnosis_status='COMPLETED',diagnosis_result=$2::jsonb,completed_at=clock_timestamp(),updated_at=clock_timestamp(),insight_revision_count=insight_revision_count+CASE WHEN diagnosis_status='COMPLETED' THEN 1 ELSE 0 END WHERE id=$1`,[row.id,value]);
    await client.query('COMMIT');return true;
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const updated=await this.pool.query(`UPDATE secumie_general.lead SET diagnosis_status='COMPLETED',diagnosis_result=$3::jsonb,completed_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() AND diagnosis_status IN ('RECEIVED','FAILED') RETURNING id`,[kind,digest(receipt),value]);
  if(updated.rowCount)return true;
  const replay=await this.pool.query(`SELECT id FROM secumie_general.lead WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp()
   AND diagnosis_status='COMPLETED' AND diagnosis_result=$3::jsonb`,[kind,digest(receipt),value]);
  return Boolean(replay.rowCount);
 }
 async getCompleted(kind:GeneralKind,receipt:string):Promise<unknown|null>{
  if(!receiptPattern.test(receipt))return null;
  const q=await this.pool.query(`SELECT diagnosis_result FROM secumie_general.lead WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() AND diagnosis_status='COMPLETED'`,[kind,digest(receipt)]);
  return q.rows[0]?.diagnosis_result??null;
 }
 async claimConsultation(kind:GeneralKind,receipt:string,input:{phone:string;note?:string;answers?:{questionId:string;answerId:string}[]}):Promise<GeneralConsultationClaim>{
  if(!receiptPattern.test(receipt))throw Error('RECEIPT_EXPIRED');
  const phone=z.string().trim().min(1).max(50).parse(input.phone),note=z.string().trim().max(2000).parse(input.note??'');
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const row=(await client.query(`SELECT id,company_name,person_name,email,target_url,diagnosis_status,diagnosis_result,consultation_status,consultation_phone,consultation_note,consultation_requested_at,notification_status
    FROM secumie_general.lead WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() FOR UPDATE`,[kind,digest(receipt)])).rows[0];
   if(!row)throw Error('RECEIPT_EXPIRED');
   if(row.diagnosis_status!=='COMPLETED')throw Error('DIAGNOSIS_NOT_SAVED');
   if(kind==='INSIGHT'){
    const stored=z.array(z.object({questionId:z.string(),answerId:z.string()})).length(8).safeParse(row.diagnosis_result?.answers);
    const expected=input.answers;
    const canonical=(items:{questionId:string;answerId:string}[])=>JSON.stringify(items.map(x=>[x.questionId,x.answerId]).sort((a,b)=>a[0]!.localeCompare(b[0]!)));
    if(!stored.success||!expected||expected.length!==8||new Set(expected.map(x=>x.questionId)).size!==8||canonical(stored.data)!==canonical(expected))throw Error('DIAGNOSIS_NOT_SAVED');
   }else if(input.answers!==undefined)throw Error('DIAGNOSIS_NOT_SAVED');
   let status:GeneralConsultationClaim['status'];
   let at=row.consultation_requested_at;
   if(row.consultation_status==='NONE'){
    const updated=await client.query(`UPDATE secumie_general.lead SET consultation_status='REQUESTED',consultation_phone=$3,consultation_note=$4,consultation_consent_version=$5,consultation_requested_at=clock_timestamp(),notification_status='PENDING',updated_at=clock_timestamp() WHERE kind=$1 AND id=$2 RETURNING consultation_requested_at`,[kind,row.id,phone,note,GENERAL_CONSULTATION_CONSENT_VERSION]);
    at=updated.rows[0].consultation_requested_at;status='CLAIMED';
   }else{
    if(row.consultation_phone!==phone||(row.consultation_note??'')!==note)throw Error('ALREADY_SUBMITTED');
    status=row.notification_status;
    if(!['PENDING','SENT','FAILED'].includes(status))throw Error('INVALID_NOTIFICATION_STATE');
   }
   await client.query('COMMIT');
   return {status,id:row.id,companyName:row.company_name,personName:row.person_name,email:row.email,phone,note,...(row.target_url?{targetUrl:row.target_url}:{}),report:row.diagnosis_result,receivedAt:new Date(at).toISOString()};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async finishConsultation(kind:GeneralKind,id:string,status:'SENT'|'FAILED'):Promise<boolean>{
  const q=await this.pool.query(`UPDATE secumie_general.lead SET notification_status=$3,updated_at=clock_timestamp() WHERE kind=$1 AND id=$2 AND consultation_status='REQUESTED' AND notification_status='PENDING' RETURNING id`,[kind,id,status]);
  return Boolean(q.rowCount);
 }
 async fail(kind:GeneralKind,receipt:string):Promise<boolean>{
  if(!receiptPattern.test(receipt))return false;
  const q=await this.pool.query(`UPDATE secumie_general.lead SET diagnosis_status='FAILED',updated_at=clock_timestamp()
   WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() AND diagnosis_status='RECEIVED' RETURNING id`,[kind,digest(receipt)]);
  return Boolean(q.rowCount);
 }
}
