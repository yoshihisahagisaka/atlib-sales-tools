import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CURRENT_INTEREST_CODES_V2,
  FUTURE_CODES_V2,
  INTEREST_THEME_CODES_V2,
  IT_EXPECTATION_CODES_V2,
  MANAGEMENT_CONNECTION_CODES_V2,
  VISIBILITY_CODES_V2,
} from '../domain/freeDiagnosisDesignV2';
import { FreeDiagnosisDesignV2ApiError, type FreeDiagnosisDesignV2ApiService } from '../services/freeDiagnosisDesignV2ApiService';

function actor(req: Request): string {
  return req.staffEmail ?? 'unknown-staff';
}

function handle(res: Response, operation: () => Promise<void>): void {
  operation().catch(error => {
    if (error instanceof FreeDiagnosisDesignV2ApiError) {
      res.status(error.status).json({ error: error.code });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
}

const stateSchema = z.object({
  q2Future: z.array(z.enum(FUTURE_CODES_V2)).min(1),
  q3ItExpectations: z.array(z.enum(IT_EXPECTATION_CODES_V2)).min(1).max(2),
  q4CurrentInterest: z.enum(CURRENT_INTEREST_CODES_V2),
  q5Visibility: z.enum(VISIBILITY_CODES_V2),
  q6ManagementConnection: z.enum(MANAGEMENT_CONNECTION_CODES_V2),
  q7InterestThemes: z.array(z.enum(INTEREST_THEME_CODES_V2)).min(1).max(3),
}).strict();

const saveCurrentStateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  state: stateSchema,
  q1CompanyContext: z.object({ employeeRange: z.string().trim().min(1).max(100), siteRange: z.string().trim().min(1).max(100) }).strict().optional(),
  supplements: z.record(z.unknown()).nullable().optional(),
  changeReason: z.string().trim().max(2_000).nullable().optional(),
}).strict();

const reanalyzeSchema = z.object({ expectedCurrentStateRevision: z.number().int().positive() }).strict();
const narrativeSectionSchema = z.object({ heading: z.string(), entries: z.array(z.string()) }).strict();
const narrativeSchema = z.object({
  future: narrativeSectionSchema,
  currentUnderstanding: narrativeSectionSchema,
  confirmationAndImprovement: narrativeSectionSchema,
  unknowns: narrativeSectionSchema,
  nextFacts: narrativeSectionSchema,
}).strict();
const narrativeEditSchema = z.object({
  generatedNarrativeId: z.string().uuid(),
  content: narrativeSchema,
  editReason: z.string().trim().max(2_000).nullable().optional(),
}).strict();

export function createAdminFreeDiagnosisDesignV2Router(service: FreeDiagnosisDesignV2ApiService): Router {
  const router = Router();

  router.get('/cases/:id/design-v2/post-hearing-analysis', (req, res) => handle(res, async () => {
    res.json(await service.getWorkspace(req.params.id));
  }));

  router.post('/cases/:id/design-v2/current-state-revisions', (req, res) => handle(res, async () => {
    const parsed = saveCurrentStateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.status(201).json(await service.saveCurrentState(req.params.id, parsed.data, actor(req)));
  }));

  router.post('/cases/:id/design-v2/reanalyze', (req, res) => handle(res, async () => {
    const parsed = reanalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await service.reanalyze(req.params.id, parsed.data, actor(req)));
  }));

  router.post('/cases/:id/design-v2/narrative-edits', (req, res) => handle(res, async () => {
    const parsed = narrativeEditSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.status(201).json(await service.saveNarrativeEdit(req.params.id, parsed.data, actor(req)));
  }));

  return router;
}
