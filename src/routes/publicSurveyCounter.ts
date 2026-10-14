import { Router } from 'express';
import { z } from 'zod';
import { createIpRateLimiter } from '../middleware/rateLimit';
import { normalizeSurveyUtm } from '../domain/surveyCounterAttribution';
import type { SurveyMonthlyCounterRepo } from '../services/surveyMonthlyCounterRepo';

/**
 * Public normal-mode counter ingestion. Staff test-mode needs a separately
 * authenticated route; never trust ?test=1 or a client isTest field.
 * NOT mounted until the additive migration and release gates are approved.
 */
const countRequestSchema = z.object({
  kind: z.enum(['STARTED', 'COMPLETED']),
  utm: z.object({
    source: z.string().max(200).nullable().optional(),
    medium: z.string().max(200).nullable().optional(),
    campaign: z.string().max(200).nullable().optional(),
    content: z.string().max(200).nullable().optional(),
    term: z.string().max(200).nullable().optional(),
  }).strict().optional(),
}).strict();

export function createPublicSurveyCounterRouter(
  repo: SurveyMonthlyCounterRepo,
  publicIntakeEnabled: boolean,
  maxRequestsPerHour = 60,
): Router {
  const router = Router();
  router.post('/count', (req, res, next) => {
    if (!publicIntakeEnabled) { res.status(403).json({ error: 'PUBLIC_INTAKE_DISABLED' }); return; }
    if (req.query.test !== undefined || req.query.isTest !== undefined) {
      res.status(400).json({ error: 'TEST_MODE_REQUIRES_STAFF_AUTH' }); return;
    }
    next();
  }, createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: maxRequestsPerHour }), async (req, res) => {
    const parsed = countRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      let utm;
      try {
        utm = normalizeSurveyUtm(parsed.data.utm ?? {});
      } catch {
        res.status(400).json({ error: 'INVALID_UTM' });
        return;
      }
      const initiativeId = await repo.resolveInitiativeId(utm);
      await repo.increment({ kind: parsed.data.kind, initiativeId, acceptedAt: new Date() });
      res.status(204).end();
    } catch {
      // No applicant data, raw attribution, or answers in error logs.
      res.status(503).json({ error: 'SURVEY_COUNTER_UNAVAILABLE' });
    }
  });
  return router;
}
