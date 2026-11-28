import {createHash,createHmac} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import type {GeneralKind} from './secumieGeneralAdminRepo';

export const GENERAL_CONSENT_VERSION='SECUMIE-GENERAL-LEAD-DRAFT-V1';
export const generalLeadInputSchema=z.object({
 idempotencyKey:z.string().uuid(), companyName:z.string().trim().min(1).max(150),
 personName:z.string().trim().min(1).max(150),email:z.string().trim().email().max(254),
 department:z.string().trim().max(150).optional(),position:z.string().trim().max(150).optional(),
 phone:z.string().trim().max(50).optional(),accepted:z.literal(true),
 salesContactAllowed:z.boolean().default(false)
}).strict();
export type GeneralLeadInput=z.input<typeof generalLeadInputSchema>;
export type GeneralLeadStart= {id:string;receipt:string;created:boolean;status:'RECEIVED'|'COMPLETED'|'FAILED'};
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
  const updated=await this.pool.query(`UPDATE secumie_general.lead SET diagnosis_status='COMPLETED',diagnosis_result=$3::jsonb,completed_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() AND diagnosis_status IN ('RECEIVED','FAILED') RETURNING id`,[kind,digest(receipt),value]);
  if(updated.rowCount)return true;
  const replay=await this.pool.query(`SELECT id FROM secumie_general.lead WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp()
   AND diagnosis_status='COMPLETED' AND diagnosis_result=$3::jsonb`,[kind,digest(receipt),value]);
  return Boolean(replay.rowCount);
 }
 async fail(kind:GeneralKind,receipt:string):Promise<boolean>{
  if(!receiptPattern.test(receipt))return false;
  const q=await this.pool.query(`UPDATE secumie_general.lead SET diagnosis_status='FAILED',updated_at=clock_timestamp()
   WHERE kind=$1 AND receipt_hash=$2 AND receipt_expires_at>clock_timestamp() AND diagnosis_status='RECEIVED' RETURNING id`,[kind,digest(receipt)]);
  return Boolean(q.rowCount);
 }
}
