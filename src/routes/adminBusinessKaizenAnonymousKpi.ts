import { Router } from 'express';
import { z } from 'zod';
import { resolveBusinessKaizenKpiPeriod } from '../services/businessKaizenKpiService';
import type { BusinessKaizenAnonymousKpiService } from '../services/businessKaizenAnonymousKpiService';

const query = z.object({
  from: z.string().optional(), to: z.string().optional(), fiscalYear: z.coerce.number().int().optional(),
  environment: z.enum(['PRODUCTION','TEST']).optional(), origin: z.string().url().max(300).optional(),
}).strict();

export function createAdminBusinessKaizenAnonymousKpiRouter(service: BusinessKaizenAnonymousKpiService): Router {
  const router = Router();
  router.get('/', async (req,res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const period = resolveBusinessKaizenKpiPeriod(parsed.data);
    if (!period) { res.status(400).json({ error: 'INVALID_PERIOD' }); return; }
    try {
      const exclusiveDate = period.toExclusive.slice(0,10);
      const to = new Date(`${exclusiveDate}T00:00:00Z`);
      to.setUTCDate(to.getUTCDate()-1);
      res.json(await service.read({ from: period.from.slice(0,10), to: to.toISOString().slice(0,10),
        environment: parsed.data.environment, origin: parsed.data.origin }));
    } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
  });
  return router;
}
