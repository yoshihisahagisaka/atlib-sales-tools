import { Router } from 'express';
import { z } from 'zod';
import type { BusinessKaizenAnonymousKpiService } from '../services/businessKaizenAnonymousKpiService';
import { createIpRateLimiter } from '../middleware/rateLimit';

const schema = z.object({
  eventType: z.enum(['diagnosis_start','diagnosis_complete']),
  turnstileToken: z.string().min(1).max(2048),
  utmSource: z.string().trim().min(1).max(200).optional(),
  utmMedium: z.string().trim().min(1).max(200).optional(),
  utmCampaign: z.string().trim().min(1).max(200).optional(),
  utmContent: z.string().trim().min(1).max(200).optional(),
  utmTerm: z.string().trim().min(1).max(200).optional(),
}).strict();

export function createBusinessKaizenAnonymousEventsRouter(service: BusinessKaizenAnonymousKpiService): Router {
  const router = Router();
  const rateLimit = createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 120 });
  router.use((req,res,next) => {
    const origin = req.get('origin');
    if (origin && service.config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type');
    }
    if (req.method === 'OPTIONS') { res.status(origin && service.config.allowedOrigins.includes(origin) ? 204 : 403).end(); return; }
    next();
  });
  router.post('/', rateLimit, async (req,res) => {
    const parsed = schema.safeParse(req.body), origin = req.get('origin');
    if (!parsed.success || !origin) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      const result = await service.receive(parsed.data,origin);
      if (result === 'DISABLED') { res.status(503).json({ error: 'ANONYMOUS_KPI_DISABLED' }); return; }
      if (result === 'REJECTED') { res.status(403).json({ error: 'ANONYMOUS_EVENT_REJECTED' }); return; }
      res.status(202).json({ accepted: true });
    } catch { res.status(503).json({ error: 'ANONYMOUS_KPI_UNAVAILABLE' }); }
  });
  return router;
}
