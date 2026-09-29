import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { applicationSchema, DiagnosisError, responseSchema, type Actor } from '../domain/itManagementDiagnosis';
import { createIpRateLimiter } from '../middleware/rateLimit';
import type { ItManagementDiagnosisRepo } from '../services/itManagementDiagnosisRepo';
import type { StaffAuthService } from '../services/staffAuthService';
import { COOKIE_NAME as STAFF_SESSION_COOKIE_NAME } from '../middleware/staffAuth';

export const DIAGNOSIS_POLICY_NOTICE_VERSION = 'ITMGMT-DIAGNOSIS-NOTICE-2026-09-13-v1';
const webApplicationSchema = z.object({
  policyNoticeVersion: z.literal(DIAGNOSIS_POLICY_NOTICE_VERSION),
  policyAcknowledged: z.literal(true),
  hp: z.string().max(200).optional(),
}).passthrough();
const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const LP_ORIGIN = 'https://www.atlib.jp';
// allowedOrigins lets a test harness add its own real (ephemeral-port) origin
// alongside the fixed production LP origin, since a real browser's Origin header
// cannot be spoofed to match a hardcoded string. Production never overrides this,
// so it always resolves to exactly [LP_ORIGIN] there.
function allowPublicLpOrigin(req: Request, res: Response, allowedOrigins: readonly string[]): boolean {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  return true;
}
function publicApplicationPayloadHash(input: unknown): string {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) throw new DiagnosisError(422, 'INVALID_APPLICATION');
  const value = parsed.data;
  return createHash('sha256').update(JSON.stringify({ companyName: value.companyName, contactName: value.contactName, email: value.email, phone: value.phone ?? null, jobTitle: value.jobTitle ?? null })).digest('hex');
}
/**
 * Never throws and never redirects: this only sets req.staffEmail when an existing,
 * valid staff_session cookie is present, so the public /cases route can recognize an
 * atLIB staff-driven internal test request without requiring staff auth from every
 * customer caller. It must not become a substitute for a real customer-facing gate.
 */
function markOptionalStaffEmail(req: Request, staffAuthService: StaffAuthService | undefined): void {
  if (!staffAuthService) return;
  const token = req.cookies?.[STAFF_SESSION_COOKIE_NAME];
  if (!token) return;
  try { req.staffEmail = staffAuthService.verifySessionToken(token).email; } catch { /* not staff; proceed as a public caller */ }
}

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

export function createItManagementDiagnosisRouter(
  repo: ItManagementDiagnosisRepo,
  notify?: CompletionNotifier,
  publicIntake?: { enabled: boolean; staffAuthService?: StaffAuthService; allowedOrigins?: readonly string[] },
): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.options('/cases', (req, res) => { if (!allowPublicLpOrigin(req, res, publicIntake?.allowedOrigins ?? [LP_ORIGIN])) { res.status(403).end(); return; } res.status(204).end(); });
  router.post('/cases', (req, res, next) => {
    // A recognized atLIB staff session may exercise this exact public-intake code
    // path for internal test data, independent of the LP-origin check below and of
    // publicIntake.enabled. This is a bypass for staff, never a public relaxation.
    markOptionalStaffEmail(req, publicIntake?.staffAuthService);
    if (req.staffEmail) { next(); return; }
    // Origin/CORS is a browser-response convention, not an access boundary: it must
    // not be the only thing standing between an anonymous direct POST and a real Case.
    if (!allowPublicLpOrigin(req, res, publicIntake?.allowedOrigins ?? [LP_ORIGIN])) { res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' }); return; }
    if (!publicIntake?.enabled) { res.status(403).json({ error: 'PUBLIC_INTAKE_DISABLED' }); return; }
    next();
  }, createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 }), diagnosisHandler(async (req, res) => {
    // Public callers cannot choose SALES_VISIT or provide a staff identity.
    const parsed = webApplicationSchema.safeParse(req.body);
    if (!parsed.success) throw new DiagnosisError(422, 'サービス内容とデータ利用について確認してからお申し込みください。');
    const { policyNoticeVersion, policyAcknowledged: _policyAcknowledged, hp = '', ...application } = parsed.data;
    // A bot receives no acceptance signal and cannot allocate a case.
    if (hp) { res.status(204).end(); return; }
    // Case creation and acknowledgement provenance are one DB transaction.
    const rawKey = req.get('idempotency-key');
    if (!rawKey) { res.status(201).json(await repo.createCase(application, 'WEB', { kind: 'CUSTOMER', token: '' }, { noticeVersion: policyNoticeVersion })); return; }
    const key = idempotencyKeySchema.safeParse(rawKey);
    if (!key.success) throw new DiagnosisError(422, 'INVALID_IDEMPOTENCY_KEY');
    const result = await repo.createWebCaseIdempotently(application, key.data, publicApplicationPayloadHash(application), { noticeVersion: policyNoticeVersion });
    if (result.kind === 'created') { res.status(201).json(result.created); return; }
    res.status(202).json({ acceptance: 'ACCEPTED_RESUME_LINK_UNAVAILABLE' });
  }));
  router.use('/cases/:id', createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 300 }));
  mountSurveyCommands(router, repo, customerActor, notify);
  return router;
}
