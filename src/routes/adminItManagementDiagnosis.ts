import { Router } from 'express';
import {createDiagnosisAssessmentRouter} from './diagnosisAssessment';
import type {DiagnosisAssessmentRepo} from '../services/diagnosisAssessmentRepo';
import { z } from 'zod';
import { DIAGNOSIS_STATUSES, DiagnosisError } from '../domain/itManagementDiagnosis';
import type { ItManagementDiagnosisRepo, RetentionClass } from '../services/itManagementDiagnosisRepo';
import { caseId, diagnosisHandler, mountSurveyCommands, staffActor, type CompletionNotifier } from './itManagementDiagnosis';
import { createDiagnosisPreparationRouter, type PreparationServices } from './diagnosisPreparation';
import { createDiagnosisWorkspaceRouter, type WorkspaceServices } from './diagnosisWorkspace';
import { createDiagnosisReviewRouter, type ReviewServices } from './diagnosisReview';
import { createDiagnosisReportRouter, type ReportServices } from './diagnosisReport';

const transcriptConsentSchema = z.object({
  consentVersion: z.string().trim().min(1).max(100),
  consentScope: z.string().trim().min(1).max(500),
  consentedAt: z.string().datetime({ offset: true }),
  customerReference: z.string().trim().max(200).optional(),
  evidenceNote: z.string().trim().max(1000).optional(),
}).strict();
const deletionRequestSchema = z.object({ requesterReference: z.string().trim().min(1).max(200) }).strict();
const retentionClassSchema = z.enum(['GENERAL_RAW_DIAGNOSIS','TRANSCRIPT_RECORDING','RAW_AI_IO','APPROVED_DECISION_EVIDENCE']);
const deletionScopeSchema = z.object({
  dataClasses: z.array(retentionClassSchema).min(1).max(4),
  restrictedRetention: z.array(z.object({ dataClass: retentionClassSchema, reason: z.string().trim().min(1).max(1000) }).strict()).max(20).default([]),
}).strict();
const deletionDecisionSchema = z.object({ decision: z.enum(['APPROVE','REJECT']), reason: z.string().trim().min(1).max(2000) }).strict();

// Mounted behind the existing Google Workspace auth and rate-limit gate.
export function createAdminItManagementDiagnosisRouter(repo: ItManagementDiagnosisRepo, notify?: CompletionNotifier, preparation?: PreparationServices, workspace?: WorkspaceServices, review?: ReviewServices, report?: ReportServices, assessment?: DiagnosisAssessmentRepo): Router {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.staffEmail) { res.status(401).json({ error: 'スタッフ認証が必要です。' }); return; }
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

  router.get('/cases/:id/policy', diagnosisHandler(async (req, res) => {
    res.json(await repo.getPolicyReadModel(caseId(req), staffActor(req)));
  }));
  router.post('/cases/:id/transcript-consents', diagnosisHandler(async (req, res) => {
    const parsed = transcriptConsentSchema.safeParse(req.body);
    if (!parsed.success) throw new DiagnosisError(422, 'Transcript同意記録の内容を確認してください。');
    res.status(201).json(await repo.recordTranscriptConsent(caseId(req), staffActor(req), parsed.data));
  }));
  router.post('/cases/:id/transcript-consents/:consentId/revoke', diagnosisHandler(async (req, res) => {
    const consentId = z.string().uuid().safeParse(req.params.consentId);
    if (!consentId.success) throw new DiagnosisError(400, '同意IDが無効です。');
    await repo.revokeTranscriptConsent(caseId(req), consentId.data, staffActor(req));
    res.status(204).end();
  }));
  router.post('/cases/:id/deletion-requests', diagnosisHandler(async (req, res) => {
    const parsed = deletionRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new DiagnosisError(422, '削除要求の受付情報を確認してください。');
    res.status(201).json(await repo.createDeletionRequest(caseId(req), staffActor(req), parsed.data.requesterReference));
  }));
  router.post('/cases/:id/sources/:sourceId/purpose-completion', diagnosisHandler(async (req, res) => {
    const sourceId = z.string().uuid().safeParse(req.params.sourceId);
    const parsed = z.object({ completedAt: z.string().datetime({ offset: true }) }).strict().safeParse(req.body);
    if (!sourceId.success || !parsed.success) throw new DiagnosisError(422, 'Transcriptと取得目的の完了日時を確認してください。');
    res.json(await repo.completeTranscriptPurpose(caseId(req), sourceId.data, staffActor(req), parsed.data.completedAt));
  }));
  router.put('/cases/:id/deletion-requests/:requestId/scope', diagnosisHandler(async (req, res) => {
    const requestId = z.string().uuid().safeParse(req.params.requestId);
    const parsed = deletionScopeSchema.safeParse(req.body);
    if (!requestId.success || !parsed.success) throw new DiagnosisError(422, '削除要求の対象範囲を確認してください。');
    await repo.scopeDeletionRequest(caseId(req), requestId.data, staffActor(req), parsed.data.dataClasses as RetentionClass[], parsed.data.restrictedRetention);
    res.status(204).end();
  }));
  router.post('/cases/:id/deletion-requests/:requestId/decision', diagnosisHandler(async (req, res) => {
    const requestId = z.string().uuid().safeParse(req.params.requestId);
    const parsed = deletionDecisionSchema.safeParse(req.body);
    if (!requestId.success || !parsed.success) throw new DiagnosisError(422, '削除要求の承認判断を確認してください。');
    await repo.decideDeletionRequest(caseId(req), requestId.data, staffActor(req), parsed.data.decision, parsed.data.reason);
    res.status(204).end();
  }));
  router.get('/cases/:id/retention/dry-run', diagnosisHandler(async (req, res) => {
    res.json(await repo.retentionDryRun(caseId(req), staffActor(req)));
  }));

  if (preparation) router.use(createDiagnosisPreparationRouter(preparation));
  if (workspace) router.use(createDiagnosisWorkspaceRouter(workspace));
  if (review) router.use(createDiagnosisReviewRouter(review));
  if (report) router.use(createDiagnosisReportRouter(report));
  if (assessment) router.use(createDiagnosisAssessmentRouter(assessment));
  mountSurveyCommands(router, repo, staffActor, notify);
  return router;
}
