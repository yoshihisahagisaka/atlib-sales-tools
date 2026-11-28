import { Router } from 'express';
import { z } from 'zod';
import { generalKinds, generalSalesStates, type SecumieGeneralAdminRepo } from '../services/secumieGeneralAdminRepo';

const kind=z.enum(generalKinds);
const salesStatus=z.enum(generalSalesStates);
const filters=z.object({kind,companyName:z.string().trim().max(150).optional(),diagnosisStatus:z.enum(['RECEIVED','COMPLETED','FAILED']).optional(),consultationStatus:z.enum(['NONE','REQUESTED']).optional(),salesStatus:salesStatus.optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict();
const key=z.object({kind,id:z.string().uuid()}).strict();
const edit=z.object({status:salesStatus,note:z.string().trim().max(2000)}).strict();
export function createAdminSecumieGeneralRouter(repo:Pick<SecumieGeneralAdminRepo,'list'|'detail'|'updateSales'>):Router{
 const router=Router();
 router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(!req.staffEmail){res.status(401).json({code:'STAFF_AUTH_REQUIRED'});return;}
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.get('sec-fetch-site')==='cross-site'||req.get('x-secumie-staff-command')!=='1')){res.status(403).json({code:'STAFF_COMMAND_REQUIRED'});return;}
  next();
 });
 router.get('/leads',async(req,res)=>{
  const p=filters.safeParse(req.query);
  if(!p.success){res.status(400).json({code:'INVALID_REQUEST'});return;}
  try{res.json(await repo.list(p.data));}catch{res.status(503).json({code:'SERVICE_UNAVAILABLE'});}
 });
 router.get('/leads/:kind/:id',async(req,res)=>{
  const p=key.safeParse(req.params);
  if(!p.success){res.status(400).json({code:'INVALID_REQUEST'});return;}
  try{const row=await repo.detail(p.data.kind,p.data.id);if(!row){res.sendStatus(404);return;}res.json(row);}catch{res.status(503).json({code:'SERVICE_UNAVAILABLE'});}
 });
 router.patch('/leads/:kind/:id/sales',async(req,res)=>{
  const p=key.safeParse(req.params),v=edit.safeParse(req.body);
  if(!p.success||!v.success){res.status(400).json({code:'INVALID_REQUEST'});return;}
  try{const changed=await repo.updateSales(p.data.kind,p.data.id,{...v.data,actor:req.staffEmail!});res.sendStatus(changed?204:404);}catch{res.status(503).json({code:'SERVICE_UNAVAILABLE'});}
 });
 return router;
}
