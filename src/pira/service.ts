import { randomUUID } from 'node:crypto';
import { Actor, Kind, Store, Transaction, RecordRow, Service, check, key, row, same, text, uuid, principalId } from './model';

const services: Service[] = ['GUARD','SEND','INFRAVISION'];
const number = (v: unknown, min=0, max=1000000000): number => { check(Number.isSafeInteger(v) && (v as number)>=min && (v as number)<=max,'INVALID_NUMBER',400); return v as number; };
const email = (v: unknown) => { const s=text(v,254).toLowerCase(); check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),'INVALID_EMAIL',400); return s; };
const roles = ['atlib_admin','association_admin','association_staff','company_admin'];
export class PiraService {
  constructor(public store: Store, private now=()=>new Date().toISOString()) {}
  // Phase 1 intentionally serializes its small management ledger. Covers membership, terms,
  // affiliation and order changes in one DB lock; never calls a remote service while held.
  private run<T>(fn:(tx:Transaction)=>Promise<T>) { return this.store.transaction('pira-phase1-business',fn); }
  private async memberships(tx:Transaction,a:Actor) {
    const p=await tx.get('principal',a.id); check(p?.data.active && p.data.internal===a.internal,'ACCESS_DENIED',403);
    const memberships=(await tx.list('membership')).filter(m=>m.data.principalId===a.id && m.data.active);
    check(memberships.length>0,'ACCESS_DENIED',403);return memberships;
  }
  private async authorize(tx:Transaction,a:Actor, associationId?:string, companyId?:string, permission='read') {
    const ms=await this.memberships(tx,a);
    if(a.internal && ms.some(m=>m.data.role==='atlib_admin'))return 'atlib_admin';
    check(!a.internal && permission!=='admin','ACCESS_DENIED',403);
    const m=ms.find(m=>associationId && m.associationId===associationId &&
      ((m.data.role==='association_admin') || (m.data.role==='association_staff' && permission!=='manage' && (permission!=='order'||m.data.canOrder===true))))
      ?? ms.find(m=>companyId && m.companyId===companyId && m.data.role==='company_admin' && !['order','manage'].includes(permission));
    check(m,'ACCESS_DENIED',403); return m.data.role as string;
  }
  private async audit(tx:Transaction,a:Actor,action:string,target:RecordRow,before:unknown=null,reason:string|null=null) {
    await tx.save('audit',row({actorId:a.id,machine:a.machine??null,requestId:a.requestId??null,action,targetId:target.id,targetVersion:target.version,before,after:target.data,reason,at:this.now()},target.associationId,target.companyId));
  }
  private async event(tx:Transaction,type:string,target:RecordRow, associationEmail?:string) {
    const eventId=key(type,target.id,String(target.version));
    for(const destination of associationEmail?['slack','association_email']:['slack']) {
      const id=key(eventId,destination);
      await tx.save('outbox',row({eventId,type,targetId:target.id,number:target.data.number,service:target.data.service,destination,
        state:'pending',attempts:0,nextAt:this.now(),leaseUntil:null,leaseId:null,channelId:'C0C9YB6F49H'},target.associationId,target.companyId,id));
    }
  }
  async session(a:Actor) { return this.run(async tx=>({actor:a,memberships:await Promise.all((await this.memberships(tx,a)).map(async m=>({...m,associationName:m.associationId?(await tx.get('association',m.associationId))?.data.name:null,companyName:m.companyId?(await tx.company(m.companyId))?.name:null})))})); }
  async list(a:Actor,kind:Kind,associationId?:string,companyId?:string) {
    check(['association','affiliation','application','order','terms','audit','external_link','membership','principal','outbox'].includes(kind),'INVALID_KIND',400);
    return this.run(async tx=>{
      const ms=await this.memberships(tx,a); const internal=a.internal&&ms.some(m=>m.data.role==='atlib_admin');
      if(!internal)check(associationId||companyId,'SCOPE_REQUIRED',403);
      if(associationId)uuid(associationId);if(companyId)uuid(companyId);
      if(!internal)await this.authorize(tx,a,associationId,companyId);
      check(internal||!['external_link','audit','membership','principal','outbox'].includes(kind),'ACCESS_DENIED',403);
      const companyTerms=!internal&&kind==='terms'&&!!companyId&&ms.some(m=>m.data.role==='company_admin'&&m.companyId===companyId);
      if(companyTerms)check(associationId&&(await tx.get('affiliation',key(associationId,companyId!)))?.data.active,'AFFILIATION_REQUIRED',403);
      const list=await tx.list(kind,{associationId,companyId:companyTerms?undefined:companyId});
      // A company role cannot use an association filter to enumerate its peers.
      const visible=list.filter(r=>internal||ms.some(m=>
        ((m.data.role==='association_admin'||m.data.role==='association_staff') && m.associationId===(kind==='association'?r.id:r.associationId)) ||
        (m.data.role==='company_admin' && (m.companyId===r.companyId || (companyTerms&&!r.companyId)))));
      return Promise.all(visible.map(async r=>({...r,companyName:r.companyId?(await tx.company(r.companyId))?.name:null,associationName:r.associationId?(await tx.get('association',r.associationId))?.data.name:null})));
    });
  }
  async detail(a:Actor,kind:'application'|'order',id:string) {
    return this.run(async tx=>{const r=await tx.get(kind,text(id,100));check(r,'NOT_FOUND',404);await this.authorize(tx,a,r.associationId!,r.companyId!);return r;});
  }
  async history(a:Actor,id:string) { return this.run(async tx=>{
    const r=await tx.get('application',text(id,100));check(r,'NOT_FOUND',404);await this.authorize(tx,a,r.associationId!,r.companyId!);
    return (await tx.list('audit',{associationId:r.associationId!,companyId:r.companyId!})).filter(e=>e.data.targetId===id).map(e=>({id:e.id,action:e.data.action,at:e.data.at,version:e.data.targetVersion,reason:e.data.reason}));
  }); }
  async saveAssociation(a:Actor,input:any) { return this.run(async tx=>{
    await this.authorize(tx,a,undefined,undefined,'admin');const id=input.id?uuid(input.id):randomUUID(); const old=await tx.get('association',id);
    check(input.mode===undefined||input.mode==='MANUAL','AUTO_NOT_ENABLED',400);
    const r=row({name:text(input.name),email:email(input.email),contactName:text(input.contactName),phone:typeof input.phone==='string'?input.phone.slice(0,40):'',active:input.active!==false,orderMode:'MANUAL',serviceModes:{GUARD:'MANUAL',SEND:'MANUAL',INFRAVISION:'MANUAL'}},id,null,id);
    if(old&&input.version===undefined){check(same(old.data,r.data),'VERSION_CONFLICT');return old;}
    check(!old||old.version===input.version,'VERSION_CONFLICT');r.version=(old?.version??0)+1;await tx.save('association',r);await this.audit(tx,a,'association_saved',r,old?.data);return r;
  }); }
  async grant(a:Actor,input:any) {return this.run(async tx=>{
    await this.authorize(tx,a,undefined,undefined,'admin');check(roles.includes(input.role),'INVALID_ROLE',400);
    const internal=input.role==='atlib_admin';const address=email(input.email);check(!internal||address.endsWith('@atlib.jp'),'INVALID_STAFF',400);
    const pid=internal?'staff:'+address:principalId(address); const p=await tx.get('principal',pid);
    const pr=row({...p?.data,email:address,internal,active:p?.data.active??true},null,null,pid);pr.version=(p?.version??0)+1;await tx.save('principal',pr);
    const aid=internal||input.role==='company_admin'?null:uuid(input.associationId);const cid=input.role==='company_admin'?uuid(input.companyId):null;
    if(aid)check((await tx.get('association',aid))?.data.active,'ASSOCIATION_NOT_ACTIVE');if(cid)check(await tx.company(cid),'COMPANY_NOT_FOUND');
    const id=key(pid,input.role,aid??'',cid??''); const old=await tx.get('membership',id);
    const m=row({principalId:pid,role:input.role,active:input.active!==false,canOrder:input.role==='association_admin'||input.canOrder===true},aid,cid,id);m.version=(old?.version??0)+1;
    await tx.save('membership',m);await this.audit(tx,a,'membership_saved',m,old?.data);return m;
  });}
  async bindGoogle(issuer:string,subject:string,address:string) {return this.run(async tx=>{
    check(['accounts.google.com','https://accounts.google.com'].includes(issuer),'ACCESS_DENIED',403);
    const sub=text(subject);const id=principalId(email(address));const p=await tx.get('principal',id);
    check(p?.data.active&&!p.data.internal,'INVITATION_REQUIRED',403);
    check(!p.data.subject||p.data.subject===sub,'IDENTITY_MISMATCH',403);
    if(!p.data.subject){p.data={...p.data,issuer:'https://accounts.google.com',subject:sub};p.version++;await tx.save('principal',p);await this.audit(tx,{id,internal:false},'identity_bound',p);}
    await this.memberships(tx,{id,internal:false});return {id,internal:false};
  });}
  async searchCompanies(a:Actor,term:string) { return this.run(async tx=>{await this.authorize(tx,a,undefined,undefined,'admin');return tx.searchCompanies(text(term,100));}); }
  async resolveCompany(a:Actor,input:any) {return this.run(async tx=>{
    await this.authorize(tx,a,undefined,undefined,'admin');const aid=uuid(input.associationId);check((await tx.get('association',aid))?.data.active,'ASSOCIATION_NOT_ACTIVE');
    const proof=text(input.evidence,1000);const normalized=typeof input.corporateNumber==='string'?input.corporateNumber.replace(/[-\s]/g,''):null;
    check(!normalized||/^\d{13}$/.test(normalized),'INVALID_CORPORATE_NUMBER',400);
    // No-number cases require an explicit verified external/manual identity, never a company name.
    const identityKey=normalized?key('corporate-number',normalized):key('verified-reference',text(input.verifiedReference));
    const existing=await tx.get('identity',identityKey);let cid=input.companyId?uuid(input.companyId):existing?.companyId;
    if(existing){check(!cid||cid===existing.companyId,'IDENTITY_CONFLICT');cid=existing.companyId;}
    if(cid){const c=await tx.company(cid);check(c,'COMPANY_NOT_FOUND');check(!normalized||!c.corporateNumber||c.corporateNumber.replace(/[-\s]/g,'')===normalized,'IDENTITY_CONFLICT');}
    else {
      if(normalized){const candidates=await tx.searchCompanies(normalized);check(!candidates.some(c=>c.corporateNumber?.replace(/[-\s]/g,'')===normalized),'EXISTING_COMPANY_REVIEW_REQUIRED');}
      cid=randomUUID();await tx.createCompany(cid,text(input.name),normalized,a.id);
    }
    if(!existing)await tx.save('identity',row({type:normalized?'corporate_number':'verified_reference',evidence:proof,verifiedBy:a.id,verifiedAt:this.now()},null,cid!,identityKey));
    const id=key(aid,cid!);const old=await tx.get('affiliation',id);
    const r=row({active:input.active!==false,evidence:proof,contactName:text(input.contactName),contactEmail:email(input.contactEmail),verifiedAt:this.now()},aid,cid!,id);r.version=(old?.version??0)+1;
    await tx.save('affiliation',r);await this.audit(tx,a,'company_affiliated',r,old?.data,proof);return r;
  });}
  async linkExternal(a:Actor,input:any) {return this.run(async tx=>{
    await this.authorize(tx,a,undefined,undefined,'admin');const cid=uuid(input.companyId);check(await tx.company(cid),'COMPANY_NOT_FOUND');
    check(services.includes(input.service),'INVALID_SERVICE',400);const env=text(input.environment,40),externalId=text(input.externalId,100);
    if(input.service==='INFRAVISION'){uuid(externalId);text(input.customerCode,20);}
    if(input.service==='GUARD')check(/^\d+$/.test(externalId),'INVALID_EXTERNAL_ID',400);
    if(input.service==='SEND')uuid(externalId);
    const id=key(input.service,env,externalId),old=await tx.get('external_link',id);check(!old||old.companyId===cid,'EXTERNAL_ID_ALREADY_LINKED');
    const r=row({service:input.service,environment:env,externalId,customerCode:input.service==='INFRAVISION'?input.customerCode:null,evidence:text(input.evidence,1000),verifiedBy:a.id,verifiedAt:this.now()},null,cid,id);r.version=(old?.version??0)+1;
    await tx.save('external_link',r);await this.audit(tx,a,'external_id_linked',r,old?.data);return r;
  });}
  async approveTerms(a:Actor,input:any) {return this.run(async tx=>{
    await this.authorize(tx,a,undefined,undefined,'admin');const aid=uuid(input.associationId);check((await tx.get('association',aid))?.data.active,'ASSOCIATION_NOT_ACTIVE');
    check(services.includes(input.service),'INVALID_SERVICE',400);let estimate=null,cid=null;
    if(input.service==='INFRAVISION'){cid=uuid(input.companyId);estimate=await tx.confirmedEstimate(uuid(input.estimateId),cid);check(estimate,'CONFIRMED_ESTIMATE_REQUIRED');}
    const r=row({service:input.service,label:text(input.label),baseMonthlyYen:number(input.baseMonthlyYen),unitMonthlyYen:number(input.unitMonthlyYen),initialYen:number(input.initialYen),minQuantity:number(input.minQuantity,1,100000),maxQuantity:number(input.maxQuantity,1,100000),
      conditions:text(input.conditions,3000),estimate,approvedBy:a.id,approvedAt:this.now(),active:true,billingQuantityConfirmed:input.service!=='GUARD'},aid,cid);
    check(r.data.maxQuantity>=r.data.minQuantity,'INVALID_QUANTITY_RANGE',400);await tx.save('terms',r);await this.audit(tx,a,'terms_approved',r);return r;
  });}
  private async offer(tx:Transaction,aid:string,cid:string,termsId:string,quantity:number) {
    const t=await tx.get('terms',uuid(termsId));check(t?.associationId===aid&&(!t.companyId||t.companyId===cid),'TERMS_NOT_FOUND',404);
    check(t.data.active && quantity>=t.data.minQuantity&&quantity<=t.data.maxQuantity,'TERMS_OR_QUANTITY_INVALID');
    if(t.data.service==='INFRAVISION'){const e=await tx.confirmedEstimate(t.data.estimate.id,cid);check(e?.revision===t.data.estimate.revision,'ESTIMATE_CHANGED');}
    return {termsId:t.id,termsVersion:t.version,service:t.data.service,quantity,baseMonthlyYen:t.data.baseMonthlyYen,unitMonthlyYen:t.data.unitMonthlyYen,initialYen:t.data.initialYen,conditions:t.data.conditions,estimate:t.data.estimate,billingQuantityConfirmed:t.data.billingQuantityConfirmed};
  }
  async submit(a:Actor,input:any) {return this.run(async tx=>{
    const aid=uuid(input.associationId),cid=uuid(input.companyId);const role=await this.authorize(tx,a,aid,cid,'submit');check(role==='company_admin'||role==='atlib_admin','COMPANY_ROLE_REQUIRED',403);
    const association=await tx.get('association',aid);check(association?.data.active,'ASSOCIATION_NOT_ACTIVE');check((await tx.get('affiliation',key(aid,cid)))?.data.active,'AFFILIATION_REQUIRED');
    check(input.acceptedTerms===true,'CONSENT_REQUIRED',400);const qty=number(input.quantity,1,100000);const requestId=text(input.requestId,100);
    const snapshot=await this.offer(tx,aid,cid,input.termsId,qty);const fingerprint={aid,cid,termsId:input.termsId,quantity:qty,acceptedTerms:true};
    const id=key('submission',a.id,requestId);const old=await tx.get('application',id);
    if(old){check(same(old.data.request,fingerprint),'IDEMPOTENCY_CONFLICT');return old;}
    const r=row({number:'PA-'+randomUUID(),state:'SUBMITTED',service:snapshot.service,snapshot,request:fingerprint,submittedBy:a.id,submittedAt:this.now(),acceptedAt:this.now(),note:typeof input.note==='string'?input.note.slice(0,1000):'',orderId:null},aid,cid,id);
    await tx.save('application',r);await this.audit(tx,a,'application_submitted',r);await this.event(tx,'application_submitted',r,association.data.email);return r;
  });}
  async revise(a:Actor,id:string,input:any) {return this.run(async tx=>{
    const r=await tx.get('application',text(id,100));check(r,'NOT_FOUND',404);const role=await this.authorize(tx,a,r.associationId!,r.companyId!,'submit');check(['company_admin','atlib_admin'].includes(role),'COMPANY_ROLE_REQUIRED',403);
    check(r.version===input.version,'VERSION_CONFLICT');check(r.data.state==='RETURNED','INVALID_TRANSITION');check(input.acceptedTerms===true,'CONSENT_REQUIRED',400);
    check((await tx.get('affiliation',key(r.associationId!,r.companyId!)))?.data.active,'AFFILIATION_REQUIRED');
    const before=structuredClone(r.data);const snapshot=await this.offer(tx,r.associationId!,r.companyId!,input.termsId,number(input.quantity,1,100000));
    r.version++;r.data={...r.data,state:'SUBMITTED',snapshot,service:snapshot.service,acceptedAt:this.now()};await tx.save('application',r);await this.audit(tx,a,'application_revised',r,before);await this.event(tx,'application_submitted',r,(await tx.get('association',r.associationId!))?.data.email);return r;
  });}
  async transition(a:Actor,id:string,input:any) {return this.run(async tx=>{
    const r=await tx.get('application',text(id,100));check(r,'NOT_FOUND',404);check(r.version===input.version,'VERSION_CONFLICT');const action=input.action;check(['return','cancel','note'].includes(action),'INVALID_ACTION',400);
    const role=await this.authorize(tx,a,r.associationId!,r.companyId!,action==='return'?'review':'read');
    if(action==='return')check(['association_admin','association_staff','atlib_admin'].includes(role),'ACCESS_DENIED',403);
    if(action==='note')check(role==='atlib_admin','ACCESS_DENIED',403);
    if(action!=='note')check(['SUBMITTED','RETURNED'].includes(r.data.state),'INVALID_TRANSITION');
    const before=structuredClone(r.data),reason=text(input.reason,1000);r.version++;if(action!=='note')r.data.state=action==='return'?'RETURNED':'CANCELLED';else r.data.supportNote=reason;
    await tx.save('application',r);await this.audit(tx,a,'application_'+action,r,before,reason);return r;
  });}
  async confirmOrder(a:Actor,id:string,input:any) {return this.run(async tx=>{
    const r=await tx.get('application',text(id,100));check(r,'NOT_FOUND',404);await this.authorize(tx,a,r.associationId!,r.companyId!,'order');
    check(!a.internal,'ASSOCIATION_APPROVAL_REQUIRED',403);check(input.mode===undefined||input.mode==='MANUAL','AUTO_NOT_ENABLED',400);
    const requestId=text(input.requestId,100);
    if(r.data.orderId){const o=await tx.get('order',r.data.orderId);check(o,'ORDER_INCONSISTENT');check(o.data.applicationVersion===input.version,'VERSION_CONFLICT');check(o.data.approvedBy===a.id&&o.data.requestId===requestId,'ALREADY_ORDERED');return o;}
    check(r.version===input.version,'VERSION_CONFLICT');check(r.data.state==='SUBMITTED','INVALID_TRANSITION');
    const association=await tx.get('association',r.associationId!);check(association?.data.active&&association.data.orderMode==='MANUAL','ORDER_MODE_UNAVAILABLE');check((await tx.get('affiliation',key(r.associationId!,r.companyId!)))?.data.active,'AFFILIATION_REQUIRED');
    const current=await this.offer(tx,r.associationId!,r.companyId!,r.data.snapshot.termsId,r.data.snapshot.quantity);check(same(current,r.data.snapshot),'TERMS_CHANGED');
    return this.finalizeOrder(tx,a,r,{mode:'MANUAL',ruleVersion:null,requestId});
  });}
  /** Single persistence boundary for validated approval decisions. Future AUTO policy
   * evaluation must call this same function after authorization; no AUTO entry exists now. */
  private async finalizeOrder(tx:Transaction,a:Actor,r:RecordRow,decision:{mode:'MANUAL'|'AUTO';ruleVersion:string|null;requestId:string}) {
    const o=row({number:'PO-'+randomUUID(),applicationId:r.id,applicationVersion:r.version,approvedBy:a.id,approvalMode:decision.mode,ruleVersion:decision.ruleVersion,receivedAt:this.now(),requestId:decision.requestId,snapshot:structuredClone(r.data.snapshot),service:r.data.service},r.associationId,r.companyId);
    await tx.save('order',o);const before=structuredClone(r.data);r.version++;r.data={...r.data,state:'ORDERED',orderId:o.id};await tx.save('application',r);await this.audit(tx,a,'order_confirmed',o);await this.audit(tx,a,'application_ordered',r,before);await this.event(tx,'order_confirmed',o);return o;
  }
  // Diagnostic completion has no runtime/public producer in Phase 1. An authenticated,
  // consent-aware source adapter must be reviewed before it may enqueue that event.
}
