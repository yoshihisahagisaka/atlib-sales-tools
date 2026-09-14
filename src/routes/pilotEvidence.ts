import { Router } from 'express';
import { z } from 'zod';
import { PilotEvidenceRepo } from '../services/pilotEvidenceRepo';

const code=z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/);
const codes=z.array(code).max(30);
const inputSchema=z.object({
  customer_segment:code,
  entry_trigger:code,
  future_theme_code:code,
  completion_status:z.enum(['IN_PROGRESS','COMPLETED','ABANDONED']),
  confusing_question_codes:codes,
  unknown_pattern_codes:codes,
  operator_correction_categories:codes,
  ai_misclassification_categories:codes,
  management_feedback_reaction:z.enum(['POSITIVE','NEUTRAL','NEGATIVE','NOT_OBSERVED']),
  assessment_need_understood:z.enum(['YES','NO','UNCLEAR','NOT_ASKED']),
  next_action_code:code,
  customer_feedback_signal:z.enum(['POSITIVE','NEUTRAL','NEGATIVE','NONE']),
}).strict();
const caseSchema=z.string().uuid();

export function createPilotEvidenceRouter(repo:PilotEvidenceRepo){
  const router=Router();
  router.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(!req.staffEmail){res.status(401).json({error:'スタッフ認証が必要です。'});return;}
    if(!['GET','HEAD','OPTIONS'].includes(req.method)
      && (req.get('sec-fetch-site')==='cross-site'||req.get('x-diagnosis-command')!=='1')){
      res.status(403).json({error:'管理画面から操作してください。'});return;
    }
    next();
  });
  router.get('/cases/:id/pilot-evidence',async(req,res,next)=>{
    try{
      const id=caseSchema.parse(req.params.id);
      res.json({items:await repo.list(id)});
    }catch(error){next(error);}
  });
  router.post('/cases/:id/pilot-evidence',async(req,res,next)=>{
    try{
      const id=caseSchema.parse(req.params.id);
      const input=inputSchema.parse(req.body);
      res.status(201).json(await repo.record(id,req.staffEmail!,input));
    }catch(error){next(error);}
  });
  return router;
}
