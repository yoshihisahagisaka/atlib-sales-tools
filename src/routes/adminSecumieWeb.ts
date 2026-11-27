import { Router } from 'express';
import { z } from 'zod';
import { AssemblyAdminService } from '../secumieWeb/assemblyAdminService';

const status = z.enum(['RECEIVED','IN_PROGRESS','SUBMITTED','CANCELLED']);
export function createAdminSecumieWebRouter(service: AssemblyAdminService): Router {
  const router = Router();
  // Same staff-only mutation gate used by IT management KAIZEN.
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.staffEmail) {
      res.status(401).json({ error: { code: 'STAFF_AUTH_REQUIRED' } });
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && (req.get('sec-fetch-site') === 'cross-site' || req.get('x-secumie-staff-command') !== '1')) {
      res.status(403).json({ error: { code: 'STAFF_COMMAND_REQUIRED' } });
      return;
    }
    next();
  });
  router.get('/requests', async (req, res) => {
    const parsed = z.object({ status: status.optional(), companyName:z.string().max(200).optional(), unionName:z.string().max(200).optional(), limit:z.coerce.number().int().min(1).max(100).default(50), offset:z.coerce.number().int().min(0).default(0) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error:{ code:'INVALID_REQUEST' } });
    try { return res.json({ items: await service.list(parsed.data) }); } catch { return res.status(500).json({ error:{ code:'INTERNAL_ERROR' } }); }
  });
  router.patch('/requests/:id/status', async (req, res) => {
    const parsed = z.object({ status }).strict().safeParse(req.body);
    if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error:{ code:'INVALID_REQUEST' } });
    try { const result = await service.changeStatus(req.params.id!, parsed.data.status, req.staffEmail!); return result ? res.json(result) : res.status(404).json({ error:{ code:'NOT_FOUND' } }); } catch { return res.status(500).json({ error:{ code:'INTERNAL_ERROR' } }); }
  });
  return router;
}
