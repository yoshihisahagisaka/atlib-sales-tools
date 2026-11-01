import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PiraIntakeError, type InitiativeKind, type PiraContext, type SubmissionState, PiraIntakeService } from '../piraIntake/piraIntakeService';
import { PiraJwtError, PiraJwtVerifier } from '../piraIntake/piraJwtVerifier';

const base = z.object({ initiativeCode: z.string().min(1).max(80), companyName: z.string().min(1).max(200), contactName: z.string().min(1).max(200), websiteUrl: z.string().min(1).max(2000), phone: z.string().max(50).optional(), unionName: z.string().max(200).optional(), address: z.string().max(500).optional(), consentVersion: z.string().min(1).max(100), idempotencyKey: z.string().uuid() }).strict();
const stateSchema = z.object({ state: z.enum(['ANSWERING','COMPLETED']) }).strict();
export type ContextResolver = (req: Request) => PiraContext | undefined;
/** Deployment configuration maps the accepted public host to one immutable initiative. */
export function createHostPiraContextResolver(contexts: ReadonlyMap<string, PiraContext>): ContextResolver {
  return req => contexts.get(req.hostname.toLowerCase());
}
function auth(req: Request) { const value = req.get('authorization'); return value?.startsWith('Bearer ') ? value.slice(7) : undefined; }
function failure(res: Response, error: unknown) { if (error instanceof PiraIntakeError) return res.status(error.status).json({ error: { code: error.code } }); if (error instanceof PiraJwtError) return res.status(error.code === 'JWKS_UNAVAILABLE' ? 503 : 401).json({ error: { code: error.code } }); return res.status(500).json({ error: { code: 'INTERNAL_ERROR' } }); }
export function createPublicPiraIntakeRouter(service: PiraIntakeService, verifier: PiraJwtVerifier, resolve: ContextResolver): Router {
  const router = Router();
  const context = (req: Request) => { const value = resolve(req); if (!value) throw new PiraIntakeError(404, 'INITIATIVE_NOT_FOUND'); return value; };
  const claims = async (req: Request, value: PiraContext) => { const token = auth(req); if (!token) throw new PiraJwtError(); return verifier.verify(token, value.serviceId); };
  router.get('/intake-contract', async (req, res) => { try { const value = context(req); res.json(await service.contract(value)); } catch (error) { failure(res, error); } });
  router.post('/submissions', async (req, res) => { const parsed = base.safeParse(req.body); if (!parsed.success) return failure(res, new PiraIntakeError(422, 'INVALID_REQUEST')); try { const value = context(req); if (parsed.data.initiativeCode !== value.initiativeCode) throw new PiraIntakeError(404, 'INITIATIVE_NOT_FOUND'); const result = await service.create(value, await claims(req, value), parsed.data); res.status(result.replayed ? 200 : 201).json(result); } catch (error) { failure(res, error); } });
  router.post('/submissions/:receiptId/state', async (req, res) => { const parsed = stateSchema.safeParse(req.body); if (!parsed.success || !z.string().uuid().safeParse(req.params.receiptId).success) return failure(res, new PiraIntakeError(422, 'INVALID_REQUEST')); try { const value = context(req); res.status(200).json(await service.updateState(value, await claims(req, value), req.params.receiptId!, parsed.data.state as SubmissionState)); } catch (error) { failure(res, error); } });
  return router;
}
