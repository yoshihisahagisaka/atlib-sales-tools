import {createHash} from 'node:crypto';
import {z} from 'zod';
import {SECUMIE_SCHEDULE_URLS,validateScheduleUrl,type ConsultationNotice} from './secumieConsultationHandoff';
import type {GeneralKind} from './secumieGeneralAdminRepo';
import type {SecumieGeneralLeadRepo} from './secumieGeneralLeadRepo';

export const generalConsultationSchema=z.object({
 leadReceipt:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
 phone:z.string().trim().min(1).max(50),note:z.string().trim().max(2000).optional(),accepted:z.literal(true)
}).strict();
export type GeneralConsultationInput=z.infer<typeof generalConsultationSchema>;
export class SecumieGeneralConsultation{
 constructor(private readonly repo:Pick<SecumieGeneralLeadRepo,'claimConsultation'|'finishConsultation'>,private readonly notify:(notice:ConsultationNotice)=>Promise<void>){}
 async submit(kind:GeneralKind,input:GeneralConsultationInput){
  const v=generalConsultationSchema.parse(input);
  const claim=await this.repo.claimConsultation(kind,v.leadReceipt,{phone:v.phone,note:v.note});
  let notificationStatus: 'PENDING'|'SENT'|'FAILED'=claim.status==='CLAIMED'?'PENDING':claim.status;
  if(claim.status==='CLAIMED'){
   let outcome:'SENT'|'FAILED'='FAILED';
   const report=kind==='WEB'&&claim.report&&typeof claim.report==='object'&&'report' in claim.report?claim.report.report:claim.report;
   try{
    await this.notify({kind,companyName:claim.companyName,personName:claim.personName,email:claim.email,phone:claim.phone,note:claim.note, targetUrl:claim.targetUrl,report,receivedAt:claim.receivedAt,reference:createHash('sha256').update(v.leadReceipt).digest('hex').slice(0,20)});
    outcome='SENT';
   }catch{/* Stored request remains available to staff; no automatic SMTP resend. */}
   try{if(await this.repo.finishConsultation(kind,claim.id,outcome))notificationStatus=outcome;}catch{/* Ambiguous result stays PENDING; staff reconciliation, not automatic resend. */}
  }
  return {scheduleUrl:validateScheduleUrl(SECUMIE_SCHEDULE_URLS[kind]),notificationStatus};
 }
}
