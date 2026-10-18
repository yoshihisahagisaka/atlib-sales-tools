import { Router, RequestHandler, ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { PiraError, Kind, check } from './model';
import { PiraService } from './service';
import { ExternalAuthConfig, internalActor, externalSessionView, clearExternalSession } from './auth';

const id=z.string().uuid(),str=z.string().trim().min(1).max(200),mail=z.string().email().max(254),quantity=z.number().int().min(1).max(100000),money=z.number().int().min(0).max(1000000000);
const submit=z.object({associationId:id,companyId:id,termsId:id,quantity,acceptedTerms:z.literal(true),requestId:str,note:z.string().max(1000).optional()}).strict();
const revise=z.object({version:z.number().int().positive(),termsId:id,quantity,acceptedTerms:z.literal(true)}).strict();
const transition=z.object({version:z.number().int().positive(),action:z.enum(['return','cancel','note']),reason:z.string().min(1).max(1000)}).strict();
const order=z.object({version:z.number().int().positive(),requestId:str,mode:z.literal('MANUAL').optional()}).strict();
const association=z.object({id,version:z.number().int().positive().optional(),name:str,email:mail,contactName:str,phone:z.string().max(40).optional(),active:z.boolean().optional(),mode:z.literal('MANUAL').optional()}).strict();
const grant=z.object({email:mail,role:z.enum(['atlib_admin','association_admin','association_staff','company_admin']),associationId:id.optional(),companyId:id.optional(),active:z.boolean().optional(),canOrder:z.boolean().optional()}).strict();
const resolve=z.object({associationId:id,companyId:id.optional(),name:str.optional(),corporateNumber:z.string().max(30).optional(),verifiedReference:str.optional(),evidence:z.string().min(1).max(1000),contactName:str,contactEmail:mail,active:z.boolean().optional()}).strict();
const link=z.object({companyId:id,service:z.enum(['GUARD','SEND','INFRAVISION']),environment:str,externalId:str,customerCode:z.string().max(20).optional(),evidence:z.string().min(1).max(1000)}).strict();
const terms=z.object({associationId:id,companyId:id.optional(),service:z.enum(['GUARD','SEND','INFRAVISION']),estimateId:id.optional(),label:str,baseMonthlyYen:money,unitMonthlyYen:money,initialYen:money,minQuantity:quantity,maxQuantity:quantity,conditions:z.string().min(1).max(3000)}).strict();
const asyncRoute=(fn:(q:any,s:any)=>Promise<unknown>):RequestHandler=>(q,s,n)=>{void fn(q,s).catch(n);};
export function piraApi(service:PiraService,internal:boolean,authConfig?:ExternalAuthConfig,origin?:string):Router {
  const r=Router();r.use((_q,s,n)=>{s.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');n();});
  if(internal)r.use((q,s,n)=>{try{s.locals.piraActor=internalActor(q.staffEmail);if(!['GET','HEAD'].includes(q.method))check(q.get('origin')===origin&&q.get('x-pira-request')==='1','CSRF_REJECTED',403);n();}catch(e){n(e);}});
  const actor=(s:any)=>s.locals.piraActor;
  r.get('/session',asyncRoute(async(q,s)=>s.json({...await service.session(actor(s)),...(!internal&&authConfig?externalSessionView(authConfig,q):{})})));
  if(!internal&&authConfig)r.post('/logout',asyncRoute(async(_q,s)=>{clearExternalSession(s,authConfig);s.json({ok:true});}));
  r.get('/records/:kind',asyncRoute(async(q,s)=>s.json(await service.list(actor(s),q.params.kind as Kind,typeof q.query.associationId==='string'?q.query.associationId:undefined,typeof q.query.companyId==='string'?q.query.companyId:undefined))));
  r.get('/applications/:id',asyncRoute(async(q,s)=>s.json(await service.detail(actor(s),'application',q.params.id))));
  r.get('/applications/:id/history',asyncRoute(async(q,s)=>s.json(await service.history(actor(s),q.params.id))));
  r.get('/orders/:id',asyncRoute(async(q,s)=>s.json(await service.detail(actor(s),'order',q.params.id))));
  r.post('/applications',asyncRoute(async(q,s)=>s.status(201).json(await service.submit(actor(s),submit.parse(q.body)))));
  r.post('/applications/:id/revise',asyncRoute(async(q,s)=>s.json(await service.revise(actor(s),q.params.id,revise.parse(q.body)))));
  r.post('/applications/:id/transition',asyncRoute(async(q,s)=>s.json(await service.transition(actor(s),q.params.id,transition.parse(q.body)))));
  r.post('/applications/:id/order',asyncRoute(async(q,s)=>s.json(await service.confirmOrder(actor(s),q.params.id,order.parse(q.body)))));
  if(internal){
    r.post('/associations',asyncRoute(async(q,s)=>s.json(await service.saveAssociation(actor(s),association.parse(q.body)))));
    r.post('/memberships',asyncRoute(async(q,s)=>s.json(await service.grant(actor(s),grant.parse(q.body)))));
    r.get('/companies',asyncRoute(async(q,s)=>s.json(await service.searchCompanies(actor(s),String(q.query.q??'')))));
    r.post('/companies/resolve',asyncRoute(async(q,s)=>s.json(await service.resolveCompany(actor(s),resolve.parse(q.body)))));
    r.post('/external-links',asyncRoute(async(q,s)=>s.json(await service.linkExternal(actor(s),link.parse(q.body)))));
    r.post('/terms',asyncRoute(async(q,s)=>s.status(201).json(await service.approveTerms(actor(s),terms.parse(q.body)))));
  }
  return r;
}
export const piraErrors:ErrorRequestHandler=(e,_q,s,_n)=>{
  if(e instanceof PiraError){s.status(e.status).json({error:e.code});return;}
  if(e instanceof z.ZodError){s.status(400).json({error:'INVALID_INPUT'});return;}
  // No SQL, OAuth tokens, request bodies, or secrets in error responses/logs.
  s.status(500).json({error:'PIRA_REQUEST_FAILED'});
};
