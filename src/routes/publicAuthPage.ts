import { readFileSync } from 'node:fs';
import { Router } from 'express';

export type PublicAuthPageBrand = { serviceId: string; apiBase: string; intakeStartUrl: string; turnstileSiteKey?: string };

/** Server-owned host mapping prevents the browser from choosing another service or brand. */
export function createPublicAuthPageRouter(pagePath: string, brandsByHost: ReadonlyMap<string, PublicAuthPageBrand>): Router {
  const router = Router();
  router.get('/', (req, res) => {
    const host = req.hostname.toLowerCase(); const config = brandsByHost.get(host);
    if (!config) return res.sendStatus(404);
    const page = readFileSync(pagePath, 'utf8').replace('<!-- PUBLIC_AUTH_CONFIG -->', `<script>window.__PUBLIC_AUTH_CONFIG__=${JSON.stringify(config).replace(/</g, '\\u003c')};</script>`);
    res.type('html').send(page);
  });
  return router;
}
