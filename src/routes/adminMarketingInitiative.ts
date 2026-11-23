import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { MarketingInitiativeError, type MarketingInitiativeRepo } from '../services/marketingInitiativeRepo';
import type { FreeDiagnosisSalesLauncherRepo } from '../services/freeDiagnosisSalesLauncherRepo';

const optionalUtm = z.string().trim().min(1).max(200).optional();
const createSchema = z.object({
  initiativeName: z.string().trim().min(1).max(200), serviceKey: z.enum(['IT_KAIZEN','BUSINESS_WEB']),
  utmSource: optionalUtm, utmMedium: optionalUtm, utmCampaign: optionalUtm, utmContent: optionalUtm, utmTerm: optionalUtm,
}).strict().refine(value => [value.utmSource,value.utmMedium,value.utmCampaign,value.utmContent,value.utmTerm].some(Boolean), {
  message: '少なくとも1つのUTM条件が必要です。',
});

function handle(res: Response, fn: () => Promise<void>) {
  fn().catch(error => {
    if (error instanceof MarketingInitiativeError) { res.status(error.status).json({ error: error.code }); return; }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
}

export function createAdminMarketingInitiativeRouter(repo: MarketingInitiativeRepo, launcher: FreeDiagnosisSalesLauncherRepo): Router {
  const router = Router();
  router.get('/', (_req, res) => handle(res, async () => { res.json({ items: await repo.list() }); }));
  router.post('/', (req: Request, res) => handle(res, async () => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.status(201).json(await repo.create(parsed.data, req.staffEmail ?? 'unknown-staff'));
  }));
  router.post('/:initiativeId/deactivate', (req, res) => handle(res, async () => {
    const id = z.string().uuid().safeParse(req.params.initiativeId);
    if (!id.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json(await repo.deactivate(id.data, req.staffEmail ?? 'unknown-staff'));
  }));
  router.get('/:initiativeId/sales-activities', (req, res) => handle(res, async () => {
    const id = z.string().uuid().safeParse(req.params.initiativeId);
    if (!id.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    res.json({ items: await launcher.listSalesActivities({ initiativeId: id.data }) });
  }));
  return router;
}
