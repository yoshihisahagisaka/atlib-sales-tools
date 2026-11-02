import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PiraAdminRepo, type ExportFormat } from '../piraAdmin/piraAdminRepo';
import { csv, xlsx } from '../piraAdmin/piraExport';

const state=z.enum(['RECEIVED','ANSWERING','COMPLETED']);
const kind=z.enum(['UNION','GENERAL']);
const query=z.object({initiativeCode:z.string().max(80).optional(),initiativeKind:kind.optional(),companyName:z.string().max(200).optional(),state:state.optional(),from:z.coerce.date().optional(),to:z.coerce.date().optional(),limit:z.coerce.number().int().min(1).max(200).default(50),offset:z.coerce.number().int().min(0).default(0)}).strict();
const exportBody=z.object({format:z.enum(['CSV','XLSX']),filters:z.object({initiativeCode:z.string().max(80).optional(),initiativeKind:kind.optional(),companyName:z.string().max(200).optional(),state:state.optional(),from:z.coerce.date().optional(),to:z.coerce.date().optional()}).strict()}).strict();
const initiative=z.object({code:z.string().trim().min(1).max(80),kind:z.enum(['UNION','GENERAL']),name:z.string().trim().min(1).max(200)}).strict();

function admin(req:Request,admins:ReadonlySet<string>){return admins.has((req.staffEmail??'').trim().toLowerCase());}
function fail(res:Response,error:unknown){const code=typeof error==='object'&&error&&'code'in error?String(error.code):'INTERNAL_ERROR';res.status(code==='EXPORT_LIMIT_EXCEEDED'?422:500).json({error:{code}});}

export function createAdminPiraRouter(repo:PiraAdminRepo,adminEmails:ReadonlySet<string>):Router{
 const router=Router();
 router.get('/permissions',(req,res)=>res.json({canExport:admin(req,adminEmails)}));
 router.get('/initiatives',async(_req,res)=>{try{res.json({items:await repo.initiatives()});}catch(e){fail(res,e);}});
 router.post('/initiatives',async(req,res)=>{if(!admin(req,adminEmails)){res.status(403).json({error:{code:'PIRA_ADMIN_REQUIRED'}});return;}const p=initiative.safeParse(req.body);if(!p.success){res.status(400).json({error:{code:'INVALID_REQUEST'}});return;}try{res.status(201).json(await repo.createInitiative(p.data));}catch(e){fail(res,e);}});
 router.patch('/initiatives/:id',async(req,res)=>{if(!admin(req,adminEmails)){res.status(403).json({error:{code:'PIRA_ADMIN_REQUIRED'}});return;}const p=z.object({active:z.boolean()}).strict().safeParse(req.body);if(!p.success||!z.string().uuid().safeParse(req.params.id).success){res.status(400).json({error:{code:'INVALID_REQUEST'}});return;}try{const item=await repo.setInitiativeActive(req.params.id!,p.data.active);if(!item){res.status(404).json({error:{code:'NOT_FOUND'}});return;}res.json(item);}catch(e){fail(res,e);}});
 router.get('/submissions',async(req,res)=>{const p=query.safeParse(req.query);if(!p.success){res.status(400).json({error:{code:'INVALID_REQUEST'}});return;}try{res.json(await repo.list(p.data));}catch(e){fail(res,e);}});
 router.get('/submissions/:id',async(req,res)=>{if(!z.string().uuid().safeParse(req.params.id).success){res.status(400).json({error:{code:'INVALID_REQUEST'}});return;}try{const item=await repo.detail(req.params.id!);if(!item){res.status(404).json({error:{code:'NOT_FOUND'}});return;}res.json(item);}catch(e){fail(res,e);}});
 router.post('/exports',async(req,res)=>{
  if(!admin(req,adminEmails)){res.status(403).json({error:{code:'PIRA_ADMIN_REQUIRED'}});return;}const p=exportBody.safeParse(req.body);if(!p.success){res.status(400).json({error:{code:'INVALID_REQUEST'}});return;}
  const actor=req.staffEmail!,format=p.data.format as ExportFormat,filters={...p.data.filters,limit:10000,offset:0}; let count=0; let codes:string[]=[];
  try{const rows=await repo.exportRows(filters);count=rows.length;codes=[...new Set(rows.map((row:any)=>row.initiative_code))] as string[];const output=format==='CSV'?csv(rows):await xlsx(rows);await repo.audit({actor,format,filters:p.data.filters,count,success:true,initiativeCodes:codes});res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition',`attachment; filename="pira-submissions.${format.toLowerCase()}"`);res.type(format==='CSV'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(output);}
  catch(error){try{await repo.audit({actor,format,filters:p.data.filters,count,success:false,failureCode:typeof error==='object'&&error&&'code'in error?String(error.code):'EXPORT_FAILED',initiativeCodes:codes});}catch{res.status(500).json({error:{code:'EXPORT_AUDIT_FAILED'}});return;}fail(res,error);}
 });
 router.get('/retention-candidates',async(req,res)=>{if(!admin(req,adminEmails)){res.status(403).json({error:{code:'PIRA_ADMIN_REQUIRED'}});return;}try{res.json(await repo.retentionCandidates());}catch(e){fail(res,e);}});
 return router;
}
