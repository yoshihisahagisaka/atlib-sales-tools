import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request } from 'express';
import type { Pool } from 'pg';
import { PiraIntakeService, type PiraContext } from '../piraIntake/piraIntakeService';
import { HttpJwksProvider, PiraJwtVerifier } from '../piraIntake/piraJwtVerifier';
import { createPublicPiraIntakeRouter, createUrlPiraContextResolver, type PiraPublicRoute } from '../routes/publicPiraIntake';
import { configurePublicRuntime, publicPageCsp } from './runtimeSecurity';

export type PiraPublicRuntimeOptions = {
  pool: Pool;
  issuer: string;
  jwksUrl: string;
  unionHost: string;
  generalHost: string;
  unionInitiativeCode: string;
  generalInitiativeCode: string;
  generalEnabled: boolean;
  turnstileSiteKey: string;
  unionOtpApiBase?: string;
  generalOtpApiBase?: string;
  publicAuthScriptPath: string;
  prototypeDir: string;
};

function htmlFor(options: PiraPublicRuntimeOptions, serviceId: 'pira-union' | 'pira-general'): string {
  const source = readFileSync(path.join(options.prototypeDir, 'pira-e2.html'), 'utf8');
  const apiBase = serviceId === 'pira-general' ? options.generalOtpApiBase ?? '/security-check/v1/otp' : options.unionOtpApiBase ?? '/v1/otp';
  const safe = JSON.stringify({ serviceId, apiBase, turnstileSiteKey: options.turnstileSiteKey }).replace(/</g, '\\u003c');
  return source
    .replace('</head>', `<script>Object.assign(window.__PUBLIC_AUTH_CONFIG__,${safe});</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head>`)
    .replace('<div id="turnstile"></div>', `<div id="turnstile" class="cf-turnstile" data-sitekey=${JSON.stringify(options.turnstileSiteKey)}></div>`);
}

function isHost(req: Request, host: string): boolean { return req.hostname.toLowerCase() === host.toLowerCase(); }

export function createPiraPublicRuntime(options: PiraPublicRuntimeOptions): Express {
  const app = express();
  configurePublicRuntime(app);
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use((_req, res, next) => { res.setHeader('Content-Security-Policy', publicPageCsp); next(); });

  const union: PiraContext = { serviceId: 'pira-union', initiativeCode: options.unionInitiativeCode, kind: 'UNION' };
  const general: PiraContext = { serviceId: 'pira-general', initiativeCode: options.generalInitiativeCode, kind: 'GENERAL' };
  const routes: PiraPublicRoute[] = [
    { hostname: options.unionHost.toLowerCase(), pathPrefix: '/api/public/pira/v1', context: union },
    ...(options.generalEnabled ? [{ hostname: options.generalHost.toLowerCase(), pathPrefix: '/security-check/api/public/pira/v1', context: general } as PiraPublicRoute] : []),
  ];
  const verifier = new PiraJwtVerifier(new HttpJwksProvider(options.jwksUrl), options.issuer);
  const intake = createPublicPiraIntakeRouter(new PiraIntakeService(options.pool, options.generalEnabled), verifier, createUrlPiraContextResolver(routes));
  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', service: 'pira-public' }));
  app.use('/api/public/pira/v1', intake);
  if (options.generalEnabled) app.use('/security-check/api/public/pira/v1', intake);

  app.get('/', (req, res, next) => {
    if (!isHost(req, options.unionHost)) return next();
    res.type('html').send(htmlFor(options, 'pira-union'));
  });
  app.get('/security-check/', (req, res, next) => {
    if (!options.generalEnabled || !isHost(req, options.generalHost)) return next();
    res.type('html').send(htmlFor(options, 'pira-general'));
  });
  if (options.generalEnabled) app.use('/security-check', express.static(options.prototypeDir, { index: false, fallthrough: true }));
  app.get('/public-service-auth.js', (_req, res) => res.sendFile(options.publicAuthScriptPath));
  app.use(express.static(options.prototypeDir, { index: false, fallthrough: true }));
  app.use((_req, res) => res.sendStatus(404));
  return app;
}
