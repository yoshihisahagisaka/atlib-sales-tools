import path from 'node:path';
import { createGeneralTurnstileVerifier, createSecumieGeneralRuntime } from './runtime/secumieGeneralRuntime';
import { WscHtmlService } from './services/wscHtmlService';

const kind = process.env.SECUMIE_GENERAL_KIND;
if (kind !== 'WEB' && kind !== 'INSIGHT') throw new Error('SECUMIE_GENERAL_KIND_REQUIRED');
const enabled = process.env.SECUMIE_GENERAL_ENABLED === 'true';
const hostname = process.env.SECUMIE_GENERAL_HOST ?? 'service.atlib.jp';
const siteKey = process.env.SECUMIE_TURNSTILE_SITE_KEY ?? '';
const secret = process.env.SECUMIE_TURNSTILE_SECRET ?? '';
if (enabled && (!siteKey || !secret)) throw new Error('TURNSTILE_CONFIG_REQUIRED');
const app = createSecumieGeneralRuntime({
  kind, hostname, enabled,
  verify: createGeneralTurnstileVerifier(secret, hostname),
  ...(kind === 'WEB' ? { wsc: new WscHtmlService({technicalHeadings:true}) } : {}),
  assets: {
    pageDir: path.resolve(process.cwd(), 'prototypes/secumie-general'),
    insightDir: path.resolve(process.cwd(), 'prototypes/pira-union-diagnosis-v2'),
    siteKey,
  },
});
app.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
