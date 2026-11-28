import path from 'node:path';
import { pathToFileURL } from 'node:url';
type WscModule = {
  normalizeDiagnosisUrl(value: string): string;
  evaluate(input: unknown, options: { rulesPath: string; explanationsPath: string }): unknown;
  render(report: unknown, company: { name: string; url: string }, options?: { technicalHeadings?: boolean }): string;
};
type ProbeModule = {
  createRestrictedNetworkProbe(options: Record<string, unknown>): (input: Record<string, unknown>) => Promise<{ diagnosis: unknown }>;
};

export interface WscHtmlServiceOptions {
  technicalHeadings?: boolean;
  /** Test-only transport injection. Production leaves this undefined. */
  networkExchange?: (input: Record<string, unknown>) => Promise<{ diagnosis: unknown }>;
  /** Test-only DNS injections keep the regression suite off the network. */
  lookup?: (...args: unknown[]) => Promise<Array<{ address: string }>>;
  resolveTxt?: (...args: unknown[]) => Promise<string[][]>;
}

const vendor = (...parts: string[]): string => path.resolve(__dirname, '../wsc/vendor/tools', ...parts);
// TypeScript compiles `import()` to require() for this CommonJS application.
// Keep native dynamic import here because the completed WSC is intentionally
// retained as an ES module rather than rewritten for this integration.
const nativeImport = Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
const load = async <T>(file: string): Promise<T> => nativeImport(pathToFileURL(file).href) as Promise<T>;
export class WscHtmlService {
  constructor(private readonly options: WscHtmlServiceOptions = {}) {}
  async diagnose({ name, url, executor }: { name: string; url: string; executor: string }): Promise<{html:string;report:unknown;normalizedUrl:string}> {
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
    let html = engine.render(report, { name, url: normalizedUrl }, { technicalHeadings: this.options.technicalHeadings === true });
    if (this.options.technicalHeadings) html = html.replace('</head>', '<style>@media print{.overview .ov-item{padding:1mm 0}.overview .technical-heading{margin-bottom:1px}.overview .ov-head{padding:2mm}.overview .ov-list{padding:0 2mm}.overview .ov-item b{font-size:9pt}.overview .attention{margin-top:2mm;padding:2mm 3mm}.overview .attention li{margin:0;line-height:1.35}.overview .attention h3{margin:0 0 1mm}}</style></head>');
    return { html, report, normalizedUrl };
  }
}
