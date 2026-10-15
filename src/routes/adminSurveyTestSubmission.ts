import { Router } from 'express';
import { publicCustomerSelfDesignV2SubmissionSchema } from '../domain/publicCustomerSelfDesignV2';
import { mayCreateTestSurveyCase } from '../domain/staffSurveyTestAuthorization';
import type { PublicCustomerSelfSubmissionService } from '../services/publicCustomerSelfSubmissionService';

/**
 * Mount only after existing adminAuthGate. This is intentionally fail-closed:
 * the service rejects STAFF_TEST until test consent provenance is implemented.
 * Do not mount or expose until migration, integration tests, and release review.
 */
export function createAdminSurveyTestSubmissionRouter(
  service: PublicCustomerSelfSubmissionService,
  testCaseAdminEmails: ReadonlySet<string>,
): Router {
  const router = Router();
  router.post('/submissions', async (req, res) => {
    if (!req.staffEmail) {
      res.status(401).json({ error: 'STAFF_AUTH_REQUIRED' });
      return;
    }
    if (!mayCreateTestSurveyCase(req.staffEmail, testCaseAdminEmails)) {
      res.status(403).json({ error: 'TEST_CASE_ADMIN_REQUIRED' });
      return;
    }
    const parsed = publicCustomerSelfDesignV2SubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_REQUEST' });
      return;
    }
    try {
      const result = await service.submitWithTrustedContext(parsed.data, {
        mode: 'STAFF_TEST',
        actor: req.staffEmail,
      });
      res.status(result.created ? 201 : 200).json({ caseId: result.caseId, isTestCase: true });
    } catch (error) {
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code;
      if (typeof status === 'number' && status >= 400 && status <= 501 && code) {
        res.status(status).json({ error: code });
        return;
      }
      res.status(500).json({ error: 'TEST_SUBMISSION_FAILED' });
    }
  });
  return router;
}
