import { Router } from 'express';
import type { Request } from 'express';

/**
 * Staff test eligibility endpoint, to be mounted ONLY behind existing
 * adminAuthGate. This does not activate the public survey or create a Case.
 *
 * Existing test-case administration allowlist is intentionally distinct from
 * staff authentication. This endpoint confirms a staff session, not permission
 * to modify the designation of an existing production Case.
 */
export function createStaffSurveyTestEligibilityRouter(): Router {
  const router = Router();
  router.get('/eligibility', (req: Request, res) => {
    if (!req.staffEmail) {
      res.status(401).json({ error: 'STAFF_AUTH_REQUIRED' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      staffTestEligible: true,
      surveyTestModeAvailable: false,
      reason: 'TEST_SUBMISSION_FLOW_NOT_IMPLEMENTED',
    });
  });
  return router;
}
