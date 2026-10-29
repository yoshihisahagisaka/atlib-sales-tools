import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

type WscModule = {
  normalizeDiagnosisUrl(value: string): string;
  evaluate(input: unknown, options: { rulesPath: string; explanationsPath: string }): unknown;
  render(report: unknown, company: { name: string; url: string }): string;
};
type ProbeModule = {
  createRestrictedNetworkProbe(options: Record<string, unknown>): (input: Record<string, unknown>) => Promise<{ diagnosis: unknown }>;
};

export interface WscDiagnosisResult {
  pdf: Buffer;
  filename: string;
}

export interface WscSalesServiceOptions {
  /** Test-only transport injection. Production leaves this undefined. */
  networkExchange?: (input: Record<string, unknown>) => Promise<{ diagnosis: unknown }>;
  /** Test-only DNS injections keep the regression suite off the network. */
  lookup?: (...args: unknown[]) => Promise<Array<{ address: string }>>;
  resolveTxt?: (...args: unknown[]) => Promise<string[][]>;
  renderPdf?: (html: string) => Promise<Buffer>;
}

const vendor = (...parts: string[]): string => path.resolve(__dirname, '../wsc/vendor/tools', ...parts);
// TypeScript compiles `import()` to require() for this CommonJS application.
// Keep native dynamic import here because the completed WSC is intentionally
// retained as an ES module rather than rewritten for this integration.
const nativeImport = Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
const load = async <T>(file: string): Promise<T> => nativeImport(pathToFileURL(file).href) as Promise<T>;
const safeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_').trim() || '名称未設定';

export async function renderWscPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => /^https?:/i.test(route.request().url()) ? route.abort() : route.continue());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.emulateMedia({ media: 'print' });
    let timer: NodeJS.Timeout | undefined;
    try {
      return Buffer.from(await Promise.race([
        page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('WSC_PDF_TIMEOUT')), 60_000); }),
      ]));
    } finally {
      if (timer) clearTimeout(timer);
    }
  } finally {
    await browser.close();
  }
}

export class WscSalesService {
  constructor(private readonly options: WscSalesServiceOptions = {}) {}

  async diagnose({ name, url, executor }: { name: string; url: string; executor: string }): Promise<WscDiagnosisResult> {
    const engine = await load<WscModule>(vendor('wsc-vs1', 'engine.mjs'));
    const probeModule = await load<ProbeModule>(vendor('wsc-phase2c', 'restricted-network-probe.mjs'));
    const normalizedUrl = engine.normalizeDiagnosisUrl(url);
    if (!normalizedUrl.startsWith('https://')) throw new Error('WSC_URL_HTTPS_REQUIRED');
    const host = new URL(normalizedUrl).hostname;
    const approvalId = `staff-start-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // The capability is private to this authenticated request and consumed by
    // the unchanged Phase 2C probe before its first DNS lookup. It is never
    // persisted or logged in Cloud Run.
    const store = {
      used: false,
      consume: (input: { approvalId?: unknown; url?: unknown; executor?: unknown; now?: unknown }) => {
        if (store.used || input.approvalId !== approvalId || input.url !== normalizedUrl || input.executor !== executor || typeof input.now !== 'number') return null;
        store.used = true;
        return { targetUrl: normalizedUrl, expiresAt: Date.now() + 120_000 };
      },
    };
    const approvedProbe = probeModule.createRestrictedNetworkProbe({
      approvalStore: store,
      ...(this.options.networkExchange ? { networkExchange: this.options.networkExchange } : {}),
      ...(this.options.lookup ? { lookup: this.options.lookup } : {}),
      ...(this.options.resolveTxt ? { resolveTxt: this.options.resolveTxt } : {}),
    });
    const acquisition = await approvedProbe({ url: normalizedUrl, mailDomain: host, approvalId, executor });
    const report = engine.evaluate(acquisition.diagnosis, {
      rulesPath: vendor('wsc-vs1', 'rules.json'),
      explanationsPath: vendor('wsc-vs1', 'explanations.json'),
    });
    const html = engine.render(report, { name, url: normalizedUrl });
    const pdf = await (this.options.renderPdf ?? renderWscPdf)(html);
    return { pdf, filename: `${safeFilename(name)}_Webセキュリティ診断レポート.pdf` };
  }
}
