import express, { type Express, type Request } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { configurePublicRuntime, publicPageCsp } from './runtimeSecurity';
import { SecumieGeneralLimits, GeneralLimitError } from './secumieGeneralLimits';
import { consultationSchema, type ConsultationHandoff } from '../services/secumieConsultationHandoff';
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
  handoff?: ConsultationHandoff;
  assets?: { pageDir: string; insightDir: string; siteKey: string };
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
      if (options.kind === 'INSIGHT') { const receipt = options.handoff?.issue({kind:'INSIGHT', companyName:data.companyName,registeredAddress:data.registeredAddress}); res.json({ ok: true, ...(receipt ? {receipt}: {}) }); return; }
      if (!options.wsc || !target) { res.status(503).json({ code: 'NOT_READY' }); return; }
      const result = await options.wsc.diagnose({ name: data.companyName, url: target, executor: 'general-web' });
      const receipt = options.handoff?.issue({kind:'WEB',companyName:data.companyName,registeredAddress:data.registeredAddress,targetUrl:result.normalizedUrl,report:result.report});
      res.json({ ok: true, ...(receipt ? {receipt}: {}), html: result.html.replace('<div class="review-banner">内部デザインレビュー用｜対外配布不可</div>', ''), normalizedUrl: result.normalizedUrl });
    } catch (error) {
      if (error instanceof GeneralLimitError) { res.status(429).json({ code: error.code }); return; }
      res.status(422).json({ code: 'DIAGNOSIS_UNAVAILABLE' });
    } finally { release?.(); }
  });
  app.post(prefix + '/api/consultation', express.json({limit:'16kb',strict:true}), async (req,res) => {
    if (req.get('origin') !== 'https://' + options.hostname || !req.is('application/json')) { res.sendStatus(403); return; }
    if (!options.handoff) { res.status(503).json({code:'NOT_READY'}); return; }
    const parsed = consultationSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422).json({code:'INVALID_REQUEST'}); return; }
    try { const scheduleUrl = await options.handoff.submit(parsed.data); res.json({ok:true,scheduleUrl}); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'RECEIPT_EXPIRED') { res.status(410).json({code}); return; }
      if (code === 'ALREADY_SUBMITTED') { res.status(409).json({code}); return; }
      if (code === 'INVALID_ANSWERS') { res.status(422).json({code}); return; }
      res.status(503).json({code:'NOTIFICATION_FAILED'});
    }
  });
  if (options.assets) {
    const assets = options.assets;
    app.get(prefix + '/', (_req, res) => {
      if (!/^[A-Za-z0-9_-]+$/.test(assets.siteKey)) { res.sendStatus(503); return; }
      const html = readFileSync(path.join(assets.pageDir, options.kind === 'WEB' ? 'web.html' : 'insight.html'), 'utf8');
      res.type('html').send(html.replaceAll('__GENERAL_SITE_KEY__', assets.siteKey));
    });
    for (const file of ['general.css','general.js', options.kind === 'WEB' ? 'secumie-web.png' : 'secumie-insight.png']) app.get(prefix + '/' + file, (_req,res)=>res.sendFile(path.resolve(assets.pageDir,file)));
    if (options.kind === 'INSIGHT') {
      const allowed = ['data.js','diagnosis.js','resources.js','phase3-content.js','phase3-report.js','v6-content.js','v6.js','v6-demos.js','v7-fixed-content.js','v7-prototype.js','v7-prototype-app.js','v7-prototype.css','v7-tail-pages.css','pira-e2.css'];
      for (const file of allowed) app.get(prefix + '/engine/' + file, (_req,res)=>res.sendFile(path.resolve(assets.insightDir,file)));
      for (const dir of ['assets','materials']) {
        app.use(prefix + '/' + dir, express.static(path.resolve(assets.insightDir,dir),{index:false,dotfiles:'deny'}));
        app.use(prefix + '/engine/' + dir, express.static(path.resolve(assets.insightDir,dir),{index:false,dotfiles:'deny'}));
      }
    }
  }
  app.use((_req, res) => res.sendStatus(404));
  return app;
}
