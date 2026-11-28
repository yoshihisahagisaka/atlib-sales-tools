import { chromium } from 'playwright';
import { WscHtmlService, type WscHtmlServiceOptions } from './wscHtmlService';

export interface WscDiagnosisResult { pdf: Buffer; filename: string }
export interface WscSalesServiceOptions extends WscHtmlServiceOptions { renderPdf?: (html: string) => Promise<Buffer> }
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
  async diagnose(input: { name: string; url: string; executor: string }): Promise<WscDiagnosisResult> {
    const { html } = await new WscHtmlService(this.options).diagnose(input);
    const pdf = await (this.options.renderPdf ?? renderWscPdf)(html);
    return { pdf, filename: `${safeFilename(input.name)}_Webセキュリティ診断レポート.pdf` };
  }
}
