import { Router } from 'express';
import { z } from 'zod';
import { DIAGNOSIS_STATUSES, DiagnosisError } from '../domain/itManagementDiagnosis';
import type { ItManagementDiagnosisRepo } from '../services/itManagementDiagnosisRepo';
import { caseId, diagnosisHandler, mountSurveyCommands, staffActor, type CompletionNotifier } from './itManagementDiagnosis';
import { createDiagnosisPreparationRouter, type PreparationServices } from './diagnosisPreparation';
import { createDiagnosisWorkspaceRouter, type WorkspaceServices } from './diagnosisWorkspace';

// Mounted behind the existing Google Workspace auth and rate-limit gate.
export function createAdminItManagementDiagnosisRouter(repo: ItManagementDiagnosisRepo, notify?: CompletionNotifier, preparation?: PreparationServices, workspace?: WorkspaceServices): Router {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.staffEmail) { res.status(401).json({ error: 'スタッフ認証が必要です。' }); return; }
    // Cookie-authenticated mutations must originate from the staff UI.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && (req.get('sec-fetch-site') === 'cross-site' || req.get('x-diagnosis-command') !== '1')) {
      res.status(403).json({ error: '管理画面から操作してください。' }); return;
    }
    next();
  });
  router.get('/cases', diagnosisHandler(async (req, res) => {
    const parsed = z.object({ status: z.enum(DIAGNOSIS_STATUSES).optional(), entryChannel: z.enum(['WEB','SALES_VISIT']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(1000000).default(0) }).strict().safeParse(req.query);
    if (!parsed.success) throw new DiagnosisError(400, '絞り込み条件を確認してください。');
    res.json(await repo.listCases(parsed.data));
  }));
  router.post('/cases', diagnosisHandler(async (req, res) => {
    res.status(201).json(await repo.createCase(req.body, 'SALES_VISIT', staffActor(req)));
  }));
  router.get('/cases/:id/overview', diagnosisHandler(async (req, res) => {
    res.json(await repo.getSurvey(caseId(req), staffActor(req)));
  }));
  router.post('/cases/:id/access/revoke', diagnosisHandler(async (req, res) => {
    await repo.revokeAccessToken(caseId(req), staffActor(req));
    res.status(204).end();
  }));
  if (preparation) router.use(createDiagnosisPreparationRouter(preparation));
  if (workspace) router.use(createDiagnosisWorkspaceRouter(workspace));
  mountSurveyCommands(router, repo, staffActor, notify);
  return router;
}
