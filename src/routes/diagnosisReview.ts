import { Router } from 'express';
import { z } from 'zod';
import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { assessmentInputSchema,reasonSchema,editReviewSchema,convertUnknownSchema,completeReviewSchema } from '../domain/diagnosisReview';
import type { DiagnosisReviewRepo } from '../services/diagnosisReviewRepo';
import type { PostDiagnosisProvider } from '../services/postDiagnosisProvider';
import type { PostDiagnosisWorker } from '../services/postDiagnosisWorker';
import { caseId,diagnosisHandler,staffActor } from './itManagementDiagnosis';
export interface ReviewServices {repo:DiagnosisReviewRepo;provider:PostDiagnosisProvider;worker:PostDiagnosisWorker}
function parse<T>(schema:z.ZodType<T,any,any>,raw:unknown):T{const p=schema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');return p.data;}
export function createDiagnosisReviewRouter({repo,provider,worker}:ReviewServices){
 const router=Router(),base='/cases/:id/review';
 router.get(base,diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 router.get(base+'/analysis',diagnosisHandler(async(req,res)=>{res.json(await repo.analysis(caseId(req),staffActor(req)));}));
 router.get(base+'/approved-context',diagnosisHandler(async(req,res)=>{res.json(await repo.reportContext(caseId(req),staffActor(req)));}));
 router.post(base+'/ai/run',diagnosisHandler(async(req,res)=>{parse(z.object({}).strict(),req.body??{});res.status(202).json(await repo.enqueue(caseId(req),staffActor(req),provider.provider,provider.model));void worker.tick().catch(()=>req.log?.warn({event:'post_diagnosis_worker_failed'},'Post diagnosis worker failed'));}));
 for(const [path,action] of [['approve','APPROVE'],['reject','REJECT']] as const)router.post(base+'/proposals/:proposalId/'+path,diagnosisHandler(async(req,res)=>{const input=parse(reasonSchema,req.body??{});const result=await repo.resolve(caseId(req),parse(z.string().uuid(),req.params.proposalId),staffActor(req),action,input.reason);res.status(result?201:204);if(result)res.json(result);else res.end();}));
 router.post(base+'/proposals/:proposalId/approve-with-edit',diagnosisHandler(async(req,res)=>{const p=parse(editReviewSchema,req.body);res.status(201).json(await repo.resolve(caseId(req),parse(z.string().uuid(),req.params.proposalId),staffActor(req),'APPROVE_WITH_EDIT',p.reason,p.insight));}));
 router.post(base+'/proposals/:proposalId/convert-to-unknown',diagnosisHandler(async(req,res)=>{const p=parse(convertUnknownSchema,req.body);res.status(201).json(await repo.resolve(caseId(req),parse(z.string().uuid(),req.params.proposalId),staffActor(req),'CONVERT_TO_UNKNOWN',p.reason,undefined,p.unknown_type));}));
 router.post(base+'/insights',diagnosisHandler(async(req,res)=>{const p=parse(editReviewSchema,req.body);res.status(201).json(await repo.createInsight(caseId(req),staffActor(req),p.insight,p.reason));}));
 router.post(base+'/insights/:insightId/supersede',diagnosisHandler(async(req,res)=>{const p=parse(editReviewSchema,req.body);res.status(201).json(await repo.supersede(caseId(req),parse(z.string().uuid(),req.params.insightId),staffActor(req),p.insight,p.reason));}));
 router.post(base+'/assessment-confirmation-items',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.createAssessment(caseId(req),staffActor(req),parse(assessmentInputSchema,req.body)));}));
 router.post(base+'/complete',diagnosisHandler(async(req,res)=>{const p=parse(completeReviewSchema,req.body);await repo.complete(caseId(req),staffActor(req),p.expectedVersion,p.leave_unreviewed);res.status(204).end();}));
 return router;
}
