import { Router } from 'express';
import { z } from 'zod';
import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { confirmSchema,humanThemeSchema,humanPlanSchema } from '../domain/diagnosisPreparation';
import { reconfirmFutureSchema,resolutionSchema,type SourceType } from '../domain/diagnosisWorkspace';
import type { DiagnosisWorkspaceRepo } from '../services/diagnosisWorkspaceRepo';
import type { InterviewProvider } from '../services/interviewAssistantProvider';
import type { InterviewAssistantWorker } from '../services/interviewAssistantWorker';
import { caseId,diagnosisHandler,staffActor } from './itManagementDiagnosis';
export interface WorkspaceServices {repo:DiagnosisWorkspaceRepo;provider:InterviewProvider;worker:InterviewAssistantWorker}
function parse<T>(schema:z.ZodType<T,any,any>,raw:unknown):T {const p=schema.safeParse(raw);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');return p.data;}
export function createDiagnosisWorkspaceRouter({repo,provider,worker}:WorkspaceServices) {
 const router=Router();const base='/cases/:id';
 router.get(base+'/workspace',diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 router.post(base+'/progressive-reuse/plan-items/:planId/statements',diagnosisHandler(async(req,res)=>{
  res.status(201).json(await repo.addSource(caseId(req),staffActor(req),'INTERVIEW_STATEMENT',req.body,parse(z.string().uuid(),req.params.planId)));
 }));
 for(const [path,action] of [['start','START'],['finish','FINISH']] as const)router.post(base+'/diagnosis/'+path,diagnosisHandler(async(req,res)=>{
  const p=parse(confirmSchema,req.body);await repo.transition(caseId(req),staffActor(req),action,p.expectedVersion);res.status(204).end();
 }));
 const sources:Record<string,SourceType>={'interview-statements':'INTERVIEW_STATEMENT','operator-notes':'OPERATOR_NOTE','transcripts':'TRANSCRIPT','screen-shared-information':'SCREEN_SHARED_INFORMATION','evidence-existence':'DOCUMENT_EXISTENCE_OBSERVED'};
 for(const [path,type] of Object.entries(sources))router.post(base+'/sources/'+path,diagnosisHandler(async(req,res)=>{
  res.status(201).json(await repo.addSource(caseId(req),staffActor(req),type,req.body));
 }));
 router.post(base+'/future/reconfirm',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.reconfirm(caseId(req),staffActor(req),parse(reconfirmFutureSchema,req.body)));}));
 router.post(base+'/interview-assistant/run',diagnosisHandler(async(req,res)=>{
  parse(z.object({}).strict(),req.body??{});res.status(202).json(await repo.enqueue(caseId(req),staffActor(req),provider.provider,provider.model));
  void worker.tick().catch(()=>req.log?.warn({event:'interview_worker_failed'},'Interview worker failed'));
 }));
 router.post(base+'/interview-assistant/proposals/:proposalId/resolve',diagnosisHandler(async(req,res)=>{
  await repo.resolve(caseId(req),parse(z.string().uuid(),req.params.proposalId),staffActor(req),parse(resolutionSchema,req.body).action);res.status(204).end();
 }));
 router.post(base+'/workspace/themes',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.addHumanItem(caseId(req),staffActor(req),'theme',parse(humanThemeSchema,req.body)));}));
 router.post(base+'/workspace/plan-items',diagnosisHandler(async(req,res)=>{res.status(201).json(await repo.addHumanItem(caseId(req),staffActor(req),'plan',parse(humanPlanSchema,req.body)));}));
 return router;
}
