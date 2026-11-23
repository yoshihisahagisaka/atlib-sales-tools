import { Router } from 'express';
import { z } from 'zod';
import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { confirmSchema } from '../domain/diagnosisPreparation';
import { reportCommandSchema,revisionSchema,reissueSchema } from '../domain/diagnosisReport';
import type { DiagnosisReportRepo } from '../services/diagnosisReportRepo';
import type { ReportDraftProvider } from '../services/reportDraftProvider';
import type { ReportDraftWorker } from '../services/reportDraftWorker';
import { caseId,diagnosisHandler,staffActor } from './itManagementDiagnosis';
export interface ReportServices {repo:DiagnosisReportRepo;provider:ReportDraftProvider;worker:ReportDraftWorker}
function parse<T>(schema:z.ZodType<T,any,any>,raw:unknown):T{const p=schema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');return p.data;}
export function createDiagnosisReportRouter({repo,provider,worker}:ReportServices){const router=Router(),base='/cases/:id';
 router.get(base+'/report',diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 router.post(base+'/report/ai/run',diagnosisHandler(async(req,res)=>{parse(z.object({}).strict(),req.body??{});res.status(202).json(await repo.enqueue(caseId(req),staffActor(req),provider.provider,provider.model));void worker.tick().catch(()=>req.log?.warn({event:'report_worker_failed'},'Report worker failed'));}));
 router.post(base+'/report/manual',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.manual(caseId(req),staffActor(req),parse(confirmSchema,req.body).expectedVersion));}));
 router.post(base+'/report/wording',diagnosisHandler(async(req,res)=>{await repo.wording(caseId(req),staffActor(req),req.body);res.status(204).end();}));
 router.post(base+'/report/revision-request',diagnosisHandler(async(req,res)=>{const p=parse(revisionSchema,req.body);await repo.revision(caseId(req),staffActor(req),p.report_id,p.expectedVersion,p.reason,p.return_to_review);res.status(204).end();}));
 for(const action of ['approve','deliver'] as const)router.post(base+'/report/'+action,diagnosisHandler(async(req,res)=>{const p=parse(reportCommandSchema,req.body);await repo[action](caseId(req),staffActor(req),p.report_id,p.expectedVersion);res.status(204).end();}));
 router.post(base+'/report/reissue',diagnosisHandler(async(req,res)=>{const p=parse(reissueSchema,req.body);res.status(201).json(await repo.reissue(caseId(req),staffActor(req),p.expectedVersion,p.reason));}));
 router.post(base+'/feedback/start',diagnosisHandler(async(req,res)=>{await repo.startFeedback(caseId(req),staffActor(req),parse(confirmSchema,req.body).expectedVersion);res.status(204).end();}));
 router.post(base+'/feedback/statements',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.feedbackStatement(caseId(req),staffActor(req),req.body));}));
 router.post(base+'/feedback/complete',diagnosisHandler(async(req,res)=>{await repo.completeFeedback(caseId(req),staffActor(req),parse(confirmSchema,req.body).expectedVersion);res.status(204).end();}));return router;
}
