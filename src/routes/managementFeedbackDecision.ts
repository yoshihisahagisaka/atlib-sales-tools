import { Router } from 'express';
import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { managementFeedbackDecisionSchema } from '../domain/managementFeedback';
import type { ManagementFeedbackDecisionRepo } from '../services/managementFeedbackDecisionRepo';
import { caseId,diagnosisHandler,staffActor } from './itManagementDiagnosis';

export function createManagementFeedbackDecisionRouter(repo:ManagementFeedbackDecisionRepo){
 const router=Router(),base='/cases/:id/feedback/decision';
 router.get(base,diagnosisHandler(async(req,res)=>{res.json(await repo.read(caseId(req),staffActor(req)));}));
 router.post(base,diagnosisHandler(async(req,res)=>{const parsed=managementFeedbackDecisionSchema.safeParse(req.body);if(!parsed.success)throw new DiagnosisError(422,'Management Feedback判断の入力内容を確認してください。');res.status(201).json(await repo.decide(caseId(req),staffActor(req),parsed.data));}));
 return router;
}
