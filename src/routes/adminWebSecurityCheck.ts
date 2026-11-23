import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WscSalesService } from '../services/wscSalesService';

const input = z.object({ name: z.string().trim().min(1).max(500), url: z.string().trim().min(1).max(2_000) }).strict();
const csvSource = z.object({ source: z.string().min(1).max(2_000_000) }).strict();

const nativeImport = Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
const wscCsv = () => nativeImport(pathToFileURL(path.resolve(__dirname, '../wsc/vendor/tools/wsc-phase2a/csv.mjs')).href) as Promise<{ parseCompaniesCsv(source: string): { companies: Array<{ name: string; url: string }>; errors: Array<{ row: number; code: string }> } }>;

function actor(req: Request): string { return req.staffEmail ?? 'unknown-staff'; }
function sendError(res: Response, error: unknown): void {
  const code = error instanceof Error ? error.message : 'WSC_INTERNAL_ERROR';
  res.status(code.startsWith('WSC_') || code.startsWith('URL_') || code.startsWith('DNS_') || code.startsWith('EXTERNAL_') ? 422 : 500).json({ error: code });
}

export function createAdminWebSecurityCheckRouter(service: WscSalesService): Router {
  const router = Router();
  router.post('/diagnose', async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      const result = await service.diagnose({ ...parsed.data, executor: actor(req) });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(result.pdf);
    } catch (error) { sendError(res, error); }
  });
  // The completed WSC parser validates the CSV once. The browser subsequently
  // calls /diagnose serially; no batch diagnosis endpoint exists.
  router.post('/csv-validate', async (req, res) => {
    const parsed = csvSource.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      const parsedCsv = (await wscCsv()).parseCompaniesCsv(parsed.data.source);
      res.json({ companies: parsedCsv.companies, errors: parsedCsv.errors });
    } catch (error) { sendError(res, error); }
  });
  return router;
}
