import { Router } from 'express';
import { z } from 'zod';
import { PaidAssessmentPreparationSelectionError, paidAssessmentPreparationSelectionSchema,
  type PaidAssessmentPreparationSelectionRepo } from '../services/paidAssessmentPreparationSelectionRepo';
import {
  PaidAssessmentSourceHandoffError,
  type PaidAssessmentSourceHandoffRepo,
} from '../services/paidAssessmentSourceHandoffRepo';

const emptyBody = z.object({}).strict();

export function createAdminPaidAssessmentSourceHandoffRouter(
  repo: PaidAssessmentSourceHandoffRepo, preparationRepo?: PaidAssessmentPreparationSelectionRepo,
): Router {
  const router = Router();

  router.get('/:caseId/preparation', async (req, res) => {
    if (!preparationRepo) { res.status(501).json({ error: 'PREPARATION_NOT_CONFIGURED' }); return; }
    try { res.status(200).json({ view: await preparationRepo.latest(req.params.caseId, req.staffEmail ?? '') }); }
    catch (error) { respondError(res, error); }
  });

  router.post('/:caseId/preparation', async (req, res) => {
    if (!preparationRepo) { res.status(501).json({ error: 'PREPARATION_NOT_CONFIGURED' }); return; }
    const parsed = paidAssessmentPreparationSelectionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_SELECTION' }); return; }
    try {
      const result = await preparationRepo.save(req.params.caseId, req.staffEmail ?? '', parsed.data);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) { respondError(res, error); }
  });

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
  if (error instanceof PaidAssessmentSourceHandoffError
    || error instanceof PaidAssessmentPreparationSelectionError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}
