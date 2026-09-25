import {Router} from 'express';
import {z} from 'zod';
import {DiagnosisError} from '../domain/itManagementDiagnosis';
import {DiagnosisHearingRepo} from '../services/diagnosisHearingRepo';
import {caseId,diagnosisHandler,staffActor} from './itManagementDiagnosis';
const body=z.object({questionCode:z.string().min(1).max(100),questionVersion:z.number().int().positive(),expectedVersion:z.number().int().positive().nullable(),answer:z.union([z.string(),z.array(z.string()),z.null()]),statement:z.string().max(4000),unknownNote:z.string().max(4000),reason:z.string().max(1000).optional()}).strict();
export function createDiagnosisHearingRouter(repo:DiagnosisHearingRepo){const r=Router();
 r.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!req.staffEmail){res.status(401).json({error:'スタッフ認証が必要です。'});return;}if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.get('sec-fetch-site')==='cross-site'||req.get('x-diagnosis-command')!=='1')){res.status(403).json({error:'管理画面から操作してください。'});return;}next();});
 r.get('/cases/:id/hearing',diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 r.get('/cases/:id/hearing/:questionCode/revisions',diagnosisHandler(async(req,res)=>{res.json({items:await repo.revisions(caseId(req),req.params.questionCode!,staffActor(req))});}));
 r.put('/cases/:id/hearing',diagnosisHandler(async(req,res)=>{const p=body.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'ヒアリング記録の入力を確認してください。');res.json(await repo.save(caseId(req),staffActor(req),p.data));}));
 return r;
}
