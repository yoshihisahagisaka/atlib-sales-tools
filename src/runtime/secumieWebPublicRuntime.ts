import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { AssemblyIntakeService } from '../secumieWeb/assemblyIntakeService';
import { HttpJwksProvider, PiraJwtVerifier } from '../piraIntake/piraJwtVerifier';
import { createAssemblyIntakeRouter } from '../routes/secumieWebAssemblyIntake';
import { configurePublicRuntime, publicPageCsp } from './runtimeSecurity';

export type SecumieWebPublicRuntimeOptions = {
  pool: Pool; issuer: string; jwksUrl: string; host: string; origin: string;
  turnstileSiteKey: string; consentVersion: string; consentText: string;
  receptionCode: string; organizerName: string; publicAuthScriptPath: string; assetDir: string;
};

function htmlFor(options: SecumieWebPublicRuntimeOptions): string {
  const source = readFileSync(path.join(options.assetDir, 'intake.html'), 'utf8');
  const publicAuth = {
    serviceId: 'secumie-web-assembly', apiBase: '/v1/otp',
    intakeStartUrl: '#intake', startButtonId: 'start',
    turnstileSiteKey: options.turnstileSiteKey,
  };
  const config = JSON.stringify({
    publicAuth,
    consentVersion: options.consentVersion,
    consentText: options.consentText,
    turnstileSiteKey: options.turnstileSiteKey,
  }).replace(/</g, '\\u003c');
  if (!source.includes('<!-- WEB_RUNTIME_CONFIG -->')) throw new Error('WEB_PAGE_CONFIG_PLACEHOLDER_MISSING');
  return source.replace('<!-- WEB_RUNTIME_CONFIG -->',
    '<script>window.__SECUMIE_WEB_CONFIG__=' + config +
    ';window.__PUBLIC_AUTH_CONFIG__=window.__SECUMIE_WEB_CONFIG__.publicAuth;</script>');
}

export function createSecumieWebPublicRuntime(options: SecumieWebPublicRuntimeOptions): Express {
  const app = express();
  configurePublicRuntime(app);
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', publicPageCsp);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const verifier = new PiraJwtVerifier(new HttpJwksProvider(options.jwksUrl), options.issuer);
  const intake = new AssemblyIntakeService(options.pool, {
    code: options.receptionCode, organizerName: options.organizerName, consentVersion: options.consentVersion,
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'secumie-web' }));
  app.get('/api/public/secumie-web/v1/unions', async (_req, res) => {
    try {
      const result = await options.pool.query(
        'SELECT union_id AS "unionId", official_name AS "officialName" FROM secumie_web.assembly_union_master WHERE active=true ORDER BY official_name'
      );
      res.json({ items: result.rows });
    } catch {
      res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    }
  });
  app.use('/api/public/secumie-web/v1',
    createAssemblyIntakeRouter(intake, verifier, 'secumie-web-assembly'));
  app.get('/', (_req, res) => res.type('html').send(htmlFor(options)));
  app.get('/public-service-auth.js', (_req, res) => res.sendFile(options.publicAuthScriptPath));
  app.use(express.static(options.assetDir, { index: false, fallthrough: true }));
  app.use((_req, res) => res.sendStatus(404));
  return app;
}
