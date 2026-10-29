import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WscSalesService } from '../services/wscSalesService';

const input = z.object({ name: z.string().trim().min(1).max(500), url: z.string().trim().min(1).max(2_000) }).strict();
const csvRow = z.object({ header: z.string().max(200), row: z.string().max(10_000) }).strict();

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
  // Each physical CSV row is parsed with the completed WSC CSV parser. The
  // browser never uploads an entire batch; it calls /diagnose serially.
  router.post('/csv-row', async (req, res) => {
    const parsed = csvRow.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'INVALID_REQUEST' }); return; }
    try {
      const parsedCsv = (await wscCsv()).parseCompaniesCsv(`${parsed.data.header}\n${parsed.data.row}`);
      if (parsedCsv.companies.length === 1) { res.json({ company: parsedCsv.companies[0] }); return; }
      res.status(422).json({ error: parsedCsv.errors[0]?.code ?? 'CSV_ROW_INVALID' });
    } catch (error) { sendError(res, error); }
  });
  return router;
}
