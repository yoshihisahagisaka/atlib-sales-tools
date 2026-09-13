import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { DiagnosisError, responseSchema, type Actor } from '../domain/itManagementDiagnosis';
import { createIpRateLimiter } from '../middleware/rateLimit';
import type { ItManagementDiagnosisRepo } from '../services/itManagementDiagnosisRepo';

export const DIAGNOSIS_POLICY_NOTICE_VERSION = 'ITMGMT-DIAGNOSIS-NOTICE-2026-09-13-v1';
const webApplicationSchema = z.object({
  policyNoticeVersion: z.literal(DIAGNOSIS_POLICY_NOTICE_VERSION),
  policyAcknowledged: z.literal(true),
}).passthrough();

export type CompletionNotifier = (caseId: string) => Promise<void>;
export function diagnosisHandler(work: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try { await work(req, res); }
    catch (error) {
      if (error instanceof DiagnosisError) {
        res.status(error.status).json({ error: error.message, ...(error.questionCodes ? { questionCodes: error.questionCodes } : {}) });
      } else {
        // Never log the Error object: database errors may contain customer content.
        req.log?.error({ event: 'it_management_diagnosis_command_failed' }, 'Diagnosis operation failed');
        res.status(500).json({ error: '保存または読み込みに失敗しました。時間をおいて再度お試しください。' });
      }
    }
  };
}
export function caseId(req: Request): string {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) throw new DiagnosisError(400, '案件IDが無効です。');
  return parsed.data;
}
export function customerActor(req: Request): Actor {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization') ?? '');
  if (!match) throw new DiagnosisError(401, '有効な再開リンクが必要です。');
  return { kind: 'CUSTOMER', token: match[1]! };
}
export function staffActor(req: Request): Actor {
  if (!req.staffEmail) throw new DiagnosisError(401, 'スタッフ認証が必要です。');
  return { kind: 'STAFF', userId: req.staffEmail };
}
export function mountSurveyCommands(router: Router, repo: ItManagementDiagnosisRepo, actor: (req: Request) => Actor, notify?: CompletionNotifier): void {
  router.get('/cases/:id/survey', diagnosisHandler(async (req, res) => {
    res.json(await repo.getSurvey(caseId(req), actor(req)));
  }));
  router.post('/cases/:id/survey/start', diagnosisHandler(async (req, res) => {
    await repo.startSurvey(caseId(req), actor(req));
    res.status(204).end();
  }));
  router.put('/cases/:id/survey/responses/:questionCode', diagnosisHandler(async (req, res) => {
    const principal = actor(req);
    const parsed = responseSchema.safeParse(req.body);
    if (!parsed.success) throw new DiagnosisError(422, '回答の形式を確認してください。');
    await repo.submitResponse(caseId(req), req.params.questionCode!, parsed.data.questionVersion, parsed.data.rawValue, principal);
    res.status(204).end();
  }));
  router.post('/cases/:id/survey/complete', diagnosisHandler(async (req, res) => {
    const id = caseId(req);
    await repo.completeSurvey(id, actor(req));
    res.status(204).end();
    // Best effort, after commit and response. Failure cannot undo the completed survey.
    if (notify) void Promise.resolve().then(() => notify(id)).catch(() => {
      req.log?.warn({ event: 'it_management_diagnosis_notification_failed', caseId: id }, 'Diagnosis notification failed');
    });
  }));
}

export function createItManagementDiagnosisRouter(repo: ItManagementDiagnosisRepo, notify?: CompletionNotifier): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/cases', createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 }), diagnosisHandler(async (req, res) => {
    // Public callers cannot choose SALES_VISIT or provide a staff identity.
    const parsed = webApplicationSchema.safeParse(req.body);
    if (!parsed.success) throw new DiagnosisError(422, 'サービス内容とデータ利用について確認してからお申し込みください。');
    const { policyNoticeVersion, policyAcknowledged: _policyAcknowledged, ...application } = parsed.data;
    const created = await repo.createCase(application, 'WEB', { kind: 'CUSTOMER', token: '' });
    if (!('access_token' in created) || !created.access_token) throw new DiagnosisError(500, '申込処理を完了できませんでした。');
    await repo.recordPolicyAcknowledgement(created.id, policyNoticeVersion, 'WEB', { kind: 'CUSTOMER', token: created.access_token });
    res.status(201).json(created);
  }));
  router.use('/cases/:id', createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 300 }));
  mountSurveyCommands(router, repo, customerActor, notify);
  return router;
}
