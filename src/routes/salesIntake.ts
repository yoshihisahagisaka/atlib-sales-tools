import {Router} from 'express';
import {z} from 'zod';
import {DiagnosisError,SURVEY_QUESTIONS} from '../domain/itManagementDiagnosis';
import {SalesIntakeRepo} from '../services/salesIntakeRepo';
import {caseId,diagnosisHandler,staffActor} from './itManagementDiagnosis';
export function createSalesIntakeRouter(repo:SalesIntakeRepo){
 const r=Router();
 r.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!req.staffEmail){res.status(401).json({error:'スタッフ認証が必要です。'});return;}if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.get('sec-fetch-site')==='cross-site'||req.get('x-diagnosis-command')!=='1')){res.status(403).json({error:'管理画面から操作してください。'});return;}next();});
 r.get('/sales-intakes/questions',diagnosisHandler(async(_req,res)=>{res.json({questions:SURVEY_QUESTIONS});}));
 r.get('/sales-intakes',diagnosisHandler(async(req,res)=>{res.json({items:await repo.list(staffActor(req))});}));
 r.post('/sales-intakes',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.save(staffActor(req),req.body));}));
 r.get('/sales-intakes/:id',diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 r.put('/sales-intakes/:id',diagnosisHandler(async(req,res)=>{const p=z.object({expectedVersion:z.number().int().positive(),record:z.unknown()}).strict().safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'保存内容を確認してください。');res.json(await repo.save(staffActor(req),p.data.record,caseId(req),p.data.expectedVersion));}));
 r.post('/sales-intakes/:id/consent-and-start',diagnosisHandler(async(req,res)=>{res.json(await repo.consentAndStart(caseId(req),staffActor(req),req.body));}));
 r.get('/cases/:id/sales-conversation',diagnosisHandler(async(req,res)=>{res.json({record:await repo.forCase(caseId(req),staffActor(req))});}));
 return r;
}
