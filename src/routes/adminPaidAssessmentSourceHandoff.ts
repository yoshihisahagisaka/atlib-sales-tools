import { Router } from 'express';
import { z } from 'zod';
import {
  PaidAssessmentSourceHandoffError,
  type PaidAssessmentSourceHandoffRepo,
} from '../services/paidAssessmentSourceHandoffRepo';

const emptyBody = z.object({}).strict();

export function createAdminPaidAssessmentSourceHandoffRouter(repo: PaidAssessmentSourceHandoffRepo): Router {
  const router = Router();

  router.post('/:caseId', async (req, res) => {
    if (!emptyBody.safeParse(req.body === undefined ? {} : req.body).success) {
      res.status(400).json({ error: 'INVALID_REQUEST' });
      return;
    }
    try {
      const result = await repo.create(req.params.caseId, req.staffEmail ?? '');
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/:caseId/latest', async (req, res) => {
    try {
      res.status(200).json({ handoff: await repo.latest(req.params.caseId, req.staffEmail ?? '') });
    } catch (error) {
      respondError(res, error);
    }
  });

  return router;
}

function respondError(res: import('express').Response, error: unknown): void {
  if (error instanceof PaidAssessmentSourceHandoffError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}
