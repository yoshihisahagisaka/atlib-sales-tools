import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AssemblyAdminService } from '../secumieWeb/assemblyAdminService';

// Corporate site posts only after its existing Turnstile + SMTP success.
// This route is not a second public application form or a CRM endpoint.
const payload = z.object({
  source: z.literal('secumie_web_temporary'),
  eventId: z.string().uuid(),
  companyName: z.string().trim().min(1).max(150),
  unionName: z.string().trim().min(1).max(150),
  registeredAddress: z.string().trim().min(1).max(500),
  websiteUrl: z.string().trim().url().max(2000).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  }),
  contactName: z.string().trim().min(1).max(100),
  contactEmail: z.string().trim().email().max(254),
  contactPhone: z.string().trim().min(1).max(30),
  consented: z.literal(true),
}).strict();

function authorized(req: Request, raw: Buffer, secret: string): boolean {
  const time = req.get('x-secumie-timestamp') ?? '';
  const signature = req.get('x-secumie-signature') ?? '';
  if (!/^\d{13}$/.test(time) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const timestamp = Number(time);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) return false;
  const expected = createHmac('sha256', secret).update(time).update('\n').update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function createInternalSecumieWebMirrorRouter(
  service: Pick<AssemblyAdminService, 'recordCorporateEmailIntake'>,
  secret: string,
): Router {
  if (secret.length < 32) throw new Error('Missing/weak SECU:MIE Web mirror secret');
  const router = Router();
  router.post('/temporary-intakes', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const raw = req.body;
    if (!Buffer.isBuffer(raw) || !authorized(req, raw, secret)) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    let json: unknown;
    try { json = JSON.parse(raw.toString('utf8')); }
    catch { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    const parsed = payload.safeParse(json);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_REQUEST' });
      return;
    }
    try {
      const { source: _source, consented: _consented, ...input } = parsed.data;
      const outcome = await service.recordCorporateEmailIntake(input);
      res.status(outcome.replayed ? 200 : 201).json({ ok: true, receiptId: outcome.receiptId });
    } catch (err) {
      // An idempotency conflict is not a successful accepted submission.
      if (err instanceof Error && err.message === 'EVENT_ID_CONFLICT') {
        res.status(409).json({ error: 'EVENT_ID_CONFLICT' });
      } else {
        res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
      }
    }
  });
  return router;
}
