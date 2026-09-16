import { Router } from 'express';
import type { AssessmentScopeContextRepo } from '../services/assessmentScopeContextRepo';
import { caseId, diagnosisHandler, staffActor } from './itManagementDiagnosis';

export function createAssessmentScopeContextRouter(repo:AssessmentScopeContextRepo):Router {
  const router=Router();
  router.get('/cases/:id/assessment-scope-context',diagnosisHandler(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json(await repo.read(caseId(req),staffActor(req)));
  }));
  return router;
}
