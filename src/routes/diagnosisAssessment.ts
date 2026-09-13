import {Router} from 'express';
import {assessmentCommandSchema,handoffCommandSchema} from '../domain/diagnosisAssessment';
import {DiagnosisError} from '../domain/itManagementDiagnosis';
import type {DiagnosisAssessmentRepo} from '../services/diagnosisAssessmentRepo';
import {caseId,diagnosisHandler,staffActor} from './itManagementDiagnosis';
export function createDiagnosisAssessmentRouter(repo:DiagnosisAssessmentRepo){const router=Router(),base='/cases/:id';
 router.get(base+'/assessment',diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 for(const action of ['propose','pending','accept','decline'] as const)router.post(base+'/assessment/'+action,diagnosisHandler(async(req,res)=>{const p=assessmentCommandSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');await repo.lifecycle(caseId(req),staffActor(req),action,p.data.expectedVersion,p.data.reason);res.status(204).end();}));
 router.post(base+'/assessment/handoff/generate',diagnosisHandler(async(req,res)=>{const p=assessmentCommandSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');res.status(201).json(await repo.generate(caseId(req),staffActor(req),p.data.expectedVersion,p.data.reason));}));
 router.post(base+'/assessment/handoff/transfer',diagnosisHandler(async(req,res)=>{const p=handoffCommandSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');await repo.transfer(caseId(req),staffActor(req),p.data.handoff_id,p.data.expectedVersion,p.data.reason);res.status(204).end();}));
 router.post(base+'/close',diagnosisHandler(async(req,res)=>{const p=assessmentCommandSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');await repo.close(caseId(req),staffActor(req),p.data.expectedVersion,p.data.reason);res.status(204).end();}));return router;
}
