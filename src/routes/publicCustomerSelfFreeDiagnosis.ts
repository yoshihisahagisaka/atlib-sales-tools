import { Router } from 'express';
import { RuleBasedV1Error } from '../domain/freeDiagnosisRuleBasedV1';
import { designV2PublicSurveyContract, publicCustomerSelfDesignV2SubmissionSchema } from '../domain/publicCustomerSelfDesignV2';
import { FreeDiagnosisDesignV2EntryAdapterError } from '../services/freeDiagnosisDesignV2EntryAdapter';
import { FreeDiagnosisDesignV2PersistenceError } from '../services/freeDiagnosisDesignV2PersistenceRepo';
import { createIpRateLimiter } from '../middleware/rateLimit';
import type { PublicCustomerSelfSubmissionService } from '../services/publicCustomerSelfSubmissionService';

export type PublicCustomerSelfCreatedNotifier = (caseId: string) => Promise<void>;

export function createPublicCustomerSelfFreeDiagnosisRouter(
  service: PublicCustomerSelfSubmissionService,
  publicIntakeEnabled: boolean,
  notifyCreated?: PublicCustomerSelfCreatedNotifier,
): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/survey-contract', (_req, res) => { res.json(designV2PublicSurveyContract); });
  router.post('/submissions', (req, res, next) => {
    if (!publicIntakeEnabled) { res.status(403).json({ error: 'PUBLIC_INTAKE_DISABLED' }); return; }
    next();
  }, createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 }), async (req, res) => {
    const parsed = publicCustomerSelfDesignV2SubmissionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      const result = await service.submit(parsed.data);
      if (result.created && notifyCreated) {
        try { await notifyCreated(result.caseId); }
        catch {
          console.warn(JSON.stringify({
            event: 'public_customer_self_notification_failed',
            caseId: result.caseId,
          }));
        }
      }
      res.status(result.created ? 201 : 200).json({ caseId: result.caseId });
    } catch (error) {
      if (error instanceof RuleBasedV1Error || error instanceof FreeDiagnosisDesignV2EntryAdapterError || error instanceof FreeDiagnosisDesignV2PersistenceError) { res.status(error.status).json({ error: error.code }); return; }
      res.status(500).json({ error: 'SUBMISSION_FAILED' });
    }
  });
  return router;
}
