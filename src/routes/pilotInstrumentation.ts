import {Router} from 'express';
import type {PilotInstrumentationRepo} from '../services/pilotInstrumentationRepo';
import {caseId,diagnosisHandler,staffActor} from './itManagementDiagnosis';

export function createPilotInstrumentationRouter(repo:PilotInstrumentationRepo){
 const router=Router();
 router.get('/cases/:id/pilot-instrumentation',diagnosisHandler(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json(await repo.read(caseId(req),staffActor(req)));
 }));
 return router;
}
