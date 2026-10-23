import { randomUUID } from 'node:crypto';
import type { Store } from './model';
import { row, key, check } from './model';

export interface Delivery { slack?(message:string):Promise<boolean>; email?(address:string,subject:string,message:string):Promise<void>; }
/** Explicit worker entry point; never starts in web process. One attempt per call.
 * At-least-once: a receiver may accept a message before its response is lost.
 */
export async function deliverPiraNotice(store:Store,id:string,delivery:Delivery,origin:string|{portal:string;sales:string},now=()=>Date.now()):Promise<string> {
  const origins=typeof origin==='string'?{portal:origin,sales:origin}:origin;
  for(const value of Object.values(origins))check(new URL(value).origin===value,'INVALID_ORIGIN');
  const leaseId=randomUUID();
  const claim=await store.transaction('pira-phase1-business',async tx=>{
    const n=await tx.get('outbox',id);check(n,'NOTICE_NOT_FOUND',404);const d=n.data;
    if(d.state==='sent'||d.state==='dead'||Date.parse(d.nextAt)>now()||(d.state==='sending'&&Date.parse(d.leaseUntil)>now()))return null;
    const configured=d.destination==='slack'?!!delivery.slack:!!delivery.email;
    if(!configured)return {unconfigured:true} as const;
    const assoc=n.associationId?await tx.get('association',n.associationId):null;
    const company=n.companyId?await tx.company(n.companyId):null;
    if(d.destination==='association_email')check(assoc?.data.active&&assoc.data.email,'NOTICE_CONTACT_UNAVAILABLE');
    const url=d.destination==='association_email'?`${origins.portal}/pira/?application=${encodeURIComponent(d.targetId)}`:`${origins.sales}/admin/pira.html?${d.type==='application_submitted'?'application':'order'}=${encodeURIComponent(d.targetId)}`;
    const safe=(v:unknown)=>String(v??'').replace(/[<>&\r\n]/g,' ').slice(0,200);
    const message=`【共同購買 ${d.type==='order_confirmed'?'正式発注':'サービス申込'}】\n組合: ${safe(assoc?.data.name)}\n企業: ${safe(company?.name)}\nサービス: ${safe(d.service)}\n番号: ${safe(d.number)}\n${url}\nevent: ${d.eventId}`;
    n.version++;n.data={...d,state:'sending',attempts:d.attempts+1,leaseId,leaseUntil:new Date(now()+60000).toISOString()};await tx.save('outbox',n);
    return {unconfigured:false as const,destination:d.destination,email:assoc?.data.email,message};
  });
  if(!claim)return 'deferred';if(claim.unconfigured)return 'unconfigured';
  let ok=false;try{if(claim.destination==='slack')ok=await delivery.slack!(claim.message);else{await delivery.email!(claim.email,'共同購買：サービス申込',claim.message);ok=true;}}catch{/* diagnostics deliberately not persisted */}
  return store.transaction('pira-phase1-business',async tx=>{
    const n=await tx.get('outbox',id);check(n,'NOTICE_NOT_FOUND');if(n.data.leaseId!==leaseId)return 'lease_lost';
    n.version++;n.data={...n.data,state:ok?'sent':n.data.attempts>=8?'dead':'pending',leaseId:null,leaseUntil:null,lastError:ok?null:'DELIVERY_FAILED',nextAt:new Date(now()+Math.min(3600000,30000*2**n.data.attempts)).toISOString()};
    await tx.save('outbox',n);await tx.save('audit',row({actorId:'pira-notification-worker',action:ok?'notification_delivered':'notification_failed',targetId:id,eventId:n.data.eventId,at:new Date(now()).toISOString()},n.associationId,n.companyId,key(id,String(n.data.attempts),leaseId)));return n.data.state;
  });
}
