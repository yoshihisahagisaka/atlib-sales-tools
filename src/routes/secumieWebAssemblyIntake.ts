import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PiraJwtVerifier, PiraJwtError } from '../piraIntake/piraJwtVerifier';
import { AssemblyIntakeService, AssemblyIntakeError } from '../secumieWeb/assemblyIntakeService';

const schema = z.object({
  unionId: z.string().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  registeredAddress: z.string().trim().min(1).max(500),
  websiteUrl: z.string().trim().min(1).max(2000),
  contactName: z.string().trim().min(1).max(200),
  contactPhone: z.string().trim().min(6).max(50),
  consentVersion: z.string().min(1).max(100),
  accepted: z.literal(true),
  idempotencyKey: z.string().uuid(),
}).strict();

function fail(res: Response, error: unknown) {
  if (error instanceof AssemblyIntakeError) return res.status(error.status).json({ error: { code: error.code } });
  if (error instanceof PiraJwtError) return res.status(error.code === 'JWKS_UNAVAILABLE' ? 503 : 401).json({ error: { code: error.code } });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
}

export function createAssemblyIntakeRouter(service: AssemblyIntakeService, verifier: PiraJwtVerifier, serviceId: string): Router {
  const router = Router();
  router.post('/requests', async (req: Request, res: Response) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: { code: 'INVALID_REQUEST' } });
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'JWT_INVALID' } });
    try {
      const claims = await verifier.verify(authorization.slice(7), serviceId);
      const result = await service.create(claims, parsed.data);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { return fail(res, error); }
  });
  return router;
}
