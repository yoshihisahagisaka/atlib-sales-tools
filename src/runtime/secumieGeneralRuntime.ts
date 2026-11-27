import express, { type Express, type Request } from 'express';
import { z } from 'zod';
import { configurePublicRuntime, publicPageCsp } from './runtimeSecurity';
import { SecumieGeneralLimits, GeneralLimitError } from './secumieGeneralLimits';
import type { WscHtmlService } from '../services/wscHtmlService';

type Kind = 'WEB' | 'INSIGHT';
type Verify = (token: string, ip: string, action: string) => Promise<boolean>;
const company = z.object({
  companyName: z.string().trim().min(1).max(150),
  registeredAddress: z.string().trim().min(1).max(500),
  accepted: z.literal(true),
  turnstileToken: z.string().min(1).max(2048),
}).strict();
const web = company.extend({ targetUrl: z.string().trim().min(1).max(2000) }).strict();

export function createGeneralTurnstileVerifier(secret: string, hostname: string, fetchImpl: typeof fetch = fetch): Verify {
  return async (token, ip, action) => {
    if (!secret) return false;
    try {
      const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return false;
      const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
      return result.success === true && result.hostname === hostname && result.action === action;
    } catch { return false; }
  };
}
export function createSecumieGeneralRuntime(options: {
  kind: Kind;
  hostname: string;
  enabled: boolean;
  verify: Verify;
  wsc?: Pick<WscHtmlService, 'diagnose'>;
  limits?: SecumieGeneralLimits;
}): Express {
  const app = express();
  configurePublicRuntime(app);
  const limits = options.limits ?? new SecumieGeneralLimits();
  const prefix = options.kind === 'WEB' ? '/secumie-web' : '/secumie-insight';
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', publicPageCsp);
    if (!options.enabled || req.hostname !== options.hostname) { res.sendStatus(404); return; }
    next();
  });
  app.post(prefix + '/api/start', express.json({ limit: '16kb', strict: true }), async (req: Request, res) => {
    if (req.get('origin') !== 'https://' + options.hostname || !req.is('application/json')) { res.sendStatus(403); return; }
    const parsed = (options.kind === 'WEB' ? web : company).safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ code: 'INVALID_REQUEST' }); return; }
    const data = parsed.data;
    const ip = req.ip;
    if (!ip) { res.status(403).json({ code: 'CLIENT_IP_UNAVAILABLE' }); return; }
    let target: string | undefined;
    if ('targetUrl' in data) {
      try {
        const u = new URL(String(data.targetUrl));
        if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) throw Error();
        target = u.href;
      } catch { res.status(422).json({ code: 'INVALID_TARGET' }); return; }
    }
    let release: (() => void) | undefined;
    try {
      if (!(await options.verify(data.turnstileToken, ip, options.kind === 'WEB' ? 'secumie_web' : 'secumie_insight'))) {
        res.status(403).json({ code: 'TURNSTILE_DENIED' }); return;
      }
      release = limits.admit(options.kind, ip, target);
      if (options.kind === 'INSIGHT') { res.json({ ok: true }); return; }
      if (!options.wsc || !target) { res.status(503).json({ code: 'NOT_READY' }); return; }
      const result = await options.wsc.diagnose({ name: data.companyName, url: target, executor: 'general-web' });
      res.json({ ok: true, html: result.html, normalizedUrl: result.normalizedUrl });
    } catch (error) {
      if (error instanceof GeneralLimitError) { res.status(429).json({ code: error.code }); return; }
      res.status(422).json({ code: 'DIAGNOSIS_UNAVAILABLE' });
    } finally { release?.(); }
  });
  app.use((_req, res) => res.sendStatus(404));
  return app;
}
