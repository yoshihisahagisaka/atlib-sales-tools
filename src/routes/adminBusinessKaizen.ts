import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getBusinessKaizenQuestions } from '../domain/businessKaizenDiagnosis';
import {
  BUSINESS_KAIZEN_PROXY_CONSENT_VERSION,
  BusinessKaizenProxyError,
  type BusinessKaizenProxyService,
} from '../services/businessKaizenProxyService';

const id = z.string().uuid();
const listInput = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  owner: z.string().trim().min(1).max(320).optional(),
  entryChannel: z.enum(['CUSTOMER_SELF','STAFF_PROXY']).optional(),
  currentStage: z.enum(['ACCEPTED','SCHEDULING','SCHEDULED','MEETING_COMPLETED','PROPOSAL_IN_PROGRESS','PROPOSED']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const draftInput = z.object({ expectedRevision: z.number().int().positive(), answers: z.record(z.unknown()) }).strict();
const completeInput = z.object({
  expectedRevision: z.number().int().positive(),
  purposeConfirmed: z.literal(true), privacyHandlingConfirmed: z.literal(true),
  consentWordingVersion: z.literal(BUSINESS_KAIZEN_PROXY_CONSENT_VERSION),
}).strict();
const expectedRevision = z.number().int().positive();
const stageInput = z.object({
  expectedRevision,
  stage: z.enum(['ACCEPTED','SCHEDULING','SCHEDULED','MEETING_COMPLETED','PROPOSAL_IN_PROGRESS','PROPOSED']),
}).strict();
const scheduleInput = z.object({ expectedRevision, scheduledAt: z.string().datetime({ offset: true }).nullable() }).strict();
const outcomeInput = z.object({
  expectedRevision,
  outcome: z.enum(['WON','COMPLETED_NO_PROPOSAL','NOT_PROCEEDED','LOST']).nullable(),
  outcomeReason: z.string().trim().min(1).max(1000).nullable().optional().default(null),
  outcomeNote: z.string().trim().min(1).max(5000).nullable().optional().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.outcome === null && (value.outcomeReason !== null || value.outcomeNote !== null))
    ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'Cleared outcome cannot retain reason or note' });
});
const commercialEventInput = z.object({
  idempotencyKey: z.string().uuid(), eventType: z.enum(['PROPOSED','WON']),
  serviceName: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(5000),
  amount: z.number().finite().min(0).max(999999999999.99).nullable(), currency: z.literal('JPY'),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

function actor(req: Request): string {
  if (!req.staffEmail) throw new BusinessKaizenProxyError(401, 'STAFF_AUTH_REQUIRED');
  return req.staffEmail;
}
function run(res: Response, fn: () => Promise<void>): void {
  void fn().catch(error => {
    if (error instanceof BusinessKaizenProxyError) { res.status(error.status).json({ error: error.code }); return; }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
}

export function createAdminBusinessKaizenRouter(service: BusinessKaizenProxyService): Router {
  const router = Router();
  router.get('/questions', (req, res) => run(res, async () => {
    actor(req); res.json({ items: getBusinessKaizenQuestions(), consentWordingVersion: BUSINESS_KAIZEN_PROXY_CONSENT_VERSION });
  }));
  router.get('/diagnoses', (req, res) => run(res, async () => {
    actor(req); const parsed = listInput.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.list(parsed.data));
  }));
  router.post('/diagnoses/proxy-drafts', (req, res) => run(res, async () => {
    const staff = actor(req);
    const parsed = z.object({ salesActivityId: id }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const result = await service.createOrResume(parsed.data.salesActivityId, staff);
    res.status(result.created ? 201 : 200).json(result);
  }));
  router.get('/diagnoses/:id', (req, res) => run(res, async () => {
    actor(req); const parsed = id.safeParse(req.params.id);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.get(parsed.data));
  }));
  router.patch('/diagnoses/:id/stage', (req, res) => run(res, async () => {
    const staff = actor(req), diagnosisId = id.safeParse(req.params.id), parsed = stageInput.safeParse(req.body);
    if (!diagnosisId.success || !parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.updateStage(diagnosisId.data, parsed.data.stage, parsed.data.expectedRevision, staff));
  }));
  router.patch('/diagnoses/:id/schedule', (req, res) => run(res, async () => {
    const staff = actor(req), diagnosisId = id.safeParse(req.params.id), parsed = scheduleInput.safeParse(req.body);
    if (!diagnosisId.success || !parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.updateSchedule(diagnosisId.data, parsed.data.scheduledAt, parsed.data.expectedRevision, staff));
  }));
  router.patch('/diagnoses/:id/outcome', (req, res) => run(res, async () => {
    const staff = actor(req), diagnosisId = id.safeParse(req.params.id), parsed = outcomeInput.safeParse(req.body);
    if (!diagnosisId.success || !parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.updateOutcome(diagnosisId.data, parsed.data.outcome, parsed.data.outcomeReason,
      parsed.data.outcomeNote, parsed.data.expectedRevision, staff));
  }));
  router.post('/diagnoses/:id/commercial-events', (req, res) => run(res, async () => {
    const staff = actor(req), diagnosisId = id.safeParse(req.params.id), parsed = commercialEventInput.safeParse(req.body);
    if (!diagnosisId.success || !parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const result = await service.createCommercialEvent(diagnosisId.data, parsed.data, staff);
    res.status(result.created ? 201 : 200).json(result);
  }));
  router.get('/diagnoses/:id/stage-history', (req, res) => run(res, async () => {
    actor(req); const diagnosisId = id.safeParse(req.params.id);
    if (!diagnosisId.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.listStageHistory(diagnosisId.data));
  }));
  router.get('/diagnoses/:id/commercial-events', (req, res) => run(res, async () => {
    actor(req); const diagnosisId = id.safeParse(req.params.id);
    if (!diagnosisId.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.listCommercialEvents(diagnosisId.data));
  }));
  router.put('/diagnoses/:id/draft-answers', (req, res) => run(res, async () => {
    const staff = actor(req), diagnosisId = id.safeParse(req.params.id), parsed = draftInput.safeParse(req.body);
    if (!diagnosisId.success || !parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.saveDraft(diagnosisId.data, parsed.data.answers, parsed.data.expectedRevision, staff));
  }));
  router.post('/diagnoses/:id/complete', (req, res) => run(res, async () => {
    const staff = actor(req), diagnosisId = id.safeParse(req.params.id), parsed = completeInput.safeParse(req.body);
    if (!diagnosisId.success || !parsed.success) { res.status(400).json({ error: 'CONSENT_REQUIRED' }); return; }
    res.json(await service.complete(diagnosisId.data, parsed.data.expectedRevision, staff, parsed.data.consentWordingVersion));
  }));
  return router;
}
