import { Router } from 'express';
import { publicCustomerSelfSubmissionSchema, RuleBasedV1Error } from '../domain/freeDiagnosisRuleBasedV1';
import { createIpRateLimiter } from '../middleware/rateLimit';
import type { PublicCustomerSelfSubmissionService } from '../services/publicCustomerSelfSubmissionService';

export function createPublicCustomerSelfFreeDiagnosisRouter(service: PublicCustomerSelfSubmissionService): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/submissions', createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 }), async (req, res) => {
    const parsed = publicCustomerSelfSubmissionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      const result = await service.submit(parsed.data);
      res.status(result.created ? 201 : 200).json({ caseId: result.caseId });
    } catch (error) {
      if (error instanceof RuleBasedV1Error) { res.status(error.status).json({ error: error.code }); return; }
      res.status(500).json({ error: 'SUBMISSION_FAILED' });
    }
  });
  return router;
}
