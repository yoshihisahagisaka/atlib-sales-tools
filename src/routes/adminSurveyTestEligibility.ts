import { Router } from 'express';
import { mayCreateTestSurveyCase } from '../domain/staffSurveyTestAuthorization';

/**
 * This endpoint is not mounted yet. Existing adminAuthGate must run first.
 * Authorization is tied to the existing test-case designation administrator
 * allowlist, not to any arbitrary authenticated staff session.
 */
export function createStaffSurveyTestEligibilityRouter(
  testCaseAdminEmails: ReadonlySet<string> = new Set(),
): Router {
  const router = Router();
  router.get('/eligibility', (req, res) => {
    if (!req.staffEmail) {
      res.status(401).json({ error: 'STAFF_AUTH_REQUIRED' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (!mayCreateTestSurveyCase(req.staffEmail, testCaseAdminEmails)) {
      res.status(403).json({ error: 'TEST_CASE_ADMIN_REQUIRED' });
      return;
    }
    res.json({
      staffTestEligible: true,
      surveyTestModeAvailable: false,
      reason: 'TEST_SUBMISSION_FLOW_NOT_IMPLEMENTED',
    });
  });
  return router;
}
