import { Router } from 'express';
import { z } from 'zod';
import { DiagnosisError } from '../domain/itManagementDiagnosis';
import { humanThemeSchema, humanPlanSchema, orderSchema, confirmSchema } from '../domain/diagnosisPreparation';
import type { DiagnosisPreparationRepo } from '../services/diagnosisPreparationRepo';
import type { AIProvider } from '../services/preDiagnosisProvider';
import type { PreDiagnosisWorker } from '../services/preDiagnosisWorker';
import { caseId, diagnosisHandler, staffActor } from './itManagementDiagnosis';

export interface PreparationServices { repo: DiagnosisPreparationRepo; provider: AIProvider; worker: PreDiagnosisWorker }
const uuid = (value: unknown) => {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw new DiagnosisError(400,'IDを確認してください。'); return result.data;
};
function parse<T>(schema: z.ZodType<T,any,any>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DiagnosisError(422,'入力内容を確認してください。'); return result.data;
}
// Mounted after the existing staff and command-header gates, never publicly.
export function createDiagnosisPreparationRouter(services: PreparationServices) {
  const { repo,provider,worker } = services;
  const router = Router();
  const prefix = '/cases/:id/preparation';
  router.get('/cases/:id/progressive-reuse',diagnosisHandler(async(req,res)=>{res.json(await repo.readReuse(caseId(req),staffActor(req)));}));
  router.post('/cases/:id/progressive-reuse/select',diagnosisHandler(async(req,res)=>{
    const p=parse(z.object({candidateKey:z.string().min(1).max(200),expectedVersion:z.number().int().positive(),plan:humanPlanSchema}).strict(),req.body);
    res.status(201).json(await repo.selectReuse(caseId(req),staffActor(req),p.candidateKey,p.expectedVersion,p.plan));
  }));
  router.get(prefix,diagnosisHandler(async (req,res) => { res.json(await repo.read(caseId(req),staffActor(req))); }));
  router.post(prefix+'/ai/run',diagnosisHandler(async (req,res) => {
    const execution = await repo.enqueue(caseId(req),staffActor(req),provider.provider,provider.model);
    res.status(202).json(execution);
    void worker.tick().catch(() => req.log?.warn({ event: 'preparation_worker_failed' },'Preparation worker failed'));
  }));
  router.post(prefix+'/start',diagnosisHandler(async (req,res) => { await repo.start(caseId(req),staffActor(req)); res.status(204).end(); }));
  router.post(prefix+'/proposals/:proposalId/accept',diagnosisHandler(async (req,res) => {
    parse(z.object({}).strict(),req.body ?? {});
    res.status(201).json(await repo.accept(caseId(req),uuid(req.params.proposalId),staffActor(req)));
  }));
  router.post(prefix+'/proposals/:proposalId/accept-with-edit',diagnosisHandler(async (req,res) => {
    const edit = parse(z.union([humanThemeSchema,humanPlanSchema]),req.body);
    res.status(201).json(await repo.accept(caseId(req),uuid(req.params.proposalId),staffActor(req),edit));
  }));
  router.post(prefix+'/proposals/:proposalId/reject',diagnosisHandler(async (req,res) => {
    await repo.reject(caseId(req),uuid(req.params.proposalId),staffActor(req)); res.status(204).end();
  }));
  router.post(prefix+'/themes',diagnosisHandler(async (req,res) => { res.status(201).json(await repo.addTheme(caseId(req),staffActor(req),parse(humanThemeSchema,req.body))); }));
  router.post(prefix+'/plan-items',diagnosisHandler(async (req,res) => { res.status(201).json(await repo.addPlan(caseId(req),staffActor(req),parse(humanPlanSchema,req.body))); }));
  for (const kind of ['themes','plan-items'] as const) {
    router.post(prefix+'/'+kind+'/:itemId/update',diagnosisHandler(async (req,res) => {
      const input = kind === 'themes' ? parse(humanThemeSchema,req.body) : parse(humanPlanSchema,req.body);
      await repo.update(caseId(req),uuid(req.params.itemId),staffActor(req),kind,input); res.status(204).end();
    }));
    router.post(prefix+'/'+kind+'/:itemId/remove',diagnosisHandler(async (req,res) => {
      await repo.remove(caseId(req),uuid(req.params.itemId),staffActor(req),kind); res.status(204).end();
    }));
  }
  router.post(prefix+'/order',diagnosisHandler(async (req,res) => {
    const input = parse(orderSchema,req.body); await repo.reorder(caseId(req),staffActor(req),input.theme_ids,input.plan_item_ids); res.status(204).end();
  }));
  router.post(prefix+'/confirm',diagnosisHandler(async (req,res) => {
    const input = parse(confirmSchema,req.body); await repo.confirm(caseId(req),staffActor(req),input.expectedVersion); res.status(204).end();
  }));
  return router;
}
